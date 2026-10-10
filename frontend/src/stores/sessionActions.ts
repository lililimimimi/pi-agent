import {
  fetchSessions,
  fetchSession,
  deleteSessionApi,
  bulkDeleteSessionsApi,
  renameSessionApi,
} from '@/services/api/sessions'
import {
  matchRemoteSessions,
  newSessionPatch,
  removeSessionsPatch,
  savedSessions,
  switchSessionPatch,
} from '@/stores/sessionPatch'
import { recordsToMessages } from '@/stores/messageConversion'
import { reportError } from '@/lib/appError'
import { markViewRestored, readLastView } from '@/stores/lastView'
import type { ChatGet, ChatSet, ChatState } from '@/stores/chatModel'

export function sessionActions(
  set: ChatSet,
  get: ChatGet,
): Pick<
  ChatState,
  | 'newSession'
  | 'loadPersistedSessions'
  | 'restoreLastView'
  | 'switchSession'
  | 'renameSession'
  | 'deleteSession'
  | 'bulkDeleteSessions'
  | 'loadActiveMessages'
> {
  return {
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
      } finally {
        set({ sessionsLoading: false })
      }
    },

    // Return to the project and conversation that were open before a reload
    restoreLastView: async () => {
      try {
        const saved = readLastView()
        if (!saved) return
        const project = saved.projectPath
          ? get().projects.find((p) => p.path === saved.projectPath)
          : undefined
        const switchedProject = !!project && project.id !== get().activeProjectId
        if (project && switchedProject) get().switchProject(project.id)
        if (saved.persistId) {
          const target = get().sessions.find((s) => s.persistId === saved.persistId)
          if (!target) return
          if (target.id !== get().activeId) {
            await get().switchSession(target.id)
          } else if (!switchedProject) {
            // switchProject already loads the chat it selects, so only load it here otherwise
            await get().loadActiveMessages()
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
        set({ chatLoading: true })
        try {
          loadedMessages = recordsToMessages(await fetchSession(target.persistId))
        } catch (e) {
          reportError('Could not open this chat', e)
        } finally {
          set({ chatLoading: false })
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

    loadActiveMessages: async () => {
      const state = get()
      const active = savedSessions(state).find((s) => s.id === state.activeId)
      if (!active?.persistId || active.messages.length > 0) return
      set({ chatLoading: true })
      try {
        const messages = recordsToMessages(await fetchSession(active.persistId))
        set((s) => ({
          // Apply only if the user has not moved to another chat in the meantime
          messages: s.activeId === active.id ? messages : s.messages,
          sessions: s.sessions.map((x) => (x.id === active.id ? { ...x, messages } : x)),
        }))
      } catch (e) {
        reportError('Could not open this chat', e)
      } finally {
        set({ chatLoading: false })
      }
    },
  }
}
