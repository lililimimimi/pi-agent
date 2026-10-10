"""
Project file browser API.

GET /api/files/tree?root=<dir>&dir=<rel-dir>&depth=1  → directory listing (nested up to depth)
GET /api/files/content?root=<dir>&path=<rel-file>     → text content of a file

All paths in responses are relative to `root`. Requests whose resolved path
escapes `root` (via `..`, absolute paths or symlinks) are rejected with 403.
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.errors import (
    ForbiddenError,
    InvalidRequestError,
    NotFoundError,
    PayloadTooLargeError,
    UnsupportedMediaError,
)

router = APIRouter(prefix="/api/files", tags=["files"])

IGNORED_NAMES = frozenset({"node_modules", ".git", "__pycache__"})
IGNORED_SUFFIXES = (".pyc",)
MAX_CONTENT_BYTES = 1024 * 1024
MAX_DEPTH = 10
BINARY_PROBE_BYTES = 8192


class FileNode(BaseModel):
    name: str
    type: Literal["dir", "file"]
    path: str
    size: int | None = None
    # None = directory not expanded (beyond requested depth)
    children: list[FileNode] | None = None


class FileContent(BaseModel):
    path: str
    content: str
    size: int


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def _is_ignored(name: str) -> bool:
    return name in IGNORED_NAMES or name.endswith(IGNORED_SUFFIXES)


def _resolve_root(root: str) -> Path:
    resolved = Path(root).expanduser().resolve()
    if not resolved.exists():
        raise InvalidRequestError(f"Path does not exist: {resolved}")
    if not resolved.is_dir():
        raise InvalidRequestError(f"Path is not a directory: {resolved}")
    return resolved


def _safe_join(root: Path, rel: str) -> Path:
    """Resolve `rel` under `root`, refusing anything that escapes or is ignored."""
    if Path(rel).is_absolute():
        raise ForbiddenError("Absolute paths are not allowed")
    target = (root / rel).resolve()
    try:
        parts = target.relative_to(root).parts
    except ValueError:
        raise ForbiddenError("Path is outside project root")
    if any(_is_ignored(part) for part in parts):
        raise ForbiddenError("Path is ignored")
    return target


def _inside_root(entry: Path, root: Path) -> bool:
    try:
        entry.resolve().relative_to(root)
        return True
    except (ValueError, OSError):
        return False


def _iter_children(directory: Path, root: Path) -> list[Path]:
    try:
        entries = list(directory.iterdir())
    except (PermissionError, OSError):
        return []
    visible = [e for e in entries if not _is_ignored(e.name) and _inside_root(e, root)]
    # Directories first, then files; case-insensitive alphabetical
    return sorted(visible, key=lambda e: (not e.is_dir(), e.name.lower()))


def _build_node(entry: Path, root: Path, depth: int) -> FileNode:
    rel = "" if entry == root else entry.relative_to(root).as_posix()
    if entry.is_dir():
        children = None
        if depth > 0:
            children = [
                _build_node(c, root, depth - 1) for c in _iter_children(entry, root)
            ]
        return FileNode(name=entry.name, type="dir", path=rel, children=children)
    return FileNode(name=entry.name, type="file", path=rel, size=entry.stat().st_size)


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #


@router.get("/tree", response_model=FileNode)
async def file_tree(
    root: str = Query(...),
    subdir: str = Query(default="", alias="dir"),
    depth: int = Query(default=1, ge=0, le=MAX_DEPTH),
) -> FileNode:
    """Return the directory tree under `root` (or under `root/dir`)."""
    root_path = _resolve_root(root)
    target = _safe_join(root_path, subdir) if subdir else root_path
    if not target.is_dir():
        raise InvalidRequestError(f"Not a directory: {subdir or root}")
    return _build_node(target, root_path, depth)


@router.get("/content", response_model=FileContent)
async def file_content(
    root: str = Query(...),
    path: str = Query(...),
) -> FileContent:
    """Return the UTF-8 text content of a file inside `root`."""
    root_path = _resolve_root(root)
    target = _safe_join(root_path, path)
    if not target.is_file():
        raise NotFoundError(f"File not found: {path}")

    size = target.stat().st_size
    if size > MAX_CONTENT_BYTES:
        raise PayloadTooLargeError(f"File too large ({size} bytes)")

    data = target.read_bytes()
    if b"\x00" in data[:BINARY_PROBE_BYTES]:
        raise UnsupportedMediaError("Binary files are not supported")
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        raise UnsupportedMediaError("File is not UTF-8 text")

    return FileContent(
        path=target.relative_to(root_path).as_posix(), content=text, size=size
    )
