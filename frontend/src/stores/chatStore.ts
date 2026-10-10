import { create } from 'zustand'
import { createChat, streamChat, approveToolCall, stopChatApi } from '@/services/api/chat'
import { fetchDefaultModel } from '@/services/api/models'
import {
  fetchSessions,
  fetchSession,
  deleteSessionApi,
  bulkDeleteSessionsApi,
  renameSessionApi,
  truncateSessionApi,
} from '@/services/api/sessions'
import { fetchProjects, createProjectApi, deleteProjectApi } from '@/services/api/projects'
import type { ExecutionPreview } from '@/components/chat/ExecutionPreviewCard'
import { streamEventPatch } from '@/stores/streamEvents'
import { recordsToMessages, toApiContent } from '@/stores/messageConversion'
import {
  addProjectPatch,
  makeSession,
  matchRemoteSessions,
  newSessionPatch,
  removeProjectPatch,
  removeSessionsPatch,
  savedSessions,
  switchProjectPatch,
  switchSessionPatch,
} from '@/stores/sessionPatch'
import type { Message, ImageAttachment, TokenUsage } from '@/types'
import { reportError } from '@/lib/appError'
import { markViewRestored, readLastView, saveLastView } from '@/stores/lastView'

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
  persistId: string | null // linked to backend persistent session
}

// ── ID factories ─────────────────────────────────────────────────────────────
let msgCounter = 0
const nextMsgId = () => `msg-${++msgCounter}`
let projectCounter = 0
const nextProjectId = () => `proj-${++projectCounter}`

