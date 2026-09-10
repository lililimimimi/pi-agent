"""
Session CRUD API endpoints.

GET    /api/sessions          → list all sessions
POST   /api/sessions          → create a new session
GET    /api/sessions/:id      → get full session records
DELETE /api/sessions/:id      → delete a session
"""
from __future__ import annotations

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
