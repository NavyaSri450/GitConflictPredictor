"""Privacy-conscious aggregate views over locally supplied dataset files."""

from pydantic import BaseModel


class FeatureAggregate(BaseModel):
    name: str
    observed_count: int
    missing_count: int
    minimum: float | None
    mean: float | None
    maximum: float | None


class DailyCollectionCount(BaseModel):
    date: str
    examples: int


class RepositoryGroupCount(BaseModel):
    group: str
    examples: int


class DatasetSummaryResponse(BaseModel):
    status: str
    validation_status: str
    raw_rows: int
    processed_rows: int
    feature_count: int
    provenance_count: int
    repository_group_count: int
    repository_distribution: list[RepositoryGroupCount]
    class_counts: dict[str, int]
    feature_aggregates: list[FeatureAggregate]
    collection_timeline: list[DailyCollectionCount]
    raw_available: bool
    processed_available: bool
