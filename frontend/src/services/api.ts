import type { SSEEventData } from '@/types'
import { z } from 'zod'
import {
  CatalogGroupSchema, ModelSchema, ProviderSchema, TestResultSchema, parseResponse,
} from '@/lib/schemas'

const BASE = '/api'

/**
 * Create a chat session, returns { session_id, persist_id }.
 */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; image: { media_type: string; data: string } }

export async function createChat(
  messages: { role: string; content: string | ContentPart[] }[],
  provider = 'mock',
  model = 'mock-1',
  persistId?: string,
  projectPath?: string,
  autoEdits = false,
): Promise<{ session_id: string; persist_id: string }> {
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // project_path lets the backend add that project's rules to the prompt;
    // auto_edits lets file edits inside the project run without a confirmation
    body: JSON.stringify({
      messages, provider, model, persist_id: persistId ?? '', project_path: projectPath ?? '', auto_edits: autoEdits,
    }),
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
  {
    id: string
    name: string
    provider: string
    supports_tools: boolean
    supports_images: boolean
    provider_label?: string
    status: ModelTestStatus | null
  }[]
> {
  const res = await fetch(`${BASE}/models`)
  if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`)
  return parseResponse(z.array(ModelSchema), await res.json(), 'GET /api/models')
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
  custom?: boolean     // added by the user (can be removed)
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
  return parseResponse(z.array(ProviderSchema), await res.json(), 'GET /api/providers')
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

/** Saves a session's title in the backend, so it survives a reload. */
export async function renameSessionApi(sessionId: string, title: string): Promise<void> {
  const res = await fetch(`${BASE}/sessions/${encodeURIComponent(sessionId)}/title`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  if (!res.ok) throw new Error(`Failed to rename session: ${res.status}`)
}

/** Renames the project's folder on disk, and its record and sessions. Throws with the reason if refused. */
export async function renameProjectApi(id: string, name: string): Promise<ProjectData> {
  const res = await fetch(`${BASE}/projects/${encodeURIComponent(id)}/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(data.detail || `Failed: ${res.status}`)
  }
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

export async function deleteProjectApi(
  id: string,
  options: { deleteSessions?: boolean; deleteFolder?: boolean } = {},
): Promise<void> {
  const params = new URLSearchParams()
  if (options.deleteSessions) params.set('delete_sessions', 'true')
  if (options.deleteFolder) params.set('delete_folder', 'true')
  const query = params.toString() ? `?${params}` : ''
  const res = await fetch(`${BASE}/projects/${id}${query}`, { method: 'DELETE' })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.detail || `Failed to delete project: ${res.status}`)
  }
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

// ── Project file browser ──────────────────────────────────────────

export type FileNode = {
  name: string
  type: 'dir' | 'file'
  path: string  // relative to the project root; '' for the root itself
  size?: number
  children?: FileNode[] | null  // null = directory not expanded by the server
}

export type FileContent = { path: string; content: string; size: number }

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null)
  return data?.detail || `${fallback}: ${res.status}`
}

/**
 * List one directory under `root`. `dir` is relative to root ('' = root itself).
 */
export async function fetchFileTree(root: string, dir = '', depth = 1): Promise<FileNode> {
  const params = new URLSearchParams({ root, depth: String(depth) })
  if (dir) params.set('dir', dir)
  const res = await fetch(`${BASE}/files/tree?${params}`)
  if (!res.ok) throw new Error(await errorMessage(res, 'Failed to load files'))
  return await res.json()
}

export async function fetchFileContent(root: string, path: string): Promise<FileContent> {
  const params = new URLSearchParams({ root, path })
  const res = await fetch(`${BASE}/files/content?${params}`)
  if (!res.ok) throw new Error(await errorMessage(res, 'Failed to read file'))
  return await res.json()
}

/** Selects the session's file in Finder (macOS only). */
export async function revealSessionFile(sessionId: string): Promise<void> {
  const res = await fetch(`${BASE}/sessions/${encodeURIComponent(sessionId)}/reveal`, { method: 'POST' })
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not reveal session file'))
}

/** Opens the project folder in Finder (macOS only). */
export async function revealProjectFolder(projectId: string): Promise<void> {
  const res = await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/reveal`, { method: 'POST' })
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not open the folder'))
}

/** Sends one short prompt to a model. Costs a few tokens; only call on user action. */
export async function testModel(
  provider: string,
  model: string,
): Promise<{ ok: boolean; error?: string | null; ms?: number | null }> {
  const res = await fetch(`${BASE}/models/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, model }),
  })
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
  return parseResponse(TestResultSchema, await res.json(), 'POST /api/models/test')
}

// ── Model catalog & enabled models ──────────────────────────────

export type ModelTestStatus = {
  ok: boolean
  checked_at?: string
  error?: string | null
  ms?: number | null
}

export type CatalogModel = {
  id: string
  name: string
  supports_images: boolean
  enabled: boolean
  status: ModelTestStatus | null
}

export type CatalogGroup = {
  provider: string
  label: string
  models: CatalogModel[]
}

/** Every known model, grouped by provider, for the Settings page. */
export async function fetchModelCatalog(): Promise<CatalogGroup[]> {
  const res = await fetch(`${BASE}/models/catalog`)
  if (!res.ok) throw new Error(`Failed to load model catalog: ${res.status}`)
  return parseResponse(z.array(CatalogGroupSchema), await res.json(), 'GET /api/models/catalog')
}

/** Replaces the list of enabled models for one provider. */
export async function setEnabledModels(provider: string, models: string[]): Promise<void> {
  const res = await fetch(`${BASE}/models/enabled`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, models }),
  })
  if (!res.ok) throw new Error(`Failed to save models: ${res.status}`)
}

// ── User-added providers ────────────────────────────────────────

/** Adds an OpenAI-compatible provider; the backend fetches its model list. */
export async function createCustomProvider(body: {
  name: string
  base_url: string
  api_key: string
}): Promise<{ id: string; models: string[]; error: string | null }> {
  const res = await fetch(`${BASE}/providers/custom`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.detail || `Failed to add provider: ${res.status}`)
  }
  return await res.json()
}

/** Logs out of an in-app OAuth login (ChatGPT subscription). */
export async function logoutProvider(id: string): Promise<void> {
  const res = await fetch(`${BASE}/providers/${encodeURIComponent(id)}/logout`, { method: 'POST' })
  if (!res.ok) throw new Error(`Failed to log out: ${res.status}`)
}

export async function deleteCustomProvider(id: string): Promise<void> {
  const res = await fetch(`${BASE}/providers/custom/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Failed to remove provider: ${res.status}`)
}
