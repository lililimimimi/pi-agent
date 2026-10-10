"""
Discover the model list of a provider by asking its API.

Each provider has its own endpoint and auth; the result is (models, error).
"""

from __future__ import annotations

from typing import Any

import httpx

from app.config.meta import CUSTOM_PREFIX

# ---------------------------------------------------------------------------
# Connection test implementations
# ---------------------------------------------------------------------------

_OPENAI_COMPAT_PROVIDERS = {
    "deepseek": "https://api.deepseek.com",
    "openai": "https://api.openai.com",
    "siliconflow": "https://api.siliconflow.cn",
}

_GEMINI_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models"


_TIMEOUT = httpx.Timeout(10.0)


async def _get_json(
    url: str,
    *,
    headers: dict[str, str] | None = None,
    params: dict[str, str] | None = None,
    body_chars: int = 200,
) -> tuple[Any, str | None]:
    """GET a URL and return (parsed JSON, error). Errors become text the settings page can show."""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.get(url, headers=headers, params=params)
            r.raise_for_status()
            return r.json(), None
    except httpx.HTTPStatusError as exc:
        detail = f": {exc.response.text[:body_chars]}" if body_chars else ""
        return None, f"HTTP {exc.response.status_code}{detail}"
    except httpx.RequestError as exc:
        return None, f"Connection error: {exc}"


async def discover_models(
    provider_id: str,
    cfg: dict[str, Any],
) -> tuple[list[str], str | None]:
    """Return (models, error_or_None). Each provider has its own endpoint and auth."""
    if provider_id.startswith(CUSTOM_PREFIX):
        return await _discover_custom(cfg)
    if provider_id == "pi":
        return await _discover_pi()
    if provider_id == "ollama":
        return await _discover_ollama(cfg)
    if provider_id == "anthropic":
        return await _discover_anthropic(cfg)
    if provider_id == "gemini":
        return await _discover_gemini(cfg)
    if provider_id in _OPENAI_COMPAT_PROVIDERS:
        return await _discover_openai_compatible(provider_id, cfg)
    return [], f"Unknown provider: {provider_id}"


async def _discover_custom(cfg: dict[str, Any]) -> tuple[list[str], str | None]:
    """User-added: OpenAI-compatible GET {base_url}/models."""
    url = f"{cfg.get('base_url', '').rstrip('/')}/models"
    data, error = await _get_json(
        url,
        headers={"Authorization": f"Bearer {cfg.get('api_key', '')}"},
        body_chars=160,
    )
    if error:
        return [], error
    ids = [m.get("id", "") for m in data.get("data", []) if isinstance(m, dict)]
    return [i for i in ids if i], None


async def _discover_pi() -> tuple[list[str], str | None]:
    """Pi OAuth: the token is read from ~/.pi/agent/auth.json, no user config needed."""
    from app.config.pi_oauth import get_access_token, is_available

    if not is_available():
        return [], "Pi CLI OAuth token not found or expired. Run: pi /login"
    data, error = await _get_json(
        "https://api.anthropic.com/v1/models",
        headers={
            "Authorization": f"Bearer {get_access_token()}",
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "oauth-2025-04-20",
        },
    )
    if error:
        return [], error
    # Only tool-capable chat models (skip legacy/embedding)
    models = [
        m["id"]
        for m in data.get("data", [])
        if not any(x in m["id"] for x in ("embed", "moderat"))
    ]
    return models, None


async def _discover_ollama(cfg: dict[str, Any]) -> tuple[list[str], str | None]:
    """Local Ollama server: no auth."""
    base = (cfg.get("base_url") or "http://localhost:11434").rstrip("/")
    data, error = await _get_json(f"{base}/api/tags", body_chars=0)
    if error:
        return [], error
    return [m["name"] for m in data.get("models", [])], None


async def _discover_anthropic(cfg: dict[str, Any]) -> tuple[list[str], str | None]:
    api_key = cfg.get("api_key", "")
    if not api_key:
        return [], "API key not configured"
    data, error = await _get_json(
        "https://api.anthropic.com/v1/models",
        headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
    )
    if error:
        return [], error
    return [m["id"] for m in data.get("data", [])], None


async def _discover_gemini(cfg: dict[str, Any]) -> tuple[list[str], str | None]:
    api_key = cfg.get("api_key", "")
    if not api_key:
        return [], "API key not configured"
    data, error = await _get_json(_GEMINI_MODELS_URL, params={"key": api_key})
    if error:
        return [], error
    # Generative models only, with the "models/" prefix stripped
    models = [
        m["name"].replace("models/", "")
        for m in data.get("models", [])
        if "generateContent" in m.get("supportedGenerationMethods", [])
    ]
    return models, None


async def _discover_openai_compatible(
    provider_id: str, cfg: dict[str, Any]
) -> tuple[list[str], str | None]:
    api_key = cfg.get("api_key", "")
    if not api_key:
        return [], "API key not configured"
    data, error = await _get_json(
        f"{_OPENAI_COMPAT_PROVIDERS[provider_id]}/v1/models",
        headers={"Authorization": f"Bearer {api_key}"},
    )
    if error:
        return [], error
    return [m["id"] for m in data.get("data", [])], None
