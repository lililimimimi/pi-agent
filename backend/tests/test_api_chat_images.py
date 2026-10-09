"""
Tests for image attachments on /api/chat.

The bridge is replaced with a fake httpx client that records the request body.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.sessions import store as session_store

PNG_B64 = "iVBORw0KGgo="


@pytest.fixture
async def client():
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


class _FakeResponse:
    status_code = 200

    async def aiter_lines(self):
        for line in ['data: {"event": "text", "data": {"content": "a cat"}}']:
            yield line


class _FakeStream:
    def __init__(self, resp):
        self._resp = resp

    async def __aenter__(self):
        return self._resp

    async def __aexit__(self, *exc):
        return False


def _fake_bridge(captured: dict) -> AsyncMock:
    client = AsyncMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)

    def _stream(method, url, json):
        captured["json"] = json
        return _FakeStream(_FakeResponse())

    client.stream = MagicMock(side_effect=_stream)
    return client


def _image_message(text: str = "what is this?", media_type: str = "image/png", data: str = PNG_B64) -> dict:
    return {
        "role": "user",
        "content": [
            {"type": "text", "text": text},
            {"type": "image", "image": {"media_type": media_type, "data": data}},
        ],
    }


async def _create(client: AsyncClient, messages: list[dict]):
    return await client.post(
        "/api/chat",
        json={"messages": messages, "provider": "anthropic", "model": "claude-sonnet-4-5"},
    )


async def test_image_is_forwarded_to_bridge_unchanged(client: AsyncClient):
    r = await _create(client, [_image_message()])
    assert r.status_code == 200
    session_id = r.json()["session_id"]

    captured: dict = {}
    with patch("app.api.chat.httpx.AsyncClient", return_value=_fake_bridge(captured)):
        await client.get(f"/api/chat/stream/{session_id}")

    content = captured["json"]["messages"][0]["content"]
    assert content == [
        {"type": "text", "text": "what is this?"},
        {"type": "image", "image": {"media_type": "image/png", "data": PNG_B64}},
    ]


async def test_text_only_message_is_forwarded_as_string(client: AsyncClient):
    r = await _create(client, [{"role": "user", "content": "hello"}])
    session_id = r.json()["session_id"]

    captured: dict = {}
    with patch("app.api.chat.httpx.AsyncClient", return_value=_fake_bridge(captured)):
        await client.get(f"/api/chat/stream/{session_id}")

    assert captured["json"]["messages"][0]["content"] == "hello"


async def test_session_file_records_text_and_image_count_not_base64(client: AsyncClient):
    r = await _create(client, [_image_message("describe it")])
    persist_id = r.json()["persist_id"]

    records = session_store.get_session(persist_id)
    stored = next(rec for rec in records if rec.get("role") == "user")["content"]
    assert stored == "describe it\n[1 image(s) attached]"
    assert PNG_B64 not in str(records)


async def test_unsupported_media_type_returns_400(client: AsyncClient):
    r = await _create(client, [_image_message(media_type="image/svg+xml")])
    assert r.status_code == 400
    assert "Unsupported image type" in r.json()["detail"]


async def test_image_over_5mb_returns_400(client: AsyncClient):
    # 5MB decoded needs about 6.8M base64 chars; go just past the limit
    too_big = "A" * (7 * 1024 * 1024)
    r = await _create(client, [_image_message(data=too_big)])
    assert r.status_code == 400
    assert "5MB" in r.json()["detail"]


async def test_multiple_images_are_forwarded_in_order(client: AsyncClient):
    msg = {
        "role": "user",
        "content": [
            {"type": "text", "text": "compare these"},
            {"type": "image", "image": {"media_type": "image/png", "data": "AAA="}},
            {"type": "image", "image": {"media_type": "image/jpeg", "data": "BBB="}},
        ],
    }
    r = await _create(client, [msg])
    session_id = r.json()["session_id"]

    captured: dict = {}
    with patch("app.api.chat.httpx.AsyncClient", return_value=_fake_bridge(captured)):
        await client.get(f"/api/chat/stream/{session_id}")

    content = captured["json"]["messages"][0]["content"]
    assert [p["type"] for p in content] == ["text", "image", "image"]
    assert content[2]["image"]["data"] == "BBB="


async def test_more_than_four_images_returns_400(client: AsyncClient):
    parts = [{"type": "text", "text": "x"}]
    parts += [{"type": "image", "image": {"media_type": "image/png", "data": PNG_B64}} for _ in range(5)]
    r = await _create(client, [{"role": "user", "content": parts}])
    assert r.status_code == 400
    assert "4 images" in r.json()["detail"]


async def test_image_part_without_data_returns_400(client: AsyncClient):
    msg = {"role": "user", "content": [{"type": "image"}]}
    r = await _create(client, [msg])
    assert r.status_code == 400


async def test_bridge_error_status_is_reported_to_the_browser(client: AsyncClient):
    """A non-200 from the bridge must reach the UI as an error event, not silence."""
    r = await _create(client, [_image_message()])
    session_id = r.json()["session_id"]

    class _ErrorResponse:
        status_code = 413

        async def aread(self):
            return b"<html>PayloadTooLargeError</html>"

    client_mock = _fake_bridge({})
    client_mock.stream = MagicMock(side_effect=lambda *a, **k: _FakeStream(_ErrorResponse()))
    with patch("app.api.chat.httpx.AsyncClient", return_value=client_mock):
        r = await client.get(f"/api/chat/stream/{session_id}")

    assert '"event": "error"' in r.text or '"event":"error"' in r.text
    assert "HTTP 413" in r.text
    assert '"event": "done"' in r.text or '"event":"done"' in r.text


async def test_existing_session_does_not_repeat_its_history(client: AsyncClient):
    """Each new turn adds only the new user message; earlier turns are already saved."""
    first = await _create(client, [{"role": "user", "content": "one"}])
    persist_id = first.json()["persist_id"]

    second = await client.post("/api/chat", json={
        "messages": [
            {"role": "user", "content": "one"},
            {"role": "assistant", "content": "reply"},
            {"role": "user", "content": "two"},
        ],
        "provider": "anthropic",
        "model": "claude-sonnet-4-5",
        "persist_id": persist_id,
    })
    assert second.status_code == 200

    records = [r for r in session_store.get_session(persist_id) if r.get("type") == "message"]
    assert [r["content"] for r in records] == ["one", "two"]


async def test_failed_turn_is_saved_so_the_error_survives_a_reload(client: AsyncClient):
    r = await _create(client, [{"role": "user", "content": "hello"}])
    session_id, persist_id = r.json()["session_id"], r.json()["persist_id"]

    class _ErrorLine:
        status_code = 200

        async def aiter_lines(self):
            yield 'data: {"event": "error", "data": {"message": "out of extra usage"}}'

    client_mock = _fake_bridge({})
    client_mock.stream = MagicMock(side_effect=lambda *a, **k: _FakeStream(_ErrorLine()))
    with patch("app.api.chat.httpx.AsyncClient", return_value=client_mock):
        await client.get(f"/api/chat/stream/{session_id}")

    records = [r for r in session_store.get_session(persist_id) if r.get("type") == "message"]
    assert records[-1] == {"type": "message", "role": "assistant", "content": "Error: out of extra usage"}
