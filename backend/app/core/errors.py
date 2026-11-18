"""Small, consistent and sanitized HTTP error responses."""

import logging
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.schemas.prediction import ApiErrorResponse
from app.services.model_service import ModelPredictionError, ModelUnavailableError

logger = logging.getLogger(__name__)


def _error(status_code: int, code: str, message: str, fields: list[dict[str, str]] | None = None) -> JSONResponse:
    payload = ApiErrorResponse(
        error={"code": code, "message": message, "fields": fields},
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
    return JSONResponse(status_code=status_code, content=payload.model_dump(exclude_none=True))


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, error: RequestValidationError) -> JSONResponse:
        fields = []
        for item in error.errors():
            location = ".".join(str(part) for part in item.get("loc", ()) if part != "body") or "body"
            fields.append({"field": location, "message": "Invalid or missing value."})
        return _error(422, "VALIDATION_ERROR", "Request body is malformed or does not match the prediction schema.", fields)

    @app.exception_handler(ModelUnavailableError)
    async def model_unavailable(_: Request, __: ModelUnavailableError) -> JSONResponse:
        return _error(503, "MODEL_UNAVAILABLE", "The exploratory prediction model is unavailable.")

    @app.exception_handler(ModelPredictionError)
    async def prediction_error(_: Request, __: ModelPredictionError) -> JSONResponse:
        return _error(500, "PREDICTION_FAILED", "The model could not process this request.")

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, error: StarletteHTTPException) -> JSONResponse:
        if error.status_code == 404:
            return _error(404, "NOT_FOUND", "The requested endpoint was not found.")
        if error.status_code == 405:
            return _error(405, "METHOD_NOT_ALLOWED", "The request method is not supported for this endpoint.")
        return _error(error.status_code, "HTTP_ERROR", "The request could not be completed.")

    @app.exception_handler(Exception)
    async def unexpected_error(_: Request, error: Exception) -> JSONResponse:
        logger.exception("Unhandled API error.", exc_info=error)
        return _error(500, "INTERNAL_ERROR", "The server could not complete the request.")
