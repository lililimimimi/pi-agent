import { create } from 'zustand'
import { fetchDefaultModel } from '@/services/api/models'
import { makeSession } from '@/stores/sessionPatch'
import { makeProject, type ChatState } from '@/stores/chatModel'
import { sessionActions } from '@/stores/sessionActions'
import { projectActions } from '@/stores/projectActions'
import { messageActions } from '@/stores/messageActions'
import { saveLastView } from '@/stores/lastView'

export type { AgentStatus, Project, SessionSnapshot } from '@/stores/chatModel'

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
  sessionsLoading: true,
  chatLoading: false,
  tokenUsage: { inputTokens: 0, outputTokens: 0 },
  error: null,
  provider: localStorage.getItem('provider') ?? 'deepseek',
  model: localStorage.getItem('model') ?? 'deepseek-ai/DeepSeek-V3',

  executionPreview: null,
  clearExecutionPreview: () => set({ executionPreview: null }),
  autoEdits: false,
  setAutoEdits: (on) => set({ autoEdits: on }),

  agentStatus: 'idle',
  lastEventAt: 0,
  abortController: null,

  ...sessionActions(set, get),
  ...projectActions(set, get),
  ...messageActions(set, get),
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
