"""HTTP schemas that retain the 18-field API contract and require model inputs."""

import math
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

MAX_INPUT_VALUE = 1_000_000_000


class PredictionRequest(BaseModel):
    """Five required model inputs plus the 13 optional contract fields."""

    model_config = ConfigDict(extra="forbid")

    files_changed: Annotated[int, Field(ge=0, le=MAX_INPUT_VALUE)]
    lines_added: Annotated[int, Field(ge=0, le=MAX_INPUT_VALUE)]
    commit_severity: float | None = Field(default=None, ge=0, le=1)
    developer_commits: Annotated[int, Field(ge=0, le=MAX_INPUT_VALUE)] | None = None
    avg_files_per_commit: Annotated[float, Field(ge=0, le=MAX_INPUT_VALUE)]
    developer_conflicts: Annotated[int, Field(ge=0, le=MAX_INPUT_VALUE)] | None = None
    activity_score: Annotated[float, Field(ge=0, le=MAX_INPUT_VALUE)] | None = None
    import_count: Annotated[int, Field(ge=0, le=MAX_INPUT_VALUE)] | None = None
    dependency_conflicts: Annotated[int, Field(ge=0, le=MAX_INPUT_VALUE)] | None = None
    coverage: float | None = Field(default=None, ge=0, le=1)
    branch_commits: Annotated[int, Field(ge=0, le=MAX_INPUT_VALUE)]
    branch_files_changed: Annotated[int, Field(ge=0, le=MAX_INPUT_VALUE)]
    branch_conflicts: Annotated[int, Field(ge=0, le=MAX_INPUT_VALUE)] | None = None
    branch_risk_score: Annotated[float, Field(ge=0, le=MAX_INPUT_VALUE)] | None = None
    pattern_frequency: Annotated[int, Field(ge=0, le=MAX_INPUT_VALUE)] | None = None
    pattern_conflicts: Annotated[int, Field(ge=0, le=MAX_INPUT_VALUE)] | None = None
    dependency_risk: float | None = Field(default=None, ge=0, le=1)
    pattern_risk: float | None = Field(default=None, ge=0, le=1)

    @field_validator("*", mode="before")
    @classmethod
    def require_finite_json_numbers(cls, value: object) -> object:
        if value is None:
            return value
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("must be a JSON number")
        # Python integers are finite and converting an attacker-sized integer
        # to float can raise OverflowError before Pydantic returns a 422.
        if isinstance(value, float) and not math.isfinite(value):
            raise ValueError("must be finite")
        return value


class ClassProbabilities(BaseModel):
    clean_merge: float = Field(ge=0, le=1)
    merge_conflict: float = Field(ge=0, le=1)


class PredictionResponse(BaseModel):
    prediction: int = Field(ge=0, le=1)
    prediction_label: str
    predicted_class: str
    class_probabilities: ClassProbabilities
    probability_note: str
    model_name: str
    model_status: str
    features_used: list[str]
    predicted_at: str
    message: str


class ModelInfoResponse(BaseModel):
    model_name: str
    model_type: str | None
    model_status: str
    supported_features: list[str]
    supported_feature_count: int
    feature_contract_size: int
    class_mapping: dict[str, str]
    dataset_sha256: str | None


class ApiErrorDetail(BaseModel):
    code: str
    message: str
    fields: list[dict[str, str]] | None = None


class ApiErrorResponse(BaseModel):
    error: ApiErrorDetail
    timestamp: str
