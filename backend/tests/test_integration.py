"""Integration tests for /api/models/default endpoint and bridge proxy."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture
async def client():
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_models_default_returns_mock_when_no_real_providers(client: AsyncClient):
    """When bridge is down and no config providers, returns built-in default."""
    with (
        patch("app.services.bridge.BRIDGE_URL", "http://127.0.0.1:19999"),
        patch("app.api.models.enabled_models", AsyncMock(return_value=[])),
    ):
        r = await client.get("/api/models/default")
    assert r.status_code == 200
    body = r.json()
    assert body["provider"] == "pi"
    assert body["model"] == "claude-sonnet-4-5"


@pytest.mark.asyncio
async def test_models_default_prefers_first_enabled_model(client: AsyncClient):
    """The default is the first model the user enabled in Settings."""
    enabled = [
        {
            "id": "fake-v1",
            "name": "Fake V1",
            "provider": "fake-cloud",
            "supports_tools": True,
        }
    ]
    with patch("app.api.models.enabled_models", AsyncMock(return_value=enabled)):
        r = await client.get("/api/models/default")
    assert r.status_code == 200
    assert r.json() == {"provider": "fake-cloud", "model": "fake-v1"}


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
# Tool execution + security integration tests
# --------------------------------------------------------------------------- #


def _make_mock_bridge(fake_lines: list[str]):
    """Create a mock httpx.AsyncClient that returns fake SSE lines from bridge."""

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
    return mock_client_instance


async def test_tool_execution_flow_emits_call_then_result(client: AsyncClient):
    """Full flow via bridge proxy: tool_call + tool_result + done events."""
    r = await client.post(
        "/api/chat",
        json={
            "messages": [{"role": "user", "content": "read pyproject.toml"}],
            "provider": "anthropic",
            "model": "claude-sonnet-4-5",
        },
    )
    session_id = r.json()["session_id"]

    fake_lines = [
        'data: {"event": "tool_call", "data": {"tool_call_id": "tc-1", "tool_name": "read_file", "arguments": {"path": "pyproject.toml"}}}',
        'data: {"event": "tool_result", "data": {"tool_call_id": "tc-1", "output": "[tool.pytest]", "is_error": false}}',
        'data: {"event": "text", "data": {"content": "File contents received."}}',
        'data: {"event": "done", "data": {}}',
    ]
    mock_client = _make_mock_bridge(fake_lines)

    with patch("app.services.chat_stream.httpx.AsyncClient", return_value=mock_client):
        stream_r = await client.get(f"/api/chat/stream/{session_id}")

    events = _parse_sse_lines(stream_r.text)
    event_types = [e["event"] for e in events]

    assert "tool_call" in event_types, f"Expected tool_call event in {event_types}"
    assert "tool_result" in event_types, f"Expected tool_result event in {event_types}"
    assert events[-1]["event"] == "done", f"Last event should be done: {event_types}"

    tool_result_events = [e for e in events if e["event"] == "tool_result"]
    assert len(tool_result_events) == 1
    assert tool_result_events[0]["data"]["is_error"] is False


async def test_permission_request_proxied(client: AsyncClient):
    """Bridge permission_request event is correctly proxied."""
    r = await client.post(
        "/api/chat",
        json={
            "messages": [{"role": "user", "content": "write file"}],
            "provider": "anthropic",
            "model": "claude-sonnet-4-5",
        },
    )
    session_id = r.json()["session_id"]

    fake_lines = [
        'data: {"event": "permission_request", "data": {"tool_call_id": "tc-1", "tool_name": "write_file", "arguments": {"path": "test.txt", "content": "hello"}}}',
        'data: {"event": "done", "data": {}}',
    ]
    mock_client = _make_mock_bridge(fake_lines)

    with patch("app.services.chat_stream.httpx.AsyncClient", return_value=mock_client):
        stream_r = await client.get(f"/api/chat/stream/{session_id}")

    events = _parse_sse_lines(stream_r.text)
    event_types = [e["event"] for e in events]
    assert "permission_request" in event_types
