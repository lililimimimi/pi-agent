"""Tests for renaming a project folder: the folder, the project record and its sessions."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.services import project_rename
from app.services.project_rename import (
    RenameError,
    mark_done,
    mark_running,
    rename_project,
)
from app.sessions import store


@pytest.fixture
def env(tmp_path: Path, monkeypatch):
    """A temporary sessions folder and projects file, with one project and its sessions."""
    sessions = tmp_path / "sessions"
    sessions.mkdir()
    monkeypatch.setattr(store, "_BASE_DIR", sessions)
    monkeypatch.setattr(store, "_PROJECTS_FILE", tmp_path / "projects.json")
    project_rename._running.clear()

    work = tmp_path / "work"
    work.mkdir()
    folder = work / "app"
    folder.mkdir()
    (folder / "main.py").write_text("print('hi')\n", encoding="utf-8")

    store._save_projects([{"id": "p1", "name": "app", "path": str(folder)}])

    # Our own session: its header names the project folder
    (sessions / "s1.jsonl").write_text(
        json.dumps({"id": "s1", "title": "chat", "project_id": str(folder)})
        + "\n"
        + json.dumps({"role": "user", "content": "hi"})
        + "\n",
        encoding="utf-8",
    )
    # A session in another project must not change
    (sessions / "s2.jsonl").write_text(
        json.dumps({"id": "s2", "title": "other", "project_id": "/elsewhere"}) + "\n",
        encoding="utf-8",
    )
    # Pi's own folder for this project: the header records the cwd
    native = sessions / ("--" + str(folder).strip("/").replace("/", "-") + "--")
    native.mkdir()
    (native / "n1.jsonl").write_text(
        json.dumps({"type": "session", "cwd": str(folder)})
        + "\n"
        + json.dumps({"role": "user", "content": "hello"})
        + "\n",
        encoding="utf-8",
    )
    return {"sessions": sessions, "work": work, "folder": folder, "native": native}


def test_renames_folder_record_sessions_and_native_dir(env):
    project = rename_project("p1", "newapp")

    new_folder = env["work"] / "newapp"
    assert project.name == "newapp"
    assert project.path == str(new_folder)
    assert (new_folder / "main.py").exists()
    assert not env["folder"].exists()

    saved = store._load_projects()
    assert saved[0]["path"] == str(new_folder)

    our_header = json.loads((env["sessions"] / "s1.jsonl").read_text().split("\n")[0])
    assert our_header["project_id"] == str(new_folder)

    other_header = json.loads((env["sessions"] / "s2.jsonl").read_text().split("\n")[0])
    assert other_header["project_id"] == "/elsewhere"

    new_native = env["sessions"] / (
        "--" + str(new_folder).strip("/").replace("/", "-") + "--"
    )
    assert new_native.is_dir()
    assert not env["native"].exists()
    native_header = json.loads((new_native / "n1.jsonl").read_text().split("\n")[0])
    assert native_header["cwd"] == str(new_folder)


def test_refuses_a_name_that_already_exists(env):
    (env["work"] / "taken").mkdir()
    with pytest.raises(RenameError, match="already exists"):
        rename_project("p1", "taken")
    assert env["folder"].exists()


def test_refuses_a_name_with_a_slash(env):
    with pytest.raises(RenameError, match="plain folder name"):
        rename_project("p1", "a/b")
    assert env["folder"].exists()


def test_refuses_while_a_chat_in_the_project_is_running(env):
    mark_running(str(env["folder"]))
    try:
        with pytest.raises(RenameError, match="still running"):
            rename_project("p1", "newapp")
        assert env["folder"].exists()
    finally:
        mark_done(str(env["folder"]))

    # Once the turn is done, the rename goes through
    rename_project("p1", "newapp")
    assert (env["work"] / "newapp").exists()


def test_refuses_when_another_project_lives_inside(env):
    store._save_projects(
        [
            {"id": "p1", "name": "app", "path": str(env["folder"])},
            {"id": "p2", "name": "inner", "path": str(env["folder"] / "inner")},
        ]
    )
    with pytest.raises(RenameError, match="inside this folder"):
        rename_project("p1", "newapp")
    assert env["folder"].exists()
