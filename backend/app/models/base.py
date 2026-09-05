from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, AsyncIterator

from pydantic import BaseModel

from app.types import TextChunk, ToolCallChunk, Message


class ModelInfo(BaseModel):
    id: str
    name: str
    provider: str
    supports_tools: bool = True
    supports_vision: bool = False


class ModelProvider(ABC):
    provider_name: str

    @abstractmethod
    def list_models(self) -> list[ModelInfo]: ...

    @abstractmethod
    async def chat_stream(
        self,
        model_id: str,
        messages: list[Message],
        tools: list[dict[str, Any]],
    ) -> AsyncIterator[TextChunk | ToolCallChunk]: ...


class ModelRouter:
    def __init__(self) -> None:
        self._providers: dict[str, ModelProvider] = {}

    def register(self, provider: ModelProvider) -> None:
        self._providers[provider.provider_name] = provider

    def get_provider(self, name: str) -> ModelProvider | None:
        return self._providers.get(name)

    def list_models(self) -> list[ModelInfo]:
        return [m for p in self._providers.values() for m in p.list_models()]


# ── Mock provider (dev / testing) ─────────────────────────────────────────────

class MockProvider(ModelProvider):
    """Returns a single text chunk. No API key required."""

    provider_name = "mock"

    def list_models(self) -> list[ModelInfo]:
        return [ModelInfo(id="mock-1", name="Mock Model", provider="mock")]

    async def chat_stream(
        self,
        model_id: str,
        messages: list[Message],
        tools: list[dict[str, Any]],
    ) -> AsyncIterator[TextChunk | ToolCallChunk]:
        last = messages[-1].content if messages else ""
        yield TextChunk(content=f"Mock response to: {last}")
