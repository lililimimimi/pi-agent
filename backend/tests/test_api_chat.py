"""
Integration tests for the FastAPI HTTP layer (Module 3).

Uses httpx AsyncClient + ASGITransport — no real server required.
Patches app.container registries with MockProvider for isolation.
"""
from __future__ import annotations

import json

import pytest
from httpx import ASGITransport, AsyncClient

import app.container as container
from app.models.base import MockProvider, ModelRouter
from app.tools.base import ToolRegistry


# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #

@pytest.fixture(autouse=True)
def _patch_registries():
    """Replace global registries with clean mock instances for every test."""
    original_router = container.model_router
    original_registry = container.tool_registry

    router = ModelRouter()
    router.register(MockProvider())
    container.model_router = router
    container.tool_registry = ToolRegistry()

    yield

    container.model_router = original_router
    container.tool_registry = original_registry


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

async def test_health(client: AsyncClient):
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
    """SSE stream for mock provider must contain text + done events."""
    r = await client.post(
        "/api/chat",
        json={
            "messages": [{"role": "user", "content": "hello"}],
            "provider": "mock",
            "model": "mock-1",
        },
    )
    session_id = r.json()["session_id"]

    stream_r = await client.get(f"/api/chat/stream/{session_id}")
    assert stream_r.status_code == 200
    assert "text/event-stream" in stream_r.headers["content-type"]

    events = _parse_sse_lines(stream_r.text)
    event_types = [e["event"] for e in events]

    assert "text" in event_types, f"No 'text' event in {event_types}"
    assert events[-1]["event"] == "done", f"Last event is not 'done': {event_types}"


async def test_stream_text_content_matches_mock(client: AsyncClient):
    """Mock provider echoes the last message — verify content is present."""
    r = await client.post(
        "/api/chat",
        json={
            "messages": [{"role": "user", "content": "ping me"}],
            "provider": "mock",
            "model": "mock-1",
        },
    )
    session_id = r.json()["session_id"]

    stream_r = await client.get(f"/api/chat/stream/{session_id}")
    events = _parse_sse_lines(stream_r.text)

    text_events = [e for e in events if e["event"] == "text"]
    combined = "".join(e["data"]["content"] for e in text_events)
    assert "ping me" in combined


async def test_stream_unknown_session_returns_404(client: AsyncClient):
    r = await client.get("/api/chat/stream/does-not-exist")
    assert r.status_code == 404


async def test_approve_tool_returns_ok(client: AsyncClient):
    """POST /api/tool/approve on a valid session returns {status: ok}."""
    r = await client.post(
        "/api/chat",
        json={
            "messages": [{"role": "user", "content": "hi"}],
            "provider": "mock",
            "model": "mock-1",
        },
    )
    session_id = r.json()["session_id"]

    r2 = await client.post(
        "/api/tool/approve",
        json={
            "session_id": session_id,
            "tool_call_id": "tc-fake-123",
            "approved": True,
        },
    )
    assert r2.status_code == 200
    assert r2.json() == {"status": "ok"}


async def test_approve_unknown_session_returns_404(client: AsyncClient):
    r = await client.post(
        "/api/tool/approve",
        json={
            "session_id": "ghost-session",
            "tool_call_id": "tc-1",
            "approved": False,
        },
    )
    assert r.status_code == 404


async def test_stream_unknown_provider_emits_error_event(client: AsyncClient):
    """If provider is unknown, SSE stream must emit an 'error' event."""
    r = await client.post(
        "/api/chat",
        json={
            "messages": [{"role": "user", "content": "hi"}],
            "provider": "no-such-provider",
            "model": "x",
        },
    )
    session_id = r.json()["session_id"]

    stream_r = await client.get(f"/api/chat/stream/{session_id}")
    assert stream_r.status_code == 200

    events = _parse_sse_lines(stream_r.text)
    assert events[0]["event"] == "error"
    assert "no-such-provider" in events[0]["data"]["message"]
