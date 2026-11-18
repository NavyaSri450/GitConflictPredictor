"""Local-only, read-only Git metadata and merge-label collection."""

import hashlib
import os
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from ml.features import FEATURE_NAMES

COLLECTOR_VERSION = "0.1.0"


class GitCollectionError(RuntimeError):
    """Raised when a merge example cannot be labeled reproducibly."""


def _run_git(repo: Path, *args: str, env: dict[str, str] | None = None, input_bytes: bytes | None = None) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        check=False,
        capture_output=True,
        env=env,
        input=input_bytes,
    )


def _git_output(repo: Path, *args: str, env: dict[str, str] | None = None) -> str:
    result = _run_git(repo, *args, env=env)
    if result.returncode != 0:
        detail = result.stderr.decode("utf-8", errors="replace").strip()
        raise GitCollectionError(f"git {' '.join(args)} failed: {detail}")
    return result.stdout.decode("utf-8", errors="replace").strip()


def _resolve_commit(repo: Path, ref: str, env: dict[str, str]) -> str:
    candidates = (ref, f"refs/heads/{ref}", f"refs/remotes/origin/{ref}")
    for candidate in candidates:
        result = _run_git(repo, "rev-parse", "--verify", "--end-of-options", f"{candidate}^{{commit}}", env=env)
        if result.returncode == 0:
            return result.stdout.decode("ascii").strip()
    raise GitCollectionError(f"Cannot resolve {ref!r} to a commit in the local clone.")


def _paths_changed(repo: Path, base: str, head: str, env: dict[str, str]) -> int:
    result = _run_git(repo, "diff", "--name-only", "-z", base, head, env=env)
    if result.returncode != 0:
        raise GitCollectionError("Could not count changed paths.")
    return len({path for path in result.stdout.split(b"\0") if path})


def _lines_added(repo: Path, base: str, head: str, env: dict[str, str]) -> int:
    result = _run_git(repo, "diff", "--numstat", "-z", base, head, env=env)
    if result.returncode != 0:
        raise GitCollectionError("Could not read diff line counts.")
    total = 0
    for record in result.stdout.split(b"\0"):
        columns = record.split(b"\t", 2)
        if len(columns) != 3 or columns[0] == b"-":
            continue  # Binary file: line count is not defined.
        try:
            total += int(columns[0])
        except ValueError:
            continue
    return total


def _first_parent_commit_count(repo: Path, base: str, head: str, env: dict[str, str]) -> int:
    output = _git_output(repo, "rev-list", "--first-parent", "--count", f"{base}..{head}", env=env)
    return int(output)


def _average_files_per_commit(repo: Path, base: str, head: str, env: dict[str, str]) -> float | None:
    commits = _git_output(repo, "rev-list", "--first-parent", "--reverse", f"{base}..{head}", env=env).splitlines()
    if not commits:
        return None
    path_counts: list[int] = []
    for commit in commits:
        result = _run_git(repo, "diff-tree", "--no-commit-id", "--name-only", "-r", "-z", f"{commit}^", commit, env=env)
        if result.returncode != 0:
            raise GitCollectionError(f"Could not inspect commit {commit}.")
        path_counts.append(len({path for path in result.stdout.split(b"\0") if path}))
    return sum(path_counts) / len(path_counts)


def _reject_custom_merge_drivers(repo: Path, base: str, source: str, target: str, env: dict[str, str]) -> None:
    paths: set[bytes] = set()
    for head in (source, target):
        result = _run_git(repo, "diff", "--name-only", "-z", base, head, env=env)
        if result.returncode != 0:
            raise GitCollectionError("Could not inspect changed paths for merge-driver attributes.")
        paths.update(path for path in result.stdout.split(b"\0") if path)
    if not paths:
        return

    built_in_drivers = {b"unspecified", b"set", b"unset", b"text", b"binary", b"union"}
    path_input = b"\0".join(sorted(paths)) + b"\0"
    for head in (source, target):
        result = _run_git(
            repo,
            "check-attr",
            "-z",
            f"--source={head}",
            "merge",
            "--stdin",
            env=env,
            input_bytes=path_input,
        )
        if result.returncode != 0:
            raise GitCollectionError("Could not verify repository merge attributes; this Git version may not support check-attr --source.")
        fields = result.stdout.split(b"\0")
        for index in range(0, len(fields) - 2, 3):
            path, attribute, value = fields[index:index + 3]
            if path and attribute == b"merge" and value not in built_in_drivers:
                raise GitCollectionError("Custom merge drivers in tracked .gitattributes are not executed or labeled by this collector.")


