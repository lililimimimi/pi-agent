"""
Session CRUD API endpoints.

GET    /api/sessions          → list all sessions
POST   /api/sessions          → create a new session
GET    /api/sessions/:id      → get full session records
DELETE /api/sessions/:id      → delete a session
"""

from __future__ import annotations

import asyncio
import re
import subprocess
import sys
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.errors import InvalidRequestError, NotFoundError, NotImplementedHereError
from app.schemas import RevealResponse, StatusResponse
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
async def list_sessions() -> list[SessionSummary]:
    return store.list_sessions()


@router.post("", response_model=SessionMetaResponse)
async def create_session(req: CreateSessionRequest) -> SessionMetaResponse:
    meta = store.create_session(title=req.title, project_id=req.project_id)
    return SessionMetaResponse(
        id=meta.id,
        title=meta.title,
        project_id=meta.project_id,
        created_at=meta.created_at,
    )


@router.get("/{session_id}")
async def get_session(session_id: str) -> list[dict[str, Any]]:
    return store.get_session(session_id)


@router.delete("/{session_id}")
async def delete_session(session_id: str) -> StatusResponse:
    store.delete_session(session_id)
    return StatusResponse(status="ok")


class BulkDeleteRequest(BaseModel):
    ids: list[str]


class BulkDeleteResponse(BaseModel):
    results: dict[str, str]


@router.post("/bulk-delete")
async def bulk_delete_sessions(req: BulkDeleteRequest) -> BulkDeleteResponse:
    results = store.bulk_delete_sessions(req.ids)
    return BulkDeleteResponse(results=results)


_SAFE_ID = re.compile(r"^[A-Za-z0-9_.\-]+$")


class RenameSessionRequest(BaseModel):
    title: str


@router.post("/{session_id}/title")
async def rename_session(session_id: str, req: RenameSessionRequest) -> StatusResponse:
    """Save a new title for a session in its file, so it survives a reload."""
    title = req.title.strip()
    if not title:
        raise InvalidRequestError("Title cannot be empty")
    store.update_title(session_id, title)
    return StatusResponse(status="ok")


class TruncateRequest(BaseModel):
    user_index: int = Field(ge=0)


@router.post("/{session_id}/truncate")
async def truncate_session(session_id: str, req: TruncateRequest) -> StatusResponse:
    """Remove the Nth user message and everything after it, before that message is sent again."""
    store.truncate_before_user_message(session_id, req.user_index)
    return StatusResponse(status="ok")


@router.post("/{session_id}/reveal")
async def reveal_session_file(session_id: str) -> RevealResponse:
    """Select the session file in Finder (macOS). Used by the sidebar menu."""
    if not _SAFE_ID.fullmatch(session_id):
        raise InvalidRequestError("Invalid session id")
    path = store.session_file(session_id)
    if path is None:
        raise NotFoundError("Session file not found")
    if sys.platform != "darwin":
        raise NotImplementedHereError("Reveal in Finder is only available on macOS")
    await asyncio.to_thread(subprocess.run, ["open", "-R", str(path)], check=False)
    return RevealResponse(status="ok", path=str(path))
