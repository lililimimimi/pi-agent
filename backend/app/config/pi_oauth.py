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
        return json.loads(_AUTH_PATH.read_text())
    except (json.JSONDecodeError, OSError):
        return {}


def is_available() -> bool:
    """Return True if a valid (non-expired) Anthropic OAuth token exists."""
    data = _read_raw().get("anthropic", {})
    if not data.get("access"):
        return False
    expires_ms = data.get("expires", 0)
    if expires_ms and time.time() * 1000 > expires_ms:
        return False
    return True


def get_access_token() -> str | None:
    """Return the current OAuth access token, or None if unavailable."""
    data = _read_raw().get("anthropic", {})
    token = data.get("access", "")
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
