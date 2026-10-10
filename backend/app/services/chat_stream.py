"""One chat turn: relays the reply from pi-bridge to the browser, and keeps what was written."""

from __future__ import annotations

import json
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.errors import NotFoundError
from app.logging import get_logger, set_correlation_id
from app.services.bridge import BRIDGE_URL
from app.services.catalog import is_lasting_failure, record_model_status
from app.services.chat_content import serialize_content
from app.services.chat_sessions import ChatSession, forget_chat_session
from app.services.project_rename import mark_done, mark_running
from app.sessions import store as session_store
from app.sessions.models import MessageRecord

log = get_logger(__name__)


@dataclass
class _Outcome:
    """What one turn produced, as the bridge streamed it."""

    text: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


def _bridge_payload(session: ChatSession) -> dict[str, Any]:
    return {
        "messages": [
            {"role": m.role.value, "content": serialize_content(m.content)}
            for m in session.messages
        ],
        "provider": session.provider,
        "model": session.model,
        "execution_preview": session.execution_preview,
        "auto_edits": session.auto_edits,
        "rules": session.rules,
        "cwd": session.project_path,
        "cid": session.cid,
    }


async def _bridge_refused(resp: httpx.Response) -> AsyncIterator[str]:
    """The bridge answered with an error status: tell the browser and end the turn."""
    detail = (await resp.aread()).decode(errors="replace")[:200]
    log.error("pi-bridge returned {}: {}", resp.status_code, detail)
    message = f"pi-bridge returned HTTP {resp.status_code}"
    yield f"data: {json.dumps({'event': 'error', 'data': {'message': message}})}\n\n"
    yield f"data: {json.dumps({'event': 'done', 'data': {}})}\n\n"


async def _pass_events(
    resp: httpx.Response, session: ChatSession, outcome: _Outcome
) -> AsyncIterator[str]:
    """Forward each bridge event to the browser, and keep the text and errors it carries."""
    async for line in resp.aiter_lines():
        if session.stopped:
            break  # the user stopped: nothing more is written to the reply
        if not line.startswith("data: "):
            continue
        yield f"{line}\n\n"
        try:
            evt = json.loads(line[6:])
            if evt.get("event") == "text":
                outcome.text.append(evt["data"]["content"])
                session.reply_parts.append(evt["data"]["content"])
            elif evt.get("event") == "error":
                outcome.errors.append(str(evt["data"].get("message", "")))
        except (ValueError, KeyError):
            log.warning("skipped a malformed event from the bridge")


def _record_turn(session: ChatSession, outcome: _Outcome) -> None:
    """Update the model picker's status and save what the turn produced."""
    # The model picker's dot follows the last real chat turn, not only the Settings test.
    # A temporary failure (timeout, network) leaves the dot as it was.
    if session.provider and session.model:
        if outcome.errors and is_lasting_failure(outcome.errors[-1]):
            record_model_status(
                session.provider, session.model, False, outcome.errors[-1]
            )
        elif outcome.text and not outcome.errors:
            record_model_status(session.provider, session.model, True)
    if session.persist_id and outcome.text:
        session.save_reply()
    elif session.persist_id and outcome.errors:
        # Keep a failed turn visible after a reload
        try:
            session_store.append_record(
                session.persist_id,
                MessageRecord(role="assistant", content=f"Error: {outcome.errors[-1]}"),
            )
        except NotFoundError:
            log.warning(
                "reply not saved: session file for {} is gone", session.persist_id
            )


async def _relay(session: ChatSession) -> AsyncIterator[str]:
    set_correlation_id(session.cid)
    started = time.monotonic()
    outcome = _Outcome()
    log.info("stream started: provider={} model={}", session.provider, session.model)
    try:
        async with (
            httpx.AsyncClient(timeout=None) as client,
            client.stream(
                "POST", f"{BRIDGE_URL}/chat", json=_bridge_payload(session)
            ) as resp,
        ):
            if resp.status_code != 200:
                async for chunk in _bridge_refused(resp):
                    yield chunk
                return
            async for chunk in _pass_events(resp, session, outcome):
                yield chunk
    finally:
        # The reader may have left mid-reply (tab closed, network dropped): keep what arrived
        session.save_reply()
    log.info(
        "stream finished: {:.1f}s, reply_chars={}",
        time.monotonic() - started,
        len("".join(outcome.text)),
    )
    _record_turn(session, outcome)


async def stream_turn(session: ChatSession) -> AsyncIterator[str]:
    # While a turn streams, its project can't be renamed (see project_rename)
    mark_running(session.project_path)
    try:
        async for chunk in _relay(session):
            yield chunk
    finally:
        mark_done(session.project_path)
        # The reply is saved by now: the chat need not stay in memory
        forget_chat_session(session.session_id)
