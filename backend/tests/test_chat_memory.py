"""Live chats are kept in memory only while their reply is being written."""

from __future__ import annotations

from app.services.chat_sessions import find_chat_session, forget_chat_session, open_chat
from app.types import Message, Role


def _open() -> str:
    session_id, _ = open_chat(
        messages=[Message(role=Role.USER, content="hi")],
        persist_id_in="",
        provider="mock",
        model="mock-1",
        execution_preview=False,
        auto_edits=False,
        project_path="",
    )
    return session_id


def test_open_chat_keeps_the_chat_until_its_reply_is_over():
    session_id = _open()
    assert find_chat_session(session_id) is not None


def test_forget_chat_session_drops_a_finished_chat_from_memory():
    session_id = _open()
    forget_chat_session(session_id)
    assert find_chat_session(session_id) is None


def test_forgetting_twice_is_harmless():
    session_id = _open()
    forget_chat_session(session_id)
    forget_chat_session(session_id)
    assert find_chat_session(session_id) is None
