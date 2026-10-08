"""
Provider configuration — reads/writes ~/.pi/agent/config.json.

Schema:
{
  "providers": {
    "anthropic":   { "api_key": "sk-ant-...", "enabled": true, "models": [...], "connected": true },
    "deepseek":    { "api_key": "sk-...",     "enabled": true, "models": [], "connected": false },
    "openai":      { "api_key": "sk-...",     "enabled": false, "models": [], "connected": false },
    "siliconflow": { "api_key": "sk-...",     "enabled": true, "models": [], "connected": false },
    "ollama":      { "base_url": "http://localhost:11434", "enabled": true, "models": [], "connected": false }
  }
}

API keys never leave the local file and are never committed to git.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Supported providers & defaults
# ---------------------------------------------------------------------------

PROVIDER_IDS = ("pi", "anthropic", "deepseek", "openai", "openai-codex", "gemini", "siliconflow", "ollama")

PROVIDER_META: dict[str, dict[str, Any]] = {
    "pi":          {"label": "Claude.ai subscription (Pi)", "key_field": "none",    "placeholder": ""},
    "anthropic":   {"label": "Anthropic (Claude)", "key_field": "api_key",  "placeholder": "sk-ant-..."},
    "deepseek":    {"label": "DeepSeek",            "key_field": "api_key",  "placeholder": "sk-..."},
    "openai":      {"label": "OpenAI",              "key_field": "api_key",  "placeholder": "sk-..."},
    "openai-codex": {"label": "OpenAI (ChatGPT subscription)", "key_field": "none", "placeholder": ""},
    "gemini":      {"label": "Google Gemini",       "key_field": "api_key",  "placeholder": "AIza..."},
    "siliconflow": {"label": "SiliconFlow",         "key_field": "api_key",  "placeholder": "sk-..."},
    "ollama":      {"label": "Ollama (local)",      "key_field": "base_url", "placeholder": "http://localhost:11434"},
}

# Default model lists — used when syncing from env vars (before user tests)
DEFAULT_MODELS: dict[str, list[str]] = {
    "pi":          ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-3-5"],
    "anthropic":   ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-3-5"],
    "deepseek":    ["deepseek-chat", "deepseek-reasoner"],
    "openai":      ["gpt-4o", "gpt-4o-mini", "o1-mini"],
    "gemini":      ["gemini-2.5-pro", "gemini-2.0-flash", "gemini-1.5-pro"],
    "siliconflow": ["Qwen/Qwen2.5-72B-Instruct", "deepseek-ai/DeepSeek-V3"],
    "ollama":      [],
}

# Env var name for each provider's API key
ENV_KEY_MAP: dict[str, str] = {
    "anthropic":   "ANTHROPIC_API_KEY",
    "deepseek":    "DEEPSEEK_API_KEY",
    "openai":      "OPENAI_API_KEY",
    "gemini":      "GEMINI_API_KEY",
    "siliconflow": "SILICONFLOW_API_KEY",
}

_DEFAULT_PROVIDER: dict[str, Any] = {
    "api_key":    "",
    "base_url":   "",
    "enabled":    False,
    "models":     [],
    "connected":  False,
}

_OLLAMA_DEFAULT: dict[str, Any] = {
    "api_key":   "",
    "base_url":  "http://localhost:11434",
    "enabled":   True,
    "models":    [],
    "connected": False,
}


def sync_pi_oauth_to_config() -> None:
    """Detect Pi CLI OAuth token and auto-register the 'pi' provider.

    If ~/.pi/agent/auth.json has a valid Anthropic OAuth token, mark the
    'pi' provider as enabled + connected with the default model list.
    Otherwise mark it as not connected.
    """
    from app.config.pi_oauth import is_available, get_expires_at
    import datetime

    cfg = load_config()
    p = cfg["providers"].setdefault("pi", dict(_DEFAULT_PROVIDER))

    if is_available():
        expires_at = get_expires_at()
        expires_str = (
            datetime.datetime.fromtimestamp(expires_at).strftime("%Y-%m-%d")
            if expires_at else "unknown"
        )
        p["enabled"]   = True
        p["connected"] = True
        p["api_key"]   = "[oauth]"          # sentinel — not a real key
        p["base_url"]  = ""
        p["note"]      = f"Pi CLI OAuth · expires {expires_str}"
        if not p.get("models"):
            p["models"] = list(DEFAULT_MODELS.get("pi", []))
    else:
        p["enabled"]   = False
        p["connected"] = False
        p["api_key"]   = ""
        p["note"]      = "Pi not logged in (run: pi /login)"

    save_config(cfg)


def sync_codex_login_to_config() -> None:
    """Mark the OpenAI subscription as connected when Pi has a Codex login."""
    from app.config.pi_oauth import is_logged_in
    cfg = load_config()
    p = cfg["providers"].setdefault("openai-codex", dict(_DEFAULT_PROVIDER))
    connected = is_logged_in("openai-codex")
    p["enabled"] = connected
    p["connected"] = connected
    p["api_key"] = "[oauth]" if connected else ""
    p["note"] = "Pi OpenAI login" if connected else "Not logged in (run: pi /login, choose OpenAI)"
    save_config(cfg)


def sync_env_vars_to_config() -> None:
    """On startup: copy any env-var API keys into config.json and mark as connected.

    Only writes when the config entry currently has no api_key set — won't
    overwrite keys the user has manually updated via Settings.
    """
    cfg = load_config()
    changed = False
    for pid, env_name in ENV_KEY_MAP.items():
        key = os.getenv(env_name, "").strip()
        if not key:
            continue
        p = cfg["providers"].setdefault(pid, dict(_DEFAULT_PROVIDER))
        if p.get("api_key"):  # user already has a key set — don't overwrite
            continue
        p["api_key"]   = key
        p["enabled"]   = True
        p["connected"] = True
        if not p.get("models"):
            p["models"] = list(DEFAULT_MODELS.get(pid, []))
        changed = True
    if changed:
        save_config(cfg)

# ---------------------------------------------------------------------------
# Config file location
# ---------------------------------------------------------------------------

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
            providers[pid] = dict(_OLLAMA_DEFAULT if pid == "ollama" else _DEFAULT_PROVIDER)
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
    return cfg["providers"].get(provider_id, dict(_DEFAULT_PROVIDER))


def update_provider_config(provider_id: str, updates: dict[str, Any]) -> None:
    """Merge updates into a provider's config and save."""
    cfg = load_config()
    current = cfg["providers"].setdefault(provider_id, dict(_DEFAULT_PROVIDER))
    for k, v in updates.items():
        if k in ("api_key", "base_url", "enabled", "models", "connected", "enabled_models", "model_status"):
            current[k] = v
    save_config(cfg)


