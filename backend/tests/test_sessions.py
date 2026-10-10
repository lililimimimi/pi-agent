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

import pytest
from httpx import ASGITransport, AsyncClient

from app.errors import ConflictError, InvalidRequestError, NotFoundError
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

    def test_delete_session_removes_its_file(self):
        meta = store.create_session(title="to-delete")
        store.delete_session(meta.id)
        assert len(store.list_sessions()) == 0

    def test_append_to_nonexistent_raises(self):
        with pytest.raises(NotFoundError):
            store.append_record(
                "nonexistent-id", MessageRecord(role="user", content="x")
            )

    def test_update_title_saves_it_in_file(self):
        meta = store.create_session(title="old")
        store.update_title(meta.id, "new title")
        records = store.get_session(meta.id)
        assert records[0]["title"] == "new title"

    def test_session_file_is_valid_jsonl(self):
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
        with pytest.raises(InvalidRequestError):
            store.create_project(name="bad", dir_path="/nonexistent/path/xyz")

    def test_list_projects_returns_saved_projects(self, tmp_path):
        d1 = tmp_path / "p1"
        d1.mkdir()
        d2 = tmp_path / "p2"
        d2.mkdir()
        store.create_project("p1", str(d1))
        store.create_project("p2", str(d2))
        projects = store.list_projects()
        assert len(projects) == 2

    def test_delete_project_removes_it_from_list(self, tmp_path):
        d = tmp_path / "del-me"
        d.mkdir()
        project = store.create_project("del-me", str(d))
        store.delete_project(project.id)
        assert len(store.list_projects()) == 0

    def test_delete_nonexistent_raises(self):
        with pytest.raises(NotFoundError):
            store.delete_project("nonexistent-id")


# --------------------------------------------------------------------------- #
# API integration tests
# --------------------------------------------------------------------------- #


class TestSessionAPI:
    async def test_create_session_then_list_includes_it(self, client: AsyncClient):
        r = await client.post("/api/sessions", json={"title": "api test"})
        assert r.status_code == 200
        data = r.json()
        assert data["title"] == "api test"

        r2 = await client.get("/api/sessions")
        assert r2.status_code == 200
        sessions = r2.json()
        assert any(s["id"] == data["id"] for s in sessions)

    async def test_get_session_returns_its_records(self, client: AsyncClient):
        r = await client.post("/api/sessions", json={"title": "detail"})
        sid = r.json()["id"]
        r2 = await client.get(f"/api/sessions/{sid}")
        assert r2.status_code == 200
        records = r2.json()
        assert records[0]["type"] == "meta"

    async def test_delete_session_removes_its_file(self, client: AsyncClient):
        r = await client.post("/api/sessions", json={"title": "to-del"})
        sid = r.json()["id"]
        r2 = await client.delete(f"/api/sessions/{sid}")
        assert r2.status_code == 200

    async def test_get_nonexistent_returns_404(self, client: AsyncClient):
        r = await client.get("/api/sessions/does-not-exist")
        assert r.status_code == 404


