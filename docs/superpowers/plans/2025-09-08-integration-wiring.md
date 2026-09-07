# Integration Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the 6 independently-built modules into a working end-to-end system — inject SecurityInterceptor, skip approval flow, add smart provider fallback, and validate with integration tests + manual check.

**Architecture:** Minimal changes to existing files. Add `security_interceptor` to the global container, pass it through to AgentLoop in `chat.py`, bypass the approval branch in `core.py`, add a `/api/models/default` endpoint for smart provider selection, and update the frontend store to auto-detect the provider on startup.

**Tech Stack:** FastAPI, httpx (test client), Zustand, TypeScript

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `backend/app/container.py` | Global singleton registries | Modify: add `security_interceptor` |
| `backend/app/main.py` | App startup, registry population | Modify: initialize `security_interceptor` |
| `backend/app/api/chat.py` | Chat SSE routes | Modify: pass `security_interceptor` to AgentLoop |
| `backend/app/agent/core.py` | Agent loop | Modify: skip approval branch |
| `backend/app/api/models.py` | Models API | Modify: add `GET /api/models/default` |
| `frontend/src/services/api.ts` | API client | Modify: add `fetchDefaultModel()` |
| `frontend/src/stores/chatStore.ts` | Chat state | Modify: call `fetchDefaultModel()` on init |
| `backend/tests/test_integration.py` | Integration tests | Modify: add 2 new integration tests |

---

### Task 1: Inject SecurityInterceptor into container + AgentLoop

**Files:**
- Modify: `backend/app/container.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/api/chat.py`
- Test: `backend/tests/test_integration.py` (existing tests must still pass)

- [ ] **Step 1: Add `security_interceptor` to `container.py`**

Add the security interceptor field after the existing registries. It starts as `None` and gets set in `main.py`:

```python
"""
Global singleton registries — populated in main.py on startup.
Import here to get the shared instances; patch here in tests.
"""
from __future__ import annotations

from typing import Any

from app.models.base import ModelRouter
from app.tools.base import ToolRegistry

model_router: ModelRouter = ModelRouter()
tool_registry: ToolRegistry = ToolRegistry()
security_interceptor: Any | None = None
```

- [ ] **Step 2: Initialize `security_interceptor` in `main.py`**

Add this after the tools registration block (after `container.tool_registry.register(GitTool())`):

```python
# Security
from app.security import SecurityInterceptor  # noqa: E402
container.security_interceptor = SecurityInterceptor(project_root=os.getcwd())
```

- [ ] **Step 3: Pass `security_interceptor` to AgentLoop in `chat.py`**

In the `stream_chat` function, change the AgentLoop constructor from:

```python
    agent = AgentLoop(
        model_router=container.model_router,
        tool_registry=container.tool_registry,
    )
```

to:

```python
    agent = AgentLoop(
        model_router=container.model_router,
        tool_registry=container.tool_registry,
        security_interceptor=container.security_interceptor,
    )
```

- [ ] **Step 4: Run existing tests to verify nothing breaks**

Run: `cd backend && python -m pytest tests/ -v`
Expected: All 49 tests PASS (no new failures)

- [ ] **Step 5: Commit**

```bash
cd backend
git add app/container.py app/main.py app/api/chat.py
git commit -m "feat(integration): inject SecurityInterceptor into AgentLoop"
```

---

### Task 2: Skip approval branch in AgentLoop

**Files:**
- Modify: `backend/app/agent/core.py`
- Test: `backend/tests/test_agent_core.py` (existing tests must still pass)

- [ ] **Step 1: Comment out the approval branch in `core.py`**

In `AgentLoop.run()`, replace the approval block:

```python
                # Approval required — pause loop
                if tool.check_approval(tc.arguments):
                    yield SSEEvent(event="approval_request", data={
                        "tool_call_id": tc.tool_call_id,
                        "tool_name": tc.tool_name,
                        "arguments": tc.arguments,
                    })
                    yield SSEEvent(event="waiting_for_approval", data={
                        "tool_call_id": tc.tool_call_id,
                    })
                    paused = True
                    break
```

