"""The client for pi-bridge: an error reply from the bridge is an error, not a result."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.bridge import BridgeError, bridge_call


def _fake_bridge(status: int, body: object):
    response = MagicMock(status_code=status)
    response.json = MagicMock(return_value=body)
    client = AsyncMock()
    client.request = AsyncMock(return_value=response)
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    return client


async def test_bridge_call_returns_the_reply_on_success():
    with patch(
        "app.services.bridge.httpx.AsyncClient",
        return_value=_fake_bridge(200, {"ok": True}),
    ):
        assert await bridge_call("GET", "/models") == {"ok": True}


async def test_bridge_call_raises_with_the_bridge_message_on_an_error_reply():
    body = {"error": {"code": "BRIDGE_ERROR", "message": "Key rejected"}}
    with (
        patch(
            "app.services.bridge.httpx.AsyncClient",
            return_value=_fake_bridge(400, body),
        ),
        pytest.raises(BridgeError, match="Key rejected"),
    ):
        await bridge_call("POST", "/api-keys")


async def test_bridge_call_accepts_a_plain_string_error_reply():
    with (
        patch(
            "app.services.bridge.httpx.AsyncClient",
            return_value=_fake_bridge(404, {"error": "Preview not found"}),
        ),
        pytest.raises(BridgeError, match="Preview not found"),
    ):
        await bridge_call("POST", "/preview/x/confirm")
