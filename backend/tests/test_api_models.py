"""Tests for GET /api/models endpoint."""
from __future__ import annotations

import pytest
from httpx import AsyncClient, ASGITransport

import app.container as container
from app.models.base import MockProvider, ModelRouter


@pytest.fixture(autouse=True)
def _reset_router():
    """Ensure a clean model_router for each test."""
    original = container.model_router
    container.model_router = ModelRouter()
    container.model_router.register(MockProvider())
    yield
    container.model_router = original


@pytest.mark.asyncio
async def test_get_models_returns_list():
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/models")

    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    # Each item has expected fields
    item = data[0]
    assert "id" in item
    assert "name" in item
    assert "provider" in item
    assert "supports_tools" in item


@pytest.mark.asyncio
async def test_get_models_includes_all_providers():
    """When multiple providers are registered, all models are returned."""
    from app.models.deepseek import DeepSeekProvider
    from app.main import app

    container.model_router.register(DeepSeekProvider(api_key="fake"))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/models")

    data = resp.json()
    providers = {m["provider"] for m in data}
    assert "mock" in providers
    assert "deepseek" in providers
