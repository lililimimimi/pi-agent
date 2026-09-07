"""Tests for DeepSeekProvider — mock OpenAI SDK, verify unified chunk output."""
from __future__ import annotations

import json
from typing import Any, AsyncIterator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.base import ModelInfo
from app.types import Message, Role, TextChunk, ToolCallChunk


# ── Helpers: fake OpenAI streaming objects ────────────────────────────────────

class FakeDelta:
    def __init__(
        self,
        content: str | None = None,
        tool_calls: list | None = None,
    ):
        self.content = content
        self.tool_calls = tool_calls


class FakeToolCallDelta:
    def __init__(self, index: int, id: str | None, function: Any = None):
        self.index = index
        self.id = id
        self.function = function


class FakeFunction:
    def __init__(self, name: str | None = None, arguments: str | None = None):
        self.name = name
        self.arguments = arguments


class FakeChoice:
    def __init__(self, delta: FakeDelta, finish_reason: str | None = None):
        self.delta = delta
        self.finish_reason = finish_reason


class FakeStreamChunk:
    def __init__(self, choices: list[FakeChoice]):
        self.choices = choices


class FakeAsyncStream:
    """Async iterator that yields FakeStreamChunk objects."""

    def __init__(self, chunks: list[FakeStreamChunk]):
        self._chunks = chunks
        self._index = 0

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self._index >= len(self._chunks):
            raise StopAsyncIteration
        chunk = self._chunks[self._index]
        self._index += 1
        return chunk


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _make_provider(fake_stream: FakeAsyncStream):
    """Create DeepSeekProvider with mocked AsyncOpenAI client."""
    from app.models.deepseek import DeepSeekProvider

    provider = DeepSeekProvider(api_key="test-key")
    # Replace the client's chat.completions.create with our mock
    mock_create = AsyncMock(return_value=fake_stream)
    provider._client.chat.completions.create = mock_create
    return provider, mock_create


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestDeepSeekProviderMetadata:
    def test_provider_name(self):
        from app.models.deepseek import DeepSeekProvider

        provider = DeepSeekProvider(api_key="test-key")
        assert provider.provider_name == "deepseek"

    def test_list_models(self):
        from app.models.deepseek import DeepSeekProvider

        provider = DeepSeekProvider(api_key="test-key")
        models = provider.list_models()
        assert len(models) >= 1
        assert all(isinstance(m, ModelInfo) for m in models)
        assert all(m.provider == "deepseek" for m in models)
        ids = [m.id for m in models]
        assert "deepseek-chat" in ids

    def test_default_base_url(self):
        from app.models.deepseek import DeepSeekProvider

        provider = DeepSeekProvider(api_key="test-key")
        assert str(provider._client.base_url).rstrip("/").endswith("api.deepseek.com")

    def test_env_overrides_base_url(self, monkeypatch):
        from app.models.deepseek import DeepSeekProvider

        monkeypatch.setenv("DEEPSEEK_BASE_URL", "https://api.siliconflow.cn/v1")
        provider = DeepSeekProvider(api_key="test-key")
        assert "siliconflow" in str(provider._client.base_url)

    def test_constructor_base_url_wins_over_env(self, monkeypatch):
        from app.models.deepseek import DeepSeekProvider

        monkeypatch.setenv("DEEPSEEK_BASE_URL", "https://env.example.com/v1")
        provider = DeepSeekProvider(api_key="test-key", base_url="https://arg.example.com/v1")
        assert "arg.example.com" in str(provider._client.base_url)


class TestDeepSeekTextStreaming:
    @pytest.mark.asyncio
    async def test_pure_text_response(self):
        """Stream text deltas → unified TextChunk objects."""
        stream = FakeAsyncStream([
            FakeStreamChunk([FakeChoice(FakeDelta(content="Hello"))]),
            FakeStreamChunk([FakeChoice(FakeDelta(content=" world"))]),
            FakeStreamChunk([FakeChoice(FakeDelta(content=None), finish_reason="stop")]),
        ])
        provider, mock_create = _make_provider(stream)

        chunks = []
        async for chunk in provider.chat_stream(
            "deepseek-chat",
            [Message(role=Role.USER, content="hi")],
            [],
        ):
            chunks.append(chunk)

        assert len(chunks) == 2
        assert all(isinstance(c, TextChunk) for c in chunks)
        assert chunks[0].content == "Hello"
        assert chunks[1].content == " world"

    @pytest.mark.asyncio
    async def test_empty_content_skipped(self):
        """Deltas with None/empty content should not yield chunks."""
        stream = FakeAsyncStream([
            FakeStreamChunk([FakeChoice(FakeDelta(content=None))]),
            FakeStreamChunk([FakeChoice(FakeDelta(content="ok"))]),
        ])
        provider, _ = _make_provider(stream)

        chunks = []
        async for chunk in provider.chat_stream(
            "deepseek-chat",
            [Message(role=Role.USER, content="hi")],
            [],
        ):
            chunks.append(chunk)

        assert len(chunks) == 1
        assert chunks[0].content == "ok"


