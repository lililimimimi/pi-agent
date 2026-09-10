"""
Provider configuration API.

GET  /api/providers              → list all providers (keys masked)
PUT  /api/providers/{id}         → update api_key / base_url / enabled
POST /api/providers/{id}/test    → test connection → {ok, latency_ms, models}
GET  /api/providers/{id}/models  → return cached model list
"""
from __future__ import annotations

import time
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config.providers import (
    PROVIDER_IDS,
    all_providers_masked,
    get_provider_config,
    update_provider_config,
)

router = APIRouter(prefix="/api/providers", tags=["providers"])

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ProviderUpdate(BaseModel):
    api_key:  str | None = None
    base_url: str | None = None
    enabled:  bool | None = None


class TestResult(BaseModel):
    ok:          bool
    latency_ms:  int
    models:      list[str]
    error:       str | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("")
async def list_providers() -> list[dict[str, Any]]:
    """Return all provider configs with masked API keys."""
    return all_providers_masked()


@router.put("/{provider_id}")
async def update_provider(provider_id: str, body: ProviderUpdate) -> dict[str, Any]:
    """Update one provider's configuration."""
    if provider_id not in PROVIDER_IDS:
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
    """Test the connection for a provider and cache the discovered models."""
    if provider_id not in PROVIDER_IDS:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider_id}")

    p = get_provider_config(provider_id)
    t0 = time.monotonic()

    try:
        models, error = await _test_connection(provider_id, p)
        latency_ms = int((time.monotonic() - t0) * 1000)

        if error:
            update_provider_config(provider_id, {"connected": False})
            return TestResult(ok=False, latency_ms=latency_ms, models=[], error=error)

        # Persist discovered models + connected status
        update_provider_config(provider_id, {
            "connected": True,
            "models":    models,
            "enabled":   True,
        })
        return TestResult(ok=True, latency_ms=latency_ms, models=models)

    except Exception as exc:  # noqa: BLE001
        latency_ms = int((time.monotonic() - t0) * 1000)
        update_provider_config(provider_id, {"connected": False})
        return TestResult(ok=False, latency_ms=latency_ms, models=[], error=str(exc))


@router.get("/{provider_id}/models")
async def get_provider_models(provider_id: str) -> list[str]:
    """Return the cached model list for a provider."""
    if provider_id not in PROVIDER_IDS:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider_id}")
    p = get_provider_config(provider_id)
    raw = p.get("models", [])
    return [m if isinstance(m, str) else m.get("id", "") for m in raw]


# ---------------------------------------------------------------------------
# Connection test implementations
# ---------------------------------------------------------------------------

_OPENAI_COMPAT_PROVIDERS = {
    "deepseek":    "https://api.deepseek.com",
    "openai":      "https://api.openai.com",
    "siliconflow": "https://api.siliconflow.cn",
}

_GEMINI_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models"


async def _test_connection(
    provider_id: str,
    cfg: dict[str, Any],
) -> tuple[list[str], str | None]:
    """Return (models, error_or_None).

    Each provider has its own test strategy:
    - anthropic:   GET /v1/models with Bearer auth
    - deepseek / openai / siliconflow: GET /v1/models (OpenAI-compatible)
    - ollama:      GET /api/tags (local HTTP, no auth)
    """

    timeout = httpx.Timeout(10.0)

    if provider_id == "pi":
        # Pi OAuth — token is read from ~/.pi/agent/auth.json, no user config needed
        from app.config.pi_oauth import is_available, get_access_token
        if not is_available():
            return [], "Pi CLI OAuth token not found or expired. Run: pi /login"
        token = get_access_token()
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                r = await client.get(
                    "https://api.anthropic.com/v1/models",
                    headers={
                        "Authorization":   f"Bearer {token}",
                        "anthropic-version": "2023-06-01",
                        "anthropic-beta":    "oauth-2025-04-20",
                    },
                )
                r.raise_for_status()
                data = r.json()
                # Only return tool-capable chat models (skip legacy/embedding)
                models = [
                    m["id"] for m in data.get("data", [])
                    if not any(x in m["id"] for x in ("embed", "moderat"))
                ]
                return models, None
        except httpx.HTTPStatusError as exc:
            return [], f"HTTP {exc.response.status_code}: {exc.response.text[:200]}"
        except httpx.RequestError as exc:
            return [], f"Connection error: {exc}"

    if provider_id == "ollama":
        base = (cfg.get("base_url") or "http://localhost:11434").rstrip("/")
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                r = await client.get(f"{base}/api/tags")
                r.raise_for_status()
                data = r.json()
                models = [m["name"] for m in data.get("models", [])]
                return models, None
        except httpx.HTTPStatusError as exc:
            return [], f"HTTP {exc.response.status_code}"
        except httpx.RequestError as exc:
            return [], f"Connection error: {exc}"

    if provider_id == "anthropic":
        api_key = cfg.get("api_key", "")
        if not api_key:
            return [], "API key not configured"
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                r = await client.get(
                    "https://api.anthropic.com/v1/models",
                    headers={
                        "x-api-key":         api_key,
                        "anthropic-version": "2023-06-01",
                    },
                )
                r.raise_for_status()
                data = r.json()
                models = [m["id"] for m in data.get("data", [])]
                return models, None
        except httpx.HTTPStatusError as exc:
            return [], f"HTTP {exc.response.status_code}: {exc.response.text[:200]}"
        except httpx.RequestError as exc:
            return [], f"Connection error: {exc}"

    if provider_id == "gemini":
        api_key = cfg.get("api_key", "")
        if not api_key:
            return [], "API key not configured"
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                r = await client.get(
                    _GEMINI_MODELS_URL,
                    params={"key": api_key},
                )
                r.raise_for_status()
                data = r.json()
                # Filter to generative models only, strip "models/" prefix
                models = [
                    m["name"].replace("models/", "")
                    for m in data.get("models", [])
                    if "generateContent" in m.get("supportedGenerationMethods", [])
                ]
                return models, None
        except httpx.HTTPStatusError as exc:
            return [], f"HTTP {exc.response.status_code}: {exc.response.text[:200]}"
        except httpx.RequestError as exc:
            return [], f"Connection error: {exc}"

    # OpenAI-compatible providers
    if provider_id in _OPENAI_COMPAT_PROVIDERS:
        api_key = cfg.get("api_key", "")
        if not api_key:
            return [], "API key not configured"
        base = _OPENAI_COMPAT_PROVIDERS[provider_id]
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                r = await client.get(
                    f"{base}/v1/models",
                    headers={"Authorization": f"Bearer {api_key}"},
                )
                r.raise_for_status()
                data = r.json()
                models = [m["id"] for m in data.get("data", [])]
                return models, None
        except httpx.HTTPStatusError as exc:
            return [], f"HTTP {exc.response.status_code}: {exc.response.text[:200]}"
        except httpx.RequestError as exc:
            return [], f"Connection error: {exc}"

    return [], f"Unknown provider: {provider_id}"