class TestProjectAPI:
    async def test_create_project_valid_path_is_saved(
        self, client: AsyncClient, tmp_path
    ):
        d = tmp_path / "proj"
        d.mkdir()
        r = await client.post("/api/projects", json={"path": str(d)})
        assert r.status_code == 200
        assert r.json()["name"] == "proj"  # auto-derived from path

    async def test_create_project_invalid_path_is_refused(self, client: AsyncClient):
        r = await client.post("/api/projects", json={"path": "/nonexistent/xyz"})
        assert r.status_code == 400

    async def test_list_projects_returns_saved_projects(
        self, client: AsyncClient, tmp_path
    ):
        d = tmp_path / "lp"
        d.mkdir()
        await client.post("/api/projects", json={"path": str(d), "name": "lp"})
        r = await client.get("/api/projects")
        assert r.status_code == 200
        assert len(r.json()) >= 1

    async def test_delete_project_removes_it_from_list(
        self, client: AsyncClient, tmp_path
    ):
        d = tmp_path / "dp"
        d.mkdir()
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
            json.dumps(
                {
                    "type": "session",
                    "version": 3,
                    "id": session_id,
                    "timestamp": "2026-01-01T00:00:00.000Z",
                    "cwd": "/tmp/test-project",
                }
            ),
            json.dumps(
                {
                    "type": "session_info",
                    "id": "info1",
                    "parentId": None,
                    "timestamp": "2026-01-01T00:00:00.001Z",
                    "name": name,
                }
            ),
            json.dumps(
                {
                    "type": "model_change",
                    "id": "mc1",
                    "provider": "anthropic",
                    "modelId": "claude-3",
                }
            ),
            json.dumps(
                {
                    "type": "message",
                    "id": "m1",
                    "message": {
                        "role": "user",
                        "content": [{"type": "text", "text": user_msg}],
                    },
                }
            ),
            json.dumps(
                {
                    "type": "message",
                    "id": "m2",
                    "message": {
                        "role": "assistant",
                        "content": [{"type": "text", "text": "I can help!"}],
                    },
                }
            ),
            json.dumps(
                {
                    "type": "message",
                    "id": "m3",
                    "message": {
                        "role": "toolResult",
                        "content": [{"type": "text", "text": "file content"}],
                    },
                }
            ),
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
            json.dumps(
                {
                    "type": "session",
                    "version": 3,
                    "id": "pi-sess-002",
                    "timestamp": "2026-01-02T00:00:00.000Z",
                    "cwd": "/tmp",
                }
            ),
            json.dumps(
                {
                    "type": "session_info",
                    "id": "info2",
                    "parentId": None,
                    "timestamp": "2026-01-02T00:00:00.001Z",
                    "name": "",
                }
            ),
            json.dumps(
                {
                    "type": "message",
                    "id": "m1",
                    "message": {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": "这是一条很长的消息需要被截取到二十个字符",
                            }
                        ],
                    },
                }
            ),
        ]
        f.write_text("\n".join(lines) + "\n", encoding="utf-8")
        sessions = store.list_sessions()
        pi_sessions = [s for s in sessions if s.id == "pi-sess-002"]
        assert len(pi_sessions) == 1
        assert len(pi_sessions[0].title) <= 20

    def test_get_pi_native_session_returns_records(self):
        self._create_pi_session(None, "pi-sess-003", "Get Test", "help me")
        records = store.get_session("pi-sess-003")
        # Should have user + assistant messages, skip toolResult and meta types
        assert len(records) == 2
        assert records[0]["role"] == "user"
        assert records[0]["content"] == "help me"
        assert records[1]["role"] == "assistant"
        assert records[1]["content"] == "I can help!"

    def test_get_pi_native_session_not_found(self):
        with pytest.raises(NotFoundError):
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

    async def test_create_chat_first_message_sets_title(self, client: AsyncClient):
        long_msg = "这是一条很长的消息用来测试标题截取功能是否正常工作"
        r = await client.post(
            "/api/chat",
            json={
                "messages": [{"role": "user", "content": long_msg}],
                "provider": "mock",
                "model": "mock-1",
            },
        )
        persist_id = r.json()["persist_id"]
        records = store.get_session(persist_id)
        meta = records[0]
        assert meta["type"] == "meta"
        assert len(meta["title"]) <= 20
        assert meta["title"] == long_msg[:20]


class TestRevealSession:
    async def test_reveal_selects_the_session_file(self, client, tmp_path, monkeypatch):
        from unittest.mock import patch

        meta = store.create_session(title="reveal me")
        monkeypatch.setattr("app.api.sessions.sys.platform", "darwin")
        with patch("app.api.sessions.subprocess.run") as run:
            r = await client.post(f"/api/sessions/{meta.id}/reveal")
        assert r.status_code == 200
        args = run.call_args[0][0]
        assert args[:2] == ["open", "-R"]
        assert args[2].endswith(f"{meta.id}.jsonl")

    async def test_reveal_rejects_path_traversal(self, client):
        r = await client.post("/api/sessions/..%2Fsecret/reveal")
        assert r.status_code in (400, 404)

    async def test_reveal_unknown_session_returns_404(self, client):
        r = await client.post("/api/sessions/does-not-exist/reveal")
        assert r.status_code == 404


