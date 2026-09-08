import { create } from 'zustand'
import { createChat, streamChat, approveToolCall, fetchDefaultModel } from '@/services/api'
import type { Message, TokenUsage, ToolCall, ToolResult } from '@/types'

// ── Domain types ─────────────────────────────────────────────────────────────
export type Project = {
  id: string
  name: string
}

export type SessionSnapshot = {
  id: string
  title: string
  projectId: string
  messages: Message[]
  tokenUsage: TokenUsage
  backendSessionId: string | null
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
})

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

  // Session actions
  newSession: () => void
  switchSession: (id: string) => void
  renameSession: (id: string, title: string) => void
  deleteSession: (id: string) => void

  // Project actions
  addProject: (name: string) => void
  renameProject: (id: string, name: string) => void
  deleteProject: (id: string) => void
  switchProject: (id: string) => void

  // Model
  setModel: (provider: string, model: string) => void
  sendMessage: (content: string) => Promise<void>
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

  switchSession: (id) => {
    const { sessions, activeId, messages, tokenUsage, sessionId, isStreaming } = get()
    if (id === activeId || isStreaming) return
    const saved = sessions.map((s) =>
      s.id === activeId ? { ...s, messages, tokenUsage, backendSessionId: sessionId } : s
    )
    const target = saved.find((s) => s.id === id)
    if (!target) return
    set({
      sessions: saved,
      activeId: id,
      messages: target.messages,
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
    const remaining = sessions.filter((s) => s.id !== id)
    if (remaining.length === 0) {
      const fresh = makeSession(activeProjectId)
      set({ sessions: [fresh], activeId: fresh.id, messages: [], sessionId: null, tokenUsage: { inputTokens: 0, outputTokens: 0 }, error: null })
      return
    }
    if (id === activeId) {
      // Switch to last remaining
      const next = remaining[remaining.length - 1]
      set({ sessions: remaining, activeId: next.id, messages: next.messages, sessionId: next.backendSessionId, tokenUsage: next.tokenUsage, error: null })
    } else {
      set({ sessions: remaining })
    }
  },

  // ── Project actions ────────────────────────────────────────────────────────
  addProject: (name) => {
    const p = makeProject(name)
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
    const remaining = projects.filter((p) => p.id !== id)
    const remainingSessions = sessions.filter((s) => s.projectId !== id)
    const newProjectId = remaining[0].id
    // If active project deleted, switch to first remaining
    if (id === activeProjectId) {
      let targetSessions = remainingSessions.filter((s) => s.projectId === newProjectId)
      if (targetSessions.length === 0) {
        const fresh = makeSession(newProjectId)
        targetSessions = [fresh]
        set({ projects: remaining, sessions: [...remainingSessions, fresh], activeProjectId: newProjectId, activeId: fresh.id, messages: [], sessionId: null, tokenUsage: { inputTokens: 0, outputTokens: 0 }, error: null })
        return
      }
      const next = targetSessions[targetSessions.length - 1]
      set({ projects: remaining, sessions: remainingSessions, activeProjectId: newProjectId, activeId: next.id, messages: next.messages, sessionId: next.backendSessionId, tokenUsage: next.tokenUsage, error: null })
    } else {
      // Just remove project + its sessions
      const stillActive = remainingSessions.find((s) => s.id === activeId)
      set({ projects: remaining, sessions: stillActive ? remainingSessions : remainingSessions })
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

  // ── Message actions ────────────────────────────────────────────────────────
  sendMessage: async (content: string) => {
    const userMsg: Message = { id: nextMsgId(), role: 'user', content }
    set((s) => ({ messages: [...s.messages, userMsg], isStreaming: true, error: null }))

    // Auto-title from first user message
    const { sessions, activeId } = get()
    const cur = sessions.find((s) => s.id === activeId)
    if (cur && cur.title === 'New Conversation') {
      set({ sessions: sessions.map((s) => s.id === activeId ? { ...s, title: content.slice(0, 40).trim() } : s) })
    }

    try {
      const history = get().messages.map((m) => ({ role: m.role, content: m.content }))
      const { provider, model } = get()
      const sessionId = await createChat(history, provider, model)
      set({ sessionId })

      const assistantMsg: Message = { id: nextMsgId(), role: 'assistant', content: '' }
      set((s) => ({ messages: [...s.messages, assistantMsg] }))

      for await (const event of streamChat(sessionId)) {
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
            set({ messages: updated })
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
          case 'error':
            set({ error: event.data.message })
            break
          case 'done':
            break
        }
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      set({ isStreaming: false })
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
