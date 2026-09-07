"""ClaudeProvider — Anthropic streaming API with tool_use and usage capture."""
from __future__ import annotations

import json
import os
from typing import Any, AsyncIterator

from app.models.base import ModelProvider, ModelInfo
from app.types import Message, Role, TextChunk, ToolCallChunk


# ---------------------------------------------------------------------------
# Supported models
# ---------------------------------------------------------------------------

_MODELS: list[ModelInfo] = [
    ModelInfo(
        id="claude-opus-4-5",
        name="Claude Opus 4.5",
        provider="claude",
        supports_tools=True,
    ),
    ModelInfo(
        id="claude-sonnet-4-5",
        name="Claude Sonnet 4.5",
        provider="claude",
        supports_tools=True,
    ),
    ModelInfo(
        id="claude-haiku-3-5",
        name="Claude Haiku 3.5",
        provider="claude",
        supports_tools=True,
    ),
]


# ---------------------------------------------------------------------------
# Message conversion helpers
# ---------------------------------------------------------------------------

def _to_anthropic_messages(messages: list[Message]) -> list[dict[str, Any]]:
    """Convert internal Message list → Anthropic API message format."""
    result: list[dict[str, Any]] = []
    for msg in messages:
        if msg.role == Role.USER:
            result.append({"role": "user", "content": msg.content})

        elif msg.role == Role.ASSISTANT:
            content: list[dict[str, Any]] = []
            if msg.content:
                content.append({"type": "text", "text": msg.content})
            if msg.tool_calls:
                for tc in msg.tool_calls:
                    content.append(
                        {
                            "type": "tool_use",
                            "id": tc.tool_call_id,
                            "name": tc.tool_name,
                            "input": tc.arguments,
                        }
                    )
            result.append({"role": "assistant", "content": content})

        elif msg.role == Role.TOOL and msg.tool_results:
            tool_content = [
                {
                    "type": "tool_result",
                    "tool_use_id": tr.tool_call_id,
                    "content": tr.output,
                    "is_error": tr.is_error,
                }
                for tr in msg.tool_results
            ]
            result.append({"role": "user", "content": tool_content})

    return result


# ---------------------------------------------------------------------------
# Provider
# ---------------------------------------------------------------------------

class ClaudeProvider(ModelProvider):
    """Streams responses from Anthropic's Claude models."""

    provider_name = "claude"

    def __init__(self, api_key: str | None = None) -> None:
        try:
            import anthropic  # lazy import — not required in test environments
        except ImportError as exc:
            raise RuntimeError(
                "anthropic package is not installed. "
                "Install it with: pip install anthropic"
            ) from exc

        self._anthropic = anthropic
        self._client = anthropic.AsyncAnthropic(
            api_key=api_key or os.getenv("ANTHROPIC_API_KEY")
        )

    def list_models(self) -> list[ModelInfo]:
        return list(_MODELS)

    async def chat_stream(
        self,
        model_id: str,
        messages: list[Message],
        tools: list[dict[str, Any]],
    ) -> AsyncIterator[TextChunk | ToolCallChunk]:
        anthropic_messages = _to_anthropic_messages(messages)

        async with self._client.messages.stream(
            model=model_id,
            max_tokens=8096,
            messages=anthropic_messages,
            tools=tools or [],
        ) as stream:
            current_tool_id: str | None = None
            current_tool_name: str | None = None
            tool_input_buf: str = ""

            async for event in stream:
                etype = event.type

                if etype == "content_block_start":
                    block = event.content_block
                    if block.type == "tool_use":
                        current_tool_id = block.id
                        current_tool_name = block.name
                        tool_input_buf = ""
                    # text blocks: nothing to initialise

                elif etype == "content_block_delta":
                    delta = event.delta
                    if delta.type == "text_delta":
                        yield TextChunk(content=delta.text)
                    elif delta.type == "input_json_delta":
                        tool_input_buf += delta.partial_json

                elif etype == "content_block_stop":
                    if current_tool_id is not None:
                        try:
                            tool_args = json.loads(tool_input_buf) if tool_input_buf else {}
                        except json.JSONDecodeError:
                            tool_args = {}
                        yield ToolCallChunk(
                            tool_call_id=current_tool_id,
                            tool_name=current_tool_name or "",
                            arguments=tool_args,
                        )
                        current_tool_id = None
                        current_tool_name = None
                        tool_input_buf = ""

                # message_delta carries usage info — consumed by the caller via
                # stream.get_final_message() if needed; we don't yield it here
                # since usage SSEEvents are emitted at the AgentLoop level.
