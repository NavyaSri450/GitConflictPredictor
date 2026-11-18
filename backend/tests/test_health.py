from fastapi.testclient import TestClient

from app.main import app


def test_health_reports_process_and_loaded_model_state() -> None:
    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "gitnexus-ai-api",
        "model_available": True,
    }


def test_readiness_reports_prediction_dependency() -> None:
    with TestClient(app) as client:
        response = client.get("/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready", "model_available": True}
