import { create } from 'zustand'
import {
  createChat, streamChat, approveToolCall, fetchDefaultModel,
  fetchSessions, fetchSession, deleteSessionApi, bulkDeleteSessionsApi,
  fetchProjects, createProjectApi, deleteProjectApi,
  type ContentPart,
} from '@/services/api'
import type { ExecutionPreview } from '@/components/ExecutionPreviewCard'
import type { Message, ImageAttachment, TokenUsage, ToolCall, ToolResult } from '@/types'
import { parseDataUrl, stripImageMarker } from '@/lib/image'

// ── Domain types ─────────────────────────────────────────────────────────────
export type Project = {
  id: string
  name: string
  path?: string
}

export type SessionSnapshot = {
  id: string
  title: string
  projectId: string
  messages: Message[]
  tokenUsage: TokenUsage
  backendSessionId: string | null
  persistId: string | null  // linked to backend persistent session
}

// ── ID factories ─────────────────────────────────────────────────────────────
let msgCounter = 0
const nextMsgId = () => `msg-${++msgCounter}`
let sessionCounter = 0
const nextSessionId = () => `ses-${++sessionCounter}`
let projectCounter = 0
const nextProjectId = () => `proj-${++projectCounter}`

// ── Helpers ───────────────────────────────────────────────────────────────────
const makeProject = (name: string): Project => ({ id: nextProjectId(), name })
const makeSession = (projectId: string): SessionSnapshot => ({
  id: nextSessionId(),
  title: 'New Conversation',
  projectId,
  messages: [],
  tokenUsage: { inputTokens: 0, outputTokens: 0 },
  backendSessionId: null,
  persistId: null,
})

/** Builds the API content for a message: plain text, or text + image parts. */
function toApiContent(m: Message, includeImages: boolean): string | ContentPart[] {
  const images = includeImages ? (m.images ?? []) : []
  if (images.length === 0) return m.content
  const parts: ContentPart[] = m.content ? [{ type: 'text', text: m.content }] : []
  for (const image of images) {
    const { mediaType, data } = parseDataUrl(image.dataUrl)
    parts.push({ type: 'image', image: { media_type: mediaType, data } })
  }
  return parts
}

// ── Permission request ────────────────────────────────────────────────────────
export type PermissionRequest = {
  toolCallId: string
  toolName: string
  arguments: Record<string, unknown>
  status: 'pending' | 'approved' | 'rejected'
  createdAt: number
}

// ── Agent status ──────────────────────────────────────────────────────────────
export type AgentStatus = 'idle' | 'thinking' | 'tool_calling' | 'awaiting_approval'

