"""
StackDetector — works out which technologies a project uses from its manifest files.

Only the manifests are read; nothing is executed.
"""

from __future__ import annotations

import json
from pathlib import Path


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return ""


class StackDetector:
    @staticmethod
    def detect(project_path: str) -> set[str]:
        root = Path(project_path).expanduser()
        stack: set[str] = set()

        package_json = root / "package.json"
        if package_json.is_file():
            try:
                data = json.loads(_read(package_json) or "{}")
            except json.JSONDecodeError:
                data = {}
            deps = {**data.get("dependencies", {}), **data.get("devDependencies", {})}
            if "react" in deps:
                stack.add("react")

        for name in ("pyproject.toml", "requirements.txt"):
            if "fastapi" in _read(root / name).lower():
                stack.add("fastapi")
                break

        return stack
