"""
Keep config.json in step with the logins and keys that live outside it:
Pi's auth.json (Claude.ai and ChatGPT subscriptions) and the environment.
"""
from __future__ import annotations

import os

from app.config.meta import DEFAULT_MODELS, ENV_KEY_MAP, _DEFAULT_PROVIDER
from app.config.store import load_config, save_config

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
