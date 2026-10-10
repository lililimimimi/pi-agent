"""
FastAPI application entry point.

Dev startup:
    cd backend
    uvicorn app.main:app --port 8000 --reload

Production:
    uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
"""

from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()  # 自动读取 backend/.env

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.errors import AppError
from app.logging import setup_logging

setup_logging(level=os.getenv("LOG_LEVEL", "DEBUG"))

# Sync Pi CLI OAuth + env-var API keys → config.json (used by the model settings UI)
from app.config.sync import sync_env_vars_to_config, sync_pi_oauth_to_config

sync_pi_oauth_to_config()  # Pi CLI OAuth (Claude.ai 订阅)
sync_env_vars_to_config()  # env vars (ANTHROPIC_API_KEY 等)
from app.config.sync import sync_codex_login_to_config

sync_codex_login_to_config()  # OpenAI subscription login (Pi auth.json)

# --------------------------------------------------------------------------- #
# FastAPI app
# --------------------------------------------------------------------------- #

app = FastAPI(
    title="Code Assistant API",
    version="0.3.0",
    description="SSE-streaming agent with tool execution and approval flow.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------------------------------------------- #
# Routers
# --------------------------------------------------------------------------- #


def error_body(code: str, message: str) -> dict[str, dict[str, str]]:
    return {"error": {"code": code, "message": message}}


async def app_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Domain errors: the status comes from the error class itself."""
    if not isinstance(exc, AppError):
        raise exc
    return JSONResponse(
        status_code=exc.status_code, content=error_body(exc.code, exc.message)
    )


async def http_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Errors FastAPI raises itself (e.g. unknown route), in the same shape as domain errors."""
    if not isinstance(exc, StarletteHTTPException):
        raise exc
    return JSONResponse(
        status_code=exc.status_code,
        content=error_body("HTTP_ERROR", str(exc.detail)),
    )


async def validation_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Request bodies that do not match their model, in the same shape as domain errors."""
    if not isinstance(exc, RequestValidationError):
        raise exc
    first = exc.errors()[0] if exc.errors() else {}
    where = ".".join(str(part) for part in first.get("loc", ()) if part != "body")
    message = (
        f"{where}: {first.get('msg', 'invalid value')}"
        if where
        else str(first.get("msg", "invalid request"))
    )
    return JSONResponse(
        status_code=422, content=error_body("VALIDATION_ERROR", message)
    )


app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(StarletteHTTPException, http_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)

from app.api.chat import router as chat_router
from app.api.files import router as files_router
from app.api.filesystem import router as filesystem_router
from app.api.models import router as models_router
from app.api.preview import router as preview_router
from app.api.projects import router as projects_router
from app.api.providers import router as providers_router
from app.api.sessions import router as sessions_router

app.include_router(chat_router)
app.include_router(models_router)
app.include_router(sessions_router)
app.include_router(projects_router)
app.include_router(filesystem_router)
app.include_router(providers_router)
app.include_router(preview_router)
app.include_router(files_router)
