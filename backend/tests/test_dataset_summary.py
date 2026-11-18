from pathlib import Path

import pandas as pd
import pytest
from fastapi import FastAPI, status
from fastapi.testclient import TestClient
from fastapi import HTTPException

from app.services import dataset_summary
from app.api.router import v1_router
from ml.features import DATASET_COLUMNS


def test_dataset_summary_api_exposes_aggregate_schema_only() -> None:
    app = FastAPI()
    app.include_router(v1_router, prefix="/api")
    with TestClient(app) as client:
        response = client.get("/api/v1/dataset-summary")

    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert body["status"] == "available"
    assert body["feature_count"] == 18
    assert body["provenance_count"] == 11
    assert "repo_fingerprint" not in response.text
    assert "source_ref" not in response.text
    assert "source_commit" not in response.text


def test_dataset_summary_reports_verified_local_aggregates_without_provenance(monkeypatch: pytest.MonkeyPatch) -> None:
    raw_path, processed_path = dataset_summary.dataset_paths()
    monkeypatch.setattr(dataset_summary, "dataset_paths", lambda: (raw_path, processed_path))

    summary = dataset_summary.get_dataset_summary()
    raw = pd.read_csv(raw_path)
    processed = pd.read_csv(processed_path)

    assert summary.status == "available"
    assert summary.raw_rows == len(raw)
    assert summary.processed_rows == len(processed)
    assert summary.repository_group_count == raw["repo_fingerprint"].nunique()
    assert summary.class_counts == {"0": int((raw["merge_conflict"] == 0).sum()), "1": int((raw["merge_conflict"] == 1).sum())}
    assert summary.feature_count == len(DATASET_COLUMNS) - 1 - summary.provenance_count
    assert summary.provenance_count == 11
    assert len(summary.feature_aggregates) == 18
    assert summary.feature_aggregates[0].observed_count == raw["files_changed"].notna().sum()
    assert summary.feature_aggregates[2].missing_count == raw["commit_severity"].isna().sum()
    serialized = summary.model_dump_json()
    assert "source_ref" not in serialized
    assert "base_commit" not in serialized
    assert "repo_fingerprint" not in serialized


def test_dataset_summary_reports_unavailable_when_local_csv_is_missing(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(dataset_summary, "dataset_paths", lambda: (tmp_path / "raw.csv", tmp_path / "processed.csv"))
    with pytest.raises(HTTPException) as error:
        dataset_summary.get_dataset_summary()
    assert error.value.status_code == 503
    assert error.value.detail == "Local dataset files are unavailable."


def test_dataset_summary_rejects_unknown_or_reordered_dataset_schema(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    raw_path = tmp_path / "raw.csv"
    processed_path = tmp_path / "processed.csv"
    pd.DataFrame(columns=list(reversed(DATASET_COLUMNS))).to_csv(raw_path, index=False)
    pd.DataFrame(columns=DATASET_COLUMNS).to_csv(processed_path, index=False)
    monkeypatch.setattr(dataset_summary, "dataset_paths", lambda: (raw_path, processed_path))
    with pytest.raises(HTTPException) as error:
        dataset_summary.get_dataset_summary()
    assert error.value.status_code == 503
    assert error.value.detail == "Local dataset summary could not be verified."
