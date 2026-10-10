import { describe, it, expect } from 'vitest'
import { CatalogGroupSchema, ModelSchema, parseResponse } from '../schemas'

const validModel = {
  id: 'deepseek-v4-flash',
  name: 'DeepSeek V4 Flash',
  provider: 'deepseek',
  supports_tools: true,
  supports_images: false,
  status: null,
}

describe('parseResponse', () => {
  it('accepts a response that matches the shape', () => {
    expect(parseResponse(ModelSchema, validModel, 'test').id).toBe('deepseek-v4-flash')
  })

  it('ignores extra fields added by the backend', () => {
    const parsed = parseResponse(ModelSchema, { ...validModel, new_field: 1 }, 'test')
    expect(parsed.name).toBe('DeepSeek V4 Flash')
  })

  it('reports where the shape is wrong, in plain words', () => {
    expect(() =>
      parseResponse(ModelSchema, { ...validModel, supports_images: 'yes' }, 'GET /api/models'),
    ).toThrow(/Unexpected response from GET \/api\/models: supports_images/)
  })

  it('rejects a catalog whose model list is missing', () => {
    const bad = [{ provider: 'deepseek', label: 'DeepSeek' }]
    expect(CatalogGroupSchema.safeParse(bad[0]).success).toBe(false)
  })
})

describe('status values from failed tests', () => {
  it('accepts a null response time, which the backend stores after a failed test', () => {
    const status = { ok: false, checked_at: '2026-10-09T00:00:00Z', error: 'Model not found', ms: null }
    expect(parseResponse(ModelSchema, { ...validModel, status }, 'test').status?.ms).toBeNull()
  })
})
