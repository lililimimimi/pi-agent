"""
Session & project persistence using JSONL files.

Storage layout:
  ~/.pi/agent/sessions/<uuid>.jsonl
  ~/.pi/agent/projects.json
"""
from __future__ import annotations

import json
import os
import uuid
from pathlib import Path

from app.sessions.models import (
    MessageRecord,
    Project,
    SessionMeta,
    SessionRecord,
    SessionSummary,
    ToolCallRecord,
    ToolResultRecord,
)

# ── Defaults ───────────────────────────────────────────────────────────────────

_BASE_DIR = Path(os.getenv("PI_SESSIONS_DIR", Path.home() / ".pi" / "agent" / "sessions"))
_PROJECTS_FILE = Path(os.getenv("PI_PROJECTS_FILE", Path.home() / ".pi" / "agent" / "projects.json"))


def _sessions_dir() -> Path:
    _BASE_DIR.mkdir(parents=True, exist_ok=True)
    return _BASE_DIR


def _projects_path() -> Path:
    _PROJECTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    return _PROJECTS_FILE


# ── Session CRUD ───────────────────────────────────────────────────────────────

def create_session(title: str = "", project_id: str = "") -> SessionMeta:
    """Create a new session file with a meta record. Returns the meta."""
    sid = str(uuid.uuid4())
    meta = SessionMeta(id=sid, title=title, project_id=project_id)
    path = _sessions_dir() / f"{sid}.jsonl"
    path.write_text(meta.model_dump_json() + "\n", encoding="utf-8")
    return meta


def append_record(session_id: str, record: SessionRecord) -> None:
    """Append a record (message / tool_call / tool_result) to a session file."""
    path = _sessions_dir() / f"{session_id}.jsonl"
    if not path.exists():
        raise FileNotFoundError(f"Session '{session_id}' not found")
    with path.open("a", encoding="utf-8") as f:
        f.write(record.model_dump_json() + "\n")


def update_title(session_id: str, title: str) -> None:
    """Update the title in the meta (first line) of a session file."""
    path = _sessions_dir() / f"{session_id}.jsonl"
    if not path.exists():
        raise FileNotFoundError(f"Session '{session_id}' not found")
    lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
    if not lines:
        return
    meta = json.loads(lines[0])
    meta["title"] = title
    lines[0] = json.dumps(meta, ensure_ascii=False) + "\n"
    path.write_text("".join(lines), encoding="utf-8")


# ── Pi native session helpers ──────────────────────────────────────────────────


def _extract_pi_text(content) -> str:
    """Extract plain text from Pi native content array or string."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(item.get("text", ""))
        return "\n".join(parts)
    return str(content)


def _read_first_n_lines(path: Path, n: int) -> list[str]:
    """Read up to *n* lines from a file efficiently."""
    lines: list[str] = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            stripped = line.strip()
            if stripped:
                lines.append(stripped)
            if len(lines) >= n:
                break
    return lines


def _find_pi_native_session(session_id: str) -> Path | None:
    """Find a Pi native session file by session id across all project sub-dirs."""
    d = _sessions_dir()
    for subdir in d.glob("--*--"):
        if not subdir.is_dir():
            continue
        for f in subdir.glob("*.jsonl"):
            try:
                with f.open(encoding="utf-8") as fh:
                    first_line = fh.readline().strip()
                if not first_line:
                    continue
                meta = json.loads(first_line)
                if meta.get("type") == "session" and meta.get("id") == session_id:
                    return f
            except (json.JSONDecodeError, KeyError):
                continue
    return None


def _parse_pi_native_summary(path: Path) -> SessionSummary | None:
    """Parse a Pi native session file into a SessionSummary (reads ≤20 lines)."""
    lines = _read_first_n_lines(path, 20)
    if not lines:
        return None

    first = json.loads(lines[0])
    if first.get("type") != "session":
        return None

    sid = first.get("id", "")
    created_at = first.get("timestamp", "")
    project_id = first.get("cwd", "")

    # Try to get title from session_info (line 2)
    title = ""
    if len(lines) > 1:
        try:
            second = json.loads(lines[1])
            if second.get("type") == "session_info":
                title = second.get("name", "") or ""
        except json.JSONDecodeError:
            pass

    # If title is still empty, use first user message (up to 20 chars)
    if not title:
        for raw in lines[1:]:
            try:
                row = json.loads(raw)
                if (
                    row.get("type") == "message"
                    and isinstance(row.get("message"), dict)
                    and row["message"].get("role") == "user"
                ):
                    text = _extract_pi_text(row["message"].get("content", ""))
                    title = text[:20]
                    break
            except json.JSONDecodeError:
                continue

    return SessionSummary(
        id=sid,
        title=title,
        project_id=project_id,
        created_at=created_at,
    )


# ── Session CRUD (read path supports Pi native format) ─────────────────────────


def list_sessions() -> list[SessionSummary]:
    """List all sessions (ours + Pi native), sorted by created_at descending."""
    summaries: list[SessionSummary] = []
    d = _sessions_dir()

    # Our own sessions
    for f in d.glob("*.jsonl"):
        try:
            with f.open(encoding="utf-8") as fh:
                first_line = fh.readline().strip()
            if not first_line:
                continue
            meta = json.loads(first_line)
            if meta.get("type") != "meta":
                continue
            summaries.append(SessionSummary(
                id=meta["id"],
                title=meta.get("title", ""),
                project_id=meta.get("project_id", ""),
                created_at=meta.get("created_at", ""),
            ))
        except (json.JSONDecodeError, KeyError):
            continue

    # Pi native sessions (sub-directories matching --*--)
    for subdir in d.glob("--*--"):
        if not subdir.is_dir():
            continue
        for f in subdir.glob("*.jsonl"):
            try:
                summary = _parse_pi_native_summary(f)
                if summary:
                    summaries.append(summary)
            except (json.JSONDecodeError, KeyError):
                continue

    summaries.sort(key=lambda s: s.created_at, reverse=True)
    return summaries


def session_file(session_id: str) -> Path | None:
    """Path of the session file on disk, in our format or Pi's native layout."""
    own = _sessions_dir() / f"{session_id}.jsonl"
    if own.exists():
        return own
    return _find_pi_native_session(session_id)


