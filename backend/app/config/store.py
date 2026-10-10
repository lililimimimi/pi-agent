"""
Provider configuration — reads/writes ~/.pi/agent/config.json.

Schema:
{
  "providers": {
    "anthropic":   { "api_key": "sk-ant-...", "enabled": true, "models": [...], "connected": true },
    "deepseek":    { "api_key": "sk-...",     "enabled": true, "models": [], "connected": false },
    "ollama":      { "base_url": "http://localhost:11434", "enabled": true, "models": [], "connected": false }
  }
}

API keys never leave the local file and are never committed to git.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.config.meta import (
    _DEFAULT_PROVIDER,
    _OLLAMA_DEFAULT,
    PROVIDER_IDS,
    PROVIDER_META,
    is_custom_provider,
)


def _config_path() -> Path:
    return Path.home() / ".pi" / "agent" / "config.json"


def _ensure_dir() -> None:
    _config_path().parent.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Load / save
# ---------------------------------------------------------------------------


def load_config() -> dict[str, Any]:
    """Load and normalise the config.json, filling in defaults."""
    path = _config_path()
    raw: dict[str, Any] = {}
    if path.exists():
        try:
            raw = json.loads(path.read_text())
        except (json.JSONDecodeError, OSError):
            raw = {}

    providers: dict[str, Any] = raw.get("providers", {})
    for pid in PROVIDER_IDS:
        if pid not in providers:
            providers[pid] = dict(
                _OLLAMA_DEFAULT if pid == "ollama" else _DEFAULT_PROVIDER
            )
        else:
            # fill in any missing fields
            base = dict(_OLLAMA_DEFAULT if pid == "ollama" else _DEFAULT_PROVIDER)
            base.update(providers[pid])
            providers[pid] = base

    raw["providers"] = providers
    return raw


def save_config(config: dict[str, Any]) -> None:
    """Persist config to disk."""
    _ensure_dir()
    _config_path().write_text(json.dumps(config, indent=2))


# ---------------------------------------------------------------------------
# Key masking
# ---------------------------------------------------------------------------


def mask_key(key: str) -> str:
    """Return a masked representation: sk-ant-...****"""
    if not key:
        return ""
    if len(key) <= 8:
        return "****"
    return key[:8] + "****"


# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------


def get_provider_config(provider_id: str) -> dict[str, Any]:
    """Return a single provider's config dict."""
    cfg = load_config()
    config: dict[str, Any] = cfg["providers"].get(provider_id, dict(_DEFAULT_PROVIDER))
    return config


def update_provider_config(provider_id: str, updates: dict[str, Any]) -> None:
    """Merge updates into a provider's config and save."""
    cfg = load_config()
    current = cfg["providers"].setdefault(provider_id, dict(_DEFAULT_PROVIDER))
    for k, v in updates.items():
        if k in (
            "api_key",
            "base_url",
            "enabled",
            "models",
            "connected",
            "enabled_models",
            "model_status",
        ):
            current[k] = v
    save_config(cfg)


def known_provider(provider_id: str) -> bool:
    """Built-in provider, or a custom one the user added."""
    if provider_id in PROVIDER_IDS:
        return True
    return is_custom_provider(provider_id) and provider_id in load_config()["providers"]


def all_providers_masked() -> list[dict[str, Any]]:
    """Return provider list with masked API keys for frontend display."""
    cfg = load_config()
    result = []
    for pid in PROVIDER_IDS:
        p = cfg["providers"].get(pid, {})
        meta = PROVIDER_META[pid]
        is_pi = pid in ("pi", "openai-codex")  # OAuth logins, managed by Pi
        result.append(
            {
                "id": pid,
                "label": meta["label"],
                "key_field": meta["key_field"],  # "none" for pi
                "placeholder": meta["placeholder"],
                "api_key": "[oauth]"
                if is_pi and p.get("connected")
                else mask_key(p.get("api_key", "")),
                "base_url": p.get("base_url", ""),
                "enabled": p.get("enabled", False),
                "models": p.get("models", []),
                "connected": p.get("connected", False),
                "configured": p.get("connected", False)
                if is_pi
                else bool(p.get("api_key") or p.get("base_url")),
                "note": p.get("note", ""),
                "readonly": is_pi,  # frontend should not show key input for pi
            }
        )
    # User-added providers, after the built-in ones
    for pid, p in cfg["providers"].items():
        if not is_custom_provider(pid):
            continue
        result.append(
            {
                "id": pid,
                "label": p.get("name") or pid,
                "key_field": "api_key",
                "placeholder": "API key",
                "api_key": mask_key(p.get("api_key", "")),
                "base_url": p.get("base_url", ""),
                "enabled": p.get("enabled", False),
                "models": p.get("models", []),
                "connected": p.get("connected", False),
                "configured": bool(p.get("api_key")),
                "note": p.get("note", ""),
                "readonly": False,
                "custom": True,
            }
        )
    return result
