"""DeepSeekProvider — OpenAI-compatible streaming API with function_calling."""
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
        id="deepseek-chat",
        name="DeepSeek V3",
        provider="deepseek",
        supports_tools=True,
    ),
    ModelInfo(
        id="deepseek-reasoner",
        name="DeepSeek R1",
        provider="deepseek",
        supports_tools=False,
    ),
]


# ---------------------------------------------------------------------------
# Message conversion: internal → OpenAI format
# ---------------------------------------------------------------------------

def _to_openai_messages(messages: list[Message]) -> list[dict[str, Any]]:
    """Convert internal Message list → OpenAI API message format."""
    result: list[dict[str, Any]] = []
    for msg in messages:
        if msg.role == Role.USER:
            result.append({"role": "user", "content": msg.content})

        elif msg.role == Role.ASSISTANT:
            entry: dict[str, Any] = {"role": "assistant"}
            if msg.content:
                entry["content"] = msg.content
            if msg.tool_calls:
                entry["tool_calls"] = [
                    {
                        "id": tc.tool_call_id,
                        "type": "function",
                        "function": {
                            "name": tc.tool_name,
                            "arguments": json.dumps(tc.arguments),
                        },
                    }
                    for tc in msg.tool_calls
                ]
            if not msg.content and not msg.tool_calls:
                entry["content"] = ""
            result.append(entry)

        elif msg.role == Role.TOOL and msg.tool_results:
            for tr in msg.tool_results:
                result.append({
                    "role": "tool",
                    "tool_call_id": tr.tool_call_id,
                    "content": tr.output,
                })

    return result


# ---------------------------------------------------------------------------
# Tool schema conversion: Anthropic format → OpenAI function_calling format
# ---------------------------------------------------------------------------

def _to_openai_tools(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert Claude/Anthropic tool schemas to OpenAI function_calling format.

    Anthropic format:
        {"name": "...", "description": "...", "input_schema": {...}}

    OpenAI format:
        {"type": "function", "function": {"name": "...", "description": "...", "parameters": {...}}}

    If tools are already in OpenAI format (have "type": "function"), pass through.
    """
    result: list[dict[str, Any]] = []
    for tool in tools:
        if tool.get("type") == "function":
            # Already in OpenAI format
            result.append(tool)
        else:
            # Anthropic format → OpenAI format
            result.append({
                "type": "function",
                "function": {
                    "name": tool["name"],
                    "description": tool.get("description", ""),
                    "parameters": tool.get("input_schema", {}),
                },
            })
    return result


# ---------------------------------------------------------------------------
# Provider
# ---------------------------------------------------------------------------

class DeepSeekProvider(ModelProvider):
    """Streams responses from DeepSeek's OpenAI-compatible API."""

    provider_name = "deepseek"

    _BASE_URL = "https://api.deepseek.com"

    def __init__(self, api_key: str | None = None, base_url: str | None = None) -> None:
        try:
            from openai import AsyncOpenAI
        except ImportError as exc:
            raise RuntimeError(
                "openai package is not installed. "
                "Install it with: pip install openai"
            ) from exc

        resolved_url = base_url or os.getenv("DEEPSEEK_BASE_URL") or self._BASE_URL
        self._client = AsyncOpenAI(
            api_key=api_key or os.getenv("DEEPSEEK_API_KEY"),
            base_url=resolved_url,
        )

    def list_models(self) -> list[ModelInfo]:
        return list(_MODELS)

    async def chat_stream(
        self,
        model_id: str,
        messages: list[Message],
        tools: list[dict[str, Any]],
    ) -> AsyncIterator[TextChunk | ToolCallChunk]:
        openai_messages = _to_openai_messages(messages)
        openai_tools = _to_openai_tools(tools) if tools else []

        create_kwargs: dict[str, Any] = {
            "model": model_id,
            "messages": openai_messages,
            "stream": True,
        }
        if openai_tools:
            create_kwargs["tools"] = openai_tools

        stream = await self._client.chat.completions.create(**create_kwargs)

        # Accumulate tool calls by index
        tool_calls_acc: dict[int, dict[str, Any]] = {}

        async for chunk in stream:
            if not chunk.choices:
                continue

            choice = chunk.choices[0]
            delta = choice.delta

            # Text content
            if delta.content:
                yield TextChunk(content=delta.content)

            # Tool call deltas
            if delta.tool_calls:
                for tc_delta in delta.tool_calls:
                    idx = tc_delta.index
                    if idx not in tool_calls_acc:
                        tool_calls_acc[idx] = {
                            "id": "",
                            "name": "",
                            "arguments": "",
                        }

                    acc = tool_calls_acc[idx]
                    if tc_delta.id:
                        acc["id"] = tc_delta.id
                    if tc_delta.function:
                        if tc_delta.function.name:
                            acc["name"] = tc_delta.function.name
                        if tc_delta.function.arguments:
                            acc["arguments"] += tc_delta.function.arguments

            # On finish, emit accumulated tool calls
            if choice.finish_reason in ("tool_calls", "stop") and tool_calls_acc:
                for _idx in sorted(tool_calls_acc):
                    acc = tool_calls_acc[_idx]
                    try:
                        args = json.loads(acc["arguments"]) if acc["arguments"] else {}
                    except json.JSONDecodeError:
                        args = {}
                    yield ToolCallChunk(
                        tool_call_id=acc["id"],
                        tool_name=acc["name"],
                        arguments=args,
                    )
                tool_calls_acc.clear()
