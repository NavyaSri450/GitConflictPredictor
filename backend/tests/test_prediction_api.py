from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import create_app
from app.services.model_service import ModelService
from ml.features import FEATURE_NAMES, MODEL_FEATURES


class StubEstimator:
    classes_ = np.array([0, 1])
    named_steps = {"model": type("RandomForestClassifier", (), {})()}

    def __init__(self, fails: bool = False) -> None:
        self.fails = fails

    def predict(self, values: Any) -> np.ndarray:
        if self.fails:
            raise RuntimeError("private internal failure")
        return np.array([1 if values.iloc[0]["files_changed"] >= 10 else 0])

    def predict_proba(self, values: Any) -> np.ndarray:
        if self.fails:
            raise RuntimeError("private internal failure")
        conflict = 0.8 if values.iloc[0]["files_changed"] >= 10 else 0.2
        return np.array([[1 - conflict, conflict]])


def _bundle(estimator: StubEstimator | None = None) -> dict[str, Any]:
    return {
        "bundle_version": 2,
        "feature_names": list(MODEL_FEATURES),
        "api_feature_names": list(FEATURE_NAMES),
        "target_column": "merge_conflict",
        "class_mapping": {"0": "clean_merge", "1": "merge_conflict"},
        "model_name": "random_forest",
        "artifact_type": "exploratory",
        "production_ready": False,
        "dataset_sha256": "a" * 64,
        "estimator": estimator or StubEstimator(),
        "evaluation": {},
    }


@pytest.fixture
def client() -> TestClient:
    service = ModelService(loader=lambda _: _bundle())
    app = create_app(service)
    with TestClient(app) as test_client:
        yield test_client


def _payload(**changes: Any) -> dict[str, Any]:
    return {
        "files_changed": 4,
        "lines_added": 80,
        "avg_files_per_commit": 3.5,
        "branch_commits": 8,
        "branch_files_changed": 5,
        **changes,
    }


def test_clean_merge_prediction_has_expected_response_schema(client: TestClient) -> None:
    response = client.post("/api/v1/predict", json=_payload())
    assert response.status_code == 200
    body = response.json()
    assert body["prediction"] == 0
    assert body["prediction_label"] == "Clean merge estimate"
    assert body["predicted_class"] == "clean_merge"
    assert body["class_probabilities"] == {"clean_merge": 0.8, "merge_conflict": 0.2}
    assert body["model_name"] == "random_forest"
    assert body["model_status"].startswith("exploratory")
    assert body["features_used"] == list(MODEL_FEATURES)
    assert "not calibrated confidence" in body["probability_note"]
    assert body["predicted_at"]


def test_conflict_prediction_and_legacy_route(client: TestClient) -> None:
    response = client.post("/api/predict", json=_payload(files_changed=12))
    assert response.status_code == 200
    assert response.json()["prediction"] == 1
    assert response.json()["predicted_class"] == "merge_conflict"


def test_missing_required_feature_returns_consistent_validation_error(client: TestClient) -> None:
    payload = _payload()
    payload.pop("branch_commits")
    response = client.post("/api/v1/predict", json=payload)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert any(item["field"] == "branch_commits" for item in response.json()["error"]["fields"])


@pytest.mark.parametrize("value", ["many", True])
def test_invalid_string_or_boolean_input_is_rejected(client: TestClient, value: Any) -> None:
    response = client.post("/api/v1/predict", json=_payload(files_changed=value))
    assert response.status_code == 422


@pytest.mark.parametrize("field", ["files_changed", "lines_added", "branch_commits", "branch_files_changed"])
def test_negative_count_is_rejected(client: TestClient, field: str) -> None:
    response = client.post("/api/v1/predict", json=_payload(**{field: -1}))
    assert response.status_code == 422


def test_average_files_per_commit_accepts_decimal(client: TestClient) -> None:
    response = client.post("/api/v1/predict", json=_payload(avg_files_per_commit=3.25))
    assert response.status_code == 200


def test_optional_contract_fields_are_accepted_but_excluded_from_model(client: TestClient) -> None:
    response = client.post(
        "/api/v1/predict",
        json=_payload(commit_severity=0.4, developer_commits=12, coverage=0.8, pattern_risk=0.2),
    )
    assert response.status_code == 200
    assert response.json()["features_used"] == list(MODEL_FEATURES)


def test_fractional_count_is_rejected(client: TestClient) -> None:
    response = client.post("/api/v1/predict", json=_payload(files_changed=2.5))
    assert response.status_code == 422


