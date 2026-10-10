"""
Project CRUD API endpoints.

GET    /api/projects          → list all projects
POST   /api/projects          → add a project (validates path)
GET    /api/projects/:id      → get a project
DELETE /api/projects/:id      → delete a project
"""

from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

from app.errors import (
    AppError,
    InvalidRequestError,
    NotFoundError,
    NotImplementedHereError,
)
from app.fileio import write_text_atomic
from app.logging import get_logger
from app.schemas import RevealResponse
from app.services.project_rename import rename_project
from app.sessions import store
from app.sessions.models import Project

log = get_logger(__name__)


_IGNORED_FILE = Path.home() / ".pi" / "agent" / "ignored_projects.json"


def _load_ignored() -> set[str]:
    if not _IGNORED_FILE.exists():
        return set()
    try:
        return set(json.loads(_IGNORED_FILE.read_text(encoding="utf-8")))
    except (OSError, ValueError):
        return set()


def _save_ignored(paths: set[str]) -> None:
    _IGNORED_FILE.parent.mkdir(parents=True, exist_ok=True)
    write_text_atomic(
        _IGNORED_FILE, json.dumps(sorted(paths), indent=2, ensure_ascii=False) + "\n"
    )


router = APIRouter(prefix="/api/projects", tags=["projects"])


class CreateProjectRequest(BaseModel):
    path: str
    name: str = ""


class RenameProjectRequest(BaseModel):
    name: str


class DeleteProjectResponse(BaseModel):
    status: str
    deleted_sessions: int
    folder_deleted: bool


@router.post("/{project_id}/rename", response_model=Project)
async def rename_project_route(project_id: str, req: RenameProjectRequest) -> Project:
    """Rename the project's folder, and its record and sessions. Pi's own projects can't be renamed."""
    if project_id.startswith("pi-native:"):
        raise InvalidRequestError(
            "Projects found in Pi's folders cannot be renamed here"
        )
    return rename_project(project_id, req.name)


@router.get("", response_model=list[Project])
async def list_projects() -> list[Project]:
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
            return str(d.get("cwd", ""))
        except (OSError, ValueError):
            log.warning("could not read the working folder from {}", f.name)
    return ""


@router.post("", response_model=Project)
async def create_project(req: CreateProjectRequest) -> Project:
    # Auto-derive name from directory if not provided
    name = req.name or os.path.basename(os.path.normpath(req.path))
    return store.create_project(name=name, dir_path=req.path)


@router.get("/{project_id}", response_model=Project)
async def get_project(project_id: str) -> Project:
    return store.get_project(project_id)


def _move_to_trash(target: Path) -> None:
    """Move a folder to the Trash through Finder, so it can be recovered."""
    if sys.platform != "darwin":
        raise NotImplementedHereError("Moving to Trash is only supported on macOS")
    escaped = str(target).replace("\\", "\\\\").replace('"', '\\"')
    script = f'tell application "Finder" to delete POSIX file "{escaped}"'
    try:
        subprocess.run(
            ["osascript", "-e", script], check=True, capture_output=True, text=True
        )
    except subprocess.CalledProcessError as e:
        detail = (e.stderr or "").strip() or "Finder could not move the folder"
        raise AppError(f"Could not move folder to Trash: {detail}") from e


def _remove_project_folder(path_str: str) -> None:
    """Move the project's folder to the Trash. Refuses home and its ancestors."""
    if not path_str:
        return
    target = Path(path_str).expanduser().resolve()
    home = Path.home().resolve()
    if target == home or target in home.parents or target.parent == target:
        raise InvalidRequestError(f"Refusing to delete {target}")
    if not target.exists():
        return
    if not target.is_dir():
        raise InvalidRequestError(f"Not a folder: {target}")
    _move_to_trash(target)


@router.post("/{project_id}/reveal")
async def reveal_project_folder(project_id: str) -> RevealResponse:
    """Open the project's folder in Finder (macOS). Read-only."""
    if project_id.startswith("pi-native:"):
        raw_path = project_id[len("pi-native:") :]
    else:
        raw_path = store.get_project(project_id).path
    folder = Path(raw_path).expanduser() if raw_path else None
    if folder is None or not folder.is_dir():
        raise NotFoundError("Project folder not found")
    if sys.platform != "darwin":
        raise NotImplementedHereError("Show in Finder is only available on macOS")
    await asyncio.to_thread(
        subprocess.run, ["open", str(folder.resolve())], check=False
    )
    return RevealResponse(status="ok", path=str(folder.resolve()))


@router.delete("/{project_id}")
async def delete_project(
    project_id: str, delete_sessions: bool = False, delete_folder: bool = False
) -> DeleteProjectResponse:
    # Pi-native project: just add to ignored list so it doesn't reappear
    if project_id.startswith("pi-native:"):
        path = project_id[len("pi-native:") :]
        ignored = _load_ignored()
        ignored.add(path)
        _save_ignored(ignored)
        return DeleteProjectResponse(
            status="ok", deleted_sessions=0, folder_deleted=False
        )
    # Regular project: remove from projects.json AND ignore its path from auto-detect
    project = store.get_project(project_id)

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
    return DeleteProjectResponse(
        status="ok", deleted_sessions=deleted, folder_deleted=delete_folder
    )