def extract_premerge_features(repo: Path, base: str, source: str, target: str, env: dict[str, str]) -> dict[str, float | int | None]:
    """Extract only well-defined pre-merge metadata; leave all other fields null."""
    values: dict[str, float | int | None] = {name: None for name in FEATURE_NAMES}
    values["files_changed"] = _paths_changed(repo, base, source, env)
    values["lines_added"] = _lines_added(repo, base, source, env)
    values["avg_files_per_commit"] = _average_files_per_commit(repo, base, source, env)
    values["branch_commits"] = _first_parent_commit_count(repo, base, target, env)
    values["branch_files_changed"] = _paths_changed(repo, base, target, env)
    return values


def _merge_label(repo: Path, base: str, source: str, target: str, env: dict[str, str]) -> int:
    """Use Git's merge algorithm; return 1 conflict, 0 clean, reject other errors."""
    result = _run_git(
        repo,
        "merge-tree",
        "--write-tree",
        f"--merge-base={base}",
        target,
        source,
        env=env,
    )
    if result.returncode in (0, 1):
        return int(result.returncode == 1)
    detail = result.stderr.decode("utf-8", errors="replace").strip()
    raise GitCollectionError(f"Git could not attempt this merge; no label was recorded: {detail}")


def collect_pair(
    repository: str | Path,
    source_ref: str,
    target_ref: str,
    repository_id: str | None = None,
) -> dict[str, object]:
    """Collect one pair in a temporary no-checkout clone, never in the source repo."""
    source_repo = Path(repository).expanduser().resolve()
    if not source_repo.is_dir():
        raise GitCollectionError("--repo must be a local Git working-copy directory.")
    # A URL or remote is not accepted; validate the supplied local path before cloning.
    source_repo = Path(_git_output(source_repo, "rev-parse", "--show-toplevel")).resolve()

    with tempfile.TemporaryDirectory(prefix="gitnexus-collector-") as temporary:
        temp_root = Path(temporary)
        empty_template = temp_root / "empty-template"
        empty_template.mkdir()
        empty_global_config = temp_root / "empty.gitconfig"
        empty_global_config.write_text("", encoding="utf-8")
        # Prevent ambient Git environment overrides (GIT_DIR, object/index paths,
        # config injection, alternates, etc.) from redirecting commands outside
        # the isolated copy. PATH and ordinary process settings are retained.
        env = {key: value for key, value in os.environ.items() if not key.upper().startswith("GIT_")}
        env.update({
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_CONFIG_GLOBAL": str(empty_global_config),
            "GIT_TERMINAL_PROMPT": "0",
            "GIT_OPTIONAL_LOCKS": "0",
        })
        clone = temp_root / "repo-copy"
        cloned = subprocess.run(
            [
                "git", "clone", "--no-local", "--no-hardlinks", "--no-checkout", "--no-tags",
                "--no-recurse-submodules", f"--template={empty_template}",
                str(source_repo), str(clone),
            ],
            check=False,
            capture_output=True,
            env=env,
        )
        if cloned.returncode != 0:
            detail = cloned.stderr.decode("utf-8", errors="replace").strip()
            raise GitCollectionError(f"Could not create isolated local clone: {detail}")

        source = _resolve_commit(clone, source_ref, env)
        target = _resolve_commit(clone, target_ref, env)
        base_result = _run_git(clone, "merge-base", source, target, env=env)
        if base_result.returncode != 0:
            raise GitCollectionError("The selected commits do not have a common merge base.")
        base = base_result.stdout.decode("ascii").strip()
        if source == base or target == base:
            raise GitCollectionError("The selected branches have not both diverged from their merge base; no merge example was recorded.")

        _reject_custom_merge_drivers(clone, base, source, target, env)
        features = extract_premerge_features(clone, base, source, target, env)
        label = _merge_label(clone, base, source, target, env)
        source_time = datetime.fromisoformat(_git_output(clone, "show", "-s", "--format=%cI", source, env=env))
        target_time = datetime.fromisoformat(_git_output(clone, "show", "-s", "--format=%cI", target, env=env))
        repo_fingerprint = repository_id or hashlib.sha256(str(source_repo).casefold().encode("utf-8")).hexdigest()[:20]
        row: dict[str, object] = {**features, "merge_conflict": label}
        row.update({
            "repo_fingerprint": repo_fingerprint,
            "source_ref": source_ref,
            "target_ref": target_ref,
            "base_commit": base,
            "source_commit": source,
            "target_commit": target,
            "snapshot_timestamp": max(source_time, target_time).astimezone(timezone.utc).isoformat(),
            "collected_at": datetime.now(timezone.utc).isoformat(),
            "git_version": _git_output(clone, "--version", env=env),
            "label_method": "git_merge_tree_write_tree_exit_status_v1",
            "collector_version": COLLECTOR_VERSION,
        })
        return row
