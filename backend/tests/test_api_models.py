"""Tests for GET /api/models endpoint."""
from __future__ import annotations

from unittest.mock import patch

import pytest
from httpx import AsyncClient, ASGITransport


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
    """When bridge is down, models from all config providers are returned."""
    from app.main import app

    fake_models = [
        {"id": "ds-v3", "name": "DeepSeek V3", "provider": "deepseek", "supports_tools": True},
        {"id": "gpt-4o", "name": "GPT-4o", "provider": "openai", "supports_tools": True},
    ]
    # Patch BRIDGE to a dead address so the proxy call fails fast,
    # then patch get_all_enabled_models at its source (lazily imported in route).
    with patch("app.api.models.BRIDGE", "http://127.0.0.1:19999"), \
         patch("app.config.providers.get_all_enabled_models", return_value=fake_models):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/models")

    data = resp.json()
    providers = {m["provider"] for m in data}
    assert "deepseek" in providers
    assert "openai" in providers