// ── Helpers ───────────────────────────────────────────────────────────────────
const makeProject = (name: string): Project => ({ id: nextProjectId(), name })

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
  /** When on, file edits inside the project run without asking. Off after every reload. */
  autoEdits: boolean
  setAutoEdits: (on: boolean) => void

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
  renameProject: (id: string, name: string, path?: string) => void
  deleteProject: (id: string, deleteFolder?: boolean) => void
  switchProject: (id: string) => void
  restoreLastView: () => Promise<void>

  // Abort
  abortController: AbortController | null
  stopAgent: () => void

  // Permission
  respondPermission: (toolCallId: string, approved: boolean) => Promise<void>
  activePermissionRequest: () => PermissionRequest | undefined

  // Model
  setModel: (provider: string, model: string) => void
  sendMessage: (content: string, images?: ImageAttachment[]) => Promise<void>
  /** Drops this message and everything after it, then sends the given text in its place */
  resendFrom: (messageId: string, content: string, images?: ImageAttachment[]) => Promise<void>
  /** Asks again for the last user message, replacing the reply that followed it */
  regenerate: () => Promise<void>
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
  autoEdits: false,
  setAutoEdits: (on) => set({ autoEdits: on }),

  permissionRequests: new Map(),
  agentStatus: 'idle',
  lastEventAt: 0,
  abortController: null,

  stopAgent: () => {
    const { abortController, sessionId } = get()
    // Ask the backend to keep what was written so far; a failure here must not block stopping
    if (sessionId) stopChatApi(sessionId).catch((e) => reportError('Could not save the stopped reply', e))
    abortController?.abort()
    set({ isStreaming: false, agentStatus: 'idle' as const, abortController: null })
  },

  // ── Helpers (save current state back to snapshot) ─────────────────────────
  // (called internally before switching sessions)

  newSession: () => {
    set(newSessionPatch(get()))
  },

  loadPersistedSessions: async () => {
    try {
      const remote = await fetchSessions()
      if (remote.length === 0) return

      // Use set-updater to get latest state atomically (fixes React StrictMode double-invoke)
      set((state) => {
        const added = matchRemoteSessions(state, remote)
        if (added.length === 0) return state
        return { sessions: [...state.sessions, ...added] }
      })
    } catch (e) {
      reportError('Could not load your saved chats', e)
    }
  },

  // Return to the project and conversation that were open before a reload
  restoreLastView: async () => {
    try {
      const saved = readLastView()
      if (!saved) return
      const project = saved.projectPath ? get().projects.find((p) => p.path === saved.projectPath) : undefined
      if (project && project.id !== get().activeProjectId) get().switchProject(project.id)
      if (saved.persistId) {
        const target = get().sessions.find((s) => s.persistId === saved.persistId)
        if (!target) return
        if (target.id !== get().activeId) {
          await get().switchSession(target.id)
        } else if (get().messages.length === 0 && target.persistId) {
          // switchProject may already have selected this session without loading it
          const messages = recordsToMessages(await fetchSession(target.persistId))
          set((s) => ({
            messages,
            sessions: s.sessions.map((x) => (x.id === target.id ? { ...x, messages } : x)),
          }))
        }
      }
    } finally {
      // Only start saving once the saved view has been read and applied
      markViewRestored()
    }
  },

  switchSession: async (id) => {
    const state = get()
    if (id === state.activeId || state.isStreaming) return
    const target = savedSessions(state).find((s) => s.id === id)
    if (!target) return

    // If session has persist ID but no loaded messages, load from backend
    let loadedMessages = target.messages
    if (target.persistId && target.messages.length === 0) {
      try {
        loadedMessages = recordsToMessages(await fetchSession(target.persistId))
      } catch (e) {
        reportError('Could not open this chat', e)
      }
    }

    const patch = switchSessionPatch(get(), id, loadedMessages)
    if (patch) set(patch)
  },

  renameSession: (id, title) => {
    set((s) => ({
      sessions: s.sessions.map((sess) => (sess.id === id ? { ...sess, title } : sess)),
    }))
    // Saved sessions also keep the new title in the backend
    const target = get().sessions.find((s) => s.id === id)
    if (target?.persistId && title.trim()) {
      renameSessionApi(target.persistId, title.trim()).catch((e) =>
        reportError('Could not rename the chat', e),
      )
    }
  },

  deleteSession: (id) => {
    const target = get().sessions.find((s) => s.id === id)
    if (target?.persistId) {
      deleteSessionApi(target.persistId).catch((e) => reportError('Could not delete the chat', e))
    }
    set(removeSessionsPatch(get(), new Set([id])))
  },

  bulkDeleteSessions: (ids) => {
    const idSet = new Set(ids)
    // Collect persist IDs to delete on backend
    const persistIds = get()
      .sessions.filter((s) => idSet.has(s.id) && s.persistId)
      .map((s) => s.persistId as string)
    if (persistIds.length > 0) {
      bulkDeleteSessionsApi(persistIds).catch((e) => reportError('Could not delete the selected chats', e))
    }
    set(removeSessionsPatch(get(), idSet))
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
    } catch (e) {
      reportError('Could not load your projects', e)
    }
  },

  addProject: (name, path) => {
    const p = makeProject(name)
    // If path provided, also persist to backend
    if (path) {
      createProjectApi(path, name)
        .then((remote) => {
          // Update project with backend ID
          set((s) => ({
            projects: s.projects.map((proj) =>
              proj.id === p.id ? { ...proj, id: remote.id, path: remote.path } : proj,
            ),
          }))
        })
        .catch((e) => reportError('Could not add the project folder', e))
    }
    set(addProjectPatch(get(), p))
  },

  renameProject: (id, name, path) => {
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? { ...p, name, ...(path ? { path } : {}) } : p)),
    }))
  },

  deleteProject: (id, deleteFolder = false) => {
    if (get().projects.length === 1) return // can't delete last

    // Confirmation is shown by the UI (DeleteProjectDialog) before this is called.
    // Sessions are always removed with the project; the folder only when asked.
    // Call backend — pi-native projects go to ignored list, regular projects delete from json
    deleteProjectApi(id, { deleteSessions: true, deleteFolder }).catch((e) =>
      reportError('Could not delete the project', e),
    )

    const patch = removeProjectPatch(get(), id)
    if (patch) set(patch)
  },

  switchProject: (id) => {
    const state = get()
    if (id === state.activeProjectId || state.isStreaming) return
    set(switchProjectPatch(state, id))
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
    const userMsg: Message = {
      id: nextMsgId(),
      role: 'user',
      content,
      images: images.length > 0 ? images : undefined,
    }
    set((s) => ({
      messages: [...s.messages, userMsg],
      isStreaming: true,
      error: null,
      agentStatus: 'thinking' as const,
      lastEventAt: Date.now(),
      permissionRequests: new Map(),
    }))

    // Auto-title from first user message
    const { sessions, activeId } = get()
    const cur = sessions.find((s) => s.id === activeId)
    if (cur && cur.title === 'New') {
      set({
        sessions: sessions.map((s) => (s.id === activeId ? { ...s, title: content.slice(0, 40).trim() } : s)),
      })
    }

    const controller = new AbortController()
    set({ abortController: controller })

    try {
      // Only the message being sent carries its images; earlier images are not re-sent
      const allMessages = get().messages
      // Failed turns are not part of the conversation the model should see
      const history = allMessages
        .filter((m) => !m.error)
        .map((m, i) => ({
          role: m.role,
          content: toApiContent(m, i === allMessages.length - 1),
        }))
      const { provider, model, sessions, activeId } = get()
      const currentSession = sessions.find((s) => s.id === activeId)
      // The active project's folder; General has none, so the bridge uses the home folder
      const projectPath = get().projects.find((p) => p.id === get().activeProjectId)?.path
      const result = await createChat(
        history,
        provider,
        model,
        currentSession?.persistId ?? undefined,
        projectPath,
        get().autoEdits,
      )
      const sessionId = result.session_id
      const persistId = result.persist_id
      set({ sessionId })
      // Link persist_id to the session snapshot
      if (persistId) {
        set((s) => ({
          sessions: s.sessions.map((ses) => (ses.id === s.activeId ? { ...ses, persistId } : ses)),
        }))
      }

      const assistantMsg: Message = { id: nextMsgId(), role: 'assistant', content: '' }
      set((s) => ({ messages: [...s.messages, assistantMsg] }))

      for await (const event of streamChat(sessionId, controller.signal)) {
        set(streamEventPatch(get(), event))
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
      set({
        sessions: ss.map((s) =>
          s.id === aid ? { ...s, messages: m, tokenUsage: t, backendSessionId: sid } : s,
        ),
      })
    }
  },

  resendFrom: async (messageId, content, images = []) => {
    const { messages, isStreaming, sessions, activeId } = get()
    if (isStreaming) return
    const index = messages.findIndex((m) => m.id === messageId)
    if (index < 0) return

    // The session file counts user messages, so the cut point is this message's place among them
    const userIndex = messages.slice(0, index).filter((m) => m.role === 'user').length
    const persistId = sessions.find((s) => s.id === activeId)?.persistId
    if (persistId) {
      try {
        await truncateSessionApi(persistId, userIndex)
      } catch (err) {
        // Nothing was sent: keep the conversation as it was
        set({ error: err instanceof Error ? err.message : 'Unknown error' })
        return
      }
    }

    set({ messages: messages.slice(0, index) })
    await get().sendMessage(content, images)
  },

  regenerate: async () => {
    const { messages } = get()
    let last = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        last = i
        break
      }
    }
    if (last < 0) return
    const { id, content, images } = messages[last]
    await get().resendFrom(id, content, images)
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

useChatStore.subscribe(saveLastView)
