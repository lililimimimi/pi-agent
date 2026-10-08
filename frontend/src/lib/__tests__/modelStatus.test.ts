import { describe, it, expect } from 'vitest'
import { explainError } from '../modelStatus'

describe('explainError', () => {
  it('explains quota problems', () => {
    expect(explainError("You're out of extra usage. Add more at claude.ai")).toMatch(/quota/i)
  })
  it('explains a bad key', () => {
    expect(explainError('401 invalid x-api-key')).toMatch(/Key is invalid/)
  })
  it('explains a missing model', () => {
    expect(explainError('Model not found')).toMatch(/Model does not exist/)
  })
  it('explains timeouts and connection problems', () => {
    expect(explainError('Timed out')).toMatch(/timed out/)
    expect(explainError('fetch failed')).toMatch(/Cannot reach/)
  })
  it('falls back to the raw message, shortened', () => {
    const text = explainError('x'.repeat(300))
    expect(text.startsWith('Test failed: ')).toBe(true)
    expect(text.length).toBeLessThan(200)
  })
})