class TestDeleteProjectSessions:
    def test_removes_only_sessions_of_that_project(self, tmp_path):
        mine = store.create_session(title="mine", project_id="/proj/a")
        other = store.create_session(title="other", project_id="/proj/b")
        native_dir = store._sessions_dir() / "--proj-a--"
        native_dir.mkdir()
        (native_dir / "x.jsonl").write_text(
            '{"type":"session","id":"n1"}\n', encoding="utf-8"
        )

        removed = store.delete_project_sessions("/proj/a")

        assert removed == 2
        assert not (store._sessions_dir() / f"{mine.id}.jsonl").exists()
        assert (store._sessions_dir() / f"{other.id}.jsonl").exists()
        assert not native_dir.exists()

    def test_empty_path_removes_nothing(self):
        store.create_session(title="keep", project_id="")
        assert store.delete_project_sessions("") == 0


async def test_delete_project_with_sessions_removes_its_session_files(client, tmp_path):
    folder = tmp_path / "rules"
    folder.mkdir()
    created = (
        await client.post("/api/projects", json={"name": "rules", "path": str(folder)})
    ).json()
    store.create_session(title="a", project_id=str(folder))

    r = await client.delete(
        f"/api/projects/{created['id']}", params={"delete_sessions": "true"}
    )

    assert r.json()["deleted_sessions"] == 1
    assert not [s for s in store.list_sessions() if s.project_id == str(folder)]


class TestDeleteProjectFolder:
    async def test_moves_the_folder_to_trash_when_asked(
        self, client, tmp_path, monkeypatch
    ):
        from unittest.mock import MagicMock, patch

        monkeypatch.setattr(
            "app.api.projects.Path.home", classmethod(lambda cls: tmp_path / "home")
        )
        monkeypatch.setattr("app.api.projects.sys.platform", "darwin")
        folder = tmp_path / "home" / "Desktop" / "rules"
        folder.mkdir(parents=True)
        created = (
            await client.post(
                "/api/projects", json={"name": "rules", "path": str(folder)}
            )
        ).json()

        with patch("app.api.projects.subprocess.run", MagicMock()) as run:
            r = await client.delete(
                f"/api/projects/{created['id']}", params={"delete_folder": "true"}
            )

        assert r.status_code == 200
        assert r.json()["folder_deleted"] is True
        script = run.call_args[0][0][-1]
        assert script.startswith('tell application "Finder" to delete POSIX file')
        assert str(folder) in script

    async def test_keeps_project_when_trash_fails(self, client, tmp_path, monkeypatch):
        import subprocess
        from unittest.mock import patch

        monkeypatch.setattr(
            "app.api.projects.Path.home", classmethod(lambda cls: tmp_path / "home")
        )
        monkeypatch.setattr("app.api.projects.sys.platform", "darwin")
        folder = tmp_path / "home" / "Desktop" / "stubborn"
        folder.mkdir(parents=True)
        created = (
            await client.post(
                "/api/projects", json={"name": "stubborn", "path": str(folder)}
            )
        ).json()

        err = subprocess.CalledProcessError(1, "osascript", stderr="permission denied")
        with patch("app.api.projects.subprocess.run", side_effect=err):
            r = await client.delete(
                f"/api/projects/{created['id']}", params={"delete_folder": "true"}
            )

        assert r.status_code == 500
        assert "permission denied" in r.json()["error"]["message"]
        # The project stays listed, so the user can try again
        assert any(p.id == created["id"] for p in store.list_projects())

    async def test_keeps_the_folder_by_default(self, client, tmp_path):
        folder = tmp_path / "keep-me"
        folder.mkdir()
        created = (
            await client.post(
                "/api/projects", json={"name": "keep", "path": str(folder)}
            )
        ).json()

        await client.delete(f"/api/projects/{created['id']}")

        assert folder.exists()

    async def test_refuses_to_delete_the_home_folder(
        self, client, tmp_path, monkeypatch
    ):
        home = tmp_path / "home"
        home.mkdir()
        monkeypatch.setattr("app.api.projects.Path.home", classmethod(lambda cls: home))
        created = (
            await client.post("/api/projects", json={"name": "home", "path": str(home)})
        ).json()

        r = await client.delete(
            f"/api/projects/{created['id']}", params={"delete_folder": "true"}
        )

        assert r.status_code == 400
        assert home.exists()


