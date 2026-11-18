"""Versioned APIs for repository connection, safe analysis, and history."""

from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request

from app.core.config import settings
from app.schemas.repository import (
    AnalysisListResponse,
    AnalyzeRepositoryRequest,
    BranchListResponse,
    DashboardAnalyticsResponse,
    RepositoryAnalysis,
    RepositoryConnectRequest,
    RepositoryListResponse,
    RepositorySummary,
    SystemIntegrationStatus,
)
from app.services import repository_service
from app.services.analysis_store import store

router = APIRouter(prefix="/v1")


def _call(function, *args, **kwargs):
    try:
        return function(*args, **kwargs)
    except repository_service.RepositoryError as error:
        raise HTTPException(status_code=error.status_code, detail=str(error)) from error


@router.post("/repositories/connect", response_model=RepositorySummary, status_code=201, tags=["repositories"])
def connect_repository(payload: RepositoryConnectRequest) -> dict:
    return _call(repository_service.connect, payload.kind, payload.value)


@router.get("/repositories", response_model=RepositoryListResponse, tags=["repositories"])
def get_repositories() -> dict:
    return {"repositories": _call(repository_service.repositories)}


@router.get("/repositories/{repository_id}/branches", response_model=BranchListResponse, tags=["repositories"])
def get_repository_branches(repository_id: str) -> dict:
    summary, branches = _call(repository_service.branches, repository_id)
    return {"repository": summary, "branches": branches}


@router.post("/repositories/{repository_id}/analyze", response_model=RepositoryAnalysis, status_code=201, tags=["analysis"])
def analyze_repository(repository_id: str, payload: AnalyzeRepositoryRequest, request: Request) -> dict:
    model_service = request.app.state.model_service
    return _call(repository_service.analyze, repository_id, payload.source_ref, payload.target_ref, model_service)


@router.get("/analyses", response_model=AnalysisListResponse, tags=["analysis"])
def get_analyses(
    search: str = Query(default="", max_length=120),
    outcome: Literal["clean", "conflict"] | None = None,
    repository_id: str | None = Query(default=None, max_length=80),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=100_000),
) -> dict:
    items, total = store.analyses(query=search, merge_check=outcome, repository_id=repository_id, limit=limit, offset=offset)
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/analyses/compare", tags=["analysis"])
def compare_analyses(left_id: str = Query(min_length=1, max_length=80), right_id: str = Query(min_length=1, max_length=80)) -> dict:
    if left_id == right_id:
        raise HTTPException(status_code=422, detail="Choose two different saved analyses to compare.")
    left = store.analysis(left_id)
    right = store.analysis(right_id)
    if left is None or right is None:
        raise HTTPException(status_code=404, detail="Both saved analyses must exist before comparison.")
    features = sorted(set(left["feature_values"]) | set(right["feature_values"]))
    differences = {
        name: {"left": left["feature_values"].get(name), "right": right["feature_values"].get(name)}
        for name in features
        if left["feature_values"].get(name) != right["feature_values"].get(name)
    }
    return {"left": left, "right": right, "feature_differences": differences}


@router.get("/analyses/{analysis_id}", response_model=RepositoryAnalysis, tags=["analysis"])
def get_analysis(analysis_id: str) -> dict:
    record = store.analysis(analysis_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Analysis not found.")
    return record


@router.get("/dashboard", response_model=DashboardAnalyticsResponse, tags=["dashboard"])
def dashboard_analytics() -> dict:
    return store.dashboard()


@router.get("/integration-status", response_model=SystemIntegrationStatus, tags=["system"])
def integration_status() -> dict:
    try:
        git_version = repository_service._run(["git", "--version"], timeout=3).decode().strip()
        git_available = git_version.startswith("git version ")
    except repository_service.RepositoryError:
        git_available = False
    return {
        "database_available": store.is_available(),
        "git_available": git_available,
        "local_repository_connection_enabled": bool(settings.local_repository_roots),
        "public_github_connection_enabled": True,
    }
