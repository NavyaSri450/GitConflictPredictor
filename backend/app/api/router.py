"""Versioned prediction APIs and a backward-compatible route alias."""

from fastapi import APIRouter, Request

from app.schemas.prediction import ModelInfoResponse, PredictionRequest, PredictionResponse
from app.schemas.dataset import DatasetSummaryResponse
from app.schemas.evaluation import ModelEvaluationResponse
from app.services.dataset_summary import get_dataset_summary
from app.services.model_evaluation import get_model_evaluation
from app.services.model_service import ModelService
from app.api.repositories import router as repository_router

api_router = APIRouter()
v1_router = APIRouter(prefix="/v1")


def _model_service(request: Request) -> ModelService:
    return request.app.state.model_service


@v1_router.post("/predict", response_model=PredictionResponse, tags=["predictions"])
def predict_merge_conflict(payload: PredictionRequest, request: Request) -> dict:
    """Return an exploratory estimate from the saved five-feature model."""
    return _model_service(request).predict(payload.model_dump())


@api_router.post("/predict", response_model=PredictionResponse, tags=["predictions"], include_in_schema=False)
def predict_merge_conflict_legacy(payload: PredictionRequest, request: Request) -> dict:
    """Retain the frontend's pre-versioned URL during this backend-only stage."""
    return _model_service(request).predict(payload.model_dump())


@v1_router.get("/model-info", response_model=ModelInfoResponse, tags=["model"])
def model_information(request: Request) -> dict:
    return _model_service(request).model_info()


@v1_router.get("/dataset-summary", response_model=DatasetSummaryResponse, tags=["dataset"])
def dataset_summary() -> DatasetSummaryResponse:
    """Return local aggregate dataset quality statistics without provenance rows."""
    return get_dataset_summary()


@v1_router.get("/model-evaluation", response_model=ModelEvaluationResponse, tags=["model"])
def model_evaluation() -> ModelEvaluationResponse:
    return get_model_evaluation()


api_router.include_router(v1_router)
api_router.include_router(repository_router)
