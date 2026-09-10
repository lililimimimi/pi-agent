"""
Models API routes:
  GET /api/models         → proxy pi-bridge /models (source of truth)
  GET /api/models/default → proxy pi-bridge /models/default
"""
from __future__ import annotations
import os

import httpx
from fastapi import APIRouter

router = APIRouter(prefix="/api")

BRIDGE = os.getenv("PI_BRIDGE_URL", "http://localhost:3100")


@router.get("/models")
async def list_models() -> list[dict]:
    """Return available models.

    Priority:
    1. pi-bridge /models  — the pi SDK knows all real model IDs
    2. config.json (enabled + connected providers) — fallback when bridge is down
    """
    from app.config.providers import get_all_enabled_models
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(f"{BRIDGE}/models")
            if r.status_code == 200 and r.json():
                return r.json()
    except Exception:  # noqa: BLE001
        pass
    # Fallback: config.json connected providers
    return get_all_enabled_models()


@router.get("/models/default")
async def get_default_model() -> dict:
    """Return the best available provider + model.
    Tries pi-bridge first, then falls back to first connected config.json provider.
    """
    from app.config.providers import get_all_enabled_models
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(f"{BRIDGE}/models/default")
            if r.status_code == 200:
                return r.json()
    except Exception:  # noqa: BLE001
        pass
    # Fallback: first model from config.json
    models = get_all_enabled_models()
    if models:
        return {"provider": models[0]["provider"], "model": models[0]["id"]}
    return {"provider": "pi", "model": "claude-sonnet-4-5"}
