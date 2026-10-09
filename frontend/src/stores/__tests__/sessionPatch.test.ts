import { describe, it, expect } from 'vitest'
import { newSessionPatch, removeSessionsPatch, makeSession, type SessionState } from '../sessionPatch'

const zero = { inputTokens: 0, outputTokens: 0 }

function session(id: string, messages = [] as SessionState['messages'], backendSessionId: string | null = null) {
  return { ...makeSession('p1'), id, title: id, messages, backendSessionId }
}

function stateWith(sessions: ReturnType<typeof session>[], activeId: string): SessionState {
  return {
    sessions,
    activeId,
    activeProjectId: 'p1',
    messages: [{ id: 'm1', role: 'user', content: 'hi' }],
    sessionId: 'backend-live',
    tokenUsage: { inputTokens: 3, outputTokens: 4 },
  }
}

describe('newSessionPatch', () => {
  it('saves the open chat into its session and opens an empty one', () => {
    const patch = newSessionPatch(stateWith([session('a')], 'a'))
    const saved = patch.sessions?.find((s) => s.id === 'a')
    expect(saved?.messages).toHaveLength(1)
    expect(saved?.backendSessionId).toBe('backend-live')
    expect(patch.messages).toEqual([])
    expect(patch.sessionId).toBeNull()
    expect(patch.tokenUsage).toEqual(zero)
    expect(patch.sessions?.length).toBe(2)
    expect(patch.activeId).not.toBe('a')
  })
})

describe('removeSessionsPatch', () => {
  it('opens the last remaining session when the open one is removed', () => {
    const state = stateWith([session('a'), session('b', [{ id: 'x', role: 'user', content: 'old' }], 'b-backend')], 'a')
    const patch = removeSessionsPatch(state, new Set(['a']))
    expect(patch.activeId).toBe('b')
    expect(patch.messages).toEqual([{ id: 'x', role: 'user', content: 'old' }])
    expect(patch.sessionId).toBe('b-backend')
    expect(patch.sessions?.map((s) => s.id)).toEqual(['b'])
  })

  it('keeps the open chat when another session is removed', () => {
    const state = stateWith([session('a'), session('b')], 'a')
    const patch = removeSessionsPatch(state, new Set(['b']))
    expect(patch).toEqual({ sessions: [expect.objectContaining({ id: 'a' })] })
  })

  it('opens a fresh session when every session is removed', () => {
    const state = stateWith([session('a')], 'a')
    const patch = removeSessionsPatch(state, new Set(['a']))
    expect(patch.sessions).toHaveLength(1)
    expect(patch.sessions?.[0].id).not.toBe('a')
    expect(patch.messages).toEqual([])
    expect(patch.sessionId).toBeNull()
  })
})