with:

```python
                # Approval required — SKIPPED for now (no resume mechanism).
                # When approval flow is implemented, uncomment this block:
                # if tool.check_approval(tc.arguments):
                #     yield SSEEvent(event="approval_request", data={
                #         "tool_call_id": tc.tool_call_id,
                #         "tool_name": tc.tool_name,
                #         "arguments": tc.arguments,
                #     })
                #     yield SSEEvent(event="waiting_for_approval", data={
                #         "tool_call_id": tc.tool_call_id,
                #     })
                #     paused = True
                #     break
```

- [ ] **Step 2: Run existing tests**

Run: `cd backend && python -m pytest tests/test_agent_core.py -v`
Expected: All PASS. The test for approval (`test_agent_pauses_on_approval_required`) may now fail because approval is skipped — that's expected, we'll handle it in step 3.

- [ ] **Step 3: Fix the approval test if it fails**

If `test_agent_pauses_on_approval_required` exists and fails, update it to verify that approval is now skipped and the tool auto-executes. Check the test file:

Run: `cd backend && grep -n "approval" tests/test_agent_core.py`

If the test expects `approval_request` events, update it to expect `tool_result` instead (since tools now always auto-execute). If no such test exists, skip this step.

- [ ] **Step 4: Run full test suite**

Run: `cd backend && python -m pytest tests/ -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
cd backend
git add app/agent/core.py tests/test_agent_core.py
git commit -m "feat(integration): skip approval branch — all tools auto-execute"
```

---

### Task 3: Add `GET /api/models/default` endpoint

**Files:**
- Modify: `backend/app/api/models.py`
- Modify: `backend/app/models/base.py` (expose providers list)
- Test: `backend/tests/test_integration.py`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_integration.py`:

```python
async def test_models_default_returns_mock_when_no_real_providers(client: AsyncClient):
    """With only MockProvider registered, /api/models/default returns mock."""
    r = await client.get("/api/models/default")
    assert r.status_code == 200
    body = r.json()
    assert body["provider"] == "mock"
    assert body["model"] == "mock-1"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_integration.py::test_models_default_returns_mock_when_no_real_providers -v`
Expected: FAIL with 404 (route doesn't exist yet)

- [ ] **Step 3: Expose providers dict on ModelRouter**

In `backend/app/models/base.py`, add a `providers` property to `ModelRouter`:

```python
    @property
    def providers(self) -> dict[str, ModelProvider]:
        return dict(self._providers)
```

Add this after the existing `list_models` method in the `ModelRouter` class.

- [ ] **Step 4: Implement the `/api/models/default` endpoint**

Replace the full content of `backend/app/api/models.py` with:

```python
"""
Models API routes:
  GET /api/models         → list of available models across all providers
  GET /api/models/default → first available non-mock provider + model (fallback: mock)
"""
from __future__ import annotations

from fastapi import APIRouter

import app.container as container

router = APIRouter(prefix="/api")


@router.get("/models")
async def list_models() -> list[dict]:
    """Return all registered models from all providers."""
    return [m.model_dump() for m in container.model_router.list_models()]


@router.get("/models/default")
async def get_default_model() -> dict:
    """Return the best available provider + model for new sessions.

    Priority: first non-mock provider with at least one model.
    Fallback: mock / mock-1.
    """
    for provider in container.model_router.providers.values():
        if provider.provider_name == "mock":
            continue
        models = provider.list_models()
        if models:
            return {"provider": provider.provider_name, "model": models[0].id}

    return {"provider": "mock", "model": "mock-1"}
