from __future__ import annotations

import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.services.analysis_store import AnalysisStore
from app.services import repository_service
from app.main import create_app
from fastapi.testclient import TestClient


def git(repo: Path, *args: str) -> str:
    result = subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True)
    return result.stdout.strip()


@pytest.fixture
def diverged_repository(tmp_path: Path) -> Path:
    repo = tmp_path / "fixture-repo"
    repo.mkdir()
    subprocess.run(["git", "init", "--initial-branch=main", str(repo)], check=True, capture_output=True)
    git(repo, "config", "user.name", "GitNexus Test")
    git(repo, "config", "user.email", "gitnexus-test@example.invalid")
    (repo / "shared.txt").write_text("base\n", encoding="utf-8")
    git(repo, "add", "shared.txt")
    git(repo, "commit", "-m", "base fixture commit")
    git(repo, "switch", "-c", "feature/example")
    (repo / "shared.txt").write_text("source side\n", encoding="utf-8")
    (repo / "source.txt").write_text("source only\n", encoding="utf-8")
    git(repo, "add", ".")
    git(repo, "commit", "-m", "source fixture commit")
    git(repo, "switch", "main")
    (repo / "shared.txt").write_text("target side\n", encoding="utf-8")
    (repo / "target.txt").write_text("target only\n", encoding="utf-8")
    git(repo, "add", ".")
    git(repo, "commit", "-m", "target fixture commit")
    return repo


