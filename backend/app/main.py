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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.logging import configure_logging
from app.models.base import MockProvider
from app.tools.read_file import ReadFileTool
from app.tools.write_file import WriteFileTool
from app.tools.git_tool import GitTool

# --------------------------------------------------------------------------- #
# Logging
# --------------------------------------------------------------------------- #

configure_logging(level=os.getenv("LOG_LEVEL", "INFO"))

# --------------------------------------------------------------------------- #
# Registries (populated here; importable from app.container everywhere else)
# --------------------------------------------------------------------------- #

import app.container as container  # noqa: E402  (after configure_logging)

# Default: mock provider for local dev without an API key
container.model_router.register(MockProvider())

# DeepSeek provider — default when key is present
if os.getenv("DEEPSEEK_API_KEY"):
    try:
        from app.models.deepseek import DeepSeekProvider
        container.model_router.register(DeepSeekProvider())
    except Exception:  # noqa: BLE001
        pass

# Claude provider — only if key is present
if os.getenv("ANTHROPIC_API_KEY"):
    try:
        from app.models.claude import ClaudeProvider
        container.model_router.register(ClaudeProvider())
    except Exception:  # noqa: BLE001
        pass  # log will show the error; app still starts with mock

# Tools
container.tool_registry.register(ReadFileTool())
container.tool_registry.register(WriteFileTool())
container.tool_registry.register(GitTool())

# Security
from app.security import SecurityInterceptor  # noqa: E402
container.security_interceptor = SecurityInterceptor(project_root=os.getcwd())

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

app.include_router(chat_router)
app.include_router(models_router)
