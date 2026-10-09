"""Tests for which chat errors mark a model as failed in the model picker."""
from __future__ import annotations

import pytest

from app.services.catalog import is_lasting_failure


@pytest.mark.parametrize(
    "message",
    [
        "out of extra usage",
        "Insufficient balance",
        "You exceeded your current quota",
        "Error 401: invalid x-api-key",
        "403 Forbidden: permission denied",
        "Credit balance is too low",
        "This model is not available with your ChatGPT subscription. Choose another model.",
        "Codex error: The 'gpt-5.4' model is not supported when using Codex with a ChatGPT account.",
    ],
)
def test_money_and_key_errors_are_lasting(message: str):
    assert is_lasting_failure(message)


@pytest.mark.parametrize(
    "message",
    [
        "Request timed out",
        "fetch failed: ECONNRESET",
        "503 Service Unavailable",
        "pi-bridge unreachable",
    ],
)
def test_temporary_errors_are_not_lasting(message: str):
    assert not is_lasting_failure(message)


# --------------------------------------------------------------------------- #
# End to end: a chat turn updates the model's status in the config
# --------------------------------------------------------------------------- #

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
def cfg_file(tmp_path: Path, monkeypatch) -> Path:
    path = tmp_path / "config.json"
    monkeypatch.setattr("app.config.store._config_path", lambda: path)
    path.write_text(json.dumps({"providers": {"openai-codex": {"connected": True}}}))
    return path


async def _run_turn(lines: list[str]) -> None:
    """Start a chat and stream the given bridge lines, with the bridge mocked."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.post(
            "/api/chat",
            json={
                "messages": [{"role": "user", "content": "hi"}],
                "provider": "openai-codex",
                "model": "gpt-5.4",
                # An id with no session file: the turn is not saved, which keeps the test off disk
                "persist_id": "no-such-session",
            },
        )
        session_id = r.json()["session_id"]

        async def _lines():
            for line in lines:
                yield line

        mock_resp = AsyncMock()
        mock_resp.status_code = 200
        mock_resp.aiter_lines = _lines
        stream_ctx = AsyncMock()
        stream_ctx.__aenter__ = AsyncMock(return_value=mock_resp)
        stream_ctx.__aexit__ = AsyncMock(return_value=False)
        bridge = AsyncMock()
        bridge.stream = MagicMock(return_value=stream_ctx)
        bridge.__aenter__ = AsyncMock(return_value=bridge)
        bridge.__aexit__ = AsyncMock(return_value=False)
        with patch("app.api.chat.httpx.AsyncClient", return_value=bridge):
            await client.get(f"/api/chat/stream/{session_id}")


def _status(cfg_file: Path) -> dict | None:
    cfg = json.loads(cfg_file.read_text())
    return cfg["providers"]["openai-codex"].get("model_status", {}).get("gpt-5.4")


async def test_chat_turn_marks_model_failed_for_a_lasting_error(cfg_file):
    await _run_turn([
        'data: {"event": "error", "data": {"message": "This model is not available with your ChatGPT subscription."}}',
        'data: {"event": "done", "data": {}}',
    ])
    assert _status(cfg_file)["ok"] is False


async def test_chat_turn_leaves_status_alone_for_a_temporary_error(cfg_file):
    await _run_turn([
        'data: {"event": "error", "data": {"message": "Request timed out"}}',
        'data: {"event": "done", "data": {}}',
    ])
    assert _status(cfg_file) is None


async def test_chat_reply_marks_model_working(cfg_file):
    await _run_turn([
        'data: {"event": "text", "data": {"content": "hello"}}',
        'data: {"event": "done", "data": {}}',
    ])
    assert _status(cfg_file)["ok"] is True