```

- [ ] **Step 5: Run the new test**

Run: `cd backend && python -m pytest tests/test_integration.py::test_models_default_returns_mock_when_no_real_providers -v`
Expected: PASS

- [ ] **Step 6: Write test for non-mock provider priority**

Add to `backend/tests/test_integration.py`:

```python
async def test_models_default_prefers_non_mock(client: AsyncClient):
    """When a non-mock provider is registered, it takes priority."""
    from app.models.base import ModelProvider, ModelInfo, ModelRouter, MockProvider
    from typing import Any, AsyncIterator
    from app.types import TextChunk, Message

    class FakeProvider(ModelProvider):
        provider_name = "fake-cloud"

        def list_models(self) -> list[ModelInfo]:
            return [ModelInfo(id="fake-v1", name="Fake V1", provider="fake-cloud")]

        async def chat_stream(
            self, model_id: str, messages: list[Message], tools: list[dict[str, Any]],
        ) -> AsyncIterator[TextChunk]:
            yield TextChunk(content="hi")

    router = ModelRouter()
    router.register(MockProvider())
    router.register(FakeProvider())
    container.model_router = router

    r = await client.get("/api/models/default")
    assert r.status_code == 200
    body = r.json()
    assert body["provider"] == "fake-cloud"
    assert body["model"] == "fake-v1"
```

- [ ] **Step 7: Run both new tests**

Run: `cd backend && python -m pytest tests/test_integration.py::test_models_default_returns_mock_when_no_real_providers tests/test_integration.py::test_models_default_prefers_non_mock -v`
Expected: Both PASS

- [ ] **Step 8: Run full test suite**

Run: `cd backend && python -m pytest tests/ -v`
Expected: All PASS

- [ ] **Step 9: Commit**

```bash
cd backend
git add app/models/base.py app/api/models.py tests/test_integration.py
git commit -m "feat(integration): add GET /api/models/default with smart fallback"
```

---

### Task 4: Integration tests — tool execution + security blocking

**Files:**
- Modify: `backend/tests/test_integration.py`

These tests need a MockProvider that returns tool calls. We'll create a `ToolCallMockProvider` inline in the test file.

- [ ] **Step 1: Write the tool execution integration test**

Add to `backend/tests/test_integration.py`:

```python
from app.models.base import ModelProvider, ModelInfo, ModelRouter, MockProvider
from app.types import TextChunk, ToolCallChunk, Message
from app.tools.read_file import ReadFileTool
from typing import Any, AsyncIterator


class ToolCallMockProvider(ModelProvider):
    """Mock provider that requests a read_file tool call on first turn,
    then returns text on second turn."""

    provider_name = "tool-mock"
    _call_count: int = 0

    def list_models(self) -> list[ModelInfo]:
        return [ModelInfo(id="tool-mock-1", name="Tool Mock", provider="tool-mock")]

    async def chat_stream(
        self, model_id: str, messages: list[Message], tools: list[dict[str, Any]],
    ) -> AsyncIterator[TextChunk | ToolCallChunk]:
        # If there are tool results in history, respond with text
        if any(m.tool_results for m in messages if m.tool_results):
            yield TextChunk(content="File contents received. Done!")
            return
        # First call: request a tool call
        yield ToolCallChunk(
            tool_call_id="tc-int-1",
            tool_name="read_file",
            arguments={"path": "backend/pyproject.toml"},
        )


async def test_tool_execution_flow(client: AsyncClient):
    """Full flow: model requests read_file → tool executes → model responds."""
    # Register the tool-calling mock provider and the read_file tool
    router = ModelRouter()
    router.register(ToolCallMockProvider())
    container.model_router = router
    container.tool_registry = ToolRegistry()
    container.tool_registry.register(ReadFileTool())

    r = await client.post(
        "/api/chat",
        json={
            "messages": [{"role": "user", "content": "read pyproject.toml"}],
            "provider": "tool-mock",
            "model": "tool-mock-1",
        },
    )
    session_id = r.json()["session_id"]

    stream_r = await client.get(f"/api/chat/stream/{session_id}")
    events = _parse_sse_lines(stream_r.text)
    event_types = [e["event"] for e in events]

    assert "tool_call" in event_types, f"Expected tool_call event in {event_types}"
    assert "tool_result" in event_types, f"Expected tool_result event in {event_types}"
    assert events[-1]["event"] == "done", f"Last event should be done: {event_types}"

    # Verify the tool_result contains actual file content (pyproject.toml exists)
    tool_result_events = [e for e in events if e["event"] == "tool_result"]
    assert len(tool_result_events) == 1
    assert tool_result_events[0]["data"]["is_error"] is False
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_integration.py::test_tool_execution_flow -v`
Expected: PASS (since security interceptor is not set in test fixture, and approval is skipped)

- [ ] **Step 3: Write the security blocking integration test**

Add to `backend/tests/test_integration.py`:

```python
from app.security import SecurityInterceptor


