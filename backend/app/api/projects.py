"""
Project CRUD API endpoints.

GET    /api/projects          → list all projects
POST   /api/projects          → add a project (validates path)
GET    /api/projects/:id      → get a project
DELETE /api/projects/:id      → delete a project
"""
from __future__ import annotations

import os
import subprocess
import sys

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import json
from pathlib import Path

from app.sessions import store
from app.sessions.models import Project

_IGNORED_FILE = Path.home() / ".pi" / "agent" / "ignored_projects.json"


def _load_ignored() -> set[str]:
    if not _IGNORED_FILE.exists():
        return set()
    try:
        return set(json.loads(_IGNORED_FILE.read_text(encoding="utf-8")))
    except Exception:
        return set()


def _save_ignored(paths: set[str]) -> None:
    _IGNORED_FILE.parent.mkdir(parents=True, exist_ok=True)
    _IGNORED_FILE.write_text(json.dumps(sorted(paths), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

router = APIRouter(prefix="/api/projects", tags=["projects"])


class CreateProjectRequest(BaseModel):
    path: str
    name: str = ""


@router.get("", response_model=list[Project])
async def list_projects():
    saved = store.list_projects()
    saved_paths = {p.path for p in saved}
    ignored = _load_ignored()

    # Auto-detect Pi native project directories (--*-- subdirs)
    auto: list[Project] = []
    for subdir in store._sessions_dir().glob("--*--"):
        if not subdir.is_dir():
            continue
        cwd = _read_cwd_from_subdir(subdir)
        if cwd and cwd not in saved_paths and cwd not in ignored:
            name = Path(cwd).name
            auto.append(Project(id=f"pi-native:{cwd}", name=name, path=cwd))
            saved_paths.add(cwd)

    return saved + auto


def _read_cwd_from_subdir(subdir: Path) -> str:
    """Read the cwd from the first session file in the subdir."""
    import json
    for f in sorted(subdir.glob("*.jsonl"))[:1]:
        try:
            first_line = f.open(encoding="utf-8").readline().strip()
            d = json.loads(first_line)
            return d.get("cwd", "")
        except Exception:
            pass
    return ""


@router.post("", response_model=Project)
async def create_project(req: CreateProjectRequest):
    # Auto-derive name from directory if not provided
    name = req.name or os.path.basename(os.path.normpath(req.path))
    try:
        project = store.create_project(name=name, dir_path=req.path)
    except NotADirectoryError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return project


@router.get("/{project_id}", response_model=Project)
async def get_project(project_id: str):
    try:
        return store.get_project(project_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


def _move_to_trash(target: Path) -> None:
    """Move a folder to the Trash through Finder, so it can be recovered."""
    if sys.platform != "darwin":
        raise HTTPException(status_code=501, detail="Moving to Trash is only supported on macOS")
    escaped = str(target).replace("\\", "\\\\").replace('"', '\\"')
    script = f'tell application "Finder" to delete POSIX file "{escaped}"'
    try:
        subprocess.run(["osascript", "-e", script], check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as e:
        detail = (e.stderr or "").strip() or "Finder could not move the folder"
        raise HTTPException(status_code=500, detail=f"Could not move folder to Trash: {detail}") from e


def _remove_project_folder(path_str: str) -> None:
    """Move the project's folder to the Trash. Refuses home and its ancestors."""
    if not path_str:
        return
    target = Path(path_str).expanduser().resolve()
    home = Path.home().resolve()
    if target == home or target in home.parents or target.parent == target:
        raise HTTPException(status_code=400, detail=f"Refusing to delete {target}")
    if not target.exists():
        return
    if not target.is_dir():
        raise HTTPException(status_code=400, detail=f"Not a folder: {target}")
    _move_to_trash(target)


@router.post("/{project_id}/reveal")
async def reveal_project_folder(project_id: str) -> dict[str, str]:
    """Open the project's folder in Finder (macOS). Read-only."""
    if project_id.startswith("pi-native:"):
        raw_path = project_id[len("pi-native:"):]
    else:
        try:
            raw_path = store.get_project(project_id).path
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e
    folder = Path(raw_path).expanduser() if raw_path else None
    if folder is None or not folder.is_dir():
        raise HTTPException(status_code=404, detail="Project folder not found")
    if sys.platform != "darwin":
        raise HTTPException(status_code=501, detail="Show in Finder is only available on macOS")
    subprocess.run(["open", str(folder.resolve())], check=False)
    return {"status": "ok", "path": str(folder.resolve())}


@router.delete("/{project_id}")
async def delete_project(project_id: str, delete_sessions: bool = False, delete_folder: bool = False):
    # Pi-native project: just add to ignored list so it doesn't reappear
    if project_id.startswith("pi-native:"):
        path = project_id[len("pi-native:"):]
        ignored = _load_ignored()
        ignored.add(path)
        _save_ignored(ignored)
        return {"status": "ok"}
    # Regular project: remove from projects.json AND ignore its path from auto-detect
    try:
        project = store.get_project(project_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

    # Folder first: if it cannot be removed, the project stays listed
    if delete_folder:
        _remove_project_folder(project.path)

    store.delete_project(project_id)
    # Prevent auto-detect from re-adding it on next load
    if project.path:
        ignored = _load_ignored()
        ignored.add(project.path)
        _save_ignored(ignored)

    deleted = store.delete_project_sessions(project.path) if delete_sessions else 0
    return {"status": "ok", "deleted_sessions": deleted, "folder_deleted": delete_folder}
