"""
Tests for the project file browser endpoints (/api/files/tree, /api/files/content).

Covers tree construction, ignore rules, lazy depth, and path-safety checks.
"""
from __future__ import annotations

import os
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture
async def client():
    from app.main import app
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c


@pytest.fixture
def project(tmp_path: Path) -> Path:
    """A project root with a secret file *outside* it, plus ignored dirs inside."""
    root = tmp_path / "project"
    (root / "src" / "components").mkdir(parents=True)
    (root / "src" / "App.tsx").write_text("export const App = () => null\n")
    (root / "src" / "components" / "ChatPanel.tsx").write_text("// chat\n")
    (root / "README.md").write_text("# readme\n")
    (root / "node_modules" / "pkg").mkdir(parents=True)
    (root / "node_modules" / "pkg" / "index.js").write_text("module.exports = {}\n")
    (root / ".git").mkdir()
    (root / ".git" / "config").write_text("[core]\n")
    (root / "__pycache__").mkdir()
    (root / "__pycache__" / "mod.cpython-311.pyc").write_bytes(b"\x00\x01")
    (root / "src" / "stale.pyc").write_bytes(b"\x00\x01")
    (root / "image.bin").write_bytes(b"\x89PNG\x00\x00binary")
    (root / "big.txt").write_bytes(b"a" * (1024 * 1024 + 1))
    (tmp_path / "secret.txt").write_text("outside the project\n")
    return root


def _names(node: dict) -> list[str]:
    return [c["name"] for c in node["children"]]


# --------------------------------------------------------------------------- #
# Tree
# --------------------------------------------------------------------------- #

async def test_tree_lists_root_dirs_before_files(client: AsyncClient, project: Path):
    r = await client.get("/api/files/tree", params={"root": str(project)})

    assert r.status_code == 200
    body = r.json()
    assert body["type"] == "dir"
    assert body["path"] == ""
    assert body["name"] == "project"
    # dirs first, then files, both alphabetical (case-insensitive)
    assert _names(body) == ["src", "big.txt", "image.bin", "README.md"]


async def test_tree_ignores_node_modules_git_pycache_and_pyc(client: AsyncClient, project: Path):
    r = await client.get("/api/files/tree", params={"root": str(project), "depth": 10})

    names = set()

    def walk(node: dict):
        names.add(node["name"])
        for c in node.get("children") or []:
            walk(c)

    walk(r.json())
    assert "node_modules" not in names
    assert ".git" not in names
    assert "__pycache__" not in names
    assert "stale.pyc" not in names
    assert "App.tsx" in names


async def test_tree_depth_controls_expansion(client: AsyncClient, project: Path):
    shallow = (await client.get("/api/files/tree", params={"root": str(project), "depth": 1})).json()
    src = next(c for c in shallow["children"] if c["name"] == "src")
    # Beyond requested depth → not expanded
    assert src["children"] is None

    deep = (await client.get("/api/files/tree", params={"root": str(project), "depth": 2})).json()
    src = next(c for c in deep["children"] if c["name"] == "src")
    components = next(c for c in src["children"] if c["name"] == "components")
    assert components["children"] is None
    assert "App.tsx" in _names(src)


async def test_tree_file_nodes_have_relative_path_and_size(client: AsyncClient, project: Path):
    r = await client.get("/api/files/tree", params={"root": str(project), "depth": 2})
    src = next(c for c in r.json()["children"] if c["name"] == "src")
    app = next(c for c in src["children"] if c["name"] == "App.tsx")

    assert app["type"] == "file"
    assert app["path"] == "src/App.tsx"
    assert app["size"] == len("export const App = () => null\n")


async def test_tree_subdir_paths_are_relative_to_root(client: AsyncClient, project: Path):
    r = await client.get(
        "/api/files/tree",
        params={"root": str(project), "dir": "src/components", "depth": 1},
    )

    assert r.status_code == 200
    body = r.json()
    assert body["path"] == "src/components"
    assert body["children"][0]["path"] == "src/components/ChatPanel.tsx"


async def test_tree_skips_symlink_escaping_root(client: AsyncClient, project: Path, tmp_path: Path):
    os.symlink(tmp_path / "secret.txt", project / "leak.txt")

    r = await client.get("/api/files/tree", params={"root": str(project), "depth": 1})

    assert "leak.txt" not in _names(r.json())


async def test_tree_missing_root_returns_400(client: AsyncClient, tmp_path: Path):
    r = await client.get("/api/files/tree", params={"root": str(tmp_path / "nope")})
    assert r.status_code == 400


async def test_tree_root_is_file_returns_400(client: AsyncClient, project: Path):
    r = await client.get("/api/files/tree", params={"root": str(project / "README.md")})
    assert r.status_code == 400


async def test_tree_subdir_is_file_returns_400(client: AsyncClient, project: Path):
    r = await client.get("/api/files/tree", params={"root": str(project), "dir": "README.md"})
    assert r.status_code == 400


# --------------------------------------------------------------------------- #
# Content
# --------------------------------------------------------------------------- #

async def test_content_returns_text(client: AsyncClient, project: Path):
    r = await client.get(
        "/api/files/content",
        params={"root": str(project), "path": "src/App.tsx"},
    )

    assert r.status_code == 200
    body = r.json()
    assert body["path"] == "src/App.tsx"
    assert body["content"] == "export const App = () => null\n"
    assert body["size"] == len(body["content"].encode())


async def test_content_rejects_parent_traversal(client: AsyncClient, project: Path):
    r = await client.get(
        "/api/files/content",
        params={"root": str(project), "path": "../secret.txt"},
    )
    assert r.status_code == 403


async def test_content_rejects_absolute_path(client: AsyncClient, project: Path, tmp_path: Path):
    r = await client.get(
        "/api/files/content",
        params={"root": str(project), "path": str(tmp_path / "secret.txt")},
    )
    assert r.status_code == 403


async def test_content_rejects_symlink_escaping_root(client: AsyncClient, project: Path, tmp_path: Path):
    os.symlink(tmp_path / "secret.txt", project / "leak.txt")

    r = await client.get(
        "/api/files/content",
        params={"root": str(project), "path": "leak.txt"},
    )
    assert r.status_code == 403


async def test_content_rejects_ignored_paths(client: AsyncClient, project: Path):
    for rel in (".git/config", "node_modules/pkg/index.js", "src/stale.pyc"):
        r = await client.get(
            "/api/files/content",
            params={"root": str(project), "path": rel},
        )
        assert r.status_code == 403, rel


async def test_content_binary_returns_415(client: AsyncClient, project: Path):
    r = await client.get(
        "/api/files/content",
        params={"root": str(project), "path": "image.bin"},
    )
    assert r.status_code == 415


async def test_content_too_large_returns_413(client: AsyncClient, project: Path):
    r = await client.get(
        "/api/files/content",
        params={"root": str(project), "path": "big.txt"},
    )
    assert r.status_code == 413


async def test_content_missing_file_returns_404(client: AsyncClient, project: Path):
    r = await client.get(
        "/api/files/content",
        params={"root": str(project), "path": "src/Missing.tsx"},
    )
    assert r.status_code == 404


async def test_content_directory_returns_404(client: AsyncClient, project: Path):
    r = await client.get(
        "/api/files/content",
        params={"root": str(project), "path": "src"},
    )
    assert r.status_code == 404
