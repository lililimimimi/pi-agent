"""
Integration tests for the FastAPI HTTP layer.

Uses httpx AsyncClient + ASGITransport — no real server required.
Stream tests mock the pi-bridge proxy to avoid needing a running bridge.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #


@pytest.fixture
async def client():
    from app.main import app

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c


# --------------------------------------------------------------------------- #
# Helper
# --------------------------------------------------------------------------- #


def _parse_sse_lines(raw: str) -> list[dict]:
    events = []
    for line in raw.splitlines():
        line = line.strip()
        if line.startswith("data: "):
            events.append(json.loads(line[6:]))
    return events


# --------------------------------------------------------------------------- #
# Tests
# --------------------------------------------------------------------------- #


async def test_health_returns_ok(client: AsyncClient):
    r = await client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


async def test_post_chat_returns_session_id(client: AsyncClient):
    r = await client.post(
        "/api/chat",
        json={
            "messages": [{"role": "user", "content": "hello"}],
            "provider": "mock",
            "model": "mock-1",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert "session_id" in body
    assert len(body["session_id"]) > 10  # UUID-like


async def test_stream_returns_text_and_done(client: AsyncClient):
    """SSE stream proxied from bridge must contain text + done events."""
    r = await client.post(
        "/api/chat",
        json={
            "messages": [{"role": "user", "content": "hello"}],
            "provider": "mock",
            "model": "mock-1",
        },
    )
    session_id = r.json()["session_id"]

    # Mock the bridge SSE response
    fake_lines = [
        'data: {"event": "text", "data": {"content": "Hello!"}}',
        'data: {"event": "done", "data": {}}',
    ]

    async def _fake_aiter_lines():
        for line in fake_lines:
            yield line

    mock_resp = AsyncMock()
    mock_resp.status_code = 200
    mock_resp.aiter_lines = _fake_aiter_lines

    mock_client_instance = AsyncMock()
    mock_stream_ctx = AsyncMock()
    mock_stream_ctx.__aenter__ = AsyncMock(return_value=mock_resp)
    mock_stream_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_client_instance.stream = MagicMock(return_value=mock_stream_ctx)
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    with patch(
        "app.services.chat_stream.httpx.AsyncClient", return_value=mock_client_instance
    ):
        stream_r = await client.get(f"/api/chat/stream/{session_id}")

    assert stream_r.status_code == 200
    assert "text/event-stream" in stream_r.headers["content-type"]

    events = _parse_sse_lines(stream_r.text)
    event_types = [e["event"] for e in events]

    assert "text" in event_types, f"No 'text' event in {event_types}"
    assert events[-1]["event"] == "done", f"Last event is not 'done': {event_types}"


async def test_stream_text_content_matches_proxy(client: AsyncClient):
    """Verify text content is correctly proxied from bridge."""
    r = await client.post(
        "/api/chat",
        json={
            "messages": [{"role": "user", "content": "ping me"}],
            "provider": "mock",
            "model": "mock-1",
        },
    )
    session_id = r.json()["session_id"]

    fake_lines = [
        'data: {"event": "text", "data": {"content": "echo: ping me"}}',
        'data: {"event": "done", "data": {}}',
    ]

    async def _fake_aiter_lines():
        for line in fake_lines:
            yield line

    mock_resp = AsyncMock()
    mock_resp.status_code = 200
    mock_resp.aiter_lines = _fake_aiter_lines

    mock_client_instance = AsyncMock()
    mock_stream_ctx = AsyncMock()
    mock_stream_ctx.__aenter__ = AsyncMock(return_value=mock_resp)
    mock_stream_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_client_instance.stream = MagicMock(return_value=mock_stream_ctx)
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    with patch(
        "app.services.chat_stream.httpx.AsyncClient", return_value=mock_client_instance
    ):
        stream_r = await client.get(f"/api/chat/stream/{session_id}")

    events = _parse_sse_lines(stream_r.text)
    text_events = [e for e in events if e["event"] == "text"]
    combined = "".join(e["data"]["content"] for e in text_events)
    assert "ping me" in combined


async def test_stream_unknown_session_returns_404(client: AsyncClient):
    r = await client.get("/api/chat/stream/does-not-exist")
    assert r.status_code == 404


async def test_stream_bridge_error_is_proxied(client: AsyncClient):
    """If bridge returns an error event, it is proxied through."""
    r = await client.post(
        "/api/chat",
        json={
            "messages": [{"role": "user", "content": "hi"}],
            "provider": "no-such-provider",
            "model": "x",
        },
    )
    session_id = r.json()["session_id"]

    fake_lines = [
        'data: {"event": "error", "data": {"message": "no-such-provider"}}',
        'data: {"event": "done", "data": {}}',
    ]

    async def _fake_aiter_lines():
        for line in fake_lines:
            yield line

    mock_resp = AsyncMock()
    mock_resp.status_code = 200
    mock_resp.aiter_lines = _fake_aiter_lines

    mock_client_instance = AsyncMock()
    mock_stream_ctx = AsyncMock()
    mock_stream_ctx.__aenter__ = AsyncMock(return_value=mock_resp)
    mock_stream_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_client_instance.stream = MagicMock(return_value=mock_stream_ctx)
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    with patch(
        "app.services.chat_stream.httpx.AsyncClient", return_value=mock_client_instance
    ):
        stream_r = await client.get(f"/api/chat/stream/{session_id}")

    assert stream_r.status_code == 200
    events = _parse_sse_lines(stream_r.text)
    assert events[0]["event"] == "error"
    assert "no-such-provider" in events[0]["data"]["message"]
