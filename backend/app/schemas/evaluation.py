"""Public, path-free summary of the saved model evaluation report."""

from pydantic import BaseModel


class ModelEvaluationResponse(BaseModel):
    status: str
    model_name: str
    artifact_type: str
    production_ready: bool
    trained_at_utc: str | None
    dataset_rows: int
    repository_group_count: int
    split_method: str
    test_rows: int
    precision: float | None
    recall: float | None
    f1: float | None
    roc_auc: float | None
    confusion_matrix: list[list[int]]
