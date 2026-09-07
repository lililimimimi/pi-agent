"""ReadFileTool — reads a file from disk. No approval required."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from app.tools.base import Tool
from app.types import ToolResult


class ReadFileTool(Tool):
    name = "read_file"
    description = "Read the text contents of a file from the filesystem."
    requires_approval = False
    parameters = {
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": "Absolute or relative path of the file to read.",
            },
        },
        "required": ["path"],
    }

    async def execute(self, args: dict[str, Any]) -> ToolResult:
        path_str: str = args.get("path", "")
        try:
            content = Path(path_str).read_text(encoding="utf-8")
            return ToolResult(tool_call_id="", output=content)
        except FileNotFoundError:
            return ToolResult(
                tool_call_id="",
                output=f"File not found: {path_str}",
                is_error=True,
            )
        except PermissionError:
            return ToolResult(
                tool_call_id="",
                output=f"Permission denied: {path_str}",
                is_error=True,
            )
        except Exception as exc:  # noqa: BLE001
            return ToolResult(tool_call_id="", output=str(exc), is_error=True)