@pytest.mark.parametrize("value", [float("nan"), float("inf"), -float("inf")])
def test_nan_and_infinity_are_rejected(client: TestClient, value: float) -> None:
    payload = _payload(avg_files_per_commit=value)
    response = client.post(
        "/api/v1/predict",
        content=json.dumps(payload, allow_nan=True),
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422


def test_extremely_large_value_is_rejected(client: TestClient) -> None:
    response = client.post("/api/v1/predict", json=_payload(lines_added=1_000_000_001))
    assert response.status_code == 422


def test_integer_too_large_for_float_conversion_is_a_validation_error(client: TestClient) -> None:
    body = (
        '{"files_changed":' + "9" * 400
        + ',"lines_added":80,"avg_files_per_commit":3.5,"branch_commits":8,"branch_files_changed":5}'
    )
    response = client.post("/api/v1/predict", content=body, headers={"Content-Type": "application/json"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert "OverflowError" not in response.text


def test_oversized_request_body_is_rejected_with_sanitized_response(client: TestClient) -> None:
    body = json.dumps({**_payload(), "unexpected": "x" * (17 * 1024)})
    response = client.post(
        "/api/v1/predict",
        content=body,
        headers={"Content-Type": "application/json", "Origin": "http://localhost:5173"},
    )
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"
    assert "x" * 100 not in response.text
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_chunked_oversized_request_without_content_length_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/v1/predict",
        content=(chunk for chunk in [b"{" + b" " * 9_000, b" " * 9_000 + b"}"]),
        headers={"Content-Type": "application/json", "Transfer-Encoding": "chunked"},
    )
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"


def test_malformed_json_returns_sanitized_error(client: TestClient) -> None:
    response = client.post("/api/v1/predict", content=b'{"files_changed":', headers={"Content-Type": "application/json"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert "input" not in response.text


def test_model_info_exposes_only_safe_metadata(client: TestClient) -> None:
    response = client.get("/api/v1/model-info")
    body = response.json()
    assert response.status_code == 200
    assert body["model_name"] == "random_forest"
    assert body["model_type"] == "RandomForestClassifier"
    assert body["model_status"] == "exploratory_available"
    assert body["supported_features"] == list(MODEL_FEATURES)
    assert body["supported_feature_count"] == 5
    assert body["feature_contract_size"] == 18
    assert body["dataset_sha256"] == "a" * 64
    assert "model_path" not in body


def test_probabilities_are_valid(client: TestClient) -> None:
    probabilities = client.post("/api/v1/predict", json=_payload()).json()["class_probabilities"]
    assert all(0 <= value <= 1 for value in probabilities.values())
    assert sum(probabilities.values()) == pytest.approx(1.0)


def test_prediction_failure_is_sanitized() -> None:
    service = ModelService(loader=lambda _: _bundle(StubEstimator(fails=True)))
    with TestClient(create_app(service)) as test_client:
        response = test_client.post("/api/v1/predict", json=_payload())
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "PREDICTION_FAILED"
    assert "private internal failure" not in response.text


def test_missing_model_keeps_health_but_fails_readiness_and_prediction() -> None:
    service = ModelService(model_path=Path(".test_missing_model.joblib"))
    with TestClient(create_app(service)) as test_client:
        assert test_client.get("/health").status_code == 200
        readiness = test_client.get("/ready")
        prediction = test_client.post("/api/v1/predict", json=_payload())
    assert readiness.status_code == prediction.status_code == 503
    assert readiness.json()["error"]["code"] == "MODEL_UNAVAILABLE"


def test_invalid_model_bundle_fails_readiness() -> None:
    invalid_path = Path(".test_invalid_model_bundle.joblib")
    joblib.dump({"not_a_gitnexus_bundle": True}, invalid_path)
    service = ModelService(model_path=invalid_path)
    try:
        with TestClient(create_app(service)) as test_client:
            assert test_client.get("/ready").status_code == 503
    finally:
        invalid_path.unlink(missing_ok=True)


def test_actual_saved_model_loads_and_serves_prediction() -> None:
    with TestClient(create_app()) as test_client:
        ready = test_client.get("/ready")
        info = test_client.get("/api/v1/model-info")
        prediction = test_client.post("/api/v1/predict", json=_payload())
    assert ready.status_code == 200
    assert info.json()["model_name"] == "random_forest"
    assert prediction.status_code == 200
    assert prediction.json()["model_status"].startswith("exploratory")


def test_cors_allows_configured_local_frontend_origin(client: TestClient) -> None:
    response = client.options(
        "/api/v1/predict",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_cors_allows_local_production_preview_origin(client: TestClient) -> None:
    response = client.options(
        "/api/v1/predict",
        headers={
            "Origin": "http://127.0.0.1:4173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:4173"


def test_cors_does_not_allow_unconfigured_origin(client: TestClient) -> None:
    response = client.options(
        "/api/v1/predict",
        headers={
            "Origin": "https://untrusted.example",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_production_cors_requires_explicit_origins(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.delenv("GITNEXUS_CORS_ORIGINS", raising=False)
    with pytest.raises(ValueError, match="explicitly"):
        _ = settings.cors_origins
    monkeypatch.setenv("GITNEXUS_CORS_ORIGINS", "*")
    with pytest.raises(ValueError, match="wildcard"):
        _ = settings.cors_origins
    monkeypatch.setenv("GITNEXUS_CORS_ORIGINS", "https://app.example.test")
    assert settings.cors_origins == ["https://app.example.test"]


def test_unexpected_fields_are_rejected(client: TestClient) -> None:
    response = client.post("/api/v1/predict", json=_payload(repository_id="private-repo"))
    assert response.status_code == 422


def test_unsupported_method_has_consistent_error(client: TestClient) -> None:
    response = client.put("/api/v1/predict", json=_payload())
    assert response.status_code == 405
    assert response.json()["error"]["code"] == "METHOD_NOT_ALLOWED"
