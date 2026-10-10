"""Client for pi-bridge, the Node service that runs the Pi SDK."""

from __future__ import annotations

import os
from typing import Any

import httpx

from app.errors import UpstreamError

BRIDGE_URL = os.getenv("PI_BRIDGE_URL", "http://localhost:3100")


class BridgeError(UpstreamError):
    """pi-bridge is unreachable, or its reply could not be read."""


async def bridge_call(
    method: str,
    path: str,
    body: dict[str, Any] | None = None,
    timeout: float = 30.0,
) -> Any:
    """Send one request to pi-bridge and return its JSON reply."""
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.request(method, f"{BRIDGE_URL}{path}", json=body)
            data = r.json()
    except (httpx.HTTPError, ValueError) as e:
        raise BridgeError(str(e)) from e
    if r.status_code >= 400:
        # The bridge answers errors as { error: { message } } or as a plain string
        error = data.get("error") if isinstance(data, dict) else None
        message = error.get("message") if isinstance(error, dict) else error
        raise BridgeError(str(message or f"pi-bridge returned HTTP {r.status_code}"))
    return data


async def bridge_models() -> list[dict[str, Any]]:
    """Models the Pi SDK can run right now. Empty if the bridge is down."""
    try:
        data = await bridge_call("GET", "/models", timeout=3.0)
    except BridgeError:
        return []
    return data if isinstance(data, list) else []
