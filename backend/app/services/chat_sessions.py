"""Live chat sessions: one per request to /api/chat, kept in memory for the life of the process."""

from __future__ import annotations

import uuid

from app.errors import NotFoundError
from app.logging import get_correlation_id, get_logger
from app.rules.engine import RulesEngine
from app.sessions import store as session_store
from app.sessions.models import MessageRecord
from app.types import Message, Role, images_of, text_of

log = get_logger(__name__)


class ChatSession:
    def __init__(
        self,
        session_id: str,
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
        self.session_id = session_id
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
        # Reply text as it arrives, so a stopped reply can still be saved
        self.reply_parts: list[str] = []
        self.reply_saved = False
        self.stopped = False

    def save_reply(self) -> None:
        """Write the reply's text to the session file, at most once.

        Called when the turn finishes and when the user stops it, so the text shown on screen
        is still there after a reload.
        """
        text = "".join(self.reply_parts)
        if not self.persist_id or not text or self.reply_saved:
            return
        self.reply_saved = True
        try:
            session_store.append_record(
                self.persist_id, MessageRecord(role="assistant", content=text)
            )
        except NotFoundError:
            log.warning("reply not saved: session file for {} is gone", self.persist_id)

    def stop(self) -> None:
        """The user pressed Stop: no more text is taken, and what was written is kept."""
        self.stopped = True
        self.save_reply()


_sessions: dict[str, ChatSession] = {}


def forget_chat_session(session_id: str) -> None:
    """Drop a finished chat from memory: its reply is saved, nothing else is needed for it."""
    _sessions.pop(session_id, None)


def find_chat_session(session_id: str) -> ChatSession | None:
    """The live chat with this id, or None if it has finished and was forgotten."""
    return _sessions.get(session_id)


def get_chat_session(session_id: str) -> ChatSession:
    session = _sessions.get(session_id)
    if session is None:
        raise NotFoundError(f"Session '{session_id}' not found")
    return session


def open_chat(
    *,
    messages: list[Message],
    persist_id_in: str,
    provider: str,
    model: str,
    execution_preview: bool,
    auto_edits: bool,
    project_path: str,
) -> tuple[str, str]:
    """Save the chat's history, load its project rules, and register it for streaming.

    Returns (session_id, persist_id).
    """
    session_id = str(uuid.uuid4())
    persist_id = persist_id_in

    if not persist_id:
        first_content = next(
            (text_of(m.content) for m in messages if m.role == Role.USER), ""
        )
        title = first_content[:20].strip() if first_content else ""
        # Store the project folder so the session reopens under the same project
        meta = session_store.create_session(title=title, project_id=project_path)
        persist_id = meta.id

    # A new session stores the whole history. An existing session already has its earlier
    # turns saved, so only the new user message is added (otherwise history repeats).
    to_store = (
        messages
        if not persist_id_in
        else [m for m in messages[-1:] if m.role == Role.USER]
    )
    for m in to_store:
        # Session files store text only; images are noted but not written out
        record_text = text_of(m.content)
        n_images = len(images_of(m.content))
        if n_images:
            record_text = f"{record_text}\n[{n_images} image(s) attached]".strip()
        try:
            session_store.append_record(
                persist_id, MessageRecord(role=m.role.value, content=record_text)
            )
        except NotFoundError:
            # The chat still runs; only the saved copy is missing
            log.warning("chat not saved: session file for {} is gone", persist_id)

    try:
        rules = RulesEngine().build_rules(project_path)
    except OSError as exc:  # rules are optional; never block the chat on them
        log.warning("could not build project rules: {}", exc)
        rules = ""

    _sessions[session_id] = ChatSession(
        session_id=session_id,
        messages=messages,
        provider=provider,
        model=model,
        persist_id=persist_id,
        execution_preview=execution_preview,
        auto_edits=auto_edits,
        rules=rules,
        project_path=project_path,
        cid=get_correlation_id(),
    )
    log.info(
        "chat created: provider={} model={} messages={} project={}",
        provider,
        model,
        len(messages),
        project_path or "-",
    )
    return session_id, persist_id
