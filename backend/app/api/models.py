"""
Model routes.

  GET  /api/models              → models the user enabled in Settings (for the top-right picker)
  GET  /api/models/catalog      → every known model, with enabled flag and last test (for Settings)
  PUT  /api/models/enabled      → save which models are enabled for one provider
  POST /api/models/test         → send one short prompt to a model; result is saved
  GET  /api/models/default      → the model to use when nothing is selected yet
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

from app.config.providers import (
    PROVIDER_IDS,
    PROVIDER_META,
    known_provider,
    load_config,
    update_provider_config,
)

router = APIRouter(prefix="/api")

BRIDGE = os.getenv("PI_BRIDGE_URL", "http://localhost:3100")


class EnabledModelsUpdate(BaseModel):
    provider: str
    models: list[str]


async def _bridge_models() -> list[dict[str, Any]]:
    """Models the pi SDK can run right now (providers with a key). Empty if the bridge is down."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(f"{BRIDGE}/models")
            if r.status_code == 200 and isinstance(r.json(), list):
                return r.json()
    except (httpx.HTTPError, ValueError):
        pass
    return []


def _configured(cfg_provider: dict[str, Any], provider_id: str) -> bool:
    if provider_id == "pi":
        return bool(cfg_provider.get("connected"))
    return bool(cfg_provider.get("api_key") or cfg_provider.get("base_url") or cfg_provider.get("connected"))


async def _catalog() -> list[dict[str, Any]]:
    """One entry per provider: its models with name and image support.

    Bridge models come first (the SDK knows how to run them). Models cached in
    config.json are added for providers the bridge does not run.
    """
    cfg = load_config()
    by_provider: dict[str, dict[str, dict[str, Any]]] = {}

    for m in await _bridge_models():
        by_provider.setdefault(m["provider"], {})[m["id"]] = {
            "id": m["id"],
            "name": m.get("name") or m["id"],
            "supports_images": bool(m.get("supports_images")),
        }

    # The Claude subscription (pi) runs through the bridge's Anthropic models,
    # so it lists exactly the models the bridge can run.
    if _configured(cfg["providers"].get("pi", {}), "pi") and "anthropic" in by_provider:
        by_provider["pi"] = {mid: dict(m) for mid, m in by_provider["anthropic"].items()}

    for pid, p in cfg["providers"].items():
        if pid == "pi" or not _configured(p, pid):
            continue
        for raw in p.get("models") or []:
            mid = raw if isinstance(raw, str) else raw.get("id", "")
            if mid:
                by_provider.setdefault(pid, {}).setdefault(
                    mid, {"id": mid, "name": mid, "supports_images": False},
                )

    order = {pid: i for i, pid in enumerate(PROVIDER_IDS)}
    result = []
    for pid in sorted(by_provider, key=lambda p: (order.get(p, 99), p)):
        p = cfg["providers"].get(pid, {})
        enabled = set(p.get("enabled_models") or [])
        statuses = p.get("model_status") or {}
        models = []
        for m in by_provider[pid].values():
            models.append({
                **m,
                "enabled": m["id"] in enabled,
                "status": statuses.get(m["id"]),
            })
        result.append({
            "provider": pid,
            "label": p.get("name") or PROVIDER_META.get(pid, {}).get("label", pid),
            "models": models,
        })
    return result


@router.get("/models")
async def list_models() -> list[dict[str, Any]]:
    """Enabled models only, flattened for the top-right picker."""
    out: list[dict[str, Any]] = []
    for group in await _catalog():
        for m in group["models"]:
            if m["enabled"]:
                out.append({
                    "id": m["id"],
                    "name": m["name"],
                    "provider": group["provider"],
                    "supports_tools": True,
                    "supports_images": m["supports_images"],
                    "status": m["status"],
                })
    return out


@router.get("/models/catalog")
async def model_catalog() -> list[dict[str, Any]]:
    """Every known model, grouped by provider, for the Settings page."""
    return await _catalog()


@router.put("/models/enabled")
async def set_enabled_models(body: EnabledModelsUpdate) -> dict[str, Any]:
    if not known_provider(body.provider):
        return {"ok": False, "error": f"Unknown provider: {body.provider}"}
    unique = list(dict.fromkeys(body.models))
    update_provider_config(body.provider, {"enabled_models": unique})
    return {"ok": True, "enabled": unique}


@router.get("/models/default")
async def get_default_model() -> dict[str, Any]:
    """First enabled model, so the picker always shows something the user chose."""
    enabled = await list_models()
    if enabled:
        return {"provider": enabled[0]["provider"], "model": enabled[0]["id"]}
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(f"{BRIDGE}/models/default")
            if r.status_code == 200:
                return r.json()
    except httpx.HTTPError:
        pass
    return {"provider": "pi", "model": "claude-sonnet-4-5"}


@router.post("/models/test")
async def test_model(body: dict[str, Any]) -> dict[str, Any]:
    """Send one short prompt to a model, then save the result on that model."""
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            r = await client.post(f"{BRIDGE}/models/test", json=body)
            result = r.json()
    except (httpx.HTTPError, ValueError) as e:
        result = {"ok": False, "error": f"pi-bridge unreachable: {e}"}

    provider = body.get("provider")
    model = body.get("model")
    if known_provider(provider) and isinstance(model, str):
        cfg_statuses = dict(load_config()["providers"].get(provider, {}).get("model_status") or {})
        cfg_statuses[model] = {
            "ok": bool(result.get("ok")),
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "error": result.get("error"),
            "ms": result.get("ms"),
        }
        update_provider_config(provider, {"model_status": cfg_statuses})
    return result
