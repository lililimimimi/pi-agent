"""
Models API routes:
  GET /api/models         → list of available models across all providers
  GET /api/models/default → first available non-mock provider + model (fallback: mock)
"""
from __future__ import annotations

from fastapi import APIRouter

import app.container as container

router = APIRouter(prefix="/api")


@router.get("/models")
async def list_models() -> list[dict]:
    """Return all registered models from all providers."""
    return [m.model_dump() for m in container.model_router.list_models()]


@router.get("/models/default")
async def get_default_model() -> dict:
    """Return the best available provider + model for new sessions.

    Priority: first non-mock provider with at least one model.
    Fallback: mock / mock-1.
    """
    for provider in container.model_router.providers.values():
        if provider.provider_name == "mock":
            continue
        models = provider.list_models()
        if models:
            return {"provider": provider.provider_name, "model": models[0].id}

    return {"provider": "mock", "model": "mock-1"}
