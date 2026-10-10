"""
Stopping a reply keeps the text written so far, in the session file.

The fake bridge pauses mid-reply; the user's Stop request arrives while it is paused.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.sessions import store


@pytest.fixture
async def client():
    from app.main import app

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c


def _fake_bridge(gate: asyncio.Event):
    """A bridge stream: some text, a pause, then more text and done."""

    async def _lines():
        yield 'data: {"event": "text", "data": {"content": "Partial "}}'
        await gate.wait()
        yield 'data: {"event": "text", "data": {"content": "never saved"}}'
        yield 'data: {"event": "done", "data": {}}'

    resp = AsyncMock()
    resp.status_code = 200
    resp.aiter_lines = _lines

    ctx = AsyncMock()
    ctx.__aenter__ = AsyncMock(return_value=resp)
    ctx.__aexit__ = AsyncMock(return_value=False)

    client_instance = AsyncMock()
    client_instance.stream = MagicMock(return_value=ctx)
    client_instance.__aenter__ = AsyncMock(return_value=client_instance)
    client_instance.__aexit__ = AsyncMock(return_value=False)
    return client_instance


def _assistant_texts(session_id: str) -> list[str]:
    return [
        r["content"]
        for r in store.get_session(session_id)
        if r.get("type") == "message" and r.get("role") == "assistant"
    ]


async def test_stop_mid_reply_saves_partial_text(client: AsyncClient):
    r = await client.post(
        "/api/chat",
        json={
            "messages": [{"role": "user", "content": "hello"}],
            "provider": "mock",
            "model": "mock-1",
        },
    )
    session_id = r.json()["session_id"]
    persist_id = r.json()["persist_id"]

    gate = asyncio.Event()
    with patch(
        "app.services.chat_stream.httpx.AsyncClient", return_value=_fake_bridge(gate)
    ):
        stream_task = asyncio.create_task(client.get(f"/api/chat/stream/{session_id}"))
        await asyncio.sleep(
            0.05
        )  # let "Partial " arrive and the stream reach the pause

        stop = await client.post(f"/api/chat/stop/{session_id}")
        assert stop.status_code == 200

        gate.set()  # the bridge carries on; the stopped stream must ignore it
        await stream_task

    assert _assistant_texts(persist_id) == ["Partial "]


async def test_stop_pressed_twice_saves_once(client: AsyncClient):
    r = await client.post(
        "/api/chat",
        json={
            "messages": [{"role": "user", "content": "hello"}],
            "provider": "mock",
            "model": "mock-1",
        },
    )
    session_id = r.json()["session_id"]
    persist_id = r.json()["persist_id"]

    gate = asyncio.Event()
    with patch(
        "app.services.chat_stream.httpx.AsyncClient", return_value=_fake_bridge(gate)
    ):
        stream_task = asyncio.create_task(client.get(f"/api/chat/stream/{session_id}"))
        await asyncio.sleep(0.05)
        await client.post(f"/api/chat/stop/{session_id}")
        await client.post(
            f"/api/chat/stop/{session_id}"
        )  # a second press changes nothing
        gate.set()
        await stream_task

    assert _assistant_texts(persist_id) == ["Partial "]


async def test_stop_after_the_reply_finished_is_ok_and_does_nothing(
    client: AsyncClient,
):
    """The reply can finish just before Stop arrives: that is not an error, there is nothing to stop."""
    r = await client.post("/api/chat/stop/no-such-session")
    assert r.status_code == 200


async def test_closed_tab_mid_reply_saves_partial_text(client: AsyncClient):
    """The browser disconnects while text is still arriving: what arrived is kept."""
    from app.main import app

    r = await client.post(
        "/api/chat",
        json={
            "messages": [{"role": "user", "content": "hello"}],
            "provider": "mock",
            "model": "mock-1",
        },
    )
    session_id = r.json()["session_id"]
    persist_id = r.json()["persist_id"]

    gate = asyncio.Event()  # never opened: the reply stays unfinished
    got_text = asyncio.Event()
    disconnected = asyncio.Event()

    async def receive():
        await disconnected.wait()
        return {"type": "http.disconnect"}

    async def send(message):
        if message["type"] == "http.response.body" and b"Partial" in message.get(
            "body", b""
        ):
            got_text.set()

    scope = {
        "type": "http",
        "method": "GET",
        "path": f"/api/chat/stream/{session_id}",
        "raw_path": f"/api/chat/stream/{session_id}".encode(),
        "query_string": b"",
        "headers": [],
        "root_path": "",
        "scheme": "http",
        "server": ("test", 80),
        "client": ("test", 1),
        "http_version": "1.1",
    }

    async def close_tab_once_text_arrives():
        await got_text.wait()
        disconnected.set()

    with patch(
        "app.services.chat_stream.httpx.AsyncClient", return_value=_fake_bridge(gate)
    ):
        closer = asyncio.create_task(close_tab_once_text_arrives())
        await asyncio.wait_for(app(scope, receive, send), timeout=5)
        await closer

    assert _assistant_texts(persist_id) == ["Partial "]
