"""
Shared fixtures for all tests.

Setup: cd backend && pip install -e ".[dev]"
This installs pytest-asyncio which is required for async tests.
asyncio_mode = "auto" is set in pyproject.toml — no need for @pytest.mark.asyncio.
"""

import pytest


@pytest.fixture(autouse=True)
def _isolated_session_storage(tmp_path, monkeypatch):
    """Keep every test's sessions and projects out of the real ~/.pi/agent.

    Chat endpoints persist a session per request, so without this each test
    run leaves new entries in the user's session list.
    """
    from app.sessions import store

    monkeypatch.setattr(store, "_BASE_DIR", tmp_path / "sessions")
    monkeypatch.setattr(store, "_PROJECTS_FILE", tmp_path / "projects.json")
