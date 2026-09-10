import type { SSEEventData } from '@/types'

const BASE = '/api'

/**
 * Create a chat session, returns { session_id, persist_id }.
 */
export async function createChat(
  messages: { role: string; content: string }[],
  provider = 'mock',
  model = 'mock-1',
  persistId?: string,
): Promise<{ session_id: string; persist_id: string }> {
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, provider, model, persist_id: persistId ?? '' }),
  })
  if (!res.ok) throw new Error(`Failed to create chat: ${res.status}`)
  return await res.json()
}

/**
 * Stream SSE events for a chat session.
 * Yields parsed SSEEventData objects.
 */
export async function* streamChat(
  sessionId: string,
  signal?: AbortSignal,
): AsyncGenerator<SSEEventData> {
  const res = await fetch(`${BASE}/chat/stream/${sessionId}`, { signal })
  if (!res.ok) throw new Error(`Stream failed: ${res.status}`)
  if (!res.body) throw new Error('No response body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      // Keep the last potentially incomplete line in the buffer
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data: ')) continue
        const json = trimmed.slice(6)
        if (!json) continue
        try {
          yield JSON.parse(json) as SSEEventData
        } catch {
          // Skip malformed JSON lines
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Approve or reject a tool call.
 */
export async function approveToolCall(
  sessionId: string,
  toolCallId: string,
  approved: boolean,
): Promise<void> {
  const res = await fetch(`${BASE}/tool/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      tool_call_id: toolCallId,
      approved,
    }),
  })
  if (!res.ok) throw new Error(`Failed to approve tool: ${res.status}`)
}

/**
 * Fetch all available models from the backend.
 */
export async function fetchModels(): Promise<
  { id: string; name: string; provider: string; supports_tools: boolean }[]
> {
  const res = await fetch(`${BASE}/models`)
  if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`)
  return await res.json()
}

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

// ── Provider Configuration ─────────────────────────────────────────────

export type ProviderInfo = {
  id: string
  label: string
  key_field: 'api_key' | 'base_url' | 'none'
  placeholder: string
  api_key: string      // masked
  base_url: string
  enabled: boolean
  models: string[]
  connected: boolean
  configured: boolean
  note?: string        // extra info (e.g. OAuth expiry)
  readonly?: boolean   // true for auto-detected providers like pi
}

export type TestResult = {
  ok: boolean
  latency_ms: number
  models: string[]
  error: string | null
}

/** List all providers (API keys masked). */
export async function fetchProviders(): Promise<ProviderInfo[]> {
  const res = await fetch(`${BASE}/providers`)
  if (!res.ok) throw new Error(`Failed to fetch providers: ${res.status}`)
  return await res.json()
}

/** Update a provider's api_key / base_url / enabled. */
export async function updateProvider(
  id: string,
  data: { api_key?: string; base_url?: string; enabled?: boolean },
): Promise<void> {
  const res = await fetch(`${BASE}/providers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const d = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(d.detail || `Failed: ${res.status}`)
  }
}

/** Test connection for a provider, caches model list on success. */
export async function testProvider(id: string): Promise<TestResult> {
  const res = await fetch(`${BASE}/providers/${id}/test`, { method: 'POST' })
  if (!res.ok) throw new Error(`Failed to test provider: ${res.status}`)
  return await res.json()
}

/** Get cached model list for a provider. */
export async function fetchProviderModels(id: string): Promise<string[]> {
  const res = await fetch(`${BASE}/providers/${id}/models`)
  if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`)
  return await res.json()
}

// ── Legacy API Key aliases (kept for backward compat) ──────────────────

export type ApiKeyStatus = { provider: string; configured: boolean }

// ── Session Persistence ─────────────────────────────────────────────

export type SessionSummary = {
  id: string
  title: string
  project_id: string
  created_at: string
}

export async function fetchSessions(): Promise<SessionSummary[]> {
  const res = await fetch(`${BASE}/sessions`)
  if (!res.ok) throw new Error(`Failed to fetch sessions: ${res.status}`)
  return await res.json()
}

export async function fetchSession(id: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${BASE}/sessions/${id}`)
  if (!res.ok) throw new Error(`Failed to fetch session: ${res.status}`)
  return await res.json()
}

export async function deleteSessionApi(id: string): Promise<void> {
  const res = await fetch(`${BASE}/sessions/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Failed to delete session: ${res.status}`)
}

export async function bulkDeleteSessionsApi(ids: string[]): Promise<void> {
  const res = await fetch(`${BASE}/sessions/bulk-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) throw new Error(`Failed to bulk delete sessions: ${res.status}`)
}

// ── Project Persistence ─────────────────────────────────────────────

export type ProjectData = {
  id: string
  name: string
  path: string
  created_at: string
}

export async function fetchProjects(): Promise<ProjectData[]> {
  const res = await fetch(`${BASE}/projects`)
  if (!res.ok) throw new Error(`Failed to fetch projects: ${res.status}`)
  return await res.json()
}

export async function createProjectApi(path: string, name?: string): Promise<ProjectData> {
  const res = await fetch(`${BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, name: name ?? '' }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(data.detail || `Failed: ${res.status}`)
  }
  return await res.json()
}

export async function deleteProjectApi(id: string): Promise<void> {
  const res = await fetch(`${BASE}/projects/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Failed to delete project: ${res.status}`)
}

// ── Filesystem Browse ─────────────────────────────────────────

export type BrowseResult = {
  current: string
  parent: string | null
  dirs: { name: string; path: string }[]
}

export async function browseDirs(path?: string): Promise<BrowseResult> {
  const params = path ? `?path=${encodeURIComponent(path)}` : ''
  const res = await fetch(`${BASE}/filesystem/browse${params}`)
  if (!res.ok) throw new Error(`Failed to browse: ${res.status}`)
  return await res.json()
}

// ── Execution Preview ─────────────────────────────────────────────

export async function confirmPreview(previewId: string): Promise<void> {
  const res = await fetch(`${BASE}/preview/${previewId}/confirm`, { method: 'POST' })
  if (!res.ok) throw new Error(`Failed to confirm preview: ${res.status}`)
}

export async function cancelPreview(previewId: string): Promise<void> {
  const res = await fetch(`${BASE}/preview/${previewId}/cancel`, { method: 'POST' })
  if (!res.ok) throw new Error(`Failed to cancel preview: ${res.status}`)
}

export async function mkdirApi(parent: string, name: string): Promise<string> {
  const res = await fetch(`${BASE}/filesystem/mkdir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parent, name }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(data.detail || `Failed: ${res.status}`)
  }
  const data = await res.json()
  return data.path
}
