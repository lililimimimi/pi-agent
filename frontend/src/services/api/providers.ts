import { API_BASE, requestError } from '@/services/api/client'
import { z } from 'zod'
import { ProviderSchema, parseResponse } from '@/lib/schemas'

export type ProviderInfo = {
  id: string
  label: string
  key_field: 'api_key' | 'base_url' | 'none'
  placeholder: string
  api_key: string // masked
  base_url: string
  enabled: boolean
  models: string[]
  connected: boolean
  configured: boolean
  note?: string // extra info (e.g. OAuth expiry)
  readonly?: boolean // true for auto-detected providers like pi
  custom?: boolean // added by the user (can be removed)
}

export type TestResult = {
  ok: boolean
  latency_ms: number
  models: string[]
  error: string | null
}

/** List all providers (API keys masked). */
export async function fetchProviders(): Promise<ProviderInfo[]> {
  const res = await fetch(`${API_BASE}/providers`)
  if (!res.ok) throw await requestError(res, 'Failed to fetch providers')
  return parseResponse(z.array(ProviderSchema), await res.json(), 'GET /api/providers')
}

/** Update a provider's api_key / base_url / enabled. */
export async function updateProvider(
  id: string,
  data: { api_key?: string; base_url?: string; enabled?: boolean },
): Promise<void> {
  const res = await fetch(`${API_BASE}/providers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    throw await requestError(res, 'Failed')
  }
}

/** Test connection for a provider, caches model list on success. */
export async function testProvider(id: string): Promise<TestResult> {
  const res = await fetch(`${API_BASE}/providers/${id}/test`, { method: 'POST' })
  if (!res.ok) throw await requestError(res, 'Failed to test provider')
  return await res.json()
}

/** Get cached model list for a provider. */
export async function fetchProviderModels(id: string): Promise<string[]> {
  const res = await fetch(`${API_BASE}/providers/${id}/models`)
  if (!res.ok) throw await requestError(res, 'Failed to fetch models')
  return await res.json()
}

// ── Legacy API Key aliases (kept for backward compat) ──────────────────

export type ApiKeyStatus = { provider: string; configured: boolean }

// ── Session Persistence ─────────────────────────────────────────────

/** Adds an OpenAI-compatible provider; the backend fetches its model list. */
export async function createCustomProvider(body: {
  name: string
  base_url: string
  api_key: string
}): Promise<{ id: string; models: string[]; error: string | null }> {
  const res = await fetch(`${API_BASE}/providers/custom`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw await requestError(res, 'Failed to add provider')
  }
  return await res.json()
}

/** Logs out of an in-app OAuth login (ChatGPT subscription). */
export async function logoutProvider(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/providers/${encodeURIComponent(id)}/logout`, { method: 'POST' })
  if (!res.ok) throw await requestError(res, 'Failed to log out')
}

export async function deleteCustomProvider(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/providers/custom/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) throw await requestError(res, 'Failed to remove provider')
}
