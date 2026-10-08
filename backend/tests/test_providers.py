"""
Tests for provider configuration and provider API endpoints.

Coverage:
- config/providers.py: load/save, mask_key, all_providers_masked, get_all_enabled_models
- api/providers.py: GET /api/providers, PUT /api/providers/:id,
                    POST /api/providers/:id/test, GET /api/providers/:id/models
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# Config layer tests
# ---------------------------------------------------------------------------


def make_config_path(tmp_path: Path) -> Path:
    cfg_path = tmp_path / ".pi" / "agent" / "config.json"
    cfg_path.parent.mkdir(parents=True)
    return cfg_path


def test_mask_key_empty():
    from app.config.providers import mask_key
    assert mask_key("") == ""


def test_mask_key_short():
    from app.config.providers import mask_key
    assert mask_key("abc") == "****"


def test_mask_key_normal():
    from app.config.providers import mask_key
    result = mask_key("sk-ant-api03-xxxx")
    assert result.startswith("sk-ant-a")
    assert result.endswith("****")
    assert "api03" not in result


def test_load_config_default(tmp_path: Path, monkeypatch):
    """load_config should return defaults for all 5 providers when no file exists."""
    from app.config import providers as pmod

    cfg_file = tmp_path / ".pi" / "agent" / "config.json"
    monkeypatch.setattr(pmod, "_config_path", lambda: cfg_file)

    from app.config.providers import load_config, PROVIDER_IDS
    cfg = load_config()
    assert "providers" in cfg
    for pid in PROVIDER_IDS:
        assert pid in cfg["providers"], f"Missing default for {pid}"


def test_save_and_load_config(tmp_path: Path, monkeypatch):
    """save_config + load_config roundtrip."""
    from app.config import providers as pmod

    cfg_file = tmp_path / ".pi" / "agent" / "config.json"
    monkeypatch.setattr(pmod, "_config_path", lambda: cfg_file)

    from app.config.providers import load_config, save_config

    cfg = load_config()
    cfg["providers"]["anthropic"]["api_key"] = "sk-ant-test-key"
    cfg["providers"]["anthropic"]["enabled"] = True
    save_config(cfg)

    cfg2 = load_config()
    assert cfg2["providers"]["anthropic"]["api_key"] == "sk-ant-test-key"
    assert cfg2["providers"]["anthropic"]["enabled"] is True


def test_update_provider_config(tmp_path: Path, monkeypatch):
    from app.config import providers as pmod

    cfg_file = tmp_path / ".pi" / "agent" / "config.json"
    monkeypatch.setattr(pmod, "_config_path", lambda: cfg_file)

    from app.config.providers import update_provider_config, get_provider_config

    update_provider_config("deepseek", {"api_key": "sk-ds-key", "enabled": True})
    p = get_provider_config("deepseek")
    assert p["api_key"] == "sk-ds-key"
    assert p["enabled"] is True


def test_all_providers_masked_hides_keys(tmp_path: Path, monkeypatch):
    from app.config import providers as pmod

    cfg_file = tmp_path / ".pi" / "agent" / "config.json"
    monkeypatch.setattr(pmod, "_config_path", lambda: cfg_file)

    from app.config.providers import update_provider_config, all_providers_masked

    update_provider_config("openai", {"api_key": "sk-openai-real-secret", "enabled": True})
    providers = all_providers_masked()

    openai_cfg = next(p for p in providers if p["id"] == "openai")
    assert "real-secret" not in openai_cfg["api_key"]
    assert "****" in openai_cfg["api_key"]


def test_all_providers_masked_returns_all_five(tmp_path: Path, monkeypatch):
    from app.config import providers as pmod

    cfg_file = tmp_path / ".pi" / "agent" / "config.json"
    monkeypatch.setattr(pmod, "_config_path", lambda: cfg_file)

    from app.config.providers import all_providers_masked, PROVIDER_IDS

    result = all_providers_masked()
    ids = {p["id"] for p in result}
    assert ids == set(PROVIDER_IDS)


def test_get_all_enabled_models(tmp_path: Path, monkeypatch):
    from app.config import providers as pmod

    cfg_file = tmp_path / ".pi" / "agent" / "config.json"
    monkeypatch.setattr(pmod, "_config_path", lambda: cfg_file)

    from app.config.providers import update_provider_config, get_all_enabled_models

    update_provider_config("anthropic", {
        "api_key": "sk-ant-xxx",
        "enabled": True,
        "connected": True,
        "models": ["claude-opus-4-5", "claude-sonnet-4-5"],
    })

    models = get_all_enabled_models()
    model_ids = [m["id"] for m in models]
    assert "claude-opus-4-5" in model_ids
    assert "claude-sonnet-4-5" in model_ids
    assert all(m["provider"] == "anthropic" for m in models)


def test_get_all_enabled_models_skips_disconnected(tmp_path: Path, monkeypatch):
    from app.config import providers as pmod

    cfg_file = tmp_path / ".pi" / "agent" / "config.json"
    monkeypatch.setattr(pmod, "_config_path", lambda: cfg_file)

    from app.config.providers import update_provider_config, get_all_enabled_models

    # enabled but not connected → should not appear
    update_provider_config("openai", {
        "api_key": "sk-openai-xxx",
        "enabled": True,
        "connected": False,
        "models": ["gpt-4o"],
    })

    models = get_all_enabled_models()
    providers = [m["provider"] for m in models]
    assert "openai" not in providers


# ---------------------------------------------------------------------------
# API endpoint tests
# ---------------------------------------------------------------------------


@pytest.fixture()
def client(tmp_path: Path, monkeypatch):
    """TestClient with patched config path."""
    from app.config import providers as pmod

    cfg_file = tmp_path / ".pi" / "agent" / "config.json"
    monkeypatch.setattr(pmod, "_config_path", lambda: cfg_file)

    # Import app after monkeypatching
    from app.main import app
    return TestClient(app)


def test_list_providers_returns_all(client: TestClient):
    resp = client.get("/api/providers")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 8   # pi + anthropic + deepseek + openai + openai-codex + gemini + siliconflow + ollama
    ids = {p["id"] for p in data}
    assert "pi" in ids
    assert "anthropic" in ids
    assert "gemini" in ids
    assert "ollama" in ids


def test_list_providers_masks_keys(client: TestClient, tmp_path: Path, monkeypatch):
    from app.config import providers as pmod

    cfg_file = tmp_path / ".pi" / "agent" / "config.json"
    monkeypatch.setattr(pmod, "_config_path", lambda: cfg_file)

    from app.config.providers import update_provider_config
    update_provider_config("deepseek", {"api_key": "sk-deepseek-real-secret"})

    from app.main import app
    with TestClient(app) as c:
        resp = c.get("/api/providers")
    data = resp.json()
    ds = next(p for p in data if p["id"] == "deepseek")
    assert "real-secret" not in ds["api_key"]


def test_update_provider_api_key(client: TestClient):
    resp = client.put("/api/providers/anthropic", json={"api_key": "sk-ant-newkey"})
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


def test_update_provider_enabled(client: TestClient):
    resp = client.put("/api/providers/openai", json={"enabled": True})
    assert resp.status_code == 200


def test_update_unknown_provider(client: TestClient):
    resp = client.put("/api/providers/unknown-xyz", json={"api_key": "x"})
    assert resp.status_code == 404


def test_get_models_empty(client: TestClient):
    resp = client.get("/api/providers/anthropic/models")
    assert resp.status_code == 200
    assert resp.json() == []


def test_get_models_with_cache(client: TestClient, tmp_path: Path, monkeypatch):
    from app.config import providers as pmod

    cfg_file = tmp_path / ".pi" / "agent" / "config.json"
    monkeypatch.setattr(pmod, "_config_path", lambda: cfg_file)

    from app.config.providers import update_provider_config
    update_provider_config("anthropic", {"models": ["claude-3-haiku", "claude-opus-4-5"]})

    from app.main import app
    with TestClient(app) as c:
        resp = c.get("/api/providers/anthropic/models")
    assert resp.status_code == 200
    assert "claude-3-haiku" in resp.json()


def test_get_models_unknown_provider(client: TestClient):
    resp = client.get("/api/providers/nonexistent/models")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Connection test — mock httpx
# ---------------------------------------------------------------------------


def test_test_provider_ollama_success(client: TestClient, monkeypatch):
    """Mock httpx for Ollama to return model list."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"models": [{"name": "llama3"}, {"name": "mistral"}]}
    mock_response.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=mock_response)

    with patch("app.api.providers.httpx.AsyncClient", return_value=mock_client):
        resp = client.post("/api/providers/ollama/test")

    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert "llama3" in data["models"]
    assert data["latency_ms"] >= 0