class PathTraversalMockProvider(ModelProvider):
    """Mock provider that requests write_file with a path traversal attack."""

    provider_name = "attack-mock"

    def list_models(self) -> list[ModelInfo]:
        return [ModelInfo(id="attack-1", name="Attack Mock", provider="attack-mock")]

    async def chat_stream(
        self, model_id: str, messages: list[Message], tools: list[dict[str, Any]],
    ) -> AsyncIterator[TextChunk | ToolCallChunk]:
        # If there are tool results in history, stop
        if any(m.tool_results for m in messages if m.tool_results):
            yield TextChunk(content="Blocked.")
            return
        # Attempt path traversal
        yield ToolCallChunk(
            tool_call_id="tc-evil-1",
            tool_name="write_file",
            arguments={"path": "../../../etc/passwd", "content": "pwned"},
        )


async def test_security_blocks_path_traversal(client: AsyncClient):
    """SecurityInterceptor blocks a write_file with path traversal."""
    from app.tools.write_file import WriteFileTool

    router = ModelRouter()
    router.register(PathTraversalMockProvider())
    container.model_router = router

    registry = ToolRegistry()
    registry.register(WriteFileTool())
    container.tool_registry = registry

    container.security_interceptor = SecurityInterceptor(project_root=os.getcwd())

    r = await client.post(
        "/api/chat",
        json={
            "messages": [{"role": "user", "content": "write to etc passwd"}],
            "provider": "attack-mock",
            "model": "attack-1",
        },
    )
    session_id = r.json()["session_id"]

    stream_r = await client.get(f"/api/chat/stream/{session_id}")
    events = _parse_sse_lines(stream_r.text)
    event_types = [e["event"] for e in events]

    assert "security_violation" in event_types, f"Expected security_violation in {event_types}"

    violation = [e for e in events if e["event"] == "security_violation"][0]
    assert "traversal" in violation["data"]["reason"].lower()
```

- [ ] **Step 4: Add `import os` at top of test file**

Add `import os` to the imports at the top of `backend/tests/test_integration.py` (if not already present).

- [ ] **Step 5: Update the `_patch_registries` fixture to also reset `security_interceptor`**

Replace the existing `_patch_registries` fixture in `backend/tests/test_integration.py`:

```python
@pytest.fixture(autouse=True)
def _patch_registries():
    """Replace global registries with clean mock instances for every test."""
    original_router = container.model_router
    original_registry = container.tool_registry
    original_security = container.security_interceptor

    router = ModelRouter()
    router.register(MockProvider())
    container.model_router = router
    container.tool_registry = ToolRegistry()
    container.security_interceptor = None

    yield

    container.model_router = original_router
    container.tool_registry = original_registry
    container.security_interceptor = original_security
```

- [ ] **Step 6: Run both new integration tests**

Run: `cd backend && python -m pytest tests/test_integration.py::test_tool_execution_flow tests/test_integration.py::test_security_blocks_path_traversal -v`
Expected: Both PASS

- [ ] **Step 7: Run full test suite**

Run: `cd backend && python -m pytest tests/ -v`
Expected: All PASS

- [ ] **Step 8: Commit**

```bash
cd backend
git add tests/test_integration.py
git commit -m "test(integration): add tool execution + security blocking integration tests"
```

---

### Task 5: Frontend smart provider fallback

**Files:**
- Modify: `frontend/src/services/api.ts`
- Modify: `frontend/src/stores/chatStore.ts`

- [ ] **Step 1: Add `fetchDefaultModel()` to `api.ts`**

Add this function at the end of `frontend/src/services/api.ts`:

```typescript
/**
 * Fetch the recommended default provider + model from the backend.
 * Returns null if the backend is unreachable.
 */
