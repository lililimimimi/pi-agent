"""
Structured logging with loguru and per-request correlation IDs (contextvars).

    from app.logging import get_logger, LogContext

    log = get_logger(__name__)          # module shows in the log line
    with LogContext() as cid:           # every log inside carries cid=...
        log.info("request started")

Line format:
    2025-09-05 10:23:45.123 | INFO  | agent.core | cid=a3f2b1c4 | Agent loop started
"""
from __future__ import annotations

import sys
import uuid
from contextvars import ContextVar
from typing import Any

from loguru import logger as _base_logger

# --------------------------------------------------------------------------- #
# Correlation ID (async-safe: each task / request sees its own value)
# --------------------------------------------------------------------------- #

_correlation_id: ContextVar[str] = ContextVar("correlation_id", default="-")


def get_correlation_id() -> str:
    return _correlation_id.get()


def new_correlation_id() -> str:
    return uuid.uuid4().hex[:8]


def set_correlation_id(cid: str = "") -> str:
    """Set (or generate) a correlation ID for the current context."""
    cid = cid or new_correlation_id()
    _correlation_id.set(cid)
    return cid


class LogContext:
    """Sets a correlation ID for a block and restores the previous one on exit.

    Pass an existing ID to continue a chain started elsewhere (for example,
    a later request for the same chat session).
    """

    def __init__(self, cid: str | None = None) -> None:
        self._cid = cid or new_correlation_id()
        self._token: Any = None

    def __enter__(self) -> str:
        self._token = _correlation_id.set(self._cid)
        return self._cid

    def __exit__(self, *exc_info: object) -> bool:
        _correlation_id.reset(self._token)
        return False


# --------------------------------------------------------------------------- #
# Loguru configuration
# --------------------------------------------------------------------------- #

LOG_FORMAT = (
    "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
    "<level>{level: <5}</level> | "
    "<cyan>{extra[module]}</cyan> | "
    "cid={extra[cid]} | "
    "{message}"
)


def _inject_cid(record: dict) -> None:  # type: ignore[type-arg]
    record["extra"]["cid"] = get_correlation_id()


def setup_logging(level: str = "INFO") -> None:
    """Replace loguru's default sink with the structured format above."""
    _base_logger.remove()
    _base_logger.add(
        sys.stderr,
        format=LOG_FORMAT,
        level=level,
        colorize=sys.stderr.isatty(),
        backtrace=True,
        diagnose=False,
    )
    # Defaults for records logged without get_logger (e.g. from third-party style code)
    _base_logger.configure(extra={"cid": "-", "module": "-"})


# Kept so existing callers keep working
configure_logging = setup_logging


def get_logger(name: str):  # type: ignore[no-untyped-def]
    """Logger that adds the module name and the current correlation ID to every record."""
    module = name[4:] if name.startswith("app.") else name
    return _base_logger.patch(_inject_cid).bind(module=module)
