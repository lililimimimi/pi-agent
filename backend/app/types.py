from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class Role(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    TOOL = "tool"


# ── Model output chunks ────────────────────────────────────────────────────────

class TextChunk(BaseModel):
    type: str = Field(default="text", frozen=True)
    content: str


class ToolCallChunk(BaseModel):
    type: str = Field(default="tool_call", frozen=True)
    tool_call_id: str
    tool_name: str
    arguments: dict[str, Any]


# ── Tool primitives ────────────────────────────────────────────────────────────

class ToolCall(BaseModel):
    tool_call_id: str
    tool_name: str
    arguments: dict[str, Any]


class ToolResult(BaseModel):
    tool_call_id: str
    output: str
    is_error: bool = False


# ── Conversation message ───────────────────────────────────────────────────────

class Message(BaseModel):
    role: Role
    content: str
    tool_calls: list[ToolCall] | None = None
    tool_results: list[ToolResult] | None = None


# ── SSE event envelope ─────────────────────────────────────────────────────────

class SSEEvent(BaseModel):
    event: str
    data: dict[str, Any]


class PermissionRequestEvent(BaseModel):
    """SSE event emitted when a dangerous tool needs user approval."""
    event: str = Field(default="permission_request", frozen=True)
    data: dict[str, Any]  # tool_call_id, tool_name, arguments


class ExecutionPreviewEvent(BaseModel):
    """SSE event emitted before the first write tool call, so the user can
    confirm the agent's intended steps before anything is modified."""
    event: str = Field(default="execution_preview", frozen=True)
    data: dict[str, Any]  # preview_id, steps, has_write_ops