def test_test_provider_anthropic_no_key(client: TestClient):
    """Without API key, test should return ok=False immediately."""
    resp = client.post("/api/providers/anthropic/test")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is False
    assert "API key" in (data.get("error") or "")


def test_test_provider_anthropic_with_key(client: TestClient, tmp_path: Path, monkeypatch):
    from app.config import providers as pmod

    cfg_file = tmp_path / ".pi" / "agent" / "config.json"
    monkeypatch.setattr(pmod, "_config_path", lambda: cfg_file)

    from app.config.providers import update_provider_config
    update_provider_config("anthropic", {"api_key": "sk-ant-test-key"})

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"data": [{"id": "claude-3-5-sonnet-20241022"}, {"id": "claude-3-haiku-20240307"}]}
    mock_response.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=mock_response)

    with patch("app.api.providers.httpx.AsyncClient", return_value=mock_client):
        from app.main import app
        with TestClient(app) as c:
            resp = c.post("/api/providers/anthropic/test")

    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert "claude-3-5-sonnet-20241022" in data["models"]


def test_test_provider_http_error(client: TestClient, tmp_path: Path, monkeypatch):
    """Provider returns HTTP 403 → ok=False with error message."""
    from app.config import providers as pmod

    cfg_file = tmp_path / ".pi" / "agent" / "config.json"
    monkeypatch.setattr(pmod, "_config_path", lambda: cfg_file)

    from app.config.providers import update_provider_config
    update_provider_config("deepseek", {"api_key": "sk-bad-key"})

    import httpx as httpx_mod

    mock_request = MagicMock()
    mock_resp = MagicMock()
    mock_resp.status_code = 403
    mock_resp.text = "Forbidden"
    http_error = httpx_mod.HTTPStatusError("403", request=mock_request, response=mock_resp)

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_resp2 = MagicMock()
    mock_resp2.raise_for_status = MagicMock(side_effect=http_error)
    mock_client.get = AsyncMock(return_value=mock_resp2)

    with patch("app.api.providers.httpx.AsyncClient", return_value=mock_client):
        from app.main import app
        with TestClient(app) as c:
            resp = c.post("/api/providers/deepseek/test")

    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is False
    assert "403" in (data.get("error") or "")


def test_test_unknown_provider(client: TestClient):
    resp = client.post("/api/providers/unknown-xyz/test")
    assert resp.status_code == 404
