"""Integration tests for /api/models/default endpoint."""
from __future__ import annotations

import json
import os
from typing import Any, AsyncIterator

import pytest
from httpx import AsyncClient, ASGITransport

import app.container as container
from app.models.base import MockProvider, ModelInfo, ModelProvider, ModelRouter
from app.security import SecurityInterceptor
from app.tools.base import ToolRegistry
from app.tools.read_file import ReadFileTool
from app.tools.write_file import WriteFileTool
from app.types import Message, TextChunk, ToolCallChunk


@pytest.fixture(autouse=True)
def _patch_registries():
    """Replace global registries with clean mock instances for every test."""
    original_router = container.model_router
    original_registry = container.tool_registry
    original_security = container.security_interceptor

    router = ModelRouter()
    router.register(MockProvider())
    container.model_router = router
    container.tool_registry = ToolRegistry()
    container.security_interceptor = None

    yield

    container.model_router = original_router
    container.tool_registry = original_registry
    container.security_interceptor = original_security


@pytest.fixture
async def client():
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_models_default_returns_mock_when_no_real_providers(client: AsyncClient):
    """With only MockProvider registered, /api/models/default returns mock."""
    r = await client.get("/api/models/default")
    assert r.status_code == 200
    body = r.json()
    assert body["provider"] == "mock"
    assert body["model"] == "mock-1"


@pytest.mark.asyncio
async def test_models_default_prefers_non_mock(client: AsyncClient):
    """When a non-mock provider is registered, it takes priority."""

    class FakeProvider(ModelProvider):
        provider_name = "fake-cloud"

        def list_models(self) -> list[ModelInfo]:
            return [ModelInfo(id="fake-v1", name="Fake V1", provider="fake-cloud")]

        async def chat_stream(
            self, model_id: str, messages: list[Message], tools: list[dict[str, Any]],
        ) -> AsyncIterator[TextChunk]:
            yield TextChunk(content="hi")

    router = ModelRouter()
    router.register(MockProvider())
    router.register(FakeProvider())
    container.model_router = router

    r = await client.get("/api/models/default")
    assert r.status_code == 200
    body = r.json()
    assert body["provider"] == "fake-cloud"
    assert body["model"] == "fake-v1"


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

class ToolCallMockProvider(ModelProvider):
    """Mock provider that requests a read_file tool call on first turn,
    then returns text on second turn."""

    provider_name = "tool-mock"

    def list_models(self) -> list[ModelInfo]:
        return [ModelInfo(id="tool-mock-1", name="Tool Mock", provider="tool-mock")]

    async def chat_stream(
        self, model_id: str, messages: list[Message], tools: list[dict[str, Any]],
    ) -> AsyncIterator[TextChunk | ToolCallChunk]:
        # If there are tool results in history, respond with text
        if any(m.tool_results for m in messages if m.tool_results):
            yield TextChunk(content="File contents received. Done!")
            return
        # First call: request a tool call
        yield ToolCallChunk(
            tool_call_id="tc-int-1",
            tool_name="read_file",
            arguments={"path": "pyproject.toml"},
        )


async def test_tool_execution_flow(client: AsyncClient):
    """Full flow: model requests read_file → tool executes → model responds."""
    router = ModelRouter()
    router.register(ToolCallMockProvider())
    container.model_router = router
    container.tool_registry = ToolRegistry()
    container.tool_registry.register(ReadFileTool())

    r = await client.post(
        "/api/chat",
        json={
            "messages": [{"role": "user", "content": "read pyproject.toml"}],
            "provider": "tool-mock",
            "model": "tool-mock-1",
        },
    )
    session_id = r.json()["session_id"]

    stream_r = await client.get(f"/api/chat/stream/{session_id}")
    events = _parse_sse_lines(stream_r.text)
    event_types = [e["event"] for e in events]

    assert "tool_call" in event_types, f"Expected tool_call event in {event_types}"
    assert "tool_result" in event_types, f"Expected tool_result event in {event_types}"
    assert events[-1]["event"] == "done", f"Last event should be done: {event_types}"

    # Verify the tool_result contains actual file content (pyproject.toml exists)
    tool_result_events = [e for e in events if e["event"] == "tool_result"]
    assert len(tool_result_events) == 1
    assert tool_result_events[0]["data"]["is_error"] is False


class PathTraversalMockProvider(ModelProvider):
    """Mock provider that requests write_file with a path traversal attack."""

    provider_name = "attack-mock"

    def list_models(self) -> list[ModelInfo]:
        return [ModelInfo(id="attack-1", name="Attack Mock", provider="attack-mock")]

    async def chat_stream(
        self, model_id: str, messages: list[Message], tools: list[dict[str, Any]],
    ) -> AsyncIterator[TextChunk | ToolCallChunk]:
        # If there are tool results in history, stop
        if any(m.tool_results for m in messages if m.tool_results):
            yield TextChunk(content="Blocked.")
            return
        # Attempt path traversal
        yield ToolCallChunk(
            tool_call_id="tc-evil-1",
            tool_name="write_file",
            arguments={"path": "../../../etc/passwd", "content": "pwned"},
        )


async def test_security_blocks_path_traversal(client: AsyncClient):
    """SecurityInterceptor blocks a write_file with path traversal."""
    router = ModelRouter()
    router.register(PathTraversalMockProvider())
    container.model_router = router

    registry = ToolRegistry()
    registry.register(WriteFileTool())
    container.tool_registry = registry

    container.security_interceptor = SecurityInterceptor(project_root=os.getcwd())

    r = await client.post(
        "/api/chat",
        json={
            "messages": [{"role": "user", "content": "write to etc passwd"}],
            "provider": "attack-mock",
            "model": "attack-1",
        },
    )
    session_id = r.json()["session_id"]

    stream_r = await client.get(f"/api/chat/stream/{session_id}")
    events = _parse_sse_lines(stream_r.text)
    event_types = [e["event"] for e in events]

    assert "security_violation" in event_types, f"Expected security_violation in {event_types}"

    violation = [e for e in events if e["event"] == "security_violation"][0]
    assert "traversal" in violation["data"]["reason"].lower()
