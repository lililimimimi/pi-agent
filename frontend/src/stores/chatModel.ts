import type { ExecutionPreview } from '@/components/chat/ExecutionPreviewCard'
import type { ImageAttachment, Message, TokenUsage } from '@/types'

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
export const nextMsgId = () => `msg-${++msgCounter}`
let projectCounter = 0
export const nextProjectId = () => `proj-${++projectCounter}`

// ── Helpers ───────────────────────────────────────────────────────────────────
export const makeProject = (name: string): Project => ({ id: nextProjectId(), name })

// ── Agent status ──────────────────────────────────────────────────────────────
export type AgentStatus = 'idle' | 'thinking' | 'tool_calling'

export type ChatState = {
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
  /** True until the saved chat list has been loaded (or failed to load) once */
  sessionsLoading: boolean
  /** True while a saved chat's messages are being fetched */
  chatLoading: boolean
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

  // Agent status
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
  /** Loads the saved messages of the active chat, if it was selected without them */
  loadActiveMessages: () => Promise<void>

  // Abort
  abortController: AbortController | null
  stopAgent: () => void

  // Model
  setModel: (provider: string, model: string) => void
  sendMessage: (content: string, images?: ImageAttachment[]) => Promise<void>
  /** Drops this message and everything after it, then sends the given text in its place */
  resendFrom: (messageId: string, content: string, images?: ImageAttachment[]) => Promise<void>
  /** Asks again for the last user message, replacing the reply that followed it */
  regenerate: () => Promise<void>
  reset: () => void
  initProvider: () => Promise<void>
}

export type ChatSet = (partial: Partial<ChatState> | ((state: ChatState) => Partial<ChatState>)) => void
export type ChatGet = () => ChatState
