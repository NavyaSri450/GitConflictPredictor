"""FastAPI application with process-lifetime model loading."""

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.core.errors import register_error_handlers
from app.core.middleware import RequestSizeLimitMiddleware
from app.schemas.health import HealthResponse, ReadinessResponse
from app.services.model_service import ModelService, ModelUnavailableError


def create_app(model_service: ModelService | None = None) -> FastAPI:
    """Create the application; service injection is intended for tests only."""
    service = model_service or ModelService()

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        service.load()
        application.state.model_service = service
        yield

    application = FastAPI(title=settings.app_name, version="0.2.0", lifespan=lifespan)
    application.add_middleware(RequestSizeLimitMiddleware, max_body_bytes=16 * 1024)
    # CORS must wrap the request-size middleware so browser clients can read
    # sanitized 400/413 errors as well as normal API responses.
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "Accept"],
    )
    application.include_router(api_router, prefix="/api")
    register_error_handlers(application)

    @application.get("/health", response_model=HealthResponse, tags=["system"])
    def health_check() -> HealthResponse:
        return HealthResponse(status="ok", service="gitnexus-ai-api", model_available=service.is_ready)

    @application.get("/ready", response_model=ReadinessResponse, tags=["system"])
    def readiness_check() -> ReadinessResponse:
        if not service.is_ready:
            raise ModelUnavailableError("The model has not loaded.")
        return ReadinessResponse(status="ready", model_available=True)

    return application


app = create_app()
