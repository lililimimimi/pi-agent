"""User-added OpenAI-compatible providers: add (with a model fetch) and remove."""
from __future__ import annotations

import re
import uuid
from typing import Any

from app.config.meta import CUSTOM_PREFIX
from app.config.store import load_config, save_config, update_provider_config
from app.services.discovery import discover_models


async def add_custom_provider(name: str, base_url: str, api_key: str) -> dict[str, Any]:
    """Save the provider, then fetch its model list. Raises ValueError if a field is empty."""
    name = name.strip()
    base_url = base_url.strip().rstrip("/")
    api_key = api_key.strip()
    if not name or not base_url or not api_key:
        raise ValueError("Name, base URL and API key are required")

    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "provider"
    pid = f"{CUSTOM_PREFIX}{slug}-{uuid.uuid4().hex[:6]}"

    cfg = load_config()
    cfg["providers"][pid] = {
        "name": name,
        "base_url": base_url,
        "api_key": api_key,
        "enabled": True,
        "connected": False,
        "models": [],
        "enabled_models": [],
        "model_status": {},
    }
    save_config(cfg)

    models, error = await discover_models(pid, cfg["providers"][pid])
    update_provider_config(pid, {"connected": error is None, "models": models})
    return {"id": pid, "models": models, "error": error}


def remove_custom_provider(provider_id: str) -> None:
    """Delete a user-added provider with its key and enabled models.

    Raises ValueError for a built-in provider and KeyError for an unknown one.
    """
    if not provider_id.startswith(CUSTOM_PREFIX):
        raise ValueError("Only custom providers can be removed")
    cfg = load_config()
    if provider_id not in cfg["providers"]:
        raise KeyError(provider_id)
    del cfg["providers"][provider_id]
    save_config(cfg)
