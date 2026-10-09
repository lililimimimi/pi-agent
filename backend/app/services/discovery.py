"""
Discover the model list of a provider by asking its API.

Each provider has its own endpoint and auth; the result is (models, error).
"""
from __future__ import annotations

import time
from typing import Any

import httpx

from app.config.providers import CUSTOM_PREFIX


# ---------------------------------------------------------------------------
# Connection test implementations
# ---------------------------------------------------------------------------

_OPENAI_COMPAT_PROVIDERS = {
    "deepseek":    "https://api.deepseek.com",
    "openai":      "https://api.openai.com",
    "siliconflow": "https://api.siliconflow.cn",
}

_GEMINI_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models"


async def discover_models(
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
