"""Every error the API sends has the same shape: {"error": {"code": ..., "message": ...}}."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture
async def client():
    from app.main import app

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c


async def test_domain_error_status_comes_from_its_class(client: AsyncClient):
    r = await client.get("/api/sessions/no-such-session-id")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "NOT_FOUND"


async def test_unknown_route_uses_the_same_error_shape(client: AsyncClient):
    r = await client.get("/api/does-not-exist")
    assert r.status_code == 404
    assert set(r.json()["error"]) == {"code", "message"}


async def test_invalid_request_body_uses_the_same_error_shape(client: AsyncClient):
    r = await client.post(
        "/api/sessions/any-id/truncate", json={"user_index": "not-a-number"}
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert "detail" not in r.json()
