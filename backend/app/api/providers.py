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
    CUSTOM_PREFIX,
    known_provider,
    load_config,
    save_config,
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


class CustomProviderCreate(BaseModel):
    name: str
    base_url: str
    api_key: str


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
    # Re-check Pi logins, so a login finished in Settings shows up right away
    from app.config.providers import sync_codex_login_to_config, sync_pi_oauth_to_config
    sync_pi_oauth_to_config()
    sync_codex_login_to_config()
    return all_providers_masked()


LOGIN_PROVIDERS = {"openai-codex", "pi"}


@router.post("/{provider_id}/login")
async def start_login(provider_id: str) -> dict[str, Any]:
    """Start an in-app OAuth login (run by pi-bridge)."""
    if provider_id not in LOGIN_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"{provider_id} does not support in-app login")
    return await _bridge_call("POST", f"/auth/login", {"provider": provider_id})


@router.post("/{provider_id}/logout")
async def logout(provider_id: str) -> dict[str, Any]:
    """Log out of an OAuth provider; Pi removes the stored login."""
    if provider_id not in LOGIN_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"{provider_id} does not support in-app logout")
    result = await _bridge_call("POST", "/auth/logout", {"provider": provider_id})
    from app.config.providers import sync_codex_login_to_config, sync_pi_oauth_to_config
    sync_pi_oauth_to_config()
    sync_codex_login_to_config()
    return result


@router.get("/{provider_id}/login")
async def login_status(provider_id: str) -> dict[str, Any]:
    """Progress of the login: the events to show (such as the sign-in link)."""
    return await _bridge_call("GET", f"/auth/login/{provider_id}")


async def _bridge_call(method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
    import os
    bridge = os.getenv("PI_BRIDGE_URL", "http://localhost:3100")
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.request(method, f"{bridge}{path}", json=body)
            return r.json()
    except (httpx.HTTPError, ValueError) as e:
        raise HTTPException(status_code=502, detail=f"pi-bridge unreachable: {e}") from e


@router.post("/custom")
async def add_custom_provider(body: CustomProviderCreate) -> dict[str, Any]:
    """Add an OpenAI-compatible provider, then fetch its model list."""
    import re
    import uuid

    name = body.name.strip()
    base_url = body.base_url.strip().rstrip("/")
    if not name or not base_url or not body.api_key.strip():
        raise HTTPException(status_code=400, detail="Name, base URL and API key are required")

    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "provider"
    pid = f"{CUSTOM_PREFIX}{slug}-{uuid.uuid4().hex[:6]}"

    cfg = load_config()
    cfg["providers"][pid] = {
        "name": name,
        "base_url": base_url,
        "api_key": body.api_key.strip(),
        "enabled": True,
        "connected": False,
        "models": [],
        "enabled_models": [],
        "model_status": {},
    }
    save_config(cfg)

    models, error = await _test_connection(pid, cfg["providers"][pid])
    update_provider_config(pid, {"connected": error is None, "models": models})
    return {"id": pid, "models": models, "error": error}


@router.delete("/custom/{provider_id}")
async def delete_custom_provider(provider_id: str) -> dict[str, Any]:
    """Remove a user-added provider, its key and its enabled models."""
    if not provider_id.startswith(CUSTOM_PREFIX):
        raise HTTPException(status_code=400, detail="Only custom providers can be removed")
    cfg = load_config()
    if provider_id not in cfg["providers"]:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider_id}")
    del cfg["providers"][provider_id]
    save_config(cfg)
    return {"ok": True}


@router.put("/{provider_id}")
async def update_provider(provider_id: str, body: ProviderUpdate) -> dict[str, Any]:
    """Update one provider's configuration."""
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
    """Test the connection for a provider and cache the discovered models."""
    if not known_provider(provider_id):
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
    if not known_provider(provider_id):
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

    if provider_id.startswith(CUSTOM_PREFIX):
        # User-added: OpenAI-compatible GET {base_url}/models
        url = f"{cfg.get('base_url', '').rstrip('/')}/models"
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.get(url, headers={"Authorization": f"Bearer {cfg.get('api_key', '')}"})
        if r.status_code != 200:
            return [], f"HTTP {r.status_code}: {r.text[:160]}"
        ids = [m.get("id", "") for m in r.json().get("data", []) if isinstance(m, dict)]
        return [i for i in ids if i], None

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
