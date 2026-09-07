"""
Structured logging with loguru + per-request correlation ID via contextvars.

Usage:
    from app.logging import logger, set_correlation_id
    set_correlation_id()          # sets a fresh UUID in the current context
    logger.info("handling request")
"""
from __future__ import annotations

import sys
import uuid
from contextvars import ContextVar

from loguru import logger as _base_logger

# --------------------------------------------------------------------------- #
# Correlation-ID context var
# --------------------------------------------------------------------------- #

_correlation_id: ContextVar[str] = ContextVar("correlation_id", default="-")


def get_correlation_id() -> str:
    return _correlation_id.get()


def set_correlation_id(cid: str = "") -> str:
    """Set (or generate) a correlation ID for the current async context."""
    if not cid:
        cid = str(uuid.uuid4())[:8]
    _correlation_id.set(cid)
    return cid


# --------------------------------------------------------------------------- #
# Loguru configuration
# --------------------------------------------------------------------------- #

def configure_logging(level: str = "INFO") -> None:
    """Remove default sink and add a structured stderr sink."""
    _base_logger.remove()
    _base_logger.add(
        sys.stderr,
        format=(
            "<green>{time:HH:mm:ss}</green> | "
            "<level>{level: <8}</level> | "
            "[<cyan>{extra[cid]}</cyan>] "
            "<cyan>{name}</cyan>:<cyan>{line}</cyan> — {message}"
        ),
        level=level,
        colorize=True,
        backtrace=True,
        diagnose=False,
    )
    _base_logger.configure(extra={"cid": "-"})


def _inject_cid(record: dict) -> None:  # type: ignore[type-arg]
    record["extra"]["cid"] = get_correlation_id()


# Public logger — automatically injects correlation ID into every record.
logger = _base_logger.patch(_inject_cid)