export async function fetchDefaultModel(): Promise<{
  provider: string
  model: string
} | null> {
  try {
    const res = await fetch(`${BASE}/models/default`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Add auto-detect logic to `chatStore.ts`**

Add the import of `fetchDefaultModel` to the existing import line:

```typescript
import { createChat, streamChat, approveToolCall, fetchDefaultModel } from '@/services/api'
```

Then add an `initProvider` action to the store. Add this to the `ChatState` type:

```typescript
  initProvider: () => Promise<void>
```

And add the implementation inside the `create<ChatState>` block, after the `reset` method:

```typescript
  initProvider: async () => {
    const result = await fetchDefaultModel()
    if (result) {
      localStorage.setItem('provider', result.provider)
      localStorage.setItem('model', result.model)
      set({ provider: result.provider, model: result.model })
    }
    // If fetch fails, keep existing localStorage values (already loaded in initial state)
  },
```

- [ ] **Step 3: Call `initProvider` on app startup**

In `frontend/src/App.tsx`, add a `useEffect` to call `initProvider` once on mount. Check the current content of App.tsx first:

Run: `cat frontend/src/App.tsx`

Add at the top of the component function (inside the component, before the return):

```typescript
import { useEffect } from 'react'
import { useChatStore } from '@/stores/chatStore'

// Inside the component:
const initProvider = useChatStore((s) => s.initProvider)

useEffect(() => {
  initProvider()
}, [initProvider])
```

Adapt this to fit the existing App.tsx structure — the `useEffect` must run once on mount.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/services/api.ts src/stores/chatStore.ts src/App.tsx
git commit -m "feat(frontend): smart provider fallback via /api/models/default"
```

---

### Task 6: Manual end-to-end verification

**Files:** None (manual testing only)

- [ ] **Step 1: Start the backend**

```bash
cd backend && uvicorn app.main:app --port 8000 --reload
```

Expected: Server starts, logs show registered providers (mock + any configured real providers).

- [ ] **Step 2: Verify `/api/models/default` in browser or curl**

```bash
curl http://localhost:8000/api/models/default
```

Expected: JSON with `provider` and `model` fields. If you have `DEEPSEEK_API_KEY` or `ANTHROPIC_API_KEY` set, it should return that provider. Otherwise `{"provider": "mock", "model": "mock-1"}`.

- [ ] **Step 3: Start the frontend**

```bash
cd frontend && npm run dev
```

Expected: Vite dev server starts on `http://localhost:5173`.

- [ ] **Step 4: Verify smart provider selection**

Open `http://localhost:5173` in browser. Open DevTools Network tab. Look for:
1. A request to `/api/models/default` on page load
2. The store should update to the returned provider

- [ ] **Step 5: Send a test message**

Type a message and send. Verify:
1. Message appears in the chat
2. Streaming response arrives (text appears token by token)
3. If using mock provider: response is "Mock response to: <your message>"
4. No errors in browser console or backend terminal

- [ ] **Step 6: Verify tool execution (if using real provider)**

If using a real provider (Claude/DeepSeek), ask it to "read the file backend/pyproject.toml". Verify:
1. A ToolCallCard appears showing `read_file`
2. Tool executes automatically (no approval prompt)
3. ToolResult appears with the file content
4. Model continues responding with a summary

If using mock provider, tool execution won't trigger (mock doesn't return tool calls). This is expected — the integration test in Task 4 already validated this path.

- [ ] **Step 7: Commit verification note**

```bash
git add -A
git commit -m "chore(integration): manual e2e verification complete"
```
