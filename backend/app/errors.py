"""Domain errors. Services and stores raise these; main.py turns them into HTTP responses.

Each class carries its HTTP status, so the mapping lives next to the error, not in the handler.
"""

from __future__ import annotations

from typing import Any, ClassVar


class AppError(Exception):
    status_code: ClassVar[int] = 500
    code: ClassVar[str] = "INTERNAL_ERROR"

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        self.message = message
        self.details = details or {}
        super().__init__(message)


class InvalidRequestError(AppError):
    status_code = 400
    code = "INVALID_REQUEST"


class ForbiddenError(AppError):
    status_code = 403
    code = "FORBIDDEN"


class NotFoundError(AppError):
    status_code = 404
    code = "NOT_FOUND"


class ConflictError(AppError):
    status_code = 409
    code = "CONFLICT"


class PayloadTooLargeError(AppError):
    status_code = 413
    code = "PAYLOAD_TOO_LARGE"


class UnsupportedMediaError(AppError):
    status_code = 415
    code = "UNSUPPORTED_MEDIA"


class NotImplementedHereError(AppError):
    """A feature that only exists on some systems, e.g. Finder or the macOS Trash."""

    status_code = 501
    code = "NOT_AVAILABLE_HERE"


class UpstreamError(AppError):
    """Another local service (the pi-bridge) could not be reached or answered badly."""

    status_code = 502
    code = "UPSTREAM_ERROR"
