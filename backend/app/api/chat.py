"""
Chat API routes:
  POST /api/chat              → create session, return {session_id}
  GET  /api/chat/stream/{id} → proxy SSE stream from pi-bridge
  POST /api/tool/approve      → signal approval decision for a paused tool call
  GET  /api/health            → liveness probe
"""
from __future__ import annotations

import asyncio
import os
import uuid
from typing import Any, AsyncIterator

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.types import Message, Role

BRIDGE_URL = os.getenv("PI_BRIDGE_URL", "http://localhost:3100")

router = APIRouter(prefix="/api")

# ---------------------------------------------------------------------------
# In-memory session store
# ---------------------------------------------------------------------------

class _Session:
    def __init__(
        self,
        messages: list[Message],
        provider: str,
        model: str,
    ) -> None:
        self.messages = messages
        self.provider = provider
        self.model = model
        # tool_call_id → (Event, result-holder)
        self.approval_events: dict[str, asyncio.Event] = {}
        self.approval_results: dict[str, bool] = {}


_sessions: dict[str, _Session] = {}


def _get_session(session_id: str) -> _Session:
    session = _sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    return session


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    messages: list[dict[str, Any]]
    provider: str = "mock"
    model: str = "mock-1"


class ApproveRequest(BaseModel):
    session_id: str
    tool_call_id: str
    approved: bool


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/chat")
async def create_chat(req: ChatRequest) -> dict[str, str]:
    """Create a new chat session and return its ID."""
    messages = [
        Message(
            role=Role(msg.get("role", "user")),
            content=msg.get("content", ""),
        )
        for msg in req.messages
    ]
    session_id = str(uuid.uuid4())
    _sessions[session_id] = _Session(
        messages=messages,
        provider=req.provider,
        model=req.model,
    )
    return {"session_id": session_id}


@router.get("/chat/stream/{session_id}")
async def stream_chat(session_id: str) -> StreamingResponse:
    """Stream SSE events by proxying to pi-bridge."""
    session = _get_session(session_id)

    async def _proxy() -> AsyncIterator[str]:
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                f"{BRIDGE_URL}/chat",
                json={
                    "messages": [
                        {"role": m.role.value, "content": m.content}
                        for m in session.messages
                    ],
                },
            ) as resp:
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        yield f"{line}\n\n"

    return StreamingResponse(
        _proxy(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.post("/tool/approve")
async def approve_tool(req: ApproveRequest) -> dict[str, str]:
    """Signal the approval decision for a tool call awaiting confirmation."""
    session = _get_session(req.session_id)
    session.approval_results[req.tool_call_id] = req.approved
    event = session.approval_events.get(req.tool_call_id)
    if event is not None:
        event.set()
    return {"status": "ok"}
