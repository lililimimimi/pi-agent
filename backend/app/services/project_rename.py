"""
Rename a project's folder on disk, and everything that points at it:
the project record, our session files (project_id = path) and Pi's per-folder
session directory (--<path with / as ->--, whose files record the cwd).
"""

from __future__ import annotations

import json
import os
from collections import Counter
from pathlib import Path

from app.errors import InvalidRequestError, NotFoundError
from app.fileio import write_text_atomic
from app.sessions import store
from app.sessions.models import Project

# Project paths with a chat turn in progress. Renaming one of them would break that turn.
_running: Counter[str] = Counter()


def mark_running(path: str) -> None:
    if path:
        _running[path] += 1


def mark_done(path: str) -> None:
    if path and _running[path] > 0:
        _running[path] -= 1
        if _running[path] == 0:
            del _running[path]


class RenameError(InvalidRequestError):
    """The rename was refused; the message says why."""


def _native_dir_name(path: str) -> str:
    return "--" + path.strip("/").replace("/", "-") + "--"


def _rewrite_first_line(file: Path, key: str, old: str, new: str) -> None:
    """Change one field in the first (header) line of a session file, if it holds the old value."""
    lines = file.read_text(encoding="utf-8").split("\n")
    if not lines or not lines[0].strip():
        return
    header = json.loads(lines[0])
    if header.get(key) != old:
        return
    header[key] = new
    lines[0] = json.dumps(header, ensure_ascii=False)
    write_text_atomic(file, "\n".join(lines))


def _validate_name(new_name: str) -> str:
    name = new_name.strip()
    if not name or name in {".", ".."} or "/" in name or "\\" in name:
        raise RenameError("Use a plain folder name, without slashes.")
    return name


def _check_renamable(projects: list[dict[str, str]], index: int, name: str) -> None:
    old_path = projects[index]["path"]
    old = Path(old_path)
    new_path = os.path.join(os.path.dirname(old_path), name)
    home = Path.home().resolve()

    if old.resolve() == home or old.resolve() in home.parents:
        raise RenameError("This folder cannot be renamed.")
    if not old.is_dir():
        raise RenameError("The project folder does not exist.")
    if Path(new_path).exists():
        raise RenameError(f"A folder named '{name}' already exists here.")
    if _running.get(old_path, 0) > 0:
        raise RenameError(
            "A chat in this project is still running. Wait for it to finish, then rename."
        )
    for other in projects:
        if other["id"] != projects[index]["id"] and other["path"].startswith(
            old_path + "/"
        ):
            raise RenameError(
                "Another project lives inside this folder. Rename or move it first."
            )
    new_native = store._sessions_dir() / _native_dir_name(new_path)
    if new_native.exists():
        raise RenameError("Pi already has session records under that name.")


def _move_session_records(old_path: str, new_path: str) -> None:
    """Point our session files and Pi's per-folder directory at the new path."""
    sessions_dir = store._sessions_dir()
    # Our own session files: the header's project_id is the folder path
    for f in sessions_dir.glob("*.jsonl"):
        if store._project_of_file(f) == old_path:
            _rewrite_first_line(f, "project_id", old_path, new_path)

    # Pi's session directory: move it, then fix the cwd recorded in each file
    old_native = sessions_dir / _native_dir_name(old_path)
    new_native = sessions_dir / _native_dir_name(new_path)
    if old_native.is_dir():
        os.rename(old_native, new_native)
        for f in new_native.glob("*.jsonl"):
            _rewrite_first_line(f, "cwd", old_path, new_path)


def _undo_folder_move(old: Path, new: Path, old_path: str, new_path: str) -> None:
    """Move the folder and its Pi session directory back after a failed rename."""
    sessions_dir = store._sessions_dir()
    new_native = sessions_dir / _native_dir_name(new_path)
    old_native = sessions_dir / _native_dir_name(old_path)
    if new_native.is_dir() and not old_native.exists():
        os.rename(new_native, old_native)
    os.rename(new, old)


def rename_project(project_id: str, new_name: str) -> Project:
    name = _validate_name(new_name)

    projects = store._load_projects()
    index = next((i for i, p in enumerate(projects) if p["id"] == project_id), None)
    if index is None:
        raise NotFoundError(f"Project '{project_id}' not found")

    _check_renamable(projects, index, name)
    old_path = projects[index]["path"]
    new_path = os.path.join(os.path.dirname(old_path), name)
    old, new = Path(old_path), Path(new_path)

    # 1. The folder itself. If anything below fails, it is moved back.
    os.rename(old, new)
    try:
        _move_session_records(old_path, new_path)
        # 4. The project record
        projects[index]["path"] = new_path
        projects[index]["name"] = name
        store._save_projects(projects)
    except Exception:
        # Put the folder and its session directory back so nothing is left half-renamed
        _undo_folder_move(old, new, old_path, new_path)
        raise

    return Project(**projects[index])
