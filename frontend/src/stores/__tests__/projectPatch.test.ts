import { describe, it, expect } from 'vitest'
import {
  addProjectPatch, makeSession, matchRemoteSessions, removeProjectPatch, switchProjectPatch,
  switchSessionPatch, type ProjectState,
} from '../sessionPatch'
import type { Project } from '../chatStore'

const zero = { inputTokens: 0, outputTokens: 0 }

function session(id: string, projectId: string, extra: Partial<ReturnType<typeof makeSession>> = {}) {
  return { ...makeSession(projectId), id, title: id, ...extra }
}

function stateWith(projects: Project[], sessions: ReturnType<typeof session>[], activeProjectId: string, activeId: string): ProjectState {
  return {
    projects,
    sessions,
    activeId,
    activeProjectId,
    messages: [{ id: 'm1', role: 'user', content: 'hi' }],
    sessionId: 'live',
    tokenUsage: { inputTokens: 1, outputTokens: 2 },
  }
}

const P1: Project = { id: 'p1', name: 'one', path: '/a' }
const P2: Project = { id: 'p2', name: 'two', path: '/b' }

describe('addProjectPatch', () => {
  it('saves the open chat, then opens the new project with an empty session', () => {
    const patch = addProjectPatch(stateWith([P1], [session('s1', 'p1')], 'p1', 's1'), P2)
    expect(patch.projects).toEqual([P1, P2])
    expect(patch.activeProjectId).toBe('p2')
    expect(patch.sessions?.find((s) => s.id === 's1')?.messages).toHaveLength(1)
    expect(patch.messages).toEqual([])
    expect(patch.sessions?.find((s) => s.id === patch.activeId)?.projectId).toBe('p2')
  })
})

describe('switchProjectPatch', () => {
  it('opens the last session of the target project', () => {
    const state = stateWith([P1, P2], [session('s1', 'p1'), session('s2', 'p2', { backendSessionId: 'b2' })], 'p1', 's1')
    const patch = switchProjectPatch(state, 'p2')
    expect(patch.activeProjectId).toBe('p2')
    expect(patch.activeId).toBe('s2')
    expect(patch.sessionId).toBe('b2')
  })

  it('creates a session when the target project has none', () => {
    const state = stateWith([P1, P2], [session('s1', 'p1')], 'p1', 's1')
    const patch = switchProjectPatch(state, 'p2')
    expect(patch.sessions?.some((s) => s.projectId === 'p2')).toBe(true)
    expect(patch.messages).toEqual([])
    expect(patch.tokenUsage).toEqual(zero)
  })
})

describe('removeProjectPatch', () => {
  it('refuses to remove the last project', () => {
    expect(removeProjectPatch(stateWith([P1], [session('s1', 'p1')], 'p1', 's1'), 'p1')).toBeNull()
  })

  it('removes the sessions of a project that is not open, and keeps the open chat', () => {
    const state = stateWith([P1, P2], [session('s1', 'p1'), session('s2', 'p2')], 'p1', 's1')
    const patch = removeProjectPatch(state, 'p2')
    expect(patch?.projects).toEqual([P1])
    expect(patch?.sessions?.map((s) => s.id)).toEqual(['s1'])
    expect(patch?.activeProjectId).toBeUndefined()
  })

  it('opens the first remaining project when the open one is removed', () => {
    const state = stateWith([P1, P2], [session('s1', 'p1'), session('s2', 'p2')], 'p2', 's2')
    const patch = removeProjectPatch(state, 'p2')
    expect(patch?.activeProjectId).toBe('p1')
    expect(patch?.activeId).toBe('s1')
  })
})

describe('switchSessionPatch', () => {
  it('opens a session with the messages it was given', () => {
    const state = stateWith([P1], [session('s1', 'p1'), session('s2', 'p1')], 'p1', 's1')
    const loaded = [{ id: 'x', role: 'assistant' as const, content: 'old' }]
    const patch = switchSessionPatch(state, 's2', loaded)
    expect(patch?.activeId).toBe('s2')
    expect(patch?.messages).toEqual(loaded)
  })

  it('returns null for an unknown session', () => {
    expect(switchSessionPatch(stateWith([P1], [session('s1', 'p1')], 'p1', 's1'), 'nope', [])).toBeNull()
  })
})

describe('matchRemoteSessions', () => {
  it('adds only sessions not listed yet, matched to their project by path', () => {
    const state = { ...stateWith([P1, P2], [session('s1', 'p1', { persistId: 'known' })], 'p1', 's1') }
    const added = matchRemoteSessions(state, [
      { id: 'known', title: 'already here' },
      { id: 'new1', title: 'Fix bug', project_id: '/b' },
      { id: 'new2' },
    ])
    expect(added.map((s) => s.persistId)).toEqual(['new1', 'new2'])
    expect(added[0].projectId).toBe('p2')
    expect(added[0].title).toBe('Fix bug')
    expect(added[1].projectId).toBe('p1')
    expect(added[1].title).toBe('Untitled')
  })
})
