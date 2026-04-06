import os
import logging
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI, Request, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from openai import AsyncOpenAI
from dotenv import load_dotenv

from routers import health, ingest, pipeline

load_dotenv()

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Sentry
# ---------------------------------------------------------------------------
SENTRY_DSN = os.getenv("SENTRY_DSN", "")
if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        traces_sample_rate=0.2,
        profiles_sample_rate=0.1,
    )

# ---------------------------------------------------------------------------
# Lifespan: startup / shutdown
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup tasks."""
    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key:
        logger.warning("OPENAI_API_KEY is not set – OpenAI calls will fail")
    else:
        try:
            client = AsyncOpenAI(api_key=api_key)
            # Lightweight connectivity test: list models (cheap call)
            models = await client.models.list()
            logger.info("OpenAI connection OK – %d models available", len(models.data))
        except Exception as exc:  # noqa: BLE001
            logger.error("OpenAI connectivity test failed on startup: %s", exc)

    yield  # application runs

    logger.info("Parser service shutting down")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="myaircraft Parser Service",
    version="1.0.0",
    description="Internal microservice for PDF ingestion, OCR, and semantic chunking",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS – internal services only (no browser origin needed; restricts to known
# internal hosts as an extra safety layer)
# ---------------------------------------------------------------------------
INTERNAL_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:8080,http://web:8080",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in INTERNAL_ORIGINS],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Internal secret middleware
# ---------------------------------------------------------------------------
PARSER_SERVICE_SECRET = os.getenv("PARSER_SERVICE_SECRET", "")
# Routes that do NOT require the secret header (e.g. health probes)
_PUBLIC_PATHS = {"/health", "/ready", "/docs", "/openapi.json", "/redoc"}


@app.middleware("http")
async def require_internal_secret(request: Request, call_next):
    if request.url.path in _PUBLIC_PATHS:
        return await call_next(request)

    if not PARSER_SERVICE_SECRET:
        # Secret not configured – allow through (dev mode), log a warning
        logger.warning(
            "PARSER_SERVICE_SECRET is not set; all requests are allowed through"
        )
        return await call_next(request)

    secret_header = request.headers.get("X-Internal-Secret", "")
    if secret_header != PARSER_SERVICE_SECRET:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"detail": "Forbidden: invalid or missing X-Internal-Secret header"},
        )

    return await call_next(request)


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(health.router)
app.include_router(ingest.router, prefix="/ingest", tags=["ingest"])
app.include_router(pipeline.router, prefix="/pipeline", tags=["pipeline"])


# ---------------------------------------------------------------------------
# Root
# ---------------------------------------------------------------------------
@app.get("/", include_in_schema=False)
async def root():
    return {"service": "myaircraft-parser", "version": "1.0.0"}
