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


class RenameError(ValueError):
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
    file.write_text("\n".join(lines), encoding="utf-8")


def rename_project(project_id: str, new_name: str) -> Project:
    name = new_name.strip()
    if not name or name in {".", ".."} or "/" in name or "\\" in name:
        raise RenameError("Use a plain folder name, without slashes.")

    projects = store._load_projects()
    index = next((i for i, p in enumerate(projects) if p["id"] == project_id), None)
    if index is None:
        raise FileNotFoundError(f"Project '{project_id}' not found")

    old_path = projects[index]["path"]
    old = Path(old_path)
    new_path = os.path.join(os.path.dirname(old_path), name)
    new = Path(new_path)
    home = Path.home().resolve()

    if old.resolve() == home or old.resolve() in home.parents:
        raise RenameError("This folder cannot be renamed.")
    if not old.is_dir():
        raise RenameError("The project folder does not exist.")
    if new.exists():
        raise RenameError(f"A folder named '{name}' already exists here.")
    if _running.get(old_path, 0) > 0:
        raise RenameError("A chat in this project is still running. Wait for it to finish, then rename.")
    for other in projects:
        if other["id"] != project_id and other["path"].startswith(old_path + "/"):
            raise RenameError("Another project lives inside this folder. Rename or move it first.")

    sessions_dir = store._sessions_dir()
    old_native = sessions_dir / _native_dir_name(old_path)
    new_native = sessions_dir / _native_dir_name(new_path)
    if new_native.exists():
        raise RenameError("Pi already has session records under that name.")

    # 1. The folder itself. If anything below fails, it is moved back.
    os.rename(old, new)
    try:
        # 2. Our own session files: the header's project_id is the folder path
        for f in sessions_dir.glob("*.jsonl"):
            if store._project_of_file(f) == old_path:
                _rewrite_first_line(f, "project_id", old_path, new_path)

        # 3. Pi's session directory: move it, then fix the cwd recorded in each file
        if old_native.is_dir():
            os.rename(old_native, new_native)
            for f in new_native.glob("*.jsonl"):
                _rewrite_first_line(f, "cwd", old_path, new_path)

        # 4. The project record
        projects[index]["path"] = new_path
        projects[index]["name"] = name
        store._save_projects(projects)
    except Exception:
        # Put the folder and its session directory back so nothing is left half-renamed
        if new_native.is_dir() and not old_native.exists():
            os.rename(new_native, old_native)
        os.rename(new, old)
        raise

    return Project(**projects[index])
