"""Config and session files: written atomically, readable only by their owner."""

from __future__ import annotations

import json
import stat

from app import fileio
from app.config import store as config_store


def test_write_text_atomic_creates_owner_only_file(tmp_path):
    target = tmp_path / "data.json"

    fileio.write_text_atomic(target, '{"a": 1}')

    assert target.read_text(encoding="utf-8") == '{"a": 1}'
    assert stat.S_IMODE(target.stat().st_mode) == 0o600


def test_write_text_atomic_replaces_old_content_and_leaves_no_temp_files(tmp_path):
    target = tmp_path / "data.json"
    fileio.write_text_atomic(target, "old")

    fileio.write_text_atomic(target, "new")

    assert target.read_text(encoding="utf-8") == "new"
    assert sorted(p.name for p in tmp_path.iterdir()) == ["data.json"]


def test_save_config_keeps_api_keys_owner_only(tmp_path, monkeypatch):
    target = tmp_path / "config.json"
    monkeypatch.setattr(config_store, "_config_path", lambda: target)
    monkeypatch.setattr(config_store, "_ensure_dir", lambda: None)
    target.write_text("{}", encoding="utf-8")
    target.chmod(0o644)  # the mode an existing config file may still have

    config_store.save_config({"providers": {"x": {"api_key": "sk-secret"}}})

    assert stat.S_IMODE(target.stat().st_mode) == 0o600
    assert (
        json.loads(target.read_text(encoding="utf-8"))["providers"]["x"]["api_key"]
        == "sk-secret"
    )
