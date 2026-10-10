export type { BrowseResult, ProjectData } from '@/lib/schemas'
import {
  BrowseResultSchema,
  ProjectListSchema,
  ProjectSchema,
  parseResponse,
  type BrowseResult,
  type ProjectData,
} from '@/lib/schemas'
import { API_BASE } from '@/services/api/client'
import { requestError } from '@/services/api/client'

export async function fetchProjects(): Promise<ProjectData[]> {
  const res = await fetch(`${API_BASE}/projects`)
  if (!res.ok) throw await requestError(res, 'Failed to fetch projects')
  return parseResponse(ProjectListSchema, await res.json(), 'GET /api/projects')
}

/** Renames the project's folder on disk, and its record and sessions. Throws with the reason if refused. */
export async function renameProjectApi(id: string, name: string): Promise<ProjectData> {
  const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(id)}/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    throw await requestError(res, 'Failed')
  }
  return parseResponse(ProjectSchema, await res.json(), 'POST /api/projects/:id/rename')
}

export async function createProjectApi(path: string, name?: string): Promise<ProjectData> {
  const res = await fetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, name: name ?? '' }),
  })
  if (!res.ok) {
    throw await requestError(res, 'Failed')
  }
  return parseResponse(ProjectSchema, await res.json(), 'POST /api/projects')
}

export async function deleteProjectApi(
  id: string,
  options: { deleteSessions?: boolean; deleteFolder?: boolean } = {},
): Promise<void> {
  const params = new URLSearchParams()
  if (options.deleteSessions) params.set('delete_sessions', 'true')
  if (options.deleteFolder) params.set('delete_folder', 'true')
  const query = params.toString() ? `?${params}` : ''
  const res = await fetch(`${API_BASE}/projects/${id}${query}`, { method: 'DELETE' })
  if (!res.ok) {
    throw await requestError(res, 'Failed to delete project')
  }
}

// ── Filesystem Browse ─────────────────────────────────────────

export async function browseDirs(path?: string): Promise<BrowseResult> {
  const params = path ? `?path=${encodeURIComponent(path)}` : ''
  const res = await fetch(`${API_BASE}/filesystem/browse${params}`)
  if (!res.ok) throw await requestError(res, 'Failed to browse')
  return parseResponse(BrowseResultSchema, await res.json(), 'GET /api/filesystem/browse')
}

// ── Execution Preview ─────────────────────────────────────────────

export async function mkdirApi(parent: string, name: string): Promise<string> {
  const res = await fetch(`${API_BASE}/filesystem/mkdir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parent, name }),
  })
  if (!res.ok) {
    throw await requestError(res, 'Failed')
  }
  const data = await res.json()
  return data.path
}

// ── Project file browser ──────────────────────────────────────────

/** Opens the project folder in Finder (macOS only). */
export async function revealProjectFolder(projectId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(projectId)}/reveal`, { method: 'POST' })
  if (!res.ok) throw await requestError(res, 'Could not open the folder')
}
