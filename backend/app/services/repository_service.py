"""Read-only repository connection and merge analysis on temporary Git bundles."""

from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from app.core.config import settings
from app.services.analysis_store import store
from ml.data.git_collection import GitCollectionError, _merge_label, _reject_custom_merge_drivers, extract_premerge_features

MAX_GITHUB_SIZE_KB = 512_000
MAX_CLONE_SECONDS = 180
ALLOWED_ATTRIBUTES = {b"unspecified", b"set", b"unset", b"text", b"binary", b"union"}


class RepositoryError(RuntimeError):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def _env(global_config: Path | None = None) -> dict[str, str]:
    clean = {key: value for key, value in os.environ.items() if not key.upper().startswith("GIT_")}
    clean.update({"GIT_CONFIG_NOSYSTEM": "1", "GIT_TERMINAL_PROMPT": "0", "GIT_OPTIONAL_LOCKS": "0"})
    if global_config:
        clean["GIT_CONFIG_GLOBAL"] = str(global_config)
    return clean


def _run(args: list[str], *, env: dict[str, str] | None = None, timeout: int = 20, check: bool = True) -> bytes:
    try:
        proc = subprocess.run(args, capture_output=True, env=env or _env(), timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise RepositoryError("Git could not complete this read-only operation.", 503) from error
    if check and proc.returncode:
        raise RepositoryError("Git could not inspect the selected repository or branch.", 422)
    return proc.stdout


def _git(repo: Path, *args: str, **kwargs) -> bytes:
    return _run(["git", "-c", f"safe.directory={repo.as_posix()}", "-C", str(repo), *args], **kwargs)


def _inside(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def _local_repo(value: str) -> Path:
    try:
        path = Path(value).expanduser().resolve(strict=True)
    except OSError as error:
        raise RepositoryError("The local repository path does not exist.", 404) from error
    roots = settings.local_repository_roots
    if not roots or not any(_inside(path, root) for root in roots):
        raise RepositoryError("This local path is outside the configured repository allowlist.", 403)
    safe = path.as_posix()
    env = _env()
    env.update({"GIT_CONFIG_COUNT": "1", "GIT_CONFIG_KEY_0": "safe.directory", "GIT_CONFIG_VALUE_0": safe})
    result = _run(["git", "-C", str(path), "rev-parse", "--show-toplevel"], env=env)
    top = Path(result.decode().strip()).resolve()
    if not any(_inside(top, root) for root in roots):
        raise RepositoryError("The repository resolves outside the configured allowlist.", 403)
    shallow = _run(["git", "-C", str(top), "rev-parse", "--is-shallow-repository"], env=env).decode().strip()
    if shallow == "true":
        raise RepositoryError("Shallow repositories are not supported for merge-base analysis.", 422)
    # Repository analysis is explicitly commit/ref based. Uncommitted files
    # are ignored entirely and are never copied into the analysis snapshot.
    return top


def _parse_public_url(value: str) -> tuple[str, str, str]:
    parsed = urlsplit(value.strip())
    parts = parsed.path.strip("/").split("/")
    if (parsed.scheme != "https" or parsed.netloc.lower() != "github.com" or parsed.username or parsed.password
            or parsed.query or parsed.fragment or len(parts) != 2):
        raise RepositoryError("Use a public https://github.com/owner/repository URL without credentials or extra paths.", 422)
    owner, name = parts
    name = name.removesuffix(".git")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", owner) or not re.fullmatch(r"[A-Za-z0-9_.-]+", name):
        raise RepositoryError("The GitHub owner or repository name is invalid.", 422)
    return owner, name, f"https://github.com/{owner}/{name}.git"


def _connect_github(value: str) -> tuple[Path, str, str, str]:
    owner, name, url = _parse_public_url(value)
    try:
        request = Request(f"https://api.github.com/repos/{owner}/{name}", headers={"Accept": "application/vnd.github+json", "User-Agent": "GitNexus-AI"})
        with urlopen(request, timeout=8) as response:
            meta = json.loads(response.read(128_000))
    except HTTPError as error:
        raise RepositoryError("GitHub repository could not be found or checked for public access.", 404 if error.code == 404 else 503) from error
    except (URLError, TimeoutError, OSError, json.JSONDecodeError) as error:
        raise RepositoryError("GitHub is unavailable; no repository was cloned.", 503) from error
    if not isinstance(meta, dict) or meta.get("private") is not False or not isinstance(meta.get("size"), int):
        raise RepositoryError("GitHub did not confirm a public repository.", 422)
    if meta["size"] > MAX_GITHUB_SIZE_KB:
        raise RepositoryError("This repository is larger than the configured 500 MB limit.", 413)
    root = settings.repository_cache_path.resolve()
    root.mkdir(parents=True, exist_ok=True)
    slug = re.sub(r"[^A-Za-z0-9_.-]", "-", f"{owner}-{name}")[:90]
    import hashlib
    destination = root / f"{slug}-{hashlib.sha256(url.encode()).hexdigest()[:10]}"
    if not _inside(destination.resolve(), root):
        raise RepositoryError("The managed repository path was rejected.", 500)
    if destination.is_symlink():
        raise RepositoryError("The managed repository destination is not a regular directory.", 409)
    if destination.exists():
        origin = _run(["git", "-c", f"safe.directory={destination.as_posix()}", "-C", str(destination), "remote", "get-url", "origin"], check=False).decode().strip()
        if origin != url:
            raise RepositoryError("A different directory already occupies this managed repository name.", 409)
    else:
        with tempfile.TemporaryDirectory(prefix="gitnexus-clone-", dir=root) as stage:
            staged_repo = Path(stage) / "repo"
            empty_config = Path(stage) / "empty.gitconfig"
            empty_config.write_text("", encoding="utf-8")
            _run(["git", "-c", "protocol.file.allow=never", "clone", "--no-tags", "--no-recurse-submodules", "--no-checkout", "--", url, str(staged_repo)], env=_env(empty_config), timeout=MAX_CLONE_SECONDS)
            object_dir = staged_repo / ".git" / "objects"
            object_bytes = sum(path.stat().st_size for path in object_dir.rglob("*") if path.is_file())
            if object_bytes > 768 * 1024 * 1024:
                raise RepositoryError("Cloned Git object data exceeded the configured size limit.", 413)
            if destination.exists() or destination.is_symlink():
                raise RepositoryError("A managed repository connection appeared during cloning; no existing files were replaced.", 409)
            os.replace(staged_repo, destination)
    default, branches = _branches(destination)
    if not branches:
        raise RepositoryError("The public repository has no available branches.", 422)
    return destination, owner, str(meta.get("name", name)), default


def _branches(repo: Path) -> tuple[str, list[dict[str, object]]]:
    sym = _git(repo, "symbolic-ref", "--quiet", "refs/remotes/origin/HEAD", check=False).decode().strip()
    default_ref = sym if sym.startswith("refs/remotes/origin/") else ""
    if not default_ref:
        sym = _git(repo, "symbolic-ref", "--quiet", "HEAD", check=False).decode().strip()
        default_ref = sym if sym.startswith("refs/heads/") else ""
    data = _git(repo, "for-each-ref", "--format=%(refname)%00%(objectname)", "refs/heads", "refs/remotes/origin")
    branches: list[dict[str, object]] = []
    for line in data.splitlines():
        ref_b, _, sha_b = line.partition(b"\0")
        ref = ref_b.decode("utf-8", errors="replace")
        if ref == "refs/remotes/origin/HEAD":
            continue
        if ref.startswith("refs/heads/"):
            name = ref.removeprefix("refs/heads/")
        elif ref.startswith("refs/remotes/origin/"):
            name = ref.removeprefix("refs/remotes/")
        else:
            continue
        branches.append({"name": name, "ref": ref, "commit_sha": sha_b.decode("ascii", errors="replace"), "is_default": ref == default_ref})
    default = next((str(b["name"]) for b in branches if b["is_default"]), "")
    branches.sort(key=lambda b: (not b["is_default"], str(b["name"]).casefold(), str(b["ref"])))
    return default, branches


def _summary(row: dict[str, object]) -> dict[str, object]:
    _, branches = _branches(Path(str(row["repository_path"])))
    return {"id": row["id"], "kind": row["kind"], "name": row["name"], "owner": row["owner"], "default_branch": row["default_branch"], "branch_count": len(branches), "connected_at": row["connected_at"]}


def connect(kind: str, value: str) -> dict[str, object]:
    store.initialize()
    if kind == "local_path":
        repo = _local_repo(value)
        default, branches = _branches(repo)
        owner, name, key = None, repo.name, f"local:{repo.as_posix().casefold()}"
    elif kind == "github_url":
        repo, owner, name, default = _connect_github(value)
        _, branches = _branches(repo)
        key = f"github:{_parse_public_url(value)[2].casefold()}"
    else:
        raise RepositoryError("Unsupported repository source.", 422)
    if not default or not branches:
        raise RepositoryError("The repository default branch could not be verified.", 422)
    row = store.upsert_repository(source_key=key, kind=kind, name=name, owner=owner, default_branch=default, repository_path=repo)
    return _summary(row)


def repositories() -> list[dict[str, object]]:
    return [_summary(row) for row in store.repositories()]


def branches(repository_id: str) -> tuple[dict[str, object], list[dict[str, object]]]:
    row = store.repository(repository_id)
    if not row:
        raise RepositoryError("Connected repository was not found.", 404)
    default, refs = _branches(Path(row["repository_path"]))
    row["default_branch"] = default
    return _summary(row), refs


def _line_summary(repo: Path, base: str, tip: str, env: dict[str, str]) -> tuple[list[str], int, int]:
    paths = subprocess.run(["git", "-C", str(repo), "diff", "--name-only", "-z", base, tip], capture_output=True, env=env, timeout=30)
    stats = subprocess.run(["git", "-C", str(repo), "diff", "--numstat", "-z", base, tip], capture_output=True, env=env, timeout=30)
    if paths.returncode or stats.returncode:
        raise RepositoryError("Git could not summarize the branch changes.", 422)
    names = sorted({x.decode("utf-8", errors="replace") for x in paths.stdout.split(b"\0") if x})
    added = deleted = 0
    for row in stats.stdout.split(b"\0"):
        columns = row.split(b"\t", 2)
        if len(columns) != 3 or b"-" in columns[:2]:
            continue
        try:
            added += int(columns[0]); deleted += int(columns[1])
        except ValueError:
            pass
    return names, added, deleted


def analyze(repository_id: str, source_ref: str, target_ref: str, model_service) -> dict[str, object]:
    row = store.repository(repository_id)
    if not row:
        raise RepositoryError("Connected repository was not found.", 404)
    repo = Path(row["repository_path"]).resolve()
    default, branch_rows = _branches(repo)
    refs = {str(branch["ref"]): str(branch["commit_sha"]) for branch in branch_rows}
    if source_ref not in refs or target_ref not in refs or source_ref == target_ref:
        raise RepositoryError("Choose two different branches from the verified branch list.", 422)
    source_sha, target_sha = refs[source_ref], refs[target_ref]

    with tempfile.TemporaryDirectory(prefix="gitnexus-safe-analysis-") as work:
        temp = Path(work); empty_template = temp / "template"; empty_template.mkdir()
        empty_config = temp / "empty.gitconfig"; empty_config.write_text("", encoding="utf-8")
        env = _env(empty_config)
        # Bundles exported with refs/remotes/* are valid, but `git clone` does
        # not advertise those as branches. Copy the two selected tips into
        # temporary local branch refs first so remote-tracking refs work just
        # like local refs. All refs and objects stay inside this temp directory.
        staged = temp / "staged.git"
        _run(["git", "init", "--bare", f"--template={empty_template}", str(staged)], env=env)
        _run([
            "git", "-c", f"safe.directory={repo.as_posix()}",
            "-c", "uploadpack.packObjectsHook=", "-c", "protocol.file.allow=always",
            "-C", str(staged), "fetch", "--no-tags", "--no-recurse-submodules",
            "--no-write-fetch-head", str(repo),
            f"+{source_ref}:refs/heads/gitnexus-source",
            f"+{target_ref}:refs/heads/gitnexus-target",
        ], env=env, timeout=MAX_CLONE_SECONDS)
        bundle = temp / "pair.bundle"
        for ref, staged_ref, expected_sha in (
            (source_ref, "refs/heads/gitnexus-source", source_sha),
            (target_ref, "refs/heads/gitnexus-target", target_sha),
        ):
            if not _run(["git", "-c", f"safe.directory={repo.as_posix()}", "-C", str(repo), "show-ref", "--verify", ref], env=env, check=False):
                raise RepositoryError("A selected branch changed or is no longer available.", 409)
            actual_sha = _git(staged, "rev-parse", staged_ref, env=env).decode().strip()
            if actual_sha != expected_sha:
                raise RepositoryError("A selected branch changed while the isolated snapshot was prepared.", 409)
        _run(["git", "-C", str(staged), "bundle", "create", str(bundle), "refs/heads/gitnexus-source", "refs/heads/gitnexus-target"], env=env, timeout=MAX_CLONE_SECONDS)
        isolated = temp / "isolated"
        _run(["git", "-c", "protocol.file.allow=always", "clone", "--no-local", "--no-hardlinks", "--no-checkout", "--no-tags", "--no-recurse-submodules", f"--template={empty_template}", str(bundle), str(isolated)], env=env, timeout=MAX_CLONE_SECONDS)
        base = _git(isolated, "merge-base", source_sha, target_sha, env=env).decode().strip()
        if not base or base in (source_sha, target_sha):
            raise RepositoryError("Both branches must diverge from a common merge base.", 422)
        try:
            _reject_custom_merge_drivers(isolated, base, source_sha, target_sha, env)
            features = extract_premerge_features(isolated, base, source_sha, target_sha, env)
            conflict = _merge_label(isolated, base, source_sha, target_sha, env)
        except GitCollectionError as error:
            raise RepositoryError(str(error), 422) from error
        source_paths, source_added, source_deleted = _line_summary(isolated, base, source_sha, env)
        target_paths, target_added, target_deleted = _line_summary(isolated, base, target_sha, env)
        divergence = _git(isolated, "rev-list", "--left-right", "--count", f"{target_sha}...{source_sha}", env=env).decode().split()
        target_only, source_only = (int(value) for value in divergence)
        prediction = None; prediction_error = None
        if getattr(model_service, "is_ready", False):
            try:
                prediction = model_service.predict({name: features[name] for name in ("files_changed", "lines_added", "avg_files_per_commit", "branch_commits", "branch_files_changed")})
            except Exception:
                prediction_error = "The configured model could not score this analysis."
        else:
            prediction_error = "No schema-verified model artifact is currently available."
        result = {
            "repository_id": row["id"], "repository_name": row["name"],
            "source_branch": source_ref, "target_branch": target_ref,
            "source_commit": source_sha, "target_commit": target_sha, "merge_base": base,
            "source_only_commits": source_only, "target_only_commits": target_only,
            "source_changed_files": source_paths, "target_changed_files": target_paths,
            "overlapping_paths": sorted(set(source_paths) & set(target_paths)),
            "source_lines_added": source_added, "source_lines_deleted": source_deleted,
            "target_lines_added": target_added, "target_lines_deleted": target_deleted,
            "feature_values": features, "merge_check": "conflict" if conflict else "clean",
            "prediction": prediction, "prediction_unavailable_reason": prediction_error,
        }
        return store.save_analysis(result)
