"""
Model routes.

  GET  /api/models              → models the user enabled in Settings (for the top-right picker)
  GET  /api/models/catalog      → every known model, with enabled flag and last test (for Settings)
  PUT  /api/models/enabled      → save which models are enabled for one provider
  POST /api/models/test         → send one short prompt to a model; result is saved
  GET  /api/models/default      → the model to use when nothing is selected yet
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from app.config.providers import known_provider
from app.services.bridge import BridgeError, bridge_call
from app.services.catalog import build_catalog, enabled_models, run_model_test, save_enabled_models

router = APIRouter(prefix="/api")


class EnabledModelsUpdate(BaseModel):
    provider: str
    models: list[str]


@router.get("/models")
async def list_models() -> list[dict[str, Any]]:
    return await enabled_models()


@router.get("/models/catalog")
async def model_catalog() -> list[dict[str, Any]]:
    return await build_catalog()


@router.put("/models/enabled")
async def set_enabled_models(body: EnabledModelsUpdate) -> dict[str, Any]:
    if not known_provider(body.provider):
        return {"ok": False, "error": f"Unknown provider: {body.provider}"}
    return {"ok": True, "enabled": save_enabled_models(body.provider, body.models)}


@router.get("/models/default")
async def get_default_model() -> dict[str, Any]:
    """First enabled model, so the picker always shows something the user chose."""
    enabled = await enabled_models()
    if enabled:
        return {"provider": enabled[0]["provider"], "model": enabled[0]["id"]}
    try:
        reply = await bridge_call("GET", "/models/default", timeout=3.0)
        if isinstance(reply, dict) and "provider" in reply and "model" in reply:
            return reply
    except BridgeError:
        pass
    return {"provider": "pi", "model": "claude-sonnet-4-5"}


@router.post("/models/test")
async def test_model(body: dict[str, Any]) -> dict[str, Any]:
    return await run_model_test(body)
