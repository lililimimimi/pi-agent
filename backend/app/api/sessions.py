"""
Session CRUD API endpoints.

GET    /api/sessions          → list all sessions
POST   /api/sessions          → create a new session
GET    /api/sessions/:id      → get full session records
DELETE /api/sessions/:id      → delete a session
"""
from __future__ import annotations

import re
import subprocess
import sys

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.sessions import store
from app.sessions.models import SessionSummary

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


class CreateSessionRequest(BaseModel):
    title: str = ""
    project_id: str = ""


class SessionMetaResponse(BaseModel):
    id: str
    title: str
    project_id: str
    created_at: str


@router.get("", response_model=list[SessionSummary])
async def list_sessions():
    return store.list_sessions()


@router.post("", response_model=SessionMetaResponse)
async def create_session(req: CreateSessionRequest):
    meta = store.create_session(title=req.title, project_id=req.project_id)
    return SessionMetaResponse(
        id=meta.id, title=meta.title,
        project_id=meta.project_id, created_at=meta.created_at,
    )


@router.get("/{session_id}")
async def get_session(session_id: str):
    try:
        records = store.get_session(session_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return records


@router.delete("/{session_id}")
async def delete_session(session_id: str):
    store.delete_session(session_id)
    return {"status": "ok"}


class BulkDeleteRequest(BaseModel):
    ids: list[str]


@router.post("/bulk-delete")
async def bulk_delete_sessions(req: BulkDeleteRequest):
    results = store.bulk_delete_sessions(req.ids)
    return {"results": results}


_SAFE_ID = re.compile(r"^[A-Za-z0-9_.\-]+$")


class RenameSessionRequest(BaseModel):
    title: str


@router.post("/{session_id}/title")
async def rename_session(session_id: str, req: RenameSessionRequest) -> dict[str, str]:
    """Save a new title for a session in its file, so it survives a reload."""
    title = req.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title cannot be empty")
    try:
        store.update_title(session_id, title)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {"status": "ok"}


@router.post("/{session_id}/reveal")
async def reveal_session_file(session_id: str) -> dict[str, str]:
    """Select the session file in Finder (macOS). Used by the sidebar menu."""
    if not _SAFE_ID.fullmatch(session_id):
        raise HTTPException(status_code=400, detail="Invalid session id")
    path = store.session_file(session_id)
    if path is None:
        raise HTTPException(status_code=404, detail="Session file not found")
    if sys.platform != "darwin":
        raise HTTPException(status_code=501, detail="Reveal in Finder is only available on macOS")
    subprocess.run(["open", "-R", str(path)], check=False)
    return {"status": "ok", "path": str(path)}

