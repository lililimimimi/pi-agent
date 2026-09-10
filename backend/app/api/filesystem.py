"""
Filesystem browsing API for project directory selection.

GET /api/filesystem/browse?path=<dir>&show_hidden=false  → list subdirectories
"""
from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter(prefix="/api/filesystem", tags=["filesystem"])


class MkdirRequest(BaseModel):
    parent: str
    name: str


class MkdirResponse(BaseModel):
    path: str


class DirEntry(BaseModel):
    name: str
    path: str


class BrowseResponse(BaseModel):
    current: str
    parent: str | None
    dirs: list[DirEntry]


@router.get("/browse", response_model=BrowseResponse)
async def browse_directory(
    path: str = Query(default=""),
    show_hidden: bool = Query(default=False),
) -> BrowseResponse:
    """Return subdirectories of the given path."""
    target = Path(path).expanduser() if path else Path.home()
    target = target.resolve()

    if not target.exists():
        raise HTTPException(status_code=400, detail=f"Path does not exist: {target}")
    if not target.is_dir():
        raise HTTPException(status_code=400, detail=f"Path is not a directory: {target}")

    dirs: list[DirEntry] = []
    try:
        for entry in sorted(target.iterdir(), key=lambda e: e.name.lower()):
            if not entry.is_dir():
                continue
            if not show_hidden and entry.name.startswith("."):
                continue
            dirs.append(DirEntry(name=entry.name, path=str(entry)))
    except PermissionError:
        raise HTTPException(status_code=400, detail=f"Permission denied: {target}")

    parent = str(target.parent) if target.parent != target else None

    return BrowseResponse(current=str(target), parent=parent, dirs=dirs)


@router.post("/mkdir", response_model=MkdirResponse)
async def make_directory(req: MkdirRequest) -> MkdirResponse:
    """Create a new subdirectory inside parent."""
    parent = Path(req.parent).expanduser().resolve()
    if not parent.exists() or not parent.is_dir():
        raise HTTPException(status_code=400, detail=f"Parent does not exist: {parent}")
    name = req.name.strip()
    if not name or '/' in name or name in ('.', '..'):
        raise HTTPException(status_code=400, detail="Invalid directory name")
    new_dir = parent / name
    if new_dir.exists():
        raise HTTPException(status_code=400, detail=f"'{name}' already exists")
    try:
        new_dir.mkdir(parents=False)
    except PermissionError:
        raise HTTPException(status_code=400, detail="Permission denied")
    return MkdirResponse(path=str(new_dir))
