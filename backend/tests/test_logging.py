"""
Tests for correlation IDs and the log line format.

Correlation IDs live in contextvars, so concurrent requests must not see each other's IDs.
"""
from __future__ import annotations

import asyncio
import re

from app.logging import (
    LogContext,
    get_correlation_id,
    get_logger,
    setup_logging,
)


def test_outside_any_context_the_id_is_a_placeholder():
    assert get_correlation_id() == "-"


def test_context_sets_and_restores_the_id():
    with LogContext("abc12345") as cid:
        assert cid == "abc12345"
        assert get_correlation_id() == "abc12345"
    assert get_correlation_id() == "-"


def test_nested_contexts_restore_the_outer_id():
    with LogContext("outer000"):
        with LogContext("inner000"):
            assert get_correlation_id() == "inner000"
        assert get_correlation_id() == "outer000"


def test_new_context_gets_a_fresh_id_when_none_given():
    with LogContext() as first:
        pass
    with LogContext() as second:
        pass
    assert len(first) == 8
    assert first != second


async def test_concurrent_tasks_keep_their_own_ids():
    seen: dict[str, str] = {}

    async def request(name: str) -> None:
        with LogContext() as cid:
            await asyncio.sleep(0.01)  # let the other request run in between
            seen[name] = get_correlation_id()
            assert seen[name] == cid

    await asyncio.gather(request("a"), request("b"), request("c"))

    assert len(set(seen.values())) == 3


def test_log_line_matches_the_documented_format(capsys):
    setup_logging("DEBUG")
    log = get_logger("app.api.chat")

    with LogContext("a3f2b1c4"):
        log.info("Agent loop started")

    line = capsys.readouterr().err.strip().splitlines()[-1]
    pattern = (
        r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} \| INFO  \| "
        r"api\.chat \| cid=a3f2b1c4 \| Agent loop started$"
    )
    assert re.match(pattern, line), line
