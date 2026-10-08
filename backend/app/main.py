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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.logging import setup_logging

setup_logging(level=os.getenv("LOG_LEVEL", "DEBUG"))

# Sync Pi CLI OAuth + env-var API keys → config.json (used by the model settings UI)
from app.config.providers import sync_env_vars_to_config, sync_pi_oauth_to_config  # noqa: E402
sync_pi_oauth_to_config()   # Pi CLI OAuth (Claude.ai 订阅)
sync_env_vars_to_config()   # env vars (ANTHROPIC_API_KEY 等)
from app.config.providers import sync_codex_login_to_config  # noqa: E402
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

from app.api.chat import router as chat_router  # noqa: E402
from app.api.models import router as models_router  # noqa: E402
from app.api.sessions import router as sessions_router  # noqa: E402
from app.api.projects import router as projects_router  # noqa: E402
from app.api.filesystem import router as filesystem_router  # noqa: E402
from app.api.providers import router as providers_router  # noqa: E402
from app.api.preview import router as preview_router  # noqa: E402
from app.api.files import router as files_router  # noqa: E402

app.include_router(chat_router)
app.include_router(models_router)
app.include_router(sessions_router)
app.include_router(projects_router)
app.include_router(filesystem_router)
app.include_router(providers_router)
app.include_router(preview_router)
app.include_router(files_router)
