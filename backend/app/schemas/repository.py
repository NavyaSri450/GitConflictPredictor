"""Validated contracts for read-only repository analysis and its history."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.prediction import PredictionResponse


class RepositoryConnectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["github_url", "local_path"]
    value: str = Field(min_length=1, max_length=2048)


class RepositorySummary(BaseModel):
    id: str
    kind: Literal["github_url", "local_path"]
    name: str
    owner: str | None
    default_branch: str
    branch_count: int = Field(ge=1)
    connected_at: str


class RepositoryListResponse(BaseModel):
    repositories: list[RepositorySummary]


class BranchSummary(BaseModel):
    name: str
    ref: str
    commit_sha: str
    is_default: bool = False


class BranchListResponse(BaseModel):
    repository: RepositorySummary
    branches: list[BranchSummary]


class AnalyzeRepositoryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_ref: str = Field(min_length=1, max_length=512)
    target_ref: str = Field(min_length=1, max_length=512)


class RepositoryAnalysis(BaseModel):
    id: str
    repository_id: str
    repository_name: str
    source_branch: str
    target_branch: str
    source_commit: str
    target_commit: str
    merge_base: str
    source_only_commits: int
    target_only_commits: int
    source_changed_files: list[str]
    target_changed_files: list[str]
    overlapping_paths: list[str]
    source_lines_added: int
    source_lines_deleted: int
    target_lines_added: int
    target_lines_deleted: int
    feature_values: dict[str, int | float | None]
    merge_check: Literal["clean", "conflict"]
    prediction: PredictionResponse | None
    prediction_unavailable_reason: str | None
    created_at: str


class AnalysisListResponse(BaseModel):
    items: list[RepositoryAnalysis]
    total: int = Field(ge=0)
    limit: int = Field(ge=1)
    offset: int = Field(ge=0)


class DashboardAnalyticsResponse(BaseModel):
    repository_count: int = Field(ge=0)
    analysis_count: int = Field(ge=0)
    clean_merge_checks: int = Field(ge=0)
    conflicting_merge_checks: int = Field(ge=0)
    predictions_available: int = Field(ge=0)
    recent_analyses: list[RepositoryAnalysis]
    activity_by_date: list[dict[str, int | str]]


class SystemIntegrationStatus(BaseModel):
    database_available: bool
    git_available: bool
    local_repository_connection_enabled: bool
    public_github_connection_enabled: bool = True
