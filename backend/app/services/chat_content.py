"""Message content for chat: validates what the client sends, and shapes it for the bridge."""

from __future__ import annotations

from typing import Any

from app.errors import InvalidRequestError
from app.types import (
    IMAGE_MEDIA_TYPES,
    MAX_IMAGE_BYTES,
    MAX_IMAGES_PER_MESSAGE,
    MessageContent,
)


def parse_content(raw: Any) -> str | list[MessageContent]:
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
            raise InvalidRequestError("Invalid content part")
        if item.type == "image":
            image_count += 1
            if item.image is None:
                raise InvalidRequestError("Image part is missing data")
            if item.image.media_type not in IMAGE_MEDIA_TYPES:
                raise InvalidRequestError(
                    f"Unsupported image type: {item.image.media_type}"
                )
            # base64 expands by 4/3; this is the decoded size
            if len(item.image.data) * 3 // 4 > MAX_IMAGE_BYTES:
                raise InvalidRequestError("Image exceeds 5MB")
            if image_count > MAX_IMAGES_PER_MESSAGE:
                raise InvalidRequestError(
                    f"At most {MAX_IMAGES_PER_MESSAGE} images per message"
                )
        parts.append(item)
    return parts


def serialize_content(
    content: str | list[MessageContent],
) -> str | list[dict[str, Any]]:
    """Shape content for the bridge: a string, or a list of parts without null fields."""
    if isinstance(content, str):
        return content
    return [part.model_dump(exclude_none=True) for part in content]
