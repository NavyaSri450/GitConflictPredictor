"""Validate a labeled dataset without filling missing feature values."""

from dataclasses import asdict, dataclass
from pathlib import Path

import pandas as pd
import numpy as np

from ml.features import (
    DATASET_COLUMNS,
    FEATURE_BY_NAME,
    FEATURE_NAMES,
    INTEGER_FEATURES,
    MODEL_FEATURES,
    PROVENANCE_COLUMNS,
    TARGET_COLUMN,
)


@dataclass
class ValidationReport:
    row_count: int
    class_distribution: dict[int, int]
    repository_group_count: int
    missing_by_feature: dict[str, int]
    errors: list[str]
    warnings: list[str]

    @property
    def valid(self) -> bool:
        return not self.errors

    def to_dict(self) -> dict:
        result = asdict(self)
        result["valid"] = self.valid
        return result


def validate_frame(frame: pd.DataFrame) -> tuple[pd.DataFrame, ValidationReport]:
    """Check column contract, labels, provenance, numeric ranges and duplicates.

    Missing predictors remain NaN and are only reported here. A later training
    pipeline may impute them from the training split; source data is unchanged.
    """
    data = frame.copy()
    errors: list[str] = []
    warnings: list[str] = []
    missing_columns = [column for column in DATASET_COLUMNS if column not in data.columns]
    if missing_columns:
        errors.append("Missing required columns: " + ", ".join(missing_columns))
    unexpected_columns = [column for column in data.columns if column not in DATASET_COLUMNS]
    if unexpected_columns:
        errors.append("Unexpected columns are not allowed (prevents accidental collection of unreviewed/private data): " + ", ".join(unexpected_columns))

    for column in FEATURE_NAMES:
        if column not in data:
            continue
        original = data[column]
        numeric = pd.to_numeric(original, errors="coerce")
        invalid_text = original.notna() & numeric.isna()
        if invalid_text.any():
            errors.append(f"{column} contains {int(invalid_text.sum())} non-numeric value(s).")
        data[column] = numeric.astype(float)
        spec = FEATURE_BY_NAME[column]
        non_finite = data[column].notna() & ~np.isfinite(data[column])
        if non_finite.any():
            errors.append(f"{column} contains {int(non_finite.sum())} non-finite value(s).")
        out_of_range = data[column].notna() & (data[column] < spec.minimum)
        if spec.maximum is not None:
            out_of_range |= data[column].notna() & (data[column] > spec.maximum)
        if out_of_range.any():
            errors.append(f"{column} has {int(out_of_range.sum())} value(s) outside [{spec.minimum}, {spec.maximum if spec.maximum is not None else 'unbounded'}].")
        if column in INTEGER_FEATURES:
            fractional = data[column].notna() & (data[column] % 1 != 0)
            if fractional.any():
                errors.append(f"{column} must contain whole numbers.")

    class_distribution: dict[int, int] = {}
    if TARGET_COLUMN in data:
        labels = pd.to_numeric(data[TARGET_COLUMN], errors="coerce")
        if labels.isna().any():
            errors.append(f"{TARGET_COLUMN} must be present and numeric for every row.")
        else:
            unique = set(labels.unique().tolist())
            if not unique.issubset({0, 1}):
                errors.append(f"{TARGET_COLUMN} must contain only 0 and 1; found {sorted(unique)}.")
            else:
                data[TARGET_COLUMN] = labels.astype("int64")
                class_distribution = {int(label): int(count) for label, count in labels.value_counts().sort_index().items()}

    for column in PROVENANCE_COLUMNS:
        if column in data and data[column].isna().any():
            errors.append(f"{column} must be present for every example.")
    if "snapshot_timestamp" in data:
        invalid_times = pd.to_datetime(data["snapshot_timestamp"], utc=True, errors="coerce").isna()
        if invalid_times.any():
            errors.append(f"snapshot_timestamp contains {int(invalid_times.sum())} invalid timestamp value(s).")
    identity_columns = ["repo_fingerprint", "source_commit", "target_commit"]
    if all(column in data for column in identity_columns) and data.duplicated(identity_columns).any():
        errors.append("Duplicate repository/source/target commit examples were found.")
    if "label_method" in data and data["label_method"].nunique(dropna=True) > 1:
        errors.append("Mixed label_method values are not allowed in one training dataset.")
    if "collector_version" in data and data["collector_version"].nunique(dropna=True) > 1:
        errors.append("Mixed collector_version values are not allowed in one training dataset; review feature semantics first.")
    if "git_version" in data and data["git_version"].nunique(dropna=True) > 1:
        warnings.append("Examples were labeled with multiple Git versions; review merge behavior compatibility before training.")

    missing_by_feature = {column: int(data[column].isna().sum()) for column in FEATURE_NAMES if column in data}
    for column, missing_count in missing_by_feature.items():
        if missing_count:
            warnings.append(f"{column} is missing in {missing_count}/{len(data)} row(s); raw missing values were preserved.")
        if len(data) and missing_count == len(data):
            if column in MODEL_FEATURES:
                warnings.append(f"{column} is a selected baseline input and is entirely missing; training cannot proceed.")
            else:
                warnings.append(f"{column} is entirely missing and is excluded from the current five-feature baseline.")

    repository_group_count = int(data["repo_fingerprint"].nunique(dropna=True)) if "repo_fingerprint" in data else 0
    return data, ValidationReport(len(data), class_distribution, repository_group_count, missing_by_feature, errors, warnings)


def validate_csv(path: str | Path) -> tuple[pd.DataFrame, ValidationReport]:
    dataset_path = Path(path)
    if not dataset_path.is_file():
        raise FileNotFoundError(f"Dataset file does not exist: {dataset_path}")
    # Preserve legitimate Git ref/alias strings such as "NA"; only blank CSV
    # cells denote missing numerical feature values.
    return validate_frame(pd.read_csv(dataset_path, keep_default_na=False, na_values=[""]))
