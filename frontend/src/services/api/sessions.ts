import { parseResponse, SessionListSchema, SessionRecordsSchema, type SessionSummary } from '@/lib/schemas'
import { API_BASE } from '@/services/api/client'
import { requestError } from '@/services/api/client'

export async function fetchSessions(): Promise<SessionSummary[]> {
  const res = await fetch(`${API_BASE}/sessions`)
  if (!res.ok) throw await requestError(res, 'Failed to fetch sessions')
  return parseResponse(SessionListSchema, await res.json(), 'GET /api/sessions')
}

export async function fetchSession(id: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${API_BASE}/sessions/${id}`)
  if (!res.ok) throw await requestError(res, 'Failed to fetch session')
  return parseResponse(SessionRecordsSchema, await res.json(), 'GET /api/sessions/:id')
}

export async function deleteSessionApi(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/sessions/${id}`, { method: 'DELETE' })
  if (!res.ok) throw await requestError(res, 'Failed to delete session')
}

export async function bulkDeleteSessionsApi(ids: string[]): Promise<void> {
  const res = await fetch(`${API_BASE}/sessions/bulk-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) throw await requestError(res, 'Failed to bulk delete sessions')
}

// ── Project Persistence ─────────────────────────────────────────────

/** Saves a session's title in the backend, so it survives a reload. */
export async function renameSessionApi(sessionId: string, title: string): Promise<void> {
  const res = await fetch(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}/title`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  if (!res.ok) throw await requestError(res, 'Failed to rename session')
}

/** Cuts the saved session just before its Nth user message (0-based), so that message can be sent again. */
export async function truncateSessionApi(sessionId: string, userIndex: number): Promise<void> {
  const res = await fetch(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}/truncate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_index: userIndex }),
  })
  if (!res.ok) {
    throw await requestError(res, 'Failed to edit this session')
  }
}

/** Selects the session's file in Finder (macOS only). */
export async function revealSessionFile(sessionId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}/reveal`, { method: 'POST' })
  if (!res.ok) throw await requestError(res, 'Could not reveal session file')
}
