"""GitTool — runs git commands. Destructive operations require approval."""
from __future__ import annotations

import asyncio
from typing import Any

from app.tools.base import Tool
from app.types import ToolResult

# Operations that can mutate remote state or permanently discard local work.
_REQUIRES_APPROVAL: frozenset[str] = frozenset(
    {"push", "reset", "clean", "checkout", "merge", "rebase", "branch -D", "branch -d"}
)


class GitTool(Tool):
    name = "git"
    description = (
        "Execute a git command. Safe read-only operations (status, log, diff) "
        "run automatically; destructive operations (push, reset, clean, merge, "
        "checkout, rebase) require user approval."
    )
    requires_approval = False  # dynamic — see check_approval()
    parameters = {
        "type": "object",
        "properties": {
            "operation": {
                "type": "string",
                "description": (
                    "The git sub-command to run "
                    "(e.g. 'status', 'log', 'diff', 'add', 'commit', 'push', 'reset')."
                ),
            },
            "args": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Additional arguments passed after the operation.",
                "default": [],
            },
        },
        "required": ["operation"],
    }

    def check_approval(self, args: dict[str, Any]) -> bool:
        operation: str = args.get("operation", "").strip().lower()
        return operation in _REQUIRES_APPROVAL

    async def execute(self, args: dict[str, Any]) -> ToolResult:
        operation: str = args.get("operation", "")
        extra: list[str] = args.get("args", [])
        cmd = ["git", operation, *extra]
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
            if proc.returncode == 0:
                return ToolResult(tool_call_id="", output=stdout.decode("utf-8", errors="replace"))
            return ToolResult(
                tool_call_id="",
                output=stderr.decode("utf-8", errors="replace"),
                is_error=True,
            )
        except asyncio.TimeoutError:
            return ToolResult(tool_call_id="", output="git command timed out", is_error=True)
        except Exception as exc:  # noqa: BLE001
            return ToolResult(tool_call_id="", output=str(exc), is_error=True)
