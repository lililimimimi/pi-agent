"""
Tests for the execution preview endpoints.

The bridge owns pending-preview state, so the backend endpoints only
forward confirm/cancel requests. httpx is mocked to avoid a live bridge.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture
async def client():
    from app.main import app

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c


def _mock_httpx(status_code: int = 200) -> AsyncMock:
    """Build a fake httpx.AsyncClient whose .post() returns `status_code`."""
    resp = MagicMock()
    resp.status_code = status_code

    client = AsyncMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    client.post = AsyncMock(return_value=resp)
    return client


async def test_confirm_preview_forwards_to_bridge(client: AsyncClient):
    fake = _mock_httpx(200)
    with patch("app.api.preview.httpx.AsyncClient", return_value=fake):
        r = await client.post("/api/preview/pv-1/confirm")

    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
    fake.post.assert_awaited_once_with("http://localhost:3100/preview/pv-1/confirm")


async def test_cancel_preview_forwards_to_bridge(client: AsyncClient):
    fake = _mock_httpx(200)
    with patch("app.api.preview.httpx.AsyncClient", return_value=fake):
        r = await client.post("/api/preview/pv-2/cancel")

    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
    fake.post.assert_awaited_once_with("http://localhost:3100/preview/pv-2/cancel")


async def test_unknown_preview_returns_404(client: AsyncClient):
    with patch("app.api.preview.httpx.AsyncClient", return_value=_mock_httpx(404)):
        r = await client.post("/api/preview/missing/confirm")

    assert r.status_code == 404


async def test_bridge_unreachable_returns_502(client: AsyncClient):
    fake = _mock_httpx(200)
    fake.post = AsyncMock(side_effect=httpx.ConnectError("bridge down"))
    with patch("app.api.preview.httpx.AsyncClient", return_value=fake):
        r = await client.post("/api/preview/pv-3/confirm")

    assert r.status_code == 502


async def test_chat_carries_execution_preview_flag(client: AsyncClient):
    """The flag from POST /api/chat is persisted on the session and forwarded."""
    r = await client.post(
        "/api/chat",
        json={
            "messages": [{"role": "user", "content": "hi"}],
            "provider": "mock",
            "model": "mock-1",
            "execution_preview": False,
        },
    )
    assert r.status_code == 200
    session_id = r.json()["session_id"]

    from app.services.chat_sessions import get_chat_session

    assert get_chat_session(session_id).execution_preview is False
