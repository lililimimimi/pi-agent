"""Tests for the model routes: enabled models, catalog, saving enabled models and test results."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
def cfg_file(tmp_path: Path, monkeypatch) -> Path:
    """Use a temporary config.json so tests never touch the real one."""
    path = tmp_path / "config.json"
    monkeypatch.setattr("app.config.store._config_path", lambda: path)
    return path


@pytest.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c


BRIDGE_MODELS = [
    {
        "id": "deepseek-v4-flash",
        "name": "DeepSeek V4 Flash",
        "provider": "deepseek",
        "supports_images": False,
    },
    {
        "id": "deepseek-v4-flash-vision-exp",
        "name": "DeepSeek V4 Flash Vision",
        "provider": "deepseek",
        "supports_images": True,
    },
]


def _set_enabled(cfg_file: Path, provider: str, models: list[str]) -> None:
    cfg = json.loads(cfg_file.read_text()) if cfg_file.exists() else {"providers": {}}
    entry = cfg.setdefault("providers", {}).setdefault(provider, {})
    entry["enabled_models"] = models
    # A provider only offers its models once it has a key (or login), as in real use
    entry.setdefault("api_key", "sk-test")
    cfg_file.write_text(json.dumps(cfg))


async def test_picker_hides_models_of_a_provider_without_a_key(client, cfg_file):
    # DeepSeek has a model enabled but no API key: it must not show in the picker
    cfg_file.write_text(
        json.dumps(
            {
                "providers": {
                    "deepseek": {"enabled_models": ["deepseek-v4-flash-vision-exp"]}
                }
            }
        )
    )
    with patch(
        "app.services.catalog.bridge_models", AsyncMock(return_value=BRIDGE_MODELS)
    ):
        r = await client.get("/api/models")

    assert r.json() == []


async def test_picker_lists_only_enabled_models(client, cfg_file):
    _set_enabled(cfg_file, "deepseek", ["deepseek-v4-flash-vision-exp"])
    with patch(
        "app.services.catalog.bridge_models", AsyncMock(return_value=BRIDGE_MODELS)
    ):
        r = await client.get("/api/models")

    assert [m["id"] for m in r.json()] == ["deepseek-v4-flash-vision-exp"]
    assert r.json()[0]["supports_images"] is True
    assert r.json()[0]["provider_label"] == "DeepSeek"


async def test_catalog_shows_every_model_with_its_enabled_flag(client, cfg_file):
    _set_enabled(cfg_file, "deepseek", ["deepseek-v4-flash"])
    with patch(
        "app.services.catalog.bridge_models", AsyncMock(return_value=BRIDGE_MODELS)
    ):
        r = await client.get("/api/models/catalog")

    deepseek = next(g for g in r.json() if g["provider"] == "deepseek")
    flags = {m["id"]: m["enabled"] for m in deepseek["models"]}
    assert flags == {"deepseek-v4-flash": True, "deepseek-v4-flash-vision-exp": False}


async def test_saving_enabled_models_is_stored_and_deduplicated(client, cfg_file):
    r = await client.put(
        "/api/models/enabled", json={"provider": "deepseek", "models": ["a", "a", "b"]}
    )

    assert r.json() == {"ok": True, "enabled": ["a", "b"]}
    saved = json.loads(cfg_file.read_text())["providers"]["deepseek"]["enabled_models"]
    assert saved == ["a", "b"]


async def test_put_enabled_unknown_provider_returns_400(client, cfg_file):
    r = await client.put("/api/models/enabled", json={"provider": "nope", "models": []})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "INVALID_REQUEST"


async def test_test_result_is_saved_on_the_model(client, cfg_file):
    bridge_reply = MagicMock(status_code=200)
    bridge_reply.json = MagicMock(return_value={"ok": True, "ms": 420})
    fake = AsyncMock()
    fake.__aenter__ = AsyncMock(return_value=fake)
    fake.__aexit__ = AsyncMock(return_value=False)
    fake.request = AsyncMock(return_value=bridge_reply)

    with patch("app.services.bridge.httpx.AsyncClient", return_value=fake):
        await client.post(
            "/api/models/test",
            json={"provider": "deepseek", "model": "deepseek-v4-flash"},
        )

    status = json.loads(cfg_file.read_text())["providers"]["deepseek"]["model_status"][
        "deepseek-v4-flash"
    ]
    assert status["ok"] is True
    assert status["ms"] == 420


async def test_default_model_is_the_first_enabled_one(client, cfg_file):
    _set_enabled(cfg_file, "deepseek", ["deepseek-v4-flash"])
    with patch(
        "app.services.catalog.bridge_models", AsyncMock(return_value=BRIDGE_MODELS)
    ):
        r = await client.get("/api/models/default")

    assert r.json() == {"provider": "deepseek", "model": "deepseek-v4-flash"}


async def test_model_test_reports_unreachable_bridge_instead_of_failing(
    client, cfg_file
):
    broken = AsyncMock()
    broken.__aenter__ = AsyncMock(return_value=broken)
    broken.__aexit__ = AsyncMock(return_value=False)
    broken.request = AsyncMock(side_effect=httpx.ConnectError("refused"))
    with patch("app.services.bridge.httpx.AsyncClient", return_value=broken):
        r = await client.post(
            "/api/models/test", json={"provider": "deepseek", "model": "x"}
        )

    assert r.status_code == 200
    assert r.json()["ok"] is False
    assert "unreachable" in r.json()["error"]


async def test_custom_provider_is_added_listed_and_removed(client, cfg_file):
    with patch(
        "app.services.custom_providers.discover_models",
        AsyncMock(return_value=(["my-model"], None)),
    ):
        r = await client.post(
            "/api/providers/custom",
            json={
                "name": "My Gateway",
                "base_url": "https://gw.example.com/v1/",
                "api_key": "sk-x",
            },
        )
    assert r.status_code == 200
    pid = r.json()["id"]
    assert pid.startswith("custom-my-gateway-")
    assert r.json()["models"] == ["my-model"]

    providers = (await client.get("/api/providers")).json()
    mine = next(p for p in providers if p["id"] == pid)
    assert mine["label"] == "My Gateway"
    assert mine["custom"] is True
    assert mine["base_url"] == "https://gw.example.com/v1"

    saved = json.loads(cfg_file.read_text())["providers"][pid]
    assert saved["api_key"] == "sk-x"

    r = await client.delete(f"/api/providers/custom/{pid}")
    assert r.status_code == 200
    assert pid not in json.loads(cfg_file.read_text())["providers"]


async def test_only_custom_providers_can_be_removed(client, cfg_file):
    r = await client.delete("/api/providers/custom/deepseek")
    assert r.status_code == 400
