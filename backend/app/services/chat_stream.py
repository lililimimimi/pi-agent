"""One chat turn: relays the reply from pi-bridge to the browser, and keeps what was written."""

from __future__ import annotations

import json
import os
import time
from collections.abc import AsyncIterator

import httpx

from app.errors import NotFoundError
from app.logging import get_logger, set_correlation_id
from app.services.catalog import is_lasting_failure, record_model_status
from app.services.chat_content import serialize_content
from app.services.chat_sessions import ChatSession
from app.services.project_rename import mark_done, mark_running
from app.sessions import store as session_store
from app.sessions.models import MessageRecord

log = get_logger(__name__)

BRIDGE_URL = os.getenv("PI_BRIDGE_URL", "http://localhost:3100")


async def _relay(session: ChatSession) -> AsyncIterator[str]:

    set_correlation_id(session.cid)
    started = time.monotonic()
    assistant_text_parts: list[str] = []
    error_messages: list[str] = []
    log.info("stream started: provider={} model={}", session.provider, session.model)
    try:
        async with (
            httpx.AsyncClient(timeout=None) as client,
            client.stream(
                "POST",
                f"{BRIDGE_URL}/chat",
                json={
                    "messages": [
                        {
                            "role": m.role.value,
                            "content": serialize_content(m.content),
                        }
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
            ) as resp,
        ):
            if resp.status_code != 200:
                # Without this the browser gets nothing and waits forever
                detail = (await resp.aread()).decode(errors="replace")[:200]
                log.error("pi-bridge returned {}: {}", resp.status_code, detail)
                message = f"pi-bridge returned HTTP {resp.status_code}"
                yield f"data: {json.dumps({'event': 'error', 'data': {'message': message}})}\n\n"
                yield f"data: {json.dumps({'event': 'done', 'data': {}})}\n\n"
                return
            async for line in resp.aiter_lines():
                if session.stopped:
                    break  # the user stopped: nothing more is written to the reply
                if line.startswith("data: "):
                    yield f"{line}\n\n"
                    try:
                        evt = json.loads(line[6:])
                        if evt.get("event") == "text":
                            assistant_text_parts.append(evt["data"]["content"])
                            session.reply_parts.append(evt["data"]["content"])
                        elif evt.get("event") == "error":
                            error_messages.append(str(evt["data"].get("message", "")))
                    except (ValueError, KeyError):
                        log.warning("skipped a malformed event from the bridge")

    finally:
        # The reader may have left mid-reply (tab closed, network dropped): keep what arrived
        session.save_reply()
    log.info(
        "stream finished: {:.1f}s, reply_chars={}",
        time.monotonic() - started,
        len("".join(assistant_text_parts)),
    )
    # The model picker's dot follows the last real chat turn, not only the Settings test.
    # A temporary failure (timeout, network) leaves the dot as it was.
    if session.provider and session.model:
        if error_messages and is_lasting_failure(error_messages[-1]):
            record_model_status(
                session.provider, session.model, False, error_messages[-1]
            )
        elif assistant_text_parts and not error_messages:
            record_model_status(session.provider, session.model, True)
    if session.persist_id and assistant_text_parts:
        session.save_reply()
    elif session.persist_id and error_messages:
        # Keep a failed turn visible after a reload
        try:
            session_store.append_record(
                session.persist_id,
                MessageRecord(role="assistant", content=f"Error: {error_messages[-1]}"),
            )
        except NotFoundError:
            log.warning(
                "reply not saved: session file for {} is gone", session.persist_id
            )


async def stream_turn(session: ChatSession) -> AsyncIterator[str]:
    # While a turn streams, its project can't be renamed (see project_rename)
    mark_running(session.project_path)
    try:
        async for chunk in _relay(session):
            yield chunk
    finally:
        mark_done(session.project_path)
