export type { FileContent, FileNode } from '@/lib/schemas'
import {
  FileContentSchema,
  FileNodeSchema,
  parseResponse,
  type FileContent,
  type FileNode,
} from '@/lib/schemas'
import { API_BASE } from '@/services/api/client'
import { requestError } from '@/services/api/client'

/**
 * List one directory under `root`. `dir` is relative to root ('' = root itself).
 */
export async function fetchFileTree(root: string, dir = '', depth = 1): Promise<FileNode> {
  const params = new URLSearchParams({ root, depth: String(depth) })
  if (dir) params.set('dir', dir)
  const res = await fetch(`${API_BASE}/files/tree?${params}`)
  if (!res.ok) throw await requestError(res, 'Failed to load files')
  return parseResponse(FileNodeSchema, await res.json(), 'GET /api/files/tree')
}

export async function fetchFileContent(root: string, path: string): Promise<FileContent> {
  const params = new URLSearchParams({ root, path })
  const res = await fetch(`${API_BASE}/files/content?${params}`)
  if (!res.ok) throw await requestError(res, 'Failed to read file')
  return parseResponse(FileContentSchema, await res.json(), 'GET /api/files/content')
}
