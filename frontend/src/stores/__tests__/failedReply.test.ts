import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useChatStore } from '../chatStore'

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

describe('a failed reply', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('/api/chat')) {
          return new Response(JSON.stringify({ session_id: 's1', persist_id: 'p1' }), { status: 200 })
        }
        return sseResponse(['data: {"event":"error","data":{"message":"model not supported"}}'])
      }),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('leaves no empty assistant bubble behind, and keeps the error', async () => {
    await useChatStore.getState().sendMessage('hello')

    const messages = useChatStore.getState().messages
    expect(messages.map((m) => m.role)).toEqual(['user'])
    expect(useChatStore.getState().error).toBe('model not supported')
  })
})
