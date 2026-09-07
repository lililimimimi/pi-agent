"""
Chat API routes:
  POST /api/chat              → create session, return {session_id}
  GET  /api/chat/stream/{id} → SSE stream from AgentLoop
  POST /api/tool/approve      → signal approval decision for a paused tool call
  GET  /api/health            → liveness probe
"""
from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any, AsyncIterator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.agent.core import AgentLoop
from app.types import Message, Role

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
    """Stream SSE events for an existing session."""
    session = _get_session(session_id)

    # Import registries lazily to allow tests to patch them after import time.
    import app.container as container

    agent = AgentLoop(
        model_router=container.model_router,
        tool_registry=container.tool_registry,
        security_interceptor=container.security_interceptor,
    )

    async def _generate() -> AsyncIterator[str]:
        async for sse_event in agent.run(
            provider_name=session.provider,
            model_id=session.model,
            messages=session.messages,
        ):
            payload = json.dumps(sse_event.model_dump())
            yield f"data: {payload}\n\n"

    return StreamingResponse(
        _generate(),
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
