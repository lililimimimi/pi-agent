"""
Tests for stack detection and rules assembly.

Uses temporary rules and project directories, so the real .pi/skills files
are not needed for these tests.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.rules.detector import StackDetector
from app.rules.engine import RulesEngine


def _skill(rules_dir: Path, name: str, body: str) -> None:
    folder = rules_dir / name
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "SKILL.md").write_text(
        f"---\nname: {name}\ndescription: test\n---\n\n{body}\n",
        encoding="utf-8",
    )


@pytest.fixture
def rules_dir(tmp_path: Path) -> Path:
    d = tmp_path / "skills"
    _skill(d, "my-workflow", "GLOBAL-WORKFLOW")
    _skill(d, "react-typescript", "REACT-RULES")
    _skill(d, "fastapi-python", "FASTAPI-RULES")
    return d


@pytest.fixture
def project(tmp_path: Path) -> Path:
    p = tmp_path / "project"
    p.mkdir()
    return p


def _write_package_json(project: Path, deps: dict | None = None, dev: dict | None = None) -> None:
    (project / "package.json").write_text(
        json.dumps({"dependencies": deps or {}, "devDependencies": dev or {}}),
        encoding="utf-8",
    )


# --------------------------------------------------------------------------- #
# StackDetector
# --------------------------------------------------------------------------- #

def test_detects_react_from_package_json_dependencies(project: Path):
    _write_package_json(project, deps={"react": "^19.0.0"})
    assert StackDetector.detect(str(project)) == {"react"}


def test_detects_react_from_dev_dependencies(project: Path):
    _write_package_json(project, dev={"react": "^19.0.0"})
    assert StackDetector.detect(str(project)) == {"react"}


def test_detects_fastapi_from_pyproject(project: Path):
    (project / "pyproject.toml").write_text('dependencies = ["fastapi>=0.115"]\n', encoding="utf-8")
    assert StackDetector.detect(str(project)) == {"fastapi"}


def test_detects_fastapi_from_requirements(project: Path):
    (project / "requirements.txt").write_text("FastAPI==0.115.0\n", encoding="utf-8")
    assert StackDetector.detect(str(project)) == {"fastapi"}


def test_detects_both_stacks(project: Path):
    _write_package_json(project, deps={"react": "^19.0.0"})
    (project / "requirements.txt").write_text("fastapi\n", encoding="utf-8")
    assert StackDetector.detect(str(project)) == {"react", "fastapi"}


def test_empty_project_has_no_stack(project: Path):
    assert StackDetector.detect(str(project)) == set()


def test_malformed_package_json_is_ignored(project: Path):
    (project / "package.json").write_text("{not json", encoding="utf-8")
    assert StackDetector.detect(str(project)) == set()


# --------------------------------------------------------------------------- #
# RulesEngine
# --------------------------------------------------------------------------- #

def test_global_rules_always_load(rules_dir: Path, project: Path):
    text = RulesEngine(rules_dir).build_rules(str(project))
    assert text == "GLOBAL-WORKFLOW"


def test_single_stack_adds_its_rules(rules_dir: Path, project: Path):
    _write_package_json(project, deps={"react": "^19.0.0"})
    text = RulesEngine(rules_dir).build_rules(str(project))
    assert text == "GLOBAL-WORKFLOW\n\n---\n\nREACT-RULES"


def test_dual_stack_adds_both_in_order(rules_dir: Path, project: Path):
    _write_package_json(project, deps={"react": "^19.0.0"})
    (project / "requirements.txt").write_text("fastapi\n", encoding="utf-8")
    text = RulesEngine(rules_dir).build_rules(str(project))
    assert text == "GLOBAL-WORKFLOW\n\n---\n\nREACT-RULES\n\n---\n\nFASTAPI-RULES"


def test_frontmatter_is_removed(rules_dir: Path, project: Path):
    text = RulesEngine(rules_dir).build_rules(str(project))
    assert "name: my-workflow" not in text
    assert "description:" not in text


def test_project_rules_come_last_and_win(rules_dir: Path, project: Path):
    _write_package_json(project, deps={"react": "^19.0.0"})
    (project / ".assistant").mkdir()
    (project / ".assistant" / "rules.md").write_text("PROJECT-OVERRIDE", encoding="utf-8")

    text = RulesEngine(rules_dir).build_rules(str(project))

    assert text.endswith("PROJECT-OVERRIDE")
    assert text.index("REACT-RULES") < text.index("PROJECT-OVERRIDE")


def test_missing_stack_rule_file_is_skipped(rules_dir: Path, project: Path):
    _write_package_json(project, deps={"react": "^19.0.0"})
    (rules_dir / "react-typescript" / "SKILL.md").unlink()

    text = RulesEngine(rules_dir).build_rules(str(project))

    assert text == "GLOBAL-WORKFLOW"


def test_no_rules_directory_returns_empty_string(tmp_path: Path, project: Path):
    text = RulesEngine(tmp_path / "does-not-exist").build_rules(str(project))
    assert text == ""


def test_no_project_path_skips_project_and_detection(rules_dir: Path):
    text = RulesEngine(rules_dir).build_rules("")
    assert text == "GLOBAL-WORKFLOW"


# --------------------------------------------------------------------------- #
# Wiring: chat request → bridge request
# --------------------------------------------------------------------------- #

async def test_chat_forwards_rules_for_the_project_to_the_bridge(
    rules_dir: Path, project: Path, monkeypatch
):
    from unittest.mock import AsyncMock, MagicMock, patch
    from httpx import ASGITransport, AsyncClient

    from app.main import app

    _write_package_json(project, deps={"react": "^19.0.0"})
    monkeypatch.setenv("RULES_DIR", str(rules_dir))

    class _Resp:
        status_code = 200

        async def aiter_lines(self):
            yield 'data: {"event": "done", "data": {}}'

    class _Stream:
        async def __aenter__(self):
            return _Resp()

        async def __aexit__(self, *exc):
            return False

    captured: dict = {}
    fake = AsyncMock()
    fake.__aenter__ = AsyncMock(return_value=fake)
    fake.__aexit__ = AsyncMock(return_value=False)

    def _stream(method, url, json):
        captured["json"] = json
        return _Stream()

    fake.stream = MagicMock(side_effect=_stream)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.post(
            "/api/chat",
            json={
                "messages": [{"role": "user", "content": "hi"}],
                "provider": "deepseek",
                "model": "deepseek-v4-flash",
                "project_path": str(project),
            },
        )
        session_id = r.json()["session_id"]
        with patch("app.api.chat.httpx.AsyncClient", return_value=fake):
            await client.get(f"/api/chat/stream/{session_id}")

    assert "REACT-RULES" in captured["json"]["rules"]
    assert captured["json"]["rules"].startswith("GLOBAL-WORKFLOW")
    assert captured["json"]["cwd"] == str(project)


async def test_new_session_remembers_its_project_folder(rules_dir: Path, project: Path, monkeypatch):
    from httpx import ASGITransport, AsyncClient
    from app.main import app
    from app.sessions import store as session_store

    monkeypatch.setenv("RULES_DIR", str(rules_dir))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.post(
            "/api/chat",
            json={
                "messages": [{"role": "user", "content": "hello project"}],
                "provider": "deepseek",
                "model": "deepseek-v4-flash",
                "project_path": str(project),
            },
        )

    persist_id = r.json()["persist_id"]
    listed = {s.id: s for s in session_store.list_sessions()}
    assert listed[persist_id].project_id == str(project)
