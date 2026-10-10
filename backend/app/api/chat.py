"""
Chat API routes:
  POST /api/chat              → create session, return {session_id}
  GET  /api/chat/stream/{id}  → stream one reply from pi-bridge
  POST /api/chat/stop/{id}    → stop the reply being written
  POST /api/tool/approve      → signal approval decision for a paused tool call
  GET  /api/health            → liveness probe
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.logging import get_logger, new_correlation_id, set_correlation_id
from app.schemas import StatusResponse
from app.services.chat_content import parse_content
from app.services.chat_sessions import get_chat_session, open_chat
from app.services.chat_stream import stream_turn
from app.types import Message, Role

log = get_logger(__name__)

router = APIRouter(prefix="/api")


class ApproveRequest(BaseModel):
    session_id: str
    tool_call_id: str
    approved: bool


@router.get("/health")
async def health() -> StatusResponse:
    return StatusResponse(status="ok")


class ChatCreatedResponse(BaseModel):
    session_id: str
    persist_id: str


class ChatRequest(BaseModel):
    messages: list[dict[str, Any]]
    provider: str = "mock"
    model: str = "mock-1"
    persist_id: str = ""
    execution_preview: bool = True
    auto_edits: bool = False
    project_path: str = ""


@router.post("/chat")
async def create_chat(req: ChatRequest) -> ChatCreatedResponse:
    set_correlation_id(new_correlation_id())
    messages = [
        Message(
            role=Role(msg.get("role", "user")),
            content=parse_content(msg.get("content", "")),
        )
        for msg in req.messages
    ]
    session_id, persist_id = open_chat(
        messages=messages,
        persist_id_in=req.persist_id,
        provider=req.provider,
        model=req.model,
        execution_preview=req.execution_preview,
        auto_edits=req.auto_edits,
        project_path=req.project_path,
    )
    return ChatCreatedResponse(session_id=session_id, persist_id=persist_id)


@router.get("/chat/stream/{session_id}")
async def stream_chat(session_id: str) -> StreamingResponse:
    session = get_chat_session(session_id)
    return StreamingResponse(
        stream_turn(session),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.post("/chat/stop/{session_id}")
async def stop_chat(session_id: str) -> StatusResponse:
    """The user pressed Stop: keep the text written so far and end the reply there."""
    get_chat_session(session_id).stop()
    return StatusResponse(status="ok")


@router.post("/tool/approve")
async def approve_tool(req: ApproveRequest) -> StatusResponse:
    session = get_chat_session(req.session_id)
    session.approval_results[req.tool_call_id] = req.approved
    event = session.approval_events.get(req.tool_call_id)
    if event is not None:
        event.set()
    return StatusResponse(status="ok")
