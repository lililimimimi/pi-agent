"""
Global singleton registries — populated in main.py on startup.
Import here to get the shared instances; patch here in tests.
"""
from __future__ import annotations

from typing import Any

from app.models.base import ModelRouter
from app.tools.base import ToolRegistry

model_router: ModelRouter = ModelRouter()
tool_registry: ToolRegistry = ToolRegistry()
security_interceptor: Any | None = None
