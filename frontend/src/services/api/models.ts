import { API_BASE, requestError } from '@/services/api/client'
import { z } from 'zod'
import { CatalogGroupSchema, ModelSchema, TestResultSchema, parseResponse } from '@/lib/schemas'

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
  const res = await fetch(`${API_BASE}/models`)
  if (!res.ok) throw await requestError(res, 'Failed to fetch models')
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
    const res = await fetch(`${API_BASE}/models/default`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// ── Provider Configuration ─────────────────────────────────────────────

/** Sends one short prompt to a model. Costs a few tokens; only call on user action. */
export async function testModel(
  provider: string,
  model: string,
): Promise<{ ok: boolean; error?: string | null; ms?: number | null }> {
  const res = await fetch(`${API_BASE}/models/test`, {
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
  const res = await fetch(`${API_BASE}/models/catalog`)
  if (!res.ok) throw await requestError(res, 'Failed to load model catalog')
  return parseResponse(z.array(CatalogGroupSchema), await res.json(), 'GET /api/models/catalog')
}

/** Replaces the list of enabled models for one provider. */
export async function setEnabledModels(provider: string, models: string[]): Promise<void> {
  const res = await fetch(`${API_BASE}/models/enabled`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, models }),
  })
  if (!res.ok) throw await requestError(res, 'Failed to save models')
}

// ── User-added providers ────────────────────────────────────────