CUSTOM_PREFIX = "custom-"


def is_custom_provider(provider_id: str) -> bool:
    return provider_id.startswith(CUSTOM_PREFIX)


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
        result.append({
            "id":          pid,
            "label":       meta["label"],
            "key_field":   meta["key_field"],   # "none" for pi
            "placeholder": meta["placeholder"],
            "api_key":     "[oauth]" if is_pi and p.get("connected") else mask_key(p.get("api_key", "")),
            "base_url":    p.get("base_url", ""),
            "enabled":     p.get("enabled", False),
            "models":      p.get("models", []),
            "connected":   p.get("connected", False),
            "configured":  p.get("connected", False) if is_pi else bool(p.get("api_key") or p.get("base_url")),
            "note":        p.get("note", ""),
            "readonly":    is_pi,  # frontend should not show key input for pi
        })
    # User-added providers, after the built-in ones
    for pid, p in cfg["providers"].items():
        if not is_custom_provider(pid):
            continue
        result.append({
            "id":          pid,
            "label":       p.get("name") or pid,
            "key_field":   "api_key",
            "placeholder": "API key",
            "api_key":     mask_key(p.get("api_key", "")),
            "base_url":    p.get("base_url", ""),
            "enabled":     p.get("enabled", False),
            "models":      p.get("models", []),
            "connected":   p.get("connected", False),
            "configured":  bool(p.get("api_key")),
            "note":        p.get("note", ""),
            "readonly":    False,
            "custom":      True,
        })
    return result


def get_all_enabled_models() -> list[dict[str, Any]]:
    """Return cached models for all enabled+connected providers.
    Used by GET /api/models to enrich the model list."""
    cfg = load_config()
    result = []
    for pid, p in cfg["providers"].items():
        if p.get("enabled") and p.get("connected") and p.get("models"):
            for m in p["models"]:
                if isinstance(m, str):
                    result.append({
                        "id": m,
                        "name": m,
                        "provider": pid,
                        "supports_tools": True,
                    })
                elif isinstance(m, dict):
                    result.append({
                        "id":             m.get("id", ""),
                        "name":           m.get("name", m.get("id", "")),
                        "provider":       pid,
                        "supports_tools": m.get("supports_tools", True),
                    })
    return result
