import { createChat, streamChat, stopChatApi } from '@/services/api/chat'
import { truncateSessionApi } from '@/services/api/sessions'
import { streamEventPatch } from '@/stores/streamEvents'
import { toApiContent } from '@/stores/messageConversion'
import { reportError } from '@/lib/appError'
import { nextMsgId } from '@/stores/chatModel'
import type { ChatGet, ChatSet, ChatState } from '@/stores/chatModel'
import type { ImageAttachment, Message } from '@/types'

export function messageActions(
  set: ChatSet,
  get: ChatGet,
): Pick<ChatState, 'stopAgent' | 'sendMessage' | 'resendFrom' | 'regenerate'> {
  return {
    stopAgent: () => {
      const { abortController, sessionId } = get()
      // Ask the backend to keep what was written so far; a failure here must not block stopping
      if (sessionId) stopChatApi(sessionId).catch((e) => reportError('Could not save the stopped reply', e))
      abortController?.abort()
      set({ isStreaming: false, agentStatus: 'idle' as const, abortController: null })
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
      }))

      // Auto-title from first user message
      const { sessions, activeId } = get()
      const cur = sessions.find((s) => s.id === activeId)
      if (cur && cur.title === 'New') {
        set({
          sessions: sessions.map((s) =>
            s.id === activeId ? { ...s, title: content.slice(0, 40).trim() } : s,
          ),
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
  }
}
