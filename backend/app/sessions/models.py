"""
Session & project persistence models.

JSONL row types:
  - meta   (first line): session metadata (id, title, created_at, project_id)
  - message: a conversation message (role, content)
  - tool_call / tool_result: tool interaction records
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ── JSONL record types ─────────────────────────────────────────────────────────

class RecordType(str, Enum):
    META = "meta"
    MESSAGE = "message"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"


class SessionMeta(BaseModel):
    """First line of a .jsonl session file."""
    type: RecordType = Field(default=RecordType.META, frozen=True)
    id: str
    title: str
    project_id: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class MessageRecord(BaseModel):
    type: RecordType = Field(default=RecordType.MESSAGE, frozen=True)
    role: str
    content: str


class ToolCallRecord(BaseModel):
    type: RecordType = Field(default=RecordType.TOOL_CALL, frozen=True)
    tool_call_id: str
    tool_name: str
    arguments: dict[str, Any]


class ToolResultRecord(BaseModel):
    type: RecordType = Field(default=RecordType.TOOL_RESULT, frozen=True)
    tool_call_id: str
    output: str
    is_error: bool = False


# Union of all record types
SessionRecord = SessionMeta | MessageRecord | ToolCallRecord | ToolResultRecord


# ── Session summary (for listing) ─────────────────────────────────────────────

class SessionSummary(BaseModel):
    id: str
    title: str
    project_id: str
    created_at: str


# ── Project model ──────────────────────────────────────────────────────────────

class Project(BaseModel):
    id: str
    name: str
    path: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
