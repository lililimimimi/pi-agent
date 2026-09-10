"""
Tests for session & project persistence.

Covers:
  - Session CRUD (create / list / get / delete)
  - Title auto-truncation from first user message
  - Project CRUD + path validation
  - JSONL format correctness
"""
from __future__ import annotations

import json
import os
import tempfile

import pytest
from httpx import ASGITransport, AsyncClient

from app.sessions import store
from app.sessions.models import MessageRecord, SessionMeta


# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #

@pytest.fixture(autouse=True)
def _isolated_storage(tmp_path, monkeypatch):
    """Redirect session & project storage to a temp directory."""
    sessions_dir = tmp_path / "sessions"
    sessions_dir.mkdir()
    projects_file = tmp_path / "projects.json"

    monkeypatch.setattr(store, "_BASE_DIR", sessions_dir)
    monkeypatch.setattr(store, "_PROJECTS_FILE", projects_file)


@pytest.fixture
async def client():
    from app.main import app
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c


# --------------------------------------------------------------------------- #
# Session store unit tests
# --------------------------------------------------------------------------- #

class TestSessionStore:
    def test_create_session_returns_meta(self):
        meta = store.create_session(title="hello world")
        assert isinstance(meta, SessionMeta)
        assert meta.title == "hello world"
        assert len(meta.id) > 10

    def test_list_sessions_returns_created(self):
        store.create_session(title="s1")
        store.create_session(title="s2")
        sessions = store.list_sessions()
        assert len(sessions) == 2
        titles = {s.title for s in sessions}
        assert titles == {"s1", "s2"}

    def test_get_session_returns_records(self):
        meta = store.create_session(title="test")
        store.append_record(meta.id, MessageRecord(role="user", content="hi"))
        store.append_record(meta.id, MessageRecord(role="assistant", content="hello"))
        records = store.get_session(meta.id)
        assert len(records) == 3  # meta + 2 messages
        assert records[0]["type"] == "meta"
        assert records[1]["type"] == "message"
        assert records[1]["content"] == "hi"
        assert records[2]["content"] == "hello"

    def test_delete_session(self):
        meta = store.create_session(title="to-delete")
        store.delete_session(meta.id)
        assert len(store.list_sessions()) == 0

    def test_append_to_nonexistent_raises(self):
        with pytest.raises(FileNotFoundError):
            store.append_record("nonexistent-id", MessageRecord(role="user", content="x"))

    def test_update_title(self):
        meta = store.create_session(title="old")
        store.update_title(meta.id, "new title")
        records = store.get_session(meta.id)
        assert records[0]["title"] == "new title"

    def test_jsonl_format_is_valid(self):
        """Each line in the session file is valid JSON."""
        meta = store.create_session(title="format-test")
        store.append_record(meta.id, MessageRecord(role="user", content="test msg"))
        path = store._sessions_dir() / f"{meta.id}.jsonl"
        lines = path.read_text(encoding="utf-8").strip().split("\n")
        assert len(lines) == 2
        for line in lines:
            parsed = json.loads(line)
            assert "type" in parsed


# --------------------------------------------------------------------------- #
# Project store unit tests
# --------------------------------------------------------------------------- #

class TestProjectStore:
    def test_create_project_valid_path(self, tmp_path):
        project_dir = tmp_path / "my-project"
        project_dir.mkdir()
        project = store.create_project(name="my-project", dir_path=str(project_dir))
        assert project.name == "my-project"
        assert project.path == str(project_dir)

    def test_create_project_invalid_path_raises(self):
        with pytest.raises(NotADirectoryError):
            store.create_project(name="bad", dir_path="/nonexistent/path/xyz")

    def test_list_projects(self, tmp_path):
        d1 = tmp_path / "p1"; d1.mkdir()
        d2 = tmp_path / "p2"; d2.mkdir()
        store.create_project("p1", str(d1))
        store.create_project("p2", str(d2))
        projects = store.list_projects()
        assert len(projects) == 2

    def test_delete_project(self, tmp_path):
        d = tmp_path / "del-me"; d.mkdir()
        project = store.create_project("del-me", str(d))
        store.delete_project(project.id)
        assert len(store.list_projects()) == 0

    def test_delete_nonexistent_raises(self):
        with pytest.raises(FileNotFoundError):
            store.delete_project("nonexistent-id")


# --------------------------------------------------------------------------- #
# API integration tests
# --------------------------------------------------------------------------- #

class TestSessionAPI:
    async def test_create_and_list(self, client: AsyncClient):
        r = await client.post("/api/sessions", json={"title": "api test"})
        assert r.status_code == 200
        data = r.json()
        assert data["title"] == "api test"

        r2 = await client.get("/api/sessions")
        assert r2.status_code == 200
        sessions = r2.json()
        assert any(s["id"] == data["id"] for s in sessions)

    async def test_get_session(self, client: AsyncClient):
        r = await client.post("/api/sessions", json={"title": "detail"})
        sid = r.json()["id"]
        r2 = await client.get(f"/api/sessions/{sid}")
        assert r2.status_code == 200
        records = r2.json()
        assert records[0]["type"] == "meta"

    async def test_delete_session(self, client: AsyncClient):
        r = await client.post("/api/sessions", json={"title": "to-del"})
        sid = r.json()["id"]
        r2 = await client.delete(f"/api/sessions/{sid}")
        assert r2.status_code == 200

    async def test_get_nonexistent_returns_404(self, client: AsyncClient):
        r = await client.get("/api/sessions/does-not-exist")
        assert r.status_code == 404