class TestDeepSeekToolCalling:
    @pytest.mark.asyncio
    async def test_tool_call_stream(self):
        """Tool call deltas are accumulated and yield ToolCallChunk on finish."""
        stream = FakeAsyncStream([
            # First chunk: start tool call with id and function name
            FakeStreamChunk([FakeChoice(FakeDelta(
                tool_calls=[FakeToolCallDelta(
                    index=0,
                    id="call_abc",
                    function=FakeFunction(name="read_file", arguments='{"pat'),
                )]
            ))]),
            # Second chunk: continue arguments
            FakeStreamChunk([FakeChoice(FakeDelta(
                tool_calls=[FakeToolCallDelta(
                    index=0,
                    id=None,
                    function=FakeFunction(name=None, arguments='h": "/tmp"}'),
                )]
            ))]),
            # Finish
            FakeStreamChunk([FakeChoice(
                FakeDelta(content=None, tool_calls=None),
                finish_reason="tool_calls",
            )]),
        ])
        provider, _ = _make_provider(stream)

        chunks = []
        async for chunk in provider.chat_stream(
            "deepseek-chat",
            [Message(role=Role.USER, content="read /tmp")],
            [{"type": "function", "function": {"name": "read_file"}}],
        ):
            chunks.append(chunk)

        assert len(chunks) == 1
        tc = chunks[0]
        assert isinstance(tc, ToolCallChunk)
        assert tc.tool_call_id == "call_abc"
        assert tc.tool_name == "read_file"
        assert tc.arguments == {"path": "/tmp"}


class TestDeepSeekMessageConversion:
    @pytest.mark.asyncio
    async def test_messages_converted_to_openai_format(self):
        """Verify that internal Message format is correctly converted for the API call."""
        stream = FakeAsyncStream([
            FakeStreamChunk([FakeChoice(FakeDelta(content="ok"), finish_reason="stop")]),
        ])
        provider, mock_create = _make_provider(stream)

        messages = [
            Message(role=Role.USER, content="hello"),
        ]
        async for _ in provider.chat_stream("deepseek-chat", messages, []):
            pass

        # Verify the API was called with correct format
        mock_create.assert_called_once()
        call_kwargs = mock_create.call_args
        api_messages = call_kwargs.kwargs.get("messages") or call_kwargs[1].get("messages")
        assert api_messages == [{"role": "user", "content": "hello"}]


class TestDeepSeekToolConversion:
    @pytest.mark.asyncio
    async def test_claude_tools_converted_to_openai_format(self):
        """Claude tool schemas (Anthropic format) are converted to OpenAI function_calling."""
        stream = FakeAsyncStream([
            FakeStreamChunk([FakeChoice(FakeDelta(content="ok"), finish_reason="stop")]),
        ])
        provider, mock_create = _make_provider(stream)

        # Claude/Anthropic tool format
        claude_tools = [
            {
                "name": "read_file",
                "description": "Read a file",
                "input_schema": {
                    "type": "object",
                    "properties": {"path": {"type": "string"}},
                    "required": ["path"],
                },
            }
        ]

        async for _ in provider.chat_stream("deepseek-chat", [], claude_tools):
            pass

        call_kwargs = mock_create.call_args
        api_tools = call_kwargs.kwargs.get("tools") or call_kwargs[1].get("tools")
        assert api_tools is not None
        assert len(api_tools) == 1
        tool = api_tools[0]
        assert tool["type"] == "function"
        assert tool["function"]["name"] == "read_file"
        assert tool["function"]["description"] == "Read a file"
        assert tool["function"]["parameters"]["type"] == "object"