def get_session(session_id: str) -> list[dict]:
    """Read all records from a session file. Returns list of raw dicts.

    Checks our own format first, then falls back to Pi native format.
    """
    # Our own format
    path = _sessions_dir() / f"{session_id}.jsonl"
    if path.exists():
        records: list[dict] = []
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            records.append(json.loads(line))
        return records

    # Pi native format
    pi_path = _find_pi_native_session(session_id)
    if pi_path is None:
        raise FileNotFoundError(f"Session '{session_id}' not found")

    _SKIP_TYPES = {"session", "session_info", "model_change", "thinking_level_change"}
    records = []
    for line in pi_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue

        row_type = row.get("type", "")
        if row_type in _SKIP_TYPES:
            continue

        if row_type == "message" and isinstance(row.get("message"), dict):
            msg = row["message"]
            role = msg.get("role", "")
            if role == "toolResult":
                continue
            text = _extract_pi_text(msg.get("content", ""))
            records.append({
                "type": "message",
                "role": role,
                "content": text,
            })

    return records


def delete_session(session_id: str) -> None:
    """Delete a session file (our format or Pi native)."""
    # Our own format
    path = _sessions_dir() / f"{session_id}.jsonl"
    if path.exists():
        path.unlink()
        return
    # Pi native format (lives in --*-- subdir)
    pi_path = _find_pi_native_session(session_id)
    if pi_path and pi_path.exists():
        pi_path.unlink()


def bulk_delete_sessions(session_ids: list[str]) -> dict[str, str]:
    """Delete multiple sessions. Returns {id: 'ok'|'not_found'} for each."""
    results: dict[str, str] = {}
    for sid in session_ids:
        try:
            delete_session(sid)
            results[sid] = "ok"
        except Exception:
            results[sid] = "error"
    return results


# ── Project CRUD ───────────────────────────────────────────────────────────────

def _load_projects() -> list[dict]:
    path = _projects_path()
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, ValueError):
        return []


def _save_projects(projects: list[dict]) -> None:
    path = _projects_path()
    path.write_text(json.dumps(projects, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def create_project(name: str, dir_path: str) -> Project:
    """Create a project. Validates that dir_path exists."""
    if not os.path.isdir(dir_path):
        raise NotADirectoryError(f"Path does not exist or is not a directory: {dir_path}")
    projects = _load_projects()
    project = Project(id=str(uuid.uuid4()), name=name, path=dir_path)
    projects.append(project.model_dump())
    _save_projects(projects)
    return project


def list_projects() -> list[Project]:
    return [Project(**p) for p in _load_projects()]


def get_project(project_id: str) -> Project:
    for p in _load_projects():
        if p["id"] == project_id:
            return Project(**p)
    raise FileNotFoundError(f"Project '{project_id}' not found")


def delete_project(project_id: str) -> None:
    projects = _load_projects()
    filtered = [p for p in projects if p["id"] != project_id]
    if len(filtered) == len(projects):
        raise FileNotFoundError(f"Project '{project_id}' not found")
    _save_projects(filtered)


def _project_of_file(path: Path) -> str:
    """Project path recorded in a session file's meta line ('' if unreadable)."""
    try:
        with path.open(encoding="utf-8") as fh:
            meta = json.loads(fh.readline() or "{}")
    except (OSError, json.JSONDecodeError):
        return ""
    return meta.get("project_id", "") or ""


def delete_project_sessions(project_path: str) -> int:
    """Delete every session that belongs to a project folder.

    Covers our own files (project_id = path) and Pi's per-folder directory
    (--<path with / as ->--). Returns the number of session files removed.
    """
    if not project_path:
        return 0
    d = _sessions_dir()
    removed = 0
    for f in d.glob("*.jsonl"):
        if _project_of_file(f) == project_path:
            f.unlink()
            removed += 1
    native_dir = d / ("--" + project_path.strip("/").replace("/", "-") + "--")
    if native_dir.is_dir():
        for f in native_dir.glob("*.jsonl"):
            f.unlink()
            removed += 1
        try:
            native_dir.rmdir()  # only removes it when empty
        except OSError:
            pass
    return removed

