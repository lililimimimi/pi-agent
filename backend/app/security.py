"""Security interceptor — blocks dangerous tool calls before execution."""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class InterceptResult:
    """Result of a security check."""
    allowed: bool
    reason: str = ""


# ── Blocked patterns (always rejected) ──────────────────────────────────────────

BLOCKED_PATTERNS: list[re.Pattern[str]] = [
    re.compile(p)
    for p in [
        r"rm\s+-rf",
        r"sudo",
        r"curl.+\|(bash|sh)",
        r":\(\)\{.*\}",
        r">/dev/",
        r"mkfs",
        r"nohup",
        r"&\s*$",
    ]
]

# ── Allowed command prefixes (phase-2 allowlist) ────────────────────────────────

ALLOWED_PREFIXES: list[str] = [
    "pytest",
    "python -m pytest",
    "git ",
    "npm test",
    "npx tsc",
    "ls",
    "cat",
    "grep",
    "diff",
    "echo",
]


class CommandAllowlist:
    """Check whether a shell command is allowed."""

    def __init__(
        self,
        allowed_prefixes: list[str] | None = None,
        blocked_patterns: list[re.Pattern[str]] | None = None,
    ) -> None:
        self._allowed = allowed_prefixes if allowed_prefixes is not None else ALLOWED_PREFIXES
        self._blocked = blocked_patterns if blocked_patterns is not None else BLOCKED_PATTERNS

    def check(self, command: str) -> InterceptResult:
        cmd = command.strip()

        # 1. Check blocked patterns first (always reject)
        for pattern in self._blocked:
            if pattern.search(cmd):
                return InterceptResult(allowed=False, reason=f"Blocked pattern: {pattern.pattern}")

        # 2. Check allowlist
        if not any(cmd.startswith(prefix) for prefix in self._allowed):
            return InterceptResult(
                allowed=False,
                reason=f"Command not in allowlist: {cmd.split()[0] if cmd else '(empty)'}",
            )

        return InterceptResult(allowed=True)


class SecurityInterceptor:
    """Pre-execution security gate for all tool calls."""

    def __init__(self, project_root: str | Path) -> None:
        self._project_root = Path(project_root).resolve()
        self._command_allowlist = CommandAllowlist()

    # ── Public API ──────────────────────────────────────────────────────────────

    def before_tool_call(self, tool_name: str, args: dict) -> InterceptResult:
        """Check whether a tool call should be allowed."""
        if tool_name in ("read_file", "write_file"):
            return self._check_path(args.get("path", ""))

        if tool_name == "git":
            return self._check_git(args)

        if tool_name == "run_command":
            return self._check_command(args.get("command", ""))

        # Unknown tools — allow by default (other layers handle them)
        return InterceptResult(allowed=True)

    # ── Private helpers ─────────────────────────────────────────────────────────

    def _check_path(self, raw_path: str) -> InterceptResult:
        """Ensure the path stays within PROJECT_ROOT."""
        if not raw_path:
            return InterceptResult(allowed=False, reason="Empty path")

        # Reject obvious traversal attempts before resolving
        if ".." in raw_path:
            return InterceptResult(allowed=False, reason="Path traversal detected: '..' not allowed")

        resolved = Path(raw_path).resolve()

        # Absolute path outside project root
        if not str(resolved).startswith(str(self._project_root)):
            return InterceptResult(
                allowed=False,
                reason=f"Path outside project root: {resolved}",
            )

        return InterceptResult(allowed=True)

    def _check_git(self, args: dict) -> InterceptResult:
        """Git operations are allowed (approval layer handles destructive ones)."""
        return InterceptResult(allowed=True)

    def _check_command(self, command: str) -> InterceptResult:
        """Delegate to CommandAllowlist."""
        return self._command_allowlist.check(command)
