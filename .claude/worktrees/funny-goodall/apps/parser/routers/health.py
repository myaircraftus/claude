import os
import logging

from fastapi import APIRouter
from pydantic import BaseModel
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str
    version: str


class ReadyResponse(BaseModel):
    ready: bool
    openai: bool


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Liveness probe – always returns 200 if the service is running."""
    return HealthResponse(status="ok", version="1.0.0")


@router.get("/ready", response_model=ReadyResponse)
async def readiness_check() -> ReadyResponse:
    """Readiness probe – checks external dependencies."""
    openai_ok = False

    api_key = os.getenv("OPENAI_API_KEY", "")
    if api_key:
        try:
            client = AsyncOpenAI(api_key=api_key)
            await client.models.list()
            openai_ok = True
        except Exception as exc:  # noqa: BLE001
            logger.warning("OpenAI readiness check failed: %s", exc)

    return ReadyResponse(ready=openai_ok, openai=openai_ok)
