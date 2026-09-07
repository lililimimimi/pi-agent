"""WriteFileTool — writes content to a file. Requires user approval."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from app.tools.base import Tool
from app.types import ToolResult


class WriteFileTool(Tool):
    name = "write_file"
    description = "Write (or overwrite) text content to a file on disk."
    requires_approval = True
    parameters = {
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": "Absolute or relative path of the file to write.",
            },
            "content": {
                "type": "string",
                "description": "Text content to write to the file.",
            },
        },
        "required": ["path", "content"],
    }

    async def execute(self, args: dict[str, Any]) -> ToolResult:
        path_str: str = args.get("path", "")
        content: str = args.get("content", "")
        try:
            p = Path(path_str)
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content, encoding="utf-8")
            return ToolResult(
                tool_call_id="",
                output=f"Wrote {len(content)} bytes to {path_str}",
            )
        except PermissionError:
            return ToolResult(
                tool_call_id="",
                output=f"Permission denied: {path_str}",
                is_error=True,
            )
        except Exception as exc:  # noqa: BLE001
            return ToolResult(tool_call_id="", output=str(exc), is_error=True)
