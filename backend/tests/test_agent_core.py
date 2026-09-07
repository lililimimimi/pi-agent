from __future__ import annotations

from typing import AsyncIterator, Any
import pytest

from app.agent.core import AgentLoop
from app.models.base import ModelProvider, ModelRouter, ModelInfo
from app.tools.base import Tool, ToolRegistry
from app.types import (
    TextChunk, ToolCallChunk, ToolResult,
    Message, Role, SSEEvent,
)


# ── Test doubles ──────────────────────────────────────────────────────────────

class ScriptedProvider(ModelProvider):
    """Yields pre-defined responses, one list per call."""

    provider_name = "scripted"

    def __init__(self, responses: list[list[TextChunk | ToolCallChunk]]):
        self._responses = list(responses)
        self._call = 0

    def list_models(self) -> list[ModelInfo]:
        return [ModelInfo(id="s-1", name="Scripted", provider="scripted")]

    async def chat_stream(
        self, model_id: str, messages: list[Message], tools: list[dict[str, Any]]
    ) -> AsyncIterator[TextChunk | ToolCallChunk]:
        chunks = self._responses[self._call]
        self._call += 1
        for c in chunks:
            yield c


class EchoTool(Tool):
    name = "echo"
    description = "Echo the input text"
    parameters = {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]}
    requires_approval = False

    async def execute(self, args: dict) -> ToolResult:
        return ToolResult(tool_call_id="", output=f"echo: {args['text']}", is_error=False)


class ApprovalTool(Tool):
    name = "dangerous"
    description = "Requires approval"
    parameters = {"type": "object", "properties": {}}
    requires_approval = True

    async def execute(self, args: dict) -> ToolResult:
        return ToolResult(tool_call_id="", output="executed", is_error=False)


def make_agent(responses, tools=None):
    router = ModelRouter()
    router.register(ScriptedProvider(responses))
    registry = ToolRegistry()
    for t in (tools or []):
        registry.register(t)
    return AgentLoop(model_router=router, tool_registry=registry)


async def collect(gen) -> list[SSEEvent]:
    return [e async for e in gen]


# ── Tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_pure_text_response():
    agent = make_agent([[TextChunk(content="Hello"), TextChunk(content=" world")]])
    events = await collect(agent.run("scripted", "s-1", [Message(role=Role.USER, content="hi")]))

    text_events = [e for e in events if e.event == "text"]
    assert len(text_events) == 2
    assert text_events[0].data["content"] == "Hello"
    assert text_events[1].data["content"] == " world"
    assert events[-1].event == "done"


@pytest.mark.asyncio
async def test_tool_auto_execute():
    """Model calls echo tool → executed automatically → model continues."""
    agent = make_agent(
        responses=[
            [ToolCallChunk(tool_call_id="tc1", tool_name="echo", arguments={"text": "ping"})],
            [TextChunk(content="Tool said: echo: ping")],
        ],
        tools=[EchoTool()],
    )
    events = await collect(agent.run("scripted", "s-1", [Message(role=Role.USER, content="echo ping")]))

    types = [e.event for e in events]
    assert "tool_call" in types
    assert "tool_result" in types
    assert "text" in types
    assert events[-1].event == "done"

    result_event = next(e for e in events if e.event == "tool_result")
    assert result_event.data["output"] == "echo: ping"
    assert result_event.data["is_error"] is False


@pytest.mark.asyncio
async def test_tool_requires_approval():
    """Approval branch is skipped — tools with requires_approval=True auto-execute."""
    agent = make_agent(
        responses=[
            [ToolCallChunk(tool_call_id="tc2", tool_name="dangerous", arguments={})],
            [TextChunk(content="done")],
        ],
        tools=[ApprovalTool()],
    )
    events = await collect(agent.run("scripted", "s-1", [Message(role=Role.USER, content="do it")]))

    types = [e.event for e in events]
    assert "tool_call" in types
    # Approval is skipped, tool auto-executes
    assert "approval_request" not in types
    assert "waiting_for_approval" not in types
    assert "tool_result" in types
    result_event = next(e for e in events if e.event == "tool_result")
    assert result_event.data["output"] == "executed"
    assert events[-1].event == "done"


@pytest.mark.asyncio
async def test_unknown_tool_returns_error():
    """Model calls a tool that is not registered — error fed back to model."""
    agent = make_agent(
        responses=[
            [ToolCallChunk(tool_call_id="tc3", tool_name="ghost", arguments={})],
            [TextChunk(content="Sorry, tool not available.")],
        ],
    )
    events = await collect(agent.run("scripted", "s-1", [Message(role=Role.USER, content="use ghost")]))

    result_events = [e for e in events if e.event == "tool_result"]
    assert len(result_events) == 1
    assert result_events[0].data["is_error"] is True
    assert "ghost" in result_events[0].data["output"]
    assert events[-1].event == "done"


@pytest.mark.asyncio
async def test_unknown_provider_emits_error():
    router = ModelRouter()
    agent = AgentLoop(model_router=router, tool_registry=ToolRegistry())
    events = await collect(agent.run("nobody", "x", [Message(role=Role.USER, content="hi")]))

    assert events[0].event == "error"
    assert "nobody" in events[0].data["message"]
