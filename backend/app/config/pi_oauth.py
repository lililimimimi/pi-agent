"""
Pi CLI OAuth token reader.

Pi stores Anthropic OAuth credentials in ~/.pi/agent/auth.json:
  {
    "anthropic": {
      "type": "oauth",
      "refresh": "sk-ant-ort01-...",
      "access":  "sk-ant-oat01-...",
      "expires": 1789047486636   ← Unix ms
    }
  }

The access token is used with `auth_token=` in the Anthropic SDK,
which sends `Authorization: Bearer <token>` (instead of x-api-key).
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

_AUTH_PATH = Path.home() / ".pi" / "agent" / "auth.json"


def _read_raw() -> dict[str, Any]:
    if not _AUTH_PATH.exists():
        return {}
    try:
        data: dict[str, Any] = json.loads(_AUTH_PATH.read_text())
        return data
    except (json.JSONDecodeError, OSError):
        return {}


def _has_login(data: dict[str, Any]) -> bool:
    """A login is usable while it has an access token, or a refresh token that can renew it.

    The access token expires after about a day; Pi renews it with the refresh token
    when it is used, so an expired access token alone does not mean the user logged out.
    """
    return bool(data.get("access") or data.get("refresh"))


def is_logged_in(provider: str) -> bool:
    """True if Pi has a login for this provider in auth.json (expired access is renewed by Pi)."""
    return _has_login(_read_raw().get(provider, {}))


def is_available() -> bool:
    """True if Pi has a Claude.ai (Anthropic) login."""
    return _has_login(_read_raw().get("anthropic", {}))


def get_access_token() -> str | None:
    """Return the current OAuth access token, or None if unavailable."""
    data = _read_raw().get("anthropic", {})
    token: str = str(data.get("access", ""))
    if not token:
        return None
    expires_ms = data.get("expires", 0)
    if expires_ms and time.time() * 1000 > expires_ms:
        return None  # expired — user should re-login with pi
    return token


def get_expires_at() -> float | None:
    """Return expiry as Unix seconds, or None."""
    data = _read_raw().get("anthropic", {})
    ms = data.get("expires")
    return ms / 1000 if ms else None
