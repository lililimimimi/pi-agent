"""
RulesEngine — builds the rules text injected into the agent's system prompt.

Order (later entries take precedence):
  1. global workflow rules        (always)
  2. React / TypeScript rules     (when the project uses React)
  3. FastAPI / Python rules       (when the project uses FastAPI)
  4. project rules                (<project>/.assistant/rules.md, highest priority)

Missing files are skipped. Each rules file is a skill file with YAML frontmatter;
the frontmatter is removed before injection.
"""
from __future__ import annotations

import os
import re
from pathlib import Path

from app.rules.detector import StackDetector

_FRONTMATTER = re.compile(r"\A---\r?\n.*?\r?\n---\r?\n", re.S)
PROJECT_RULES_PATH = Path(".assistant") / "rules.md"


def default_rules_dir() -> Path:
    """Repository skills directory: <repo>/.pi/skills (override with RULES_DIR)."""
    override = os.getenv("RULES_DIR")
    if override:
        return Path(override)
    return Path(__file__).resolve().parents[3] / ".pi" / "skills"


def _strip_frontmatter(text: str) -> str:
    return _FRONTMATTER.sub("", text, count=1).strip()


def _load(path: Path) -> str | None:
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None
    body = _strip_frontmatter(text)
    return body or None


class RulesEngine:
    def __init__(self, rules_dir: Path | None = None) -> None:
        self._dir = rules_dir or default_rules_dir()

    def build_rules(self, project_path: str = "") -> str:
        parts: list[str] = []

        def add(path: Path) -> None:
            body = _load(path)
            if body:
                parts.append(body)

        add(self._dir / "my-workflow" / "SKILL.md")

        stack = StackDetector.detect(project_path) if project_path else set()
        if "react" in stack:
            add(self._dir / "react-typescript" / "SKILL.md")
        if "fastapi" in stack:
            add(self._dir / "fastapi-python" / "SKILL.md")

        if project_path:
            add(Path(project_path).expanduser() / PROJECT_RULES_PATH)

        return "\n\n---\n\n".join(parts)
