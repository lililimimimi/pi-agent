"""Renaming a session saves the title in its file, so it survives a reload."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.sessions import store


@pytest.fixture
def sessions_dir(tmp_path: Path, monkeypatch) -> Path:
    monkeypatch.setattr(store, "_BASE_DIR", tmp_path)
    return tmp_path


async def test_rename_is_saved_in_the_session_file(sessions_dir: Path):
    meta = store.create_session(title="New", project_id="/a")
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        r = await client.post(
            f"/api/sessions/{meta.id}/title", json={"title": "  Fix the login  "}
        )
    assert r.status_code == 200
    header = json.loads(
        (sessions_dir / f"{meta.id}.jsonl").read_text(encoding="utf-8").split("\n")[0]
    )
    assert header["title"] == "Fix the login"


async def test_empty_title_is_refused(sessions_dir: Path):
    meta = store.create_session(title="New", project_id="/a")
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        r = await client.post(f"/api/sessions/{meta.id}/title", json={"title": "   "})
    assert r.status_code == 400


async def test_unknown_session_is_not_found(sessions_dir: Path):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        r = await client.post("/api/sessions/nope/title", json={"title": "x"})
    assert r.status_code == 404
