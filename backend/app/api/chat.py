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
from app.sessions import store as session_store
from app.sessions.models import MessageRecord

BRIDGE_URL = os.getenv("PI_BRIDGE_URL", "http://localhost:3100")

router = APIRouter(prefix="/api")


class _Session:
    def __init__(
        self,
        messages: list[Message],
        provider: str,
        model: str,
        persist_id: str = "",
        execution_preview: bool = True,
    ) -> None:
        self.messages = messages
        self.provider = provider
        self.model = model
        self.persist_id = persist_id
        self.execution_preview = execution_preview
        self.approval_events: dict[str, asyncio.Event] = {}
        self.approval_results: dict[str, bool] = {}


_sessions: dict[str, _Session] = {}


def _get_session(session_id: str) -> _Session:
    session = _sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    return session


class ApproveRequest(BaseModel):
    session_id: str
    tool_call_id: str
    approved: bool


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


class ChatRequest(BaseModel):
    messages: list[dict[str, Any]]
    provider: str = "mock"
    model: str = "mock-1"
    persist_id: str = ""
    execution_preview: bool = True


@router.post("/chat")
async def create_chat(req: ChatRequest) -> dict[str, str]:
    messages = [
        Message(role=Role(msg.get("role", "user")), content=msg.get("content", ""))
        for msg in req.messages
    ]
    session_id = str(uuid.uuid4())
    persist_id = req.persist_id

    if not persist_id:
        first_content = next((m.content for m in messages if m.role == Role.USER), "")
        title = first_content[:20].strip() if first_content else ""
        meta = session_store.create_session(title=title)
        persist_id = meta.id

    for m in messages:
        try:
            session_store.append_record(persist_id, MessageRecord(role=m.role.value, content=m.content))
        except FileNotFoundError:
            pass

    _sessions[session_id] = _Session(
        messages=messages,
        provider=req.provider,
        model=req.model,
        persist_id=persist_id,
        execution_preview=req.execution_preview,
    )
    return {"session_id": session_id, "persist_id": persist_id}


@router.get("/chat/stream/{session_id}")
async def stream_chat(session_id: str) -> StreamingResponse:
    session = _get_session(session_id)

    async def _proxy() -> AsyncIterator[str]:
        import json as _json
        assistant_text_parts: list[str] = []
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                f"{BRIDGE_URL}/chat",
                json={
                    "messages": [
                        {"role": m.role.value, "content": m.content}
                        for m in session.messages
                    ],
                    "provider": session.provider,
                    "model": session.model,
                    "execution_preview": session.execution_preview,
                },
            ) as resp:
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        yield f"{line}\n\n"
                        try:
                            evt = _json.loads(line[6:])
                            if evt.get("event") == "text":
                                assistant_text_parts.append(evt["data"]["content"])
                        except (ValueError, KeyError):
                            pass

        if session.persist_id and assistant_text_parts:
            full_text = "".join(assistant_text_parts)
            try:
                session_store.append_record(
                    session.persist_id,
                    MessageRecord(role="assistant", content=full_text),
                )
            except FileNotFoundError:
                pass

    return StreamingResponse(
        _proxy(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@router.post("/tool/approve")
async def approve_tool(req: ApproveRequest) -> dict[str, str]:
    session = _get_session(req.session_id)
    session.approval_results[req.tool_call_id] = req.approved
    event = session.approval_events.get(req.tool_call_id)
    if event is not None:
        event.set()
    return {"status": "ok"}
