import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useChatStore } from '../chatStore'
import type { Message } from '@/types'

const encoder = new TextEncoder()

function sseResponse(lines: string[]) {
  const body = new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line + '\n\n'))
      controller.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

const history: Message[] = [
  { id: 'u1', role: 'user', content: 'first question' },
  { id: 'a1', role: 'assistant', content: 'first answer' },
  { id: 'u2', role: 'user', content: 'second question' },
  { id: 'a2', role: 'assistant', content: 'second answer' },
]

describe('resending a user message', () => {
  let calls: { url: string; init?: RequestInit }[]
  let truncateStatus: number
  let truncateMessage: string

  beforeEach(() => {
    calls = []
    truncateStatus = 200
    truncateMessage = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url)
        calls.push({ url: u, init })
        if (u.includes('/truncate')) {
          const body =
            truncateStatus === 200
              ? { status: 'ok' }
              : { error: { code: 'CONFLICT', message: truncateMessage } }
          return new Response(JSON.stringify(body), { status: truncateStatus })
        }
        if (u.endsWith('/api/chat')) {
          return new Response(JSON.stringify({ session_id: 'live-1', persist_id: 'p1' }), { status: 200 })
        }
        return sseResponse([
          'data: {"event":"text","data":{"content":"new answer"}}',
          'data: {"event":"done","data":{}}',
        ])
      }),
    )

    useChatStore.setState({
      sessions: [
        {
          id: 's1',
          title: 'chat',
          projectId: 'proj',
          messages: history,
          tokenUsage: { inputTokens: 0, outputTokens: 0 },
          backendSessionId: null,
          persistId: 'p1',
        },
      ],
      activeId: 's1',
      messages: history,
      isStreaming: false,
      error: null,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('cuts the saved session before that message, then sends the new text', async () => {
    await useChatStore.getState().resendFrom('u2', 'edited question')

    const truncate = calls.find((c) => c.url.includes('/truncate'))!
    expect(truncate.url).toContain('/api/sessions/p1/truncate')
    expect(JSON.parse(String(truncate.init?.body))).toEqual({ user_index: 1 })

    const send = calls.find((c) => c.url.endsWith('/api/chat'))!
    const sent = JSON.parse(String(send.init?.body)).messages
    expect(sent.map((m: { content: string }) => m.content)).toEqual([
      'first question',
      'first answer',
      'edited question',
    ])
  })

  it('keeps messages before the edited one and replaces the rest with the new turn', async () => {
    await useChatStore.getState().resendFrom('u2', 'edited question')

    const messages = useChatStore.getState().messages
    expect(messages.slice(0, 2).map((m) => m.content)).toEqual(['first question', 'first answer'])
    expect(messages[2]).toMatchObject({ role: 'user', content: 'edited question' })
    expect(messages.at(-1)).toMatchObject({ role: 'assistant', content: 'new answer' })
    expect(messages.find((m) => m.content === 'second answer')).toBeUndefined()
  })

  it('sends nothing and keeps the conversation when the saved session cannot be cut', async () => {
    truncateStatus = 409
    truncateMessage = "This chat is saved in Pi's own format, so it cannot be edited here."
    await useChatStore.getState().resendFrom('u2', 'edited question')

    expect(calls.some((c) => c.url.endsWith('/api/chat'))).toBe(false)
    expect(useChatStore.getState().messages).toEqual(history)
    expect(useChatStore.getState().error).toBe(truncateMessage)
  })

  it('regenerate asks again for the last user message and drops its old reply', async () => {
    await useChatStore.getState().regenerate()

    const truncate = calls.find((c) => c.url.includes('/truncate'))!
    expect(JSON.parse(String(truncate.init?.body))).toEqual({ user_index: 1 })

    const messages = useChatStore.getState().messages
    expect(messages.map((m) => m.content)).toEqual([
      'first question',
      'first answer',
      'second question',
      'new answer',
    ])
  })
})