def configure_store(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(repository_service, "store", AnalysisStore(tmp_path / "history.sqlite3"))


def test_public_repository_url_validation_rejects_non_github_and_credentials() -> None:
    for value in (
        "http://github.com/pallets/flask",
        "https://user:secret@github.com/pallets/flask",
        "https://github.com.evil.invalid/pallets/flask",
        "https://github.com/pallets/flask/tree/main",
        "https://github.com/pallets/../flask",
    ):
        with pytest.raises(repository_service.RepositoryError):
            repository_service._parse_public_url(value)


def test_local_repository_path_must_be_allowlisted(monkeypatch: pytest.MonkeyPatch, diverged_repository: Path) -> None:
    monkeypatch.delenv("GITNEXUS_LOCAL_REPOSITORY_ROOTS", raising=False)
    with pytest.raises(repository_service.RepositoryError, match="allowlist"):
        repository_service._local_repo(str(diverged_repository))


def test_connect_analyze_persists_real_git_result_without_changing_source(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, diverged_repository: Path
) -> None:
    configure_store(monkeypatch, tmp_path)
    monkeypatch.setenv("GITNEXUS_LOCAL_REPOSITORY_ROOTS", str(tmp_path))
    head_before = git(diverged_repository, "rev-parse", "HEAD")
    branch_before = git(diverged_repository, "branch", "--show-current")

    repository = repository_service.connect("local_path", str(diverged_repository))
    _, branches = repository_service.branches(str(repository["id"]))
    source = next(branch for branch in branches if branch["name"] == "feature/example" and str(branch["ref"]).startswith("refs/heads/"))
    target = next(branch for branch in branches if branch["name"] == "main" and str(branch["ref"]).startswith("refs/heads/"))
    result = repository_service.analyze(str(repository["id"]), str(source["ref"]), str(target["ref"]), SimpleNamespace(is_ready=False))

    assert result["merge_check"] == "conflict"
    assert result["prediction"] is None
    assert result["prediction_unavailable_reason"]
    assert result["source_only_commits"] == 1
    assert result["target_only_commits"] == 1
    assert result["overlapping_paths"] == ["shared.txt"]
    assert result["feature_values"]["files_changed"] == 2
    assert result["feature_values"]["branch_files_changed"] == 2
    assert result["feature_values"]["commit_severity"] is None
    assert repository_service.store.analysis(str(result["id"]))["merge_base"] == result["merge_base"]

    assert git(diverged_repository, "rev-parse", "HEAD") == head_before
    assert git(diverged_repository, "branch", "--show-current") == branch_before
    assert git(diverged_repository, "status", "--porcelain") == ""


def test_remote_tracking_refs_are_preserved_in_the_isolated_analysis_snapshot(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, diverged_repository: Path
) -> None:
    configure_store(monkeypatch, tmp_path)
    monkeypatch.setenv("GITNEXUS_LOCAL_REPOSITORY_ROOTS", str(tmp_path))
    source_sha = git(diverged_repository, "rev-parse", "feature/example")
    target_sha = git(diverged_repository, "rev-parse", "main")
    git(diverged_repository, "update-ref", "refs/remotes/origin/feature/example", source_sha)
    git(diverged_repository, "update-ref", "refs/remotes/origin/main", target_sha)

    repository = repository_service.connect("local_path", str(diverged_repository))
    _, branches = repository_service.branches(str(repository["id"]))
    source = next(item for item in branches if item["ref"] == "refs/remotes/origin/feature/example")
    target = next(item for item in branches if item["ref"] == "refs/remotes/origin/main")
    result = repository_service.analyze(str(repository["id"]), str(source["ref"]), str(target["ref"]), SimpleNamespace(is_ready=False))

    assert result["source_commit"] == source_sha
    assert result["target_commit"] == target_sha
    assert result["merge_check"] == "conflict"
    assert result["overlapping_paths"] == ["shared.txt"]


def test_invalid_branch_is_rejected_before_analysis(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, diverged_repository: Path) -> None:
    configure_store(monkeypatch, tmp_path)
    monkeypatch.setenv("GITNEXUS_LOCAL_REPOSITORY_ROOTS", str(tmp_path))
    repository = repository_service.connect("local_path", str(diverged_repository))
    with pytest.raises(repository_service.RepositoryError, match="different branches"):
        repository_service.analyze(str(repository["id"]), "refs/heads/not-a-branch", "refs/heads/main", SimpleNamespace(is_ready=False))


def test_custom_merge_driver_is_rejected_without_execution(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    repo = tmp_path / "custom-driver-repo"
    repo.mkdir()
    subprocess.run(["git", "init", "--initial-branch=main", str(repo)], check=True, capture_output=True)
    git(repo, "config", "user.name", "GitNexus Test")
    git(repo, "config", "user.email", "gitnexus-test@example.invalid")
    (repo / ".gitattributes").write_text("*.txt merge=custom-test-driver\n", encoding="utf-8")
    (repo / "shared.txt").write_text("base\n", encoding="utf-8")
    git(repo, "add", ".")
    git(repo, "commit", "-m", "base")
    git(repo, "switch", "-c", "feature/custom")
    (repo / "shared.txt").write_text("source\n", encoding="utf-8")
    git(repo, "commit", "-am", "source")
    git(repo, "switch", "main")
    (repo / "shared.txt").write_text("target\n", encoding="utf-8")
    git(repo, "commit", "-am", "target")
    configure_store(monkeypatch, tmp_path)
    monkeypatch.setenv("GITNEXUS_LOCAL_REPOSITORY_ROOTS", str(tmp_path))
    repository = repository_service.connect("local_path", str(repo))
    _, branches = repository_service.branches(str(repository["id"]))
    source = next(branch for branch in branches if branch["name"] == "feature/custom")
    target = next(branch for branch in branches if branch["name"] == "main")
    with pytest.raises(repository_service.RepositoryError, match="Custom merge drivers"):
        repository_service.analyze(str(repository["id"]), str(source["ref"]), str(target["ref"]), SimpleNamespace(is_ready=False))


def test_api_health_connection_analysis_history_and_dashboard_end_to_end(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, diverged_repository: Path
) -> None:
    test_store = AnalysisStore(tmp_path / "api-history.sqlite3")
    monkeypatch.setattr(repository_service, "store", test_store)
    monkeypatch.setattr("app.api.repositories.store", test_store)
    monkeypatch.setenv("GITNEXUS_LOCAL_REPOSITORY_ROOTS", str(tmp_path))
    model = SimpleNamespace(is_ready=False, load=lambda: None)
    app = create_app(model)
    with TestClient(app) as client:
        assert client.get("/health").json()["status"] == "ok"
        connected = client.post("/api/v1/repositories/connect", json={"kind": "local_path", "value": str(diverged_repository)})
        assert connected.status_code == 201
        repository_id = connected.json()["id"]
        branch_list = client.get(f"/api/v1/repositories/{repository_id}/branches")
        assert branch_list.status_code == 200
        branches = branch_list.json()["branches"]
        source = next(item for item in branches if item["name"] == "feature/example" and item["ref"].startswith("refs/heads/"))
        target = next(item for item in branches if item["name"] == "main" and item["ref"].startswith("refs/heads/"))

        first = client.post(f"/api/v1/repositories/{repository_id}/analyze", json={"source_ref": source["ref"], "target_ref": target["ref"]})
        second = client.post(f"/api/v1/repositories/{repository_id}/analyze", json={"source_ref": target["ref"], "target_ref": source["ref"]})
        assert first.status_code == second.status_code == 201
        assert first.json()["merge_check"] == "conflict"
        assert first.json()["prediction"] is None
        history = client.get("/api/v1/analyses?outcome=conflict&limit=10")
        assert history.status_code == 200 and history.json()["total"] == 2
        compared = client.get(f"/api/v1/analyses/compare?left_id={first.json()['id']}&right_id={second.json()['id']}")
        assert compared.status_code == 200
        assert compared.json()["left"]["merge_check"] == "conflict"
        dashboard = client.get("/api/v1/dashboard").json()
        assert dashboard["repository_count"] == 1
        assert dashboard["analysis_count"] == 2
        assert dashboard["conflicting_merge_checks"] == 2
        status = client.get("/api/v1/integration-status").json()
        assert status["database_available"] is True
        assert status["git_available"] is True
