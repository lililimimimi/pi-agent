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
from app.services.catalog import is_lasting_failure, record_model_status
from app.services.project_rename import mark_done, mark_running
from app.logging import get_logger, get_correlation_id, new_correlation_id, set_correlation_id

log = get_logger(__name__)

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
        auto_edits: bool = False,
        rules: str = "",
        project_path: str = "",
        cid: str = "",
    ) -> None:
        self.messages = messages
        self.provider = provider
        self.model = model
        self.persist_id = persist_id
        self.execution_preview = execution_preview
        self.auto_edits = auto_edits
        self.rules = rules
        self.project_path = project_path
        # Same correlation ID as the create request, so the whole chat can be followed
        self.cid = cid or get_correlation_id()
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
    auto_edits: bool = False
    project_path: str = ""


@router.post("/chat")
async def create_chat(req: ChatRequest) -> dict[str, str]:
    set_correlation_id(new_correlation_id())
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

    # A new session stores the whole history. An existing session already has its earlier
    # turns saved, so only the new user message is added (otherwise history repeats).
    to_store = messages if not req.persist_id else [m for m in messages[-1:] if m.role == Role.USER]
    for m in to_store:
        # Session files store text only; images are noted but not written out
        record_text = text_of(m.content)
        n_images = len(images_of(m.content))
        if n_images:
            record_text = f"{record_text}\n[{n_images} image(s) attached]".strip()
        try:
            session_store.append_record(persist_id, MessageRecord(role=m.role.value, content=record_text))
        except FileNotFoundError:
            pass

    try:
        rules = RulesEngine().build_rules(req.project_path)
    except OSError as exc:  # rules are optional; never block the chat on them
        log.warning("could not build project rules: {}", exc)
        rules = ""

    _sessions[session_id] = _Session(
        messages=messages,
        provider=req.provider,
        model=req.model,
        persist_id=persist_id,
        execution_preview=req.execution_preview,
        auto_edits=req.auto_edits,
        rules=rules,
        project_path=req.project_path,
        cid=get_correlation_id(),
    )
    log.info(
        "chat created: provider={} model={} messages={} project={}",
        req.provider, req.model, len(messages), req.project_path or "-",
    )
    return {"session_id": session_id, "persist_id": persist_id}


@router.get("/chat/stream/{session_id}")
async def stream_chat(session_id: str) -> StreamingResponse:
    session = _get_session(session_id)

    async def _proxy() -> AsyncIterator[str]:
        import json as _json
        import time as _time
        set_correlation_id(session.cid)
        started = _time.monotonic()
        assistant_text_parts: list[str] = []
        error_messages: list[str] = []
        log.info("stream started: provider={} model={}", session.provider, session.model)
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
                    "auto_edits": session.auto_edits,
                    "rules": session.rules,
                    "cwd": session.project_path,
                    "cid": session.cid,
                },
            ) as resp:
                if resp.status_code != 200:
                    # Without this the browser gets nothing and waits forever
                    detail = (await resp.aread()).decode(errors="replace")[:200]
                    log.error("pi-bridge returned {}: {}", resp.status_code, detail)
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
                            elif evt.get("event") == "error":
                                error_messages.append(str(evt["data"].get("message", "")))
                        except (ValueError, KeyError):
                            pass

        log.info(
            "stream finished: {:.1f}s, reply_chars={}",
            _time.monotonic() - started,
            len("".join(assistant_text_parts)),
        )
        # The model picker's dot follows the last real chat turn, not only the Settings test.
        # A temporary failure (timeout, network) leaves the dot as it was.
        if session.provider and session.model:
            if error_messages and is_lasting_failure(error_messages[-1]):
                record_model_status(session.provider, session.model, False, error_messages[-1])
            elif assistant_text_parts and not error_messages:
                record_model_status(session.provider, session.model, True)
        if session.persist_id and assistant_text_parts:
            full_text = "".join(assistant_text_parts)
            try:
                session_store.append_record(
                    session.persist_id,
                    MessageRecord(role="assistant", content=full_text),
                )
            except FileNotFoundError:
                pass
        elif session.persist_id and error_messages:
            # Keep a failed turn visible after a reload
            try:
                session_store.append_record(
                    session.persist_id,
                    MessageRecord(role="assistant", content=f"Error: {error_messages[-1]}"),
                )
            except FileNotFoundError:
                pass

    async def _guarded() -> AsyncIterator[str]:
        # While a turn streams, its project can't be renamed (see project_rename)
        mark_running(session.project_path)
        try:
            async for chunk in _proxy():
                yield chunk
        finally:
            mark_done(session.project_path)

    return StreamingResponse(
        _guarded(),
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
