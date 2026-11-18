"""Read-only aggregate statistics for the local research dataset."""

from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import HTTPException

from app.core.config import settings
from app.schemas.dataset import DatasetSummaryResponse
from ml.features import DATASET_COLUMNS, FEATURE_NAMES, PROVENANCE_COLUMNS, TARGET_COLUMN
from ml.data.validate import validate_frame


def dataset_paths() -> tuple[Path, Path]:
    project_root = settings.project_root
    return (
        project_root / "ml" / "data" / "raw" / "merge_examples.csv",
        project_root / "ml" / "data" / "processed" / "merge_examples.csv",
    )


def get_dataset_summary() -> DatasetSummaryResponse:
    """Return aggregates only; never return branch refs or row-level provenance."""
    raw_path, processed_path = dataset_paths()
    if not raw_path.is_file() or not processed_path.is_file():
        raise HTTPException(status_code=503, detail="Local dataset files are unavailable.")

    try:
        raw = pd.read_csv(raw_path)
        processed = pd.read_csv(processed_path)
        if tuple(raw.columns) != DATASET_COLUMNS or tuple(processed.columns) != DATASET_COLUMNS:
            raise ValueError("Dataset schema does not match the documented contract.")
        if TARGET_COLUMN not in raw or raw[TARGET_COLUMN].isna().any():
            raise ValueError("Dataset target is unavailable.")
        if not raw[TARGET_COLUMN].isin((0, 1)).all():
            raise ValueError("Dataset target contains unsupported labels.")
        _, raw_validation = validate_frame(raw)
        _, processed_validation = validate_frame(processed)
        validation_status = "valid" if raw_validation.valid and processed_validation.valid and len(raw) == len(processed) else "invalid"

        aggregates = []
        for name in FEATURE_NAMES:
            values = pd.to_numeric(raw[name], errors="coerce")
            if (raw[name].notna() & values.isna()).any():
                raise ValueError(f"Feature {name} contains non-numeric observed values.")
            observed = values.dropna()
            if not np.isfinite(observed.to_numpy(dtype=float)).all():
                raise ValueError(f"Feature {name} contains non-finite values.")
            aggregates.append({
                "name": name,
                "observed_count": int(observed.count()),
                "missing_count": int(values.isna().sum()),
                "minimum": float(observed.min()) if not observed.empty else None,
                "mean": float(observed.mean()) if not observed.empty else None,
                "maximum": float(observed.max()) if not observed.empty else None,
            })

        groups = raw["repo_fingerprint"].dropna().astype(str)
        group_counts = groups.value_counts()
        # Stable anonymous labels communicate concentration without exposing IDs.
        group_order = sorted(group_counts.index, key=lambda value: (value,))
        group_distribution = [
            {"group": f"Repository group {index + 1:02d}", "examples": int(group_counts[name])}
            for index, name in enumerate(group_order)
        ]
        timeline = []
        if "collected_at" in raw:
            dates = pd.to_datetime(raw["collected_at"], errors="coerce", utc=True).dt.date
            counts = dates.dropna().value_counts().sort_index()
            timeline = [{"date": date.isoformat(), "examples": int(count)} for date, count in counts.items()]

        return DatasetSummaryResponse(
            status="available",
            validation_status=validation_status,
            raw_rows=len(raw),
            processed_rows=len(processed),
            feature_count=len(FEATURE_NAMES),
            provenance_count=len(PROVENANCE_COLUMNS),
            repository_group_count=int(groups.nunique()),
            repository_distribution=group_distribution,
            class_counts={str(label): int((raw[TARGET_COLUMN] == label).sum()) for label in (0, 1)},
            feature_aggregates=aggregates,
            collection_timeline=timeline,
            raw_available=True,
            processed_available=True,
        )
    except HTTPException:
        raise
    except (OSError, ValueError, pd.errors.ParserError, pd.errors.EmptyDataError) as error:
        raise HTTPException(status_code=503, detail="Local dataset summary could not be verified.") from error
