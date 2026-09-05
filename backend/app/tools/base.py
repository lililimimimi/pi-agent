from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from app.types import ToolResult


class Tool(ABC):
    name: str
    description: str
    parameters: dict[str, Any]
    requires_approval: bool = False

    def check_approval(self, args: dict[str, Any]) -> bool:
        """Return True if this specific call needs user approval.
        Override for dynamic logic (e.g. GitTool varies by operation).
        Defaults to the class-level requires_approval flag.
        """
        return self.requires_approval

    @abstractmethod
    async def execute(self, args: dict[str, Any]) -> ToolResult: ...


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        self._tools[tool.name] = tool

    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    def get_all(self) -> list[Tool]:
        return list(self._tools.values())

    def get_schemas(self) -> list[dict[str, Any]]:
        return [
            {
                "name": t.name,
                "description": t.description,
                "input_schema": t.parameters,
            }
            for t in self._tools.values()
        ]
