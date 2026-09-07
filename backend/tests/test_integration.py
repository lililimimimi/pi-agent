"""Integration tests for /api/models/default endpoint."""
from __future__ import annotations

import pytest
from httpx import AsyncClient, ASGITransport

import app.container as container
from app.models.base import MockProvider, ModelRouter


@pytest.fixture(autouse=True)
def _patch_registries():
    """Ensure a clean model_router with MockProvider for each test."""
    original = container.model_router
    container.model_router = ModelRouter()
    container.model_router.register(MockProvider())
    yield
    container.model_router = original


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
    from app.models.base import ModelProvider, ModelInfo, ModelRouter, MockProvider
    from typing import Any, AsyncIterator
    from app.types import TextChunk, Message

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
