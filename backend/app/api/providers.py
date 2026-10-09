"""
Provider configuration API.

GET    /api/providers                 → list all providers (keys masked)
PUT    /api/providers/{id}            → update api_key / base_url / enabled
POST   /api/providers/{id}/test       → test connection and cache the model list
GET    /api/providers/{id}/models     → cached model list
POST   /api/providers/custom          → add an OpenAI-compatible provider
DELETE /api/providers/custom/{id}     → remove one
POST   /api/providers/{id}/login      → start in-app OAuth login (ChatGPT / Claude.ai)
GET    /api/providers/{id}/login      → login progress
POST   /api/providers/{id}/logout     → log out
"""
from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config.store import all_providers_masked, get_provider_config, known_provider, update_provider_config
from app.config.sync import sync_codex_login_to_config, sync_pi_oauth_to_config
from app.services.bridge import BridgeError, bridge_call
from app.services.custom_providers import add_custom_provider, remove_custom_provider
from app.services.discovery import discover_models

router = APIRouter(prefix="/api/providers", tags=["providers"])

LOGIN_PROVIDERS = {"openai-codex", "pi"}


class ProviderUpdate(BaseModel):
    api_key: str | None = None
    base_url: str | None = None
    enabled: bool | None = None


class CustomProviderCreate(BaseModel):
    name: str
    base_url: str
    api_key: str


class TestResult(BaseModel):
    ok: bool
    latency_ms: int
    models: list[str]
    error: str | None = None


def _refresh_logins() -> None:
    """Re-read Pi's login files, so a login finished in Settings shows up right away."""
    sync_pi_oauth_to_config()
    sync_codex_login_to_config()


async def _bridge_or_502(method: str, path: str, body: dict[str, Any] | None = None) -> Any:
    try:
        return await bridge_call(method, path, body)
    except BridgeError as e:
        raise HTTPException(status_code=502, detail=f"pi-bridge unreachable: {e}") from e


@router.get("")
async def list_providers() -> list[dict[str, Any]]:
    _refresh_logins()
    return all_providers_masked()


@router.post("/custom")
async def add_custom(body: CustomProviderCreate) -> dict[str, Any]:
    try:
        return await add_custom_provider(body.name, body.base_url, body.api_key)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.delete("/custom/{provider_id}")
async def delete_custom(provider_id: str) -> dict[str, Any]:
    try:
        remove_custom_provider(provider_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except KeyError as e:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider_id}") from e
    return {"ok": True}


@router.post("/{provider_id}/login")
async def start_login(provider_id: str) -> Any:
    if provider_id not in LOGIN_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"{provider_id} does not support in-app login")
    return await _bridge_or_502("POST", "/auth/login", {"provider": provider_id})


@router.get("/{provider_id}/login")
async def login_status(provider_id: str) -> Any:
    return await _bridge_or_502("GET", f"/auth/login/{provider_id}")


@router.post("/{provider_id}/logout")
async def logout(provider_id: str) -> Any:
    if provider_id not in LOGIN_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"{provider_id} does not support in-app logout")
    result = await _bridge_or_502("POST", "/auth/logout", {"provider": provider_id})
    _refresh_logins()
    return result


@router.put("/{provider_id}")
async def update_provider(provider_id: str, body: ProviderUpdate) -> dict[str, Any]:
    if not known_provider(provider_id):
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider_id}")
    updates: dict[str, Any] = {}
    if body.api_key is not None:
        updates["api_key"] = body.api_key
    if body.base_url is not None:
        updates["base_url"] = body.base_url
    if body.enabled is not None:
        updates["enabled"] = body.enabled
    update_provider_config(provider_id, updates)
    return {"ok": True}


@router.post("/{provider_id}/test")
async def test_provider(provider_id: str) -> TestResult:
    if not known_provider(provider_id):
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider_id}")

    p = get_provider_config(provider_id)
    t0 = time.monotonic()
    try:
        models, error = await discover_models(provider_id, p)
        latency_ms = int((time.monotonic() - t0) * 1000)
        if error:
            update_provider_config(provider_id, {"connected": False})
            return TestResult(ok=False, latency_ms=latency_ms, models=[], error=error)
        update_provider_config(provider_id, {"connected": True, "models": models, "enabled": True})
        return TestResult(ok=True, latency_ms=latency_ms, models=models)
    except Exception as exc:  # noqa: BLE001
        latency_ms = int((time.monotonic() - t0) * 1000)
        update_provider_config(provider_id, {"connected": False})
        return TestResult(ok=False, latency_ms=latency_ms, models=[], error=str(exc))


@router.get("/{provider_id}/models")
async def get_provider_models(provider_id: str) -> list[str]:
    if not known_provider(provider_id):
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider_id}")
    raw = get_provider_config(provider_id).get("models", [])
    return [m if isinstance(m, str) else m.get("id", "") for m in raw]
