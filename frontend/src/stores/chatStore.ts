import { create } from 'zustand'
import { createChat, streamChat, approveToolCall, fetchDefaultModel } from '@/services/api'
import type { Message, TokenUsage, ToolCall, ToolResult } from '@/types'

type ChatState = {
  messages: Message[]
  sessionId: string | null
  isStreaming: boolean
  tokenUsage: TokenUsage
  error: string | null
  provider: string
  model: string

  setModel: (provider: string, model: string) => void
  sendMessage: (content: string) => Promise<void>
  approveToolCall: (toolCallId: string, approved: boolean) => Promise<void>
  reset: () => void
  initProvider: () => Promise<void>
}

let msgCounter = 0
const nextId = () => `msg-${++msgCounter}`

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  sessionId: null,
  isStreaming: false,
  tokenUsage: { inputTokens: 0, outputTokens: 0 },
  error: null,
  provider: localStorage.getItem('provider') ?? 'deepseek',
  model: localStorage.getItem('model') ?? 'deepseek-ai/DeepSeek-V3',

  setModel: (provider: string, model: string) => {
    localStorage.setItem('provider', provider)
    localStorage.setItem('model', model)
    set({ provider, model })
  },

  sendMessage: async (content: string) => {
    const userMsg: Message = { id: nextId(), role: 'user', content }
    set((s) => ({
      messages: [...s.messages, userMsg],
      isStreaming: true,
      error: null,
    }))

    try {
      // Build conversation history for the API
      const history = get().messages.map((m) => ({
        role: m.role,
        content: m.content,
      }))

      const { provider, model } = get()
      const sessionId = await createChat(history, provider, model)
      set({ sessionId })

      // Prepare an assistant message to accumulate into
      const assistantId = nextId()
      const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '' }
      set((s) => ({ messages: [...s.messages, assistantMsg] }))

      for await (const event of streamChat(sessionId)) {
        const { messages } = get()
        const lastIdx = messages.length - 1

        switch (event.event) {
          case 'text': {
            const updated = [...messages]
            updated[lastIdx] = {
              ...updated[lastIdx],
              content: updated[lastIdx].content + event.data.content,
            }
            set({ messages: updated })
            break
          }

          case 'tool_call': {
            const tc: ToolCall = {
              toolCallId: event.data.tool_call_id,
              toolName: event.data.tool_name,
              arguments: event.data.arguments,
            }
            const updated = [...messages]
            const existing = updated[lastIdx].toolCalls ?? []
            updated[lastIdx] = {
              ...updated[lastIdx],
              toolCalls: [...existing, tc],
            }
            set({ messages: updated })
            break
          }

          case 'tool_result': {
            const tr: ToolResult = {
              toolCallId: event.data.tool_call_id,
              output: event.data.output,
              isError: event.data.is_error,
            }
            const updated = [...messages]
            const existingResults = updated[lastIdx].toolResults ?? []
            updated[lastIdx] = {
              ...updated[lastIdx],
              toolResults: [...existingResults, tr],
            }
            set({ messages: updated })
            break
          }

          case 'usage': {
            set({
              tokenUsage: {
                inputTokens: event.data.input_tokens,
                outputTokens: event.data.output_tokens,
              },
            })
            break
          }

          case 'error': {
            set({ error: event.data.message })
            break
          }

          case 'done': {
            break
          }
        }
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      set({ isStreaming: false })
    }
  },

  approveToolCall: async (toolCallId: string, approved: boolean) => {
    const { sessionId } = get()
    if (!sessionId) return
    await approveToolCall(sessionId, toolCallId, approved)
  },

  reset: () => {
    msgCounter = 0
    set({
      messages: [],
      sessionId: null,
      isStreaming: false,
      tokenUsage: { inputTokens: 0, outputTokens: 0 },
      error: null,
    })
  },

  initProvider: async () => {
    // Only auto-detect if user hasn't manually chosen a provider
    const saved = localStorage.getItem('provider')
    if (saved) return

    const result = await fetchDefaultModel()
    if (result) {
      localStorage.setItem('provider', result.provider)
      localStorage.setItem('model', result.model)
      set({ provider: result.provider, model: result.model })
    }
    // If fetch fails, keep existing localStorage values (already loaded in initial state)
  },
}))