class TestProjectAPI:
    async def test_create_with_valid_path(self, client: AsyncClient, tmp_path):
        d = tmp_path / "proj"; d.mkdir()
        r = await client.post("/api/projects", json={"path": str(d)})
        assert r.status_code == 200
        assert r.json()["name"] == "proj"  # auto-derived from path

    async def test_create_with_invalid_path(self, client: AsyncClient):
        r = await client.post("/api/projects", json={"path": "/nonexistent/xyz"})
        assert r.status_code == 400

    async def test_list_projects(self, client: AsyncClient, tmp_path):
        d = tmp_path / "lp"; d.mkdir()
        await client.post("/api/projects", json={"path": str(d), "name": "lp"})
        r = await client.get("/api/projects")
        assert r.status_code == 200
        assert len(r.json()) >= 1

    async def test_delete_project(self, client: AsyncClient, tmp_path):
        d = tmp_path / "dp"; d.mkdir()
        r = await client.post("/api/projects", json={"path": str(d)})
        pid = r.json()["id"]
        r2 = await client.delete(f"/api/projects/{pid}")
        assert r2.status_code == 200

    async def test_delete_nonexistent_returns_404(self, client: AsyncClient):
        r = await client.delete("/api/projects/does-not-exist")
        assert r.status_code == 404


class TestPiNativeCompat:
    """Tests for reading Pi CLI native session format."""

    def _create_pi_session(self, tmp_path, session_id: str, name: str, user_msg: str):
        """Helper to create a Pi native session file in --project-- subdir."""
        subdir = store._sessions_dir() / "--test-project--"
        subdir.mkdir(exist_ok=True)
        f = subdir / f"2026-01-01T00-00-00-000Z_{session_id}.jsonl"
        lines = [
            json.dumps({"type": "session", "version": 3, "id": session_id, "timestamp": "2026-01-01T00:00:00.000Z", "cwd": "/tmp/test-project"}),
            json.dumps({"type": "session_info", "id": "info1", "parentId": None, "timestamp": "2026-01-01T00:00:00.001Z", "name": name}),
            json.dumps({"type": "model_change", "id": "mc1", "provider": "anthropic", "modelId": "claude-3"}),
            json.dumps({"type": "message", "id": "m1", "message": {"role": "user", "content": [{"type": "text", "text": user_msg}]}}),
            json.dumps({"type": "message", "id": "m2", "message": {"role": "assistant", "content": [{"type": "text", "text": "I can help!"}]}}),
            json.dumps({"type": "message", "id": "m3", "message": {"role": "toolResult", "content": [{"type": "text", "text": "file content"}]}}),
        ]
        f.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return f

    def test_list_includes_pi_native_sessions(self):
        self._create_pi_session(None, "pi-sess-001", "My Session", "hello world")
        sessions = store.list_sessions()
        pi_sessions = [s for s in sessions if s.id == "pi-sess-001"]
        assert len(pi_sessions) == 1
        assert pi_sessions[0].title == "My Session"
        assert pi_sessions[0].project_id == "/tmp/test-project"

    def test_list_pi_native_uses_first_user_msg_when_no_name(self):
        subdir = store._sessions_dir() / "--test-project2--"
        subdir.mkdir(exist_ok=True)
        f = subdir / "2026-01-02T00-00-00-000Z_pi-sess-002.jsonl"
        lines = [
            json.dumps({"type": "session", "version": 3, "id": "pi-sess-002", "timestamp": "2026-01-02T00:00:00.000Z", "cwd": "/tmp"}),
            json.dumps({"type": "session_info", "id": "info2", "parentId": None, "timestamp": "2026-01-02T00:00:00.001Z", "name": ""}),
            json.dumps({"type": "message", "id": "m1", "message": {"role": "user", "content": [{"type": "text", "text": "这是一条很长的消息需要被截取到二十个字符"}]}}),
        ]
        f.write_text("\n".join(lines) + "\n", encoding="utf-8")
        sessions = store.list_sessions()
        pi_sessions = [s for s in sessions if s.id == "pi-sess-002"]
        assert len(pi_sessions) == 1
        assert len(pi_sessions[0].title) <= 20

    def test_get_pi_native_session(self):
        self._create_pi_session(None, "pi-sess-003", "Get Test", "help me")
        records = store.get_session("pi-sess-003")
        # Should have user + assistant messages, skip toolResult and meta types
        assert len(records) == 2
        assert records[0]["role"] == "user"
        assert records[0]["content"] == "help me"
        assert records[1]["role"] == "assistant"
        assert records[1]["content"] == "I can help!"

    def test_get_pi_native_session_not_found(self):
        with pytest.raises(FileNotFoundError):
            store.get_session("nonexistent-pi-session")

    def test_mixed_sessions_in_list(self):
        """Both our sessions and Pi native sessions appear in list."""
        store.create_session(title="our session")
        self._create_pi_session(None, "pi-sess-004", "pi session", "hi")
        sessions = store.list_sessions()
        titles = {s.title for s in sessions}
        assert "our session" in titles
        assert "pi session" in titles


class TestTitleTruncation:
    """Title should be first 20 chars of user's first message."""

    async def test_auto_title_from_chat(self, client: AsyncClient):
        long_msg = "这是一条很长的消息用来测试标题截取功能是否正常工作"
        r = await client.post("/api/chat", json={
            "messages": [{"role": "user", "content": long_msg}],
            "provider": "mock",
            "model": "mock-1",
        })
        persist_id = r.json()["persist_id"]
        records = store.get_session(persist_id)
        meta = records[0]
        assert meta["type"] == "meta"
        assert len(meta["title"]) <= 20
        assert meta["title"] == long_msg[:20]
