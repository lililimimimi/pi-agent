from __future__ import annotations

from enum import Enum
from pydantic import BaseModel


class Role(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    TOOL = "tool"


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
