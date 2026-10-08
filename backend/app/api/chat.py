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

from app.types import (
    IMAGE_MEDIA_TYPES,
    MAX_IMAGE_BYTES,
    MAX_IMAGES_PER_MESSAGE,
    Message,
    MessageContent,
    Role,
    images_of,
    text_of,
)
from app.sessions import store as session_store
from app.sessions.models import MessageRecord
from app.rules.engine import RulesEngine

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
        rules: str = "",
        project_path: str = "",
    ) -> None:
        self.messages = messages
        self.provider = provider
        self.model = model
        self.persist_id = persist_id
        self.execution_preview = execution_preview
        self.rules = rules
        self.project_path = project_path
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


def _parse_content(raw: Any) -> str | list[MessageContent]:
    """Validate and convert the `content` field of an incoming message.

    Accepts a plain string, or a list of {type: text} / {type: image} parts.
    """
    if not isinstance(raw, list):
        return "" if raw is None else str(raw)

    parts: list[MessageContent] = []
    image_count = 0
    for part in raw:
        try:
            item = MessageContent.model_validate(part)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid content part")
        if item.type == "image":
            image_count += 1
            if item.image is None:
                raise HTTPException(status_code=400, detail="Image part is missing data")
            if item.image.media_type not in IMAGE_MEDIA_TYPES:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unsupported image type: {item.image.media_type}",
                )
            # base64 expands by 4/3; this is the decoded size
            if len(item.image.data) * 3 // 4 > MAX_IMAGE_BYTES:
                raise HTTPException(status_code=400, detail="Image exceeds 5MB")
            if image_count > MAX_IMAGES_PER_MESSAGE:
                raise HTTPException(
                    status_code=400,
                    detail=f"At most {MAX_IMAGES_PER_MESSAGE} images per message",
                )
        parts.append(item)
    return parts


def _serialize_content(content: str | list[MessageContent]) -> str | list[dict[str, Any]]:
    """Shape content for the bridge: a string, or a list of parts without null fields."""
    if isinstance(content, str):
        return content
    return [part.model_dump(exclude_none=True) for part in content]


class ChatRequest(BaseModel):
    messages: list[dict[str, Any]]
    provider: str = "mock"
    model: str = "mock-1"
    persist_id: str = ""
    execution_preview: bool = True
    project_path: str = ""


@router.post("/chat")
async def create_chat(req: ChatRequest) -> dict[str, str]:
    messages = [
        Message(role=Role(msg.get("role", "user")), content=_parse_content(msg.get("content", "")))
        for msg in req.messages
    ]
    session_id = str(uuid.uuid4())
    persist_id = req.persist_id

    if not persist_id:
        first_content = next((text_of(m.content) for m in messages if m.role == Role.USER), "")
        title = first_content[:20].strip() if first_content else ""
        # Store the project folder so the session reopens under the same project
        meta = session_store.create_session(title=title, project_id=req.project_path)
        persist_id = meta.id

    for m in messages:
        # Session files store text only; images are noted but not written out
        record_text = text_of(m.content)
        n_images = len(images_of(m.content))
        if n_images:
            record_text = f"{record_text}\n[附图 {n_images} 张]".strip()
        try:
            session_store.append_record(persist_id, MessageRecord(role=m.role.value, content=record_text))
        except FileNotFoundError:
            pass

    try:
        rules = RulesEngine().build_rules(req.project_path)
    except OSError as exc:  # rules are optional; never block the chat on them
        print(f"[chat] could not build rules: {exc}")
        rules = ""

    _sessions[session_id] = _Session(
        messages=messages,
        provider=req.provider,
        model=req.model,
        persist_id=persist_id,
        execution_preview=req.execution_preview,
        rules=rules,
        project_path=req.project_path,
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
                        {"role": m.role.value, "content": _serialize_content(m.content)}
                        for m in session.messages
                    ],
                    "provider": session.provider,
                    "model": session.model,
                    "execution_preview": session.execution_preview,
                    "rules": session.rules,
                    "cwd": session.project_path,
                },
            ) as resp:
                if resp.status_code != 200:
                    # Without this the browser gets nothing and waits forever
                    detail = (await resp.aread()).decode(errors="replace")[:200]
                    print(f"[chat] pi-bridge returned {resp.status_code}: {detail}")
                    message = f"pi-bridge returned HTTP {resp.status_code}"
                    yield f"data: {_json.dumps({'event': 'error', 'data': {'message': message}})}\n\n"
                    yield f"data: {_json.dumps({'event': 'done', 'data': {}})}\n\n"
                    return
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