class TestRevealProjectFolder:
    async def test_opens_the_project_folder_in_finder(
        self, client, tmp_path, monkeypatch
    ):
        from unittest.mock import MagicMock, patch

        monkeypatch.setattr("app.api.projects.sys.platform", "darwin")
        folder = tmp_path / "shown"
        folder.mkdir()
        created = (
            await client.post(
                "/api/projects", json={"name": "shown", "path": str(folder)}
            )
        ).json()

        with patch("app.api.projects.subprocess.run", MagicMock()) as run:
            r = await client.post(f"/api/projects/{created['id']}/reveal")

        assert r.status_code == 200
        assert run.call_args[0][0] == ["open", str(folder.resolve())]

    async def test_missing_folder_returns_404(self, client, tmp_path):
        gone = tmp_path / "gone"
        gone.mkdir()
        created = (
            await client.post("/api/projects", json={"name": "gone", "path": str(gone)})
        ).json()
        gone.rmdir()  # the folder disappears after the project was added
        r = await client.post(f"/api/projects/{created['id']}/reveal")
        assert r.status_code == 404


# --------------------------------------------------------------------------- #
# Truncate before a user message (edit & resend, regenerate)
# --------------------------------------------------------------------------- #


class TestTruncateBeforeUserMessage:
    def _seed(self) -> str:
        meta = store.create_session(title="t")
        for role, text in [
            ("user", "first"),
            ("assistant", "reply 1"),
            ("user", "second"),
            ("assistant", "reply 2"),
            ("user", "third"),
            ("assistant", "reply 3"),
        ]:
            store.append_record(meta.id, MessageRecord(role=role, content=text))
        return meta.id

    def _contents(self, sid: str) -> list[str]:
        return [
            r["content"] for r in store.get_session(sid) if r.get("type") == "message"
        ]

    def test_truncate_second_user_message_keeps_earlier_rows(self):
        sid = self._seed()
        store.truncate_before_user_message(sid, 1)  # cut before "second"
        assert self._contents(sid) == ["first", "reply 1"]

    def test_truncate_first_user_message_keeps_meta_line(self):
        sid = self._seed()
        store.truncate_before_user_message(sid, 0)
        assert store.get_session(sid)[0].get("title") == "t"
        assert self._contents(sid) == []

    def test_truncate_missing_user_message_raises_conflict(self):
        sid = self._seed()
        with pytest.raises(ConflictError):
            store.truncate_before_user_message(sid, 5)
        assert len(self._contents(sid)) == 6

    def test_truncate_unknown_session_raises_not_found(self):
        with pytest.raises(NotFoundError):
            store.truncate_before_user_message("no-such-id", 0)

    def test_truncate_pi_native_session_raises_conflict_with_reason(
        self, monkeypatch, tmp_path
    ):
        pi_file = tmp_path / "pi-native.jsonl"
        pi_file.write_text("{}\n", encoding="utf-8")
        monkeypatch.setattr(store, "session_file", lambda sid: pi_file)
        with pytest.raises(ConflictError, match="Pi's own format"):
            store.truncate_before_user_message("pi-native", 0)


class TestTruncateEndpoint:
    async def test_truncate_endpoint_known_index_cuts_file(self, client: AsyncClient):
        meta = store.create_session(title="t")
        store.append_record(meta.id, MessageRecord(role="user", content="a"))
        store.append_record(meta.id, MessageRecord(role="assistant", content="b"))
        store.append_record(meta.id, MessageRecord(role="user", content="c"))

        res = await client.post(
            f"/api/sessions/{meta.id}/truncate", json={"user_index": 1}
        )

        assert res.status_code == 200
        contents = [
            r["content"]
            for r in store.get_session(meta.id)
            if r.get("type") == "message"
        ]
        assert contents == ["a", "b"]

    async def test_truncate_endpoint_unknown_index_returns_409(
        self, client: AsyncClient
    ):
        meta = store.create_session(title="t")
        res = await client.post(
            f"/api/sessions/{meta.id}/truncate", json={"user_index": 3}
        )
        assert res.status_code == 409

    async def test_truncate_endpoint_negative_index_returns_422(
        self, client: AsyncClient
    ):
        meta = store.create_session(title="t")
        res = await client.post(
            f"/api/sessions/{meta.id}/truncate", json={"user_index": -1}
        )
        assert res.status_code == 422

    async def test_truncate_endpoint_unknown_session_returns_404(
        self, client: AsyncClient
    ):
        res = await client.post(
            "/api/sessions/no-such-id/truncate", json={"user_index": 0}
        )
        assert res.status_code == 404
