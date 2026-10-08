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


# ── Multimodal content ─────────────────────────────────────────────────────────

IMAGE_MEDIA_TYPES = ("image/jpeg", "image/png", "image/gif", "image/webp")
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGES_PER_MESSAGE = 4  # keep in sync with frontend/src/lib/image.ts


class ImageContent(BaseModel):
    media_type: str  # image/jpeg | image/png | image/gif | image/webp
    data: str        # base64, no data: prefix


class MessageContent(BaseModel):
    type: str        # "text" | "image"
    text: str | None = None
    image: ImageContent | None = None


# ── Conversation message ───────────────────────────────────────────────────────

class Message(BaseModel):
    role: Role
    # Plain string for text-only messages; list of parts when images are attached
    content: str | list[MessageContent] = ""
    tool_calls: list[ToolCall] | None = None
    tool_results: list[ToolResult] | None = None


def text_of(content: str | list[MessageContent]) -> str:
    """Concatenate the text parts of a message's content."""
    if isinstance(content, str):
        return content
    return "".join(part.text or "" for part in content if part.type == "text")


def images_of(content: str | list[MessageContent]) -> list[ImageContent]:
    """Return the image parts of a message's content, in order."""
    if isinstance(content, str):
        return []
    return [part.image for part in content if part.type == "image" and part.image is not None]


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
