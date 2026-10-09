import { describe, it, expect } from 'vitest'
import { friendlyError } from '../errors'

describe('friendlyError', () => {
  it('explains a usage limit in plain words and shows the provider sentence, not the JSON', () => {
    const raw = '400 {"type":"error","error":{"message":"You\'re out of extra usage."}}'
    const e = friendlyError(raw)
    expect(e.title).toMatch(/out of usage/)
    expect(e.detail).toBe("You're out of extra usage.")
  })

  it('keeps the raw text when there is no JSON message', () => {
    expect(friendlyError('Codex error: plain text').detail).toBe('Codex error: plain text')
  })

  it('explains a rejected key', () => {
    expect(friendlyError('401 invalid x-api-key').title).toMatch(/API key was rejected/)
  })

  it('falls back to a generic message for anything unknown', () => {
    expect(friendlyError('weird thing').title).toBe('Something went wrong.')
  })

  it('shortens very long details', () => {
    expect(friendlyError('x'.repeat(500)).detail.length).toBeLessThan(310)
  })
})
