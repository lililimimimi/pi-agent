import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/api/chat', () => ({
  createChat: vi.fn(),
  streamChat: vi.fn(),
  approveToolCall: vi.fn(),
}))
vi.mock('@/services/api/models', () => ({
  fetchDefaultModel: vi.fn(),
}))
vi.mock('@/services/api/sessions', () => ({
  fetchSessions: vi.fn(async () => []),
  fetchSession: vi.fn(async () => []),
  deleteSessionApi: vi.fn(),
  bulkDeleteSessionsApi: vi.fn(),
}))
vi.mock('@/services/api/projects', () => ({
  fetchProjects: vi.fn(async () => []),
  createProjectApi: vi.fn(),
  deleteProjectApi: vi.fn(async () => {}),
}))

import { useChatStore } from '../chatStore'

const RULES_PATH = '/Users/me/Desktop/rules'

beforeEach(() => {
  localStorage.clear()
  useChatStore.setState({
    projects: [
      { id: 'proj-general', name: 'general' },
      { id: 'proj-rules', name: 'rules', path: RULES_PATH },
    ],
    activeProjectId: 'proj-general',
    sessions: [
      {
        id: 'ses-general',
        title: 'New',
        projectId: 'proj-general',
        messages: [],
        tokenUsage: { inputTokens: 0, outputTokens: 0 },
        backendSessionId: null,
        persistId: null,
      },
      {
        id: 'ses-rules',
        title: 'hello',
        projectId: 'proj-rules',
        messages: [{ id: 'm1', role: 'user', content: 'hello' }],
        tokenUsage: { inputTokens: 0, outputTokens: 0 },
        backendSessionId: null,
        persistId: 'persist-rules',
      },
    ],
    activeId: 'ses-general',
    messages: [],
  })
})

describe('restoreLastView', () => {
  it('returns to the saved project and conversation after a reload', async () => {
    localStorage.setItem(
      'pi.lastView',
      JSON.stringify({ projectPath: RULES_PATH, persistId: 'persist-rules' }),
    )

    await useChatStore.getState().restoreLastView()

    const state = useChatStore.getState()
    expect(state.activeProjectId).toBe('proj-rules')
    expect(state.activeId).toBe('ses-rules')
    expect(state.messages.map((m) => m.content)).toEqual(['hello'])
  })

  it('does nothing when no view was saved', async () => {
    await useChatStore.getState().restoreLastView()

    expect(useChatStore.getState().activeProjectId).toBe('proj-general')
    expect(useChatStore.getState().activeId).toBe('ses-general')
  })

  it('falls back quietly when the saved project no longer exists', async () => {
    localStorage.setItem('pi.lastView', JSON.stringify({ projectPath: '/gone', persistId: null }))

    await useChatStore.getState().restoreLastView()

    expect(useChatStore.getState().activeProjectId).toBe('proj-general')
  })

  it('does not overwrite the saved view while projects are still loading', async () => {
    // Fresh module instance: the restore flag starts unset, as on a real page load
    vi.resetModules()
    const { useChatStore: fresh } = await import('../chatStore')
    localStorage.setItem(
      'pi.lastView',
      JSON.stringify({ projectPath: RULES_PATH, persistId: 'persist-rules' }),
    )

    fresh.setState({ activeProjectId: 'proj-general' })

    expect(JSON.parse(localStorage.getItem('pi.lastView') ?? 'null')).toEqual({
      projectPath: RULES_PATH,
      persistId: 'persist-rules',
    })
  })
})

describe('restoreLastView with a single session in the project', () => {
  it('loads the messages even when the session is already selected', async () => {
    const { fetchSession } = await import('@/services/api/sessions')
    vi.mocked(fetchSession).mockResolvedValueOnce([
      { type: 'message', role: 'user', content: 'hello' },
      { type: 'message', role: 'assistant', content: 'Hi there' },
    ] as never)

    useChatStore.setState({
      sessions: [
        {
          id: 'ses-general',
          title: 'New',
          projectId: 'proj-general',
          messages: [],
          tokenUsage: { inputTokens: 0, outputTokens: 0 },
          backendSessionId: null,
          persistId: null,
        },
        {
          id: 'ses-rules',
          title: 'hello',
          projectId: 'proj-rules',
          messages: [],
          tokenUsage: { inputTokens: 0, outputTokens: 0 },
          backendSessionId: null,
          persistId: 'persist-rules',
        },
      ],
    })
    localStorage.setItem(
      'pi.lastView',
      JSON.stringify({ projectPath: RULES_PATH, persistId: 'persist-rules' }),
    )

    await useChatStore.getState().restoreLastView()

    expect(useChatStore.getState().activeId).toBe('ses-rules')
    expect(useChatStore.getState().messages.map((m) => m.content)).toEqual(['hello', 'Hi there'])
  })
})

describe('deleteProject', () => {
  it('removes sessions and keeps the folder by default', async () => {
    const api = await import('@/services/api/projects')
    vi.mocked(api.deleteProjectApi).mockClear()

    useChatStore.getState().deleteProject('proj-rules')

    expect(api.deleteProjectApi).toHaveBeenCalledWith('proj-rules', {
      deleteSessions: true,
      deleteFolder: false,
    })
  })

  it('also deletes the folder when the user chose that', async () => {
    const api = await import('@/services/api/projects')
    vi.mocked(api.deleteProjectApi).mockClear()

    useChatStore.getState().deleteProject('proj-rules', true)

    expect(api.deleteProjectApi).toHaveBeenCalledWith('proj-rules', {
      deleteSessions: true,
      deleteFolder: true,
    })
  })
})

describe('opening a session with a saved failed turn', () => {
  it('shows the failed turn as an error message, not as a reply', async () => {
    const { fetchSession } = await import('@/services/api/sessions')
    vi.mocked(fetchSession).mockResolvedValueOnce([
      { type: 'message', role: 'user', content: 'hello' },
      { type: 'message', role: 'assistant', content: 'Error: out of extra usage' },
    ] as never)

    useChatStore.setState({
      sessions: [
        {
          id: 'ses-general',
          title: 'New',
          projectId: 'proj-general',
          messages: [],
          tokenUsage: { inputTokens: 0, outputTokens: 0 },
          backendSessionId: null,
          persistId: null,
        },
        {
          id: 'ses-chat',
          title: 'hello',
          projectId: 'proj-general',
          messages: [],
          tokenUsage: { inputTokens: 0, outputTokens: 0 },
          backendSessionId: null,
          persistId: 'persist-chat',
        },
      ],
    })
    await useChatStore.getState().switchSession('ses-chat')

    const last = useChatStore.getState().messages.at(-1)
    expect(last?.error).toBe('out of extra usage')
    expect(last?.content).toBe('')
  })
})
