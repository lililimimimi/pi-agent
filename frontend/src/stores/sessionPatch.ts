/**
 * Session and project changes as pure functions: each takes the current state and returns
 * the store fields to update. The store calls them and does the backend calls itself.
 */
import type { Message, TokenUsage } from '@/types'
import type { Project, SessionSnapshot } from '@/stores/chatStore'

/** The parts of the store that session and project changes read and write */
export type SessionState = {
  sessions: SessionSnapshot[]
  activeId: string
  activeProjectId: string
  messages: Message[]
  sessionId: string | null
  tokenUsage: TokenUsage
}

export type ProjectState = SessionState & { projects: Project[] }

export type SessionPatch = Partial<
  Pick<
    ProjectState,
    'sessions' | 'activeId' | 'activeProjectId' | 'messages' | 'sessionId' | 'tokenUsage' | 'projects'
  >
> & {
  error?: string | null
}

// ── ID factories ─────────────────────────────────────────────────────────────
let sessionCounter = 0
export const nextSessionId = () => `ses-${++sessionCounter}`

export const makeSession = (projectId: string): SessionSnapshot => ({
  id: nextSessionId(),
  title: 'New',
  projectId,
  messages: [],
  tokenUsage: { inputTokens: 0, outputTokens: 0 },
  backendSessionId: null,
  persistId: null,
})

const emptyUsage = (): TokenUsage => ({ inputTokens: 0, outputTokens: 0 })

/** All sessions, with the open chat written back into its own session */
export function savedSessions(state: SessionState): SessionSnapshot[] {
  return state.sessions.map((s) =>
    s.id === state.activeId
      ? { ...s, messages: state.messages, tokenUsage: state.tokenUsage, backendSessionId: state.sessionId }
      : s,
  )
}

/** Saves the current chat into its session and opens a new, empty one. */
export function newSessionPatch(state: SessionState): SessionPatch {
  const fresh = makeSession(state.activeProjectId)
  return {
    sessions: [...savedSessions(state), fresh],
    activeId: fresh.id,
    messages: [],
    sessionId: null,
    tokenUsage: emptyUsage(),
    error: null,
  }
}

/**
 * Removes sessions. If the open one is removed, the last remaining session opens;
 * if none remain, a fresh session opens.
 */
export function removeSessionsPatch(state: SessionState, removeIds: Set<string>): SessionPatch {
  const remaining = state.sessions.filter((s) => !removeIds.has(s.id))

  if (remaining.length === 0) {
    const fresh = makeSession(state.activeProjectId)
    return {
      sessions: [fresh],
      activeId: fresh.id,
      messages: [],
      sessionId: null,
      tokenUsage: emptyUsage(),
      error: null,
    }
  }

  if (removeIds.has(state.activeId)) {
    const next = remaining[remaining.length - 1]
    return {
      sessions: remaining,
      activeId: next.id,
      messages: next.messages,
      sessionId: next.backendSessionId,
      tokenUsage: next.tokenUsage,
      error: null,
    }
  }

  return { sessions: remaining }
}

/**
 * Opens a session. `loaded` is its messages (already fetched from the backend if needed).
 * Returns null if there is no such session.
 */
export function switchSessionPatch(state: SessionState, id: string, loaded: Message[]): SessionPatch | null {
  const saved = savedSessions(state)
  const target = saved.find((s) => s.id === id)
  if (!target) return null
  return {
    sessions: saved.map((s) => (s.id === id ? { ...s, messages: loaded } : s)),
    activeId: id,
    messages: loaded,
    sessionId: target.backendSessionId,
    tokenUsage: target.tokenUsage,
    error: null,
  }
}

/** Matches sessions saved on the backend to the projects in the app, and adds the ones not yet listed. */
export function matchRemoteSessions(
  state: SessionState & { projects: Project[] },
  remote: { id: string; title?: string; project_id?: string }[],
): SessionSnapshot[] {
  const existingPersistIds = new Set(state.sessions.map((s) => s.persistId).filter(Boolean))
  const added: SessionSnapshot[] = []
  for (const r of remote) {
    if (existingPersistIds.has(r.id)) continue
    // Pi native sessions have project_id = cwd path; match by path, else use the active project
    const matched = r.project_id ? state.projects.find((p) => p.path === r.project_id) : undefined
    added.push({
      id: nextSessionId(),
      title: r.title || 'Untitled',
      projectId: matched?.id ?? state.activeProjectId,
      messages: [],
      tokenUsage: emptyUsage(),
      backendSessionId: null,
      persistId: r.id,
    })
  }
  return added
}

/** Opens a new project with one fresh session in it. */
export function addProjectPatch(state: ProjectState, project: Project): SessionPatch {
  const fresh = makeSession(project.id)
  return {
    projects: [...state.projects, project],
    activeProjectId: project.id,
    sessions: [...savedSessions(state), fresh],
    activeId: fresh.id,
    messages: [],
    sessionId: null,
    tokenUsage: emptyUsage(),
    error: null,
  }
}

/** Opens another project: its last session, or a new one if it has none. */
export function switchProjectPatch(state: SessionState, id: string): SessionPatch {
  const saved = savedSessions(state)
  const projectSessions = saved.filter((s) => s.projectId === id)
  if (projectSessions.length === 0) {
    const fresh = makeSession(id)
    return {
      sessions: [...saved, fresh],
      activeProjectId: id,
      activeId: fresh.id,
      messages: [],
      sessionId: null,
      tokenUsage: emptyUsage(),
      error: null,
    }
  }
  const last = projectSessions[projectSessions.length - 1]
  return {
    sessions: saved,
    activeProjectId: id,
    activeId: last.id,
    messages: last.messages,
    sessionId: last.backendSessionId,
    tokenUsage: last.tokenUsage,
    error: null,
  }
}

/**
 * Removes a project and its sessions. If it was the open project, the first remaining
 * project opens. Returns null when it is the last project, which cannot be removed.
 */
export function removeProjectPatch(state: ProjectState, id: string): SessionPatch | null {
  if (state.projects.length === 1) return null
  const remaining = state.projects.filter((p) => p.id !== id)
  const remainingSessions = state.sessions.filter((s) => s.projectId !== id)
  const newProjectId = remaining[0].id

  if (id !== state.activeProjectId) {
    return { projects: remaining, sessions: remainingSessions }
  }

  const inNewProject = remainingSessions.filter((s) => s.projectId === newProjectId)
  if (inNewProject.length === 0) {
    const fresh = makeSession(newProjectId)
    return {
      projects: remaining,
      sessions: [...remainingSessions, fresh],
      activeProjectId: newProjectId,
      activeId: fresh.id,
      messages: [],
      sessionId: null,
      tokenUsage: emptyUsage(),
      error: null,
    }
  }
  const next = inNewProject[inNewProject.length - 1]
  return {
    projects: remaining,
    sessions: remainingSessions,
    activeProjectId: newProjectId,
    activeId: next.id,
    messages: next.messages,
    sessionId: next.backendSessionId,
    tokenUsage: next.tokenUsage,
    error: null,
  }
}
