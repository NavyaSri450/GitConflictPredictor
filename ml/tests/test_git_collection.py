import subprocess
from pathlib import Path

import pytest

from ml.data.git_collection import GitCollectionError, collect_pair


def git(repo: Path, *args: str) -> str:
    result = subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True)
    return result.stdout.strip()


def commit(repo: Path, message: str) -> None:
    git(repo, "add", "--all")
    git(repo, "commit", "-m", message)


def create_pair_repo(path: Path, conflict: bool) -> Path:
    path.mkdir()
    subprocess.run(["git", "init", "--quiet", "-b", "main", str(path)], check=True)
    git(path, "config", "user.name", "Unit Test")
    git(path, "config", "user.email", "unit-test@example.invalid")
    (path / "shared.txt").write_text("start\n", encoding="utf-8")
    commit(path, "fixture base")
    base = git(path, "rev-parse", "HEAD")
    git(path, "switch", "-c", "source")
    if conflict:
        (path / "shared.txt").write_text("source change\n", encoding="utf-8")
    else:
        (path / "source.txt").write_text("source only\n", encoding="utf-8")
    commit(path, "fixture source")
    git(path, "switch", "main")
    if conflict:
        (path / "shared.txt").write_text("target change\n", encoding="utf-8")
    else:
        (path / "target.txt").write_text("target only\n", encoding="utf-8")
    commit(path, "fixture target")
    assert git(path, "rev-parse", "HEAD") != base
    return path


@pytest.mark.parametrize(("conflict", "expected_label"), [(True, 1), (False, 0)])
def test_collector_labels_git_merge_tree_outcome_and_preserves_source(tmp_path, conflict, expected_label) -> None:
    repository = create_pair_repo(tmp_path / "repo", conflict)
    before_head = git(repository, "rev-parse", "HEAD")
    before_status = git(repository, "status", "--porcelain")

    row = collect_pair(repository, "source", "main", repository_id="fixture-repo")

    assert row["merge_conflict"] == expected_label
    assert row["repo_fingerprint"] == "fixture-repo"
    assert row["label_method"] == "git_merge_tree_write_tree_exit_status_v1"
    assert row["base_commit"] != row["source_commit"]
    assert row["base_commit"] != row["target_commit"]
    assert row["files_changed"] == 1
    assert row["lines_added"] == 1
    assert row["avg_files_per_commit"] == 1
    assert row["branch_commits"] == 1
    assert row["branch_files_changed"] == 1
    assert git(repository, "rev-parse", "HEAD") == before_head
    assert git(repository, "status", "--porcelain") == before_status
    assert row["commit_severity"] is None
    assert row["developer_conflicts"] is None


def test_collector_rejects_non_diverged_pair_without_label(tmp_path) -> None:
    repository = create_pair_repo(tmp_path / "repo", conflict=False)
    with pytest.raises(GitCollectionError, match="not both diverged"):
        collect_pair(repository, "main", "main")


def test_collector_refuses_repository_custom_merge_driver(tmp_path) -> None:
    repository = create_pair_repo(tmp_path / "repo", conflict=True)
    (repository / ".gitattributes").write_text("*.txt merge=custom-driver\n", encoding="utf-8")
    commit(repository, "fixture custom driver attribute")

    with pytest.raises(GitCollectionError, match="Custom merge drivers"):
        collect_pair(repository, "source", "main")

