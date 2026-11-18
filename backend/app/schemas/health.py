from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    service: str
    model_available: bool


class ReadinessResponse(BaseModel):
    status: str
    model_available: bool