// ── Store ─────────────────────────────────────────────────────────────────────
type ChatState = {
  // Projects
  projects: Project[]
  activeProjectId: string

  // Sessions (all projects)
  sessions: SessionSnapshot[]
  activeId: string

  // Current session state
  messages: Message[]
  sessionId: string | null
  isStreaming: boolean
  tokenUsage: TokenUsage
  error: string | null
  provider: string
  model: string

  // Execution preview
  executionPreview: ExecutionPreview | null
  clearExecutionPreview: () => void

  // Permission requests & agent status
  permissionRequests: Map<string, PermissionRequest>
  agentStatus: AgentStatus
  lastEventAt: number

  // Session actions
  newSession: () => void
  switchSession: (id: string) => void | Promise<void>
  renameSession: (id: string, title: string) => void
  deleteSession: (id: string) => void
  bulkDeleteSessions: (ids: string[]) => void
  loadPersistedSessions: () => Promise<void>

  // Project actions
  addProject: (name: string, path?: string) => void
  loadPersistedProjects: () => Promise<void>
  renameProject: (id: string, name: string) => void
  deleteProject: (id: string) => void
  switchProject: (id: string) => void

  // Abort
  abortController: AbortController | null
  stopAgent: () => void

  // Permission
  respondPermission: (toolCallId: string, approved: boolean) => Promise<void>
  activePermissionRequest: () => PermissionRequest | undefined

  // Model
  setModel: (provider: string, model: string) => void
  sendMessage: (content: string, images?: ImageAttachment[]) => Promise<void>
  approveToolCall: (toolCallId: string, approved: boolean) => Promise<void>
  reset: () => void
  initProvider: () => Promise<void>
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
const defaultProject = makeProject('General')
const initialSession = makeSession(defaultProject.id)

export const useChatStore = create<ChatState>((set, get) => ({
  projects: [defaultProject],
  activeProjectId: defaultProject.id,

  sessions: [initialSession],
  activeId: initialSession.id,

  messages: [],
  sessionId: null,
  isStreaming: false,
  tokenUsage: { inputTokens: 0, outputTokens: 0 },
  error: null,
  provider: localStorage.getItem('provider') ?? 'deepseek',
  model: localStorage.getItem('model') ?? 'deepseek-ai/DeepSeek-V3',

  executionPreview: null,
  clearExecutionPreview: () => set({ executionPreview: null }),

  permissionRequests: new Map(),
  agentStatus: 'idle',
  lastEventAt: 0,
  abortController: null,

  stopAgent: () => {
    const { abortController } = get()
    abortController?.abort()
    set({ isStreaming: false, agentStatus: 'idle' as const, abortController: null })
  },

  // ── Helpers (save current state back to snapshot) ─────────────────────────
  // (called internally before switching sessions)

  newSession: () => {
    const { sessions, activeId, messages, tokenUsage, sessionId, activeProjectId } = get()
    const saved = sessions.map((s) =>
      s.id === activeId ? { ...s, messages, tokenUsage, backendSessionId: sessionId } : s
    )
    const fresh = makeSession(activeProjectId)
    set({
      sessions: [...saved, fresh],
      activeId: fresh.id,
      messages: [],
      sessionId: null,
      tokenUsage: { inputTokens: 0, outputTokens: 0 },
      error: null,
    })
  },

  loadPersistedSessions: async () => {
    try {
      const remote = await fetchSessions()
      if (remote.length === 0) return

      // Use set-updater to get latest state atomically (fixes React StrictMode double-invoke)
      set((state) => {
        const existingPersistIds = new Set(
          state.sessions.map((s) => s.persistId).filter(Boolean)
        )
        const projects = state.projects

        const newSessions: SessionSnapshot[] = []
        for (const r of remote) {
          if (existingPersistIds.has(r.id)) continue

          // Pi native sessions have project_id = cwd path (e.g. /Users/myadmin/Desktop/pi-agent)
          // Try to match to a frontend project by path, else fall back to activeProjectId
          const matchedProject = r.project_id
            ? projects.find((p) => p.path === r.project_id)
            : undefined
          const projectId = matchedProject?.id ?? state.activeProjectId

          newSessions.push({
            id: nextSessionId(),
            title: r.title || 'Untitled',
            projectId,
            messages: [],
            tokenUsage: { inputTokens: 0, outputTokens: 0 },
            backendSessionId: null,
            persistId: r.id,
          })
        }

        if (newSessions.length === 0) return state
        return { sessions: [...state.sessions, ...newSessions] }
      })
    } catch {
      // silently ignore if backend unavailable
    }
  },

  switchSession: async (id) => {
    const { sessions, activeId, messages, tokenUsage, sessionId, isStreaming } = get()
    if (id === activeId || isStreaming) return
    const saved = sessions.map((s) =>
      s.id === activeId ? { ...s, messages, tokenUsage, backendSessionId: sessionId } : s
    )
    const target = saved.find((s) => s.id === id)
    if (!target) return

    // If session has persist ID but no loaded messages, load from backend
    let loadedMessages = target.messages
    if (target.persistId && target.messages.length === 0) {
      try {
        const records = await fetchSession(target.persistId)
        let msgCounter = 0
        loadedMessages = records
          .filter((r: any) => r.type === 'message')
          .map((r: any) => ({
            id: `restored-${++msgCounter}`,
            role: r.role as 'user' | 'assistant',
            content: stripImageMarker(r.content || ''),
          }))
      } catch {
        // ignore
      }
    }

    set({
      sessions: saved.map((s) => s.id === id ? { ...s, messages: loadedMessages } : s),
      activeId: id,
      messages: loadedMessages,
      sessionId: target.backendSessionId,
      tokenUsage: target.tokenUsage,
      error: null,
    })
  },

  renameSession: (id, title) => {
    set((s) => ({
      sessions: s.sessions.map((sess) => sess.id === id ? { ...sess, title } : sess),
    }))
  },

  deleteSession: (id) => {
    const { sessions, activeId, activeProjectId } = get()
    const target = sessions.find((s) => s.id === id)
    if (target?.persistId) {
      deleteSessionApi(target.persistId).catch(() => {})
    }
    const remaining = sessions.filter((s) => s.id !== id)
    if (remaining.length === 0) {
      const fresh = makeSession(activeProjectId)
      set({ sessions: [fresh], activeId: fresh.id, messages: [], sessionId: null, tokenUsage: { inputTokens: 0, outputTokens: 0 }, error: null })
      return
    }
    if (id === activeId) {
      const next = remaining[remaining.length - 1]
      set({ sessions: remaining, activeId: next.id, messages: next.messages, sessionId: next.backendSessionId, tokenUsage: next.tokenUsage, error: null })
    } else {
      set({ sessions: remaining })
    }
  },

  bulkDeleteSessions: (ids) => {
    const { sessions, activeId, activeProjectId } = get()
    const idSet = new Set(ids)
    // Collect persist IDs to delete on backend
    const persistIds = sessions
      .filter((s) => idSet.has(s.id) && s.persistId)
      .map((s) => s.persistId as string)
    if (persistIds.length > 0) {
      bulkDeleteSessionsApi(persistIds).catch(() => {})
    }
    const remaining = sessions.filter((s) => !idSet.has(s.id))
    if (remaining.length === 0) {
      const fresh = makeSession(activeProjectId)
      set({ sessions: [fresh], activeId: fresh.id, messages: [], sessionId: null, tokenUsage: { inputTokens: 0, outputTokens: 0 }, error: null })
      return
    }
    if (idSet.has(activeId)) {
      const next = remaining[remaining.length - 1]
      set({ sessions: remaining, activeId: next.id, messages: next.messages, sessionId: next.backendSessionId, tokenUsage: next.tokenUsage, error: null })
    } else {
      set({ sessions: remaining })
    }
  },

  // ── Project actions ────────────────────────────────────────────────────────
  loadPersistedProjects: async () => {
    try {
      const remote = await fetchProjects()
      if (remote.length === 0) return
      // Atomic update, fixes StrictMode double-invoke
      set((state) => {
        const existingIds = new Set(state.projects.map((p) => p.id))
        const newProjects = remote
          .filter((r) => !existingIds.has(r.id))
          .map((r) => ({ id: r.id, name: r.name, path: r.path }))
        if (newProjects.length === 0) return state
        return { projects: [...state.projects, ...newProjects] }
      })
    } catch {
      // silently ignore
    }
  },

  addProject: (name, path) => {
    const p = makeProject(name)
    // If path provided, also persist to backend
    if (path) {
      createProjectApi(path, name).then((remote) => {
        // Update project with backend ID
        set((s) => ({
          projects: s.projects.map((proj) =>
            proj.id === p.id ? { ...proj, id: remote.id, path: remote.path } : proj
          ),
        }))
      }).catch(() => {})
    }
    const fresh = makeSession(p.id)
    const { sessions, activeId, messages, tokenUsage, sessionId } = get()
    const saved = sessions.map((s) =>
      s.id === activeId ? { ...s, messages, tokenUsage, backendSessionId: sessionId } : s
    )
    set({
      projects: [...get().projects, p],
      activeProjectId: p.id,
      sessions: [...saved, fresh],
      activeId: fresh.id,
      messages: [],
      sessionId: null,
      tokenUsage: { inputTokens: 0, outputTokens: 0 },
      error: null,
    })
  },

  renameProject: (id, name) => {
    set((s) => ({ projects: s.projects.map((p) => p.id === id ? { ...p, name } : p) }))
  },

  deleteProject: (id) => {
    const { projects, sessions, activeProjectId, activeId } = get()
    if (projects.length === 1) return // can't delete last

    // Call backend — pi-native projects go to ignored list, regular projects delete from json
    deleteProjectApi(id).catch(() => {})

    const remaining = projects.filter((p) => p.id !== id)
    const remainingSessions = sessions.filter((s) => s.projectId !== id)
    const newProjectId = remaining[0].id

    if (id === activeProjectId) {
      let targetSessions = remainingSessions.filter((s) => s.projectId === newProjectId)
      if (targetSessions.length === 0) {
        const fresh = makeSession(newProjectId)
        set({ projects: remaining, sessions: [...remainingSessions, fresh], activeProjectId: newProjectId, activeId: fresh.id, messages: [], sessionId: null, tokenUsage: { inputTokens: 0, outputTokens: 0 }, error: null })
        return
      }
      const next = targetSessions[targetSessions.length - 1]
      set({ projects: remaining, sessions: remainingSessions, activeProjectId: newProjectId, activeId: next.id, messages: next.messages, sessionId: next.backendSessionId, tokenUsage: next.tokenUsage, error: null })
    } else {
      set({ projects: remaining, sessions: remainingSessions })
    }
  },

  switchProject: (id) => {
    const { sessions, activeId, messages, tokenUsage, sessionId, activeProjectId, isStreaming } = get()
    if (id === activeProjectId || isStreaming) return
    // Save current
    const saved = sessions.map((s) =>
      s.id === activeId ? { ...s, messages, tokenUsage, backendSessionId: sessionId } : s
    )
    // Find a session in target project
    const projectSessions = saved.filter((s) => s.projectId === id)
    if (projectSessions.length === 0) {
      // Create a session in that project
      const fresh = makeSession(id)
      set({ sessions: [...saved, fresh], activeProjectId: id, activeId: fresh.id, messages: [], sessionId: null, tokenUsage: { inputTokens: 0, outputTokens: 0 }, error: null })
      return
    }
    const last = projectSessions[projectSessions.length - 1]
    set({ sessions: saved, activeProjectId: id, activeId: last.id, messages: last.messages, sessionId: last.backendSessionId, tokenUsage: last.tokenUsage, error: null })
  },

  // ── Permission actions ─────────────────────────────────────────────────────
  respondPermission: async (toolCallId, approved) => {
    const { sessionId, permissionRequests } = get()
    if (!sessionId) return
    const updated = new Map(permissionRequests)
    const req = updated.get(toolCallId)
    if (req) {
      updated.set(toolCallId, { ...req, status: approved ? 'approved' : 'rejected' })
      set({ permissionRequests: updated, agentStatus: approved ? 'tool_calling' : 'idle' })
    }
    await approveToolCall(sessionId, toolCallId, approved)
  },

  activePermissionRequest: () => {
    const { permissionRequests } = get()
    for (const req of permissionRequests.values()) {
      if (req.status === 'pending') return req
    }
    return undefined
  },

  // ── Message actions ────────────────────────────────────────────────────────
  sendMessage: async (content: string, images: ImageAttachment[] = []) => {
    const userMsg: Message = { id: nextMsgId(), role: 'user', content, images: images.length > 0 ? images : undefined }
    set((s) => ({ messages: [...s.messages, userMsg], isStreaming: true, error: null, agentStatus: 'thinking' as const, lastEventAt: Date.now(), permissionRequests: new Map() }))

    // Auto-title from first user message
    const { sessions, activeId } = get()
    const cur = sessions.find((s) => s.id === activeId)
    if (cur && cur.title === 'New Conversation') {
      set({ sessions: sessions.map((s) => s.id === activeId ? { ...s, title: content.slice(0, 40).trim() } : s) })
    }

    const controller = new AbortController()
    set({ abortController: controller })

    try {
      // Only the message being sent carries its images; earlier images are not re-sent
      const allMessages = get().messages
      const history = allMessages.map((m, i) => ({
        role: m.role,
        content: toApiContent(m, i === allMessages.length - 1),
      }))
      const { provider, model, sessions, activeId } = get()
      const currentSession = sessions.find((s) => s.id === activeId)
      const result = await createChat(history, provider, model, currentSession?.persistId ?? undefined)
      const sessionId = result.session_id
      const persistId = result.persist_id
      set({ sessionId })
      // Link persist_id to the session snapshot
      if (persistId) {
        set((s) => ({
          sessions: s.sessions.map((ses) =>
            ses.id === s.activeId ? { ...ses, persistId } : ses
          ),
        }))
      }

      const assistantMsg: Message = { id: nextMsgId(), role: 'assistant', content: '' }
      set((s) => ({ messages: [...s.messages, assistantMsg] }))

      for await (const event of streamChat(sessionId, controller.signal)) {
        const { messages } = get()
        const lastIdx = messages.length - 1

        switch (event.event) {
          case 'text': {
            const updated = [...messages]
            updated[lastIdx] = { ...updated[lastIdx], content: updated[lastIdx].content + event.data.content }
            set({ messages: updated })
            break
          }
          case 'tool_call': {
            const tc: ToolCall = { toolCallId: event.data.tool_call_id, toolName: event.data.tool_name, arguments: event.data.arguments }
            const updated = [...messages]
            updated[lastIdx] = { ...updated[lastIdx], toolCalls: [...(updated[lastIdx].toolCalls ?? []), tc] }
            set({ messages: updated, agentStatus: 'tool_calling' as const, lastEventAt: Date.now() })
            break
          }
          case 'permission_request': {
            const pr: PermissionRequest = {
              toolCallId: event.data.tool_call_id,
              toolName: event.data.tool_name,
              arguments: event.data.arguments,
              status: 'pending',
              createdAt: Date.now(),
            }
            const prMap = new Map(get().permissionRequests)
            prMap.set(pr.toolCallId, pr)
            set({ permissionRequests: prMap, agentStatus: 'awaiting_approval' as const, lastEventAt: Date.now() })
            break
          }
          case 'tool_result': {
            const tr: ToolResult = { toolCallId: event.data.tool_call_id, output: event.data.output, isError: event.data.is_error }
            const updated = [...messages]
            updated[lastIdx] = { ...updated[lastIdx], toolResults: [...(updated[lastIdx].toolResults ?? []), tr] }
            set({ messages: updated })
            break
          }
          case 'usage': {
            const usage = { inputTokens: event.data.input_tokens, outputTokens: event.data.output_tokens }
            set({ tokenUsage: usage })
            const { sessions: ss, activeId: aid } = get()
            set({ sessions: ss.map((s) => s.id === aid ? { ...s, tokenUsage: usage } : s) })
            break
          }
          case 'execution_preview': {
            const ep: ExecutionPreview = {
              previewId: event.data.preview_id as string,
              steps: event.data.steps as string[],
              hasWriteOps: event.data.has_write_ops as boolean,
            }
            set({ executionPreview: ep })
            break
          }
          case 'error':
            set({ error: event.data.message, agentStatus: 'idle' as const })
            break
          case 'done':
            set({ agentStatus: 'idle' as const })
            break
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User stopped the agent — not an error
      } else {
        set({ error: err instanceof Error ? err.message : 'Unknown error' })
      }
    } finally {
      set({ isStreaming: false, agentStatus: 'idle' as const, abortController: null })
      const { messages: m, tokenUsage: t, sessionId: sid, sessions: ss, activeId: aid } = get()
      set({ sessions: ss.map((s) => s.id === aid ? { ...s, messages: m, tokenUsage: t, backendSessionId: sid } : s) })
    }
  },

  approveToolCall: async (toolCallId, approved) => {
    const { sessionId } = get()
    if (!sessionId) return
    await approveToolCall(sessionId, toolCallId, approved)
  },

  setModel: (provider, model) => {
    localStorage.setItem('provider', provider)
    localStorage.setItem('model', model)
    set({ provider, model })
  },

  reset: () => get().newSession(),

  initProvider: async () => {
    const saved = localStorage.getItem('provider')
    if (saved) return
    const result = await fetchDefaultModel()
    if (result) {
      localStorage.setItem('provider', result.provider)
      localStorage.setItem('model', result.model)
      set({ provider: result.provider, model: result.model })
    }
  },
}))
