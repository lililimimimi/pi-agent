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

describe('sendMessage with an image', () => {
  let calls: { url: string; init?: RequestInit }[]

  beforeEach(() => {
    calls = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      if (String(url).endsWith('/api/chat')) {
        return new Response(JSON.stringify({ session_id: 's1', persist_id: 'p1' }), { status: 200 })
      }
      return sseResponse([
        'data: {"event":"text","data":{"content":"这是红色"}}',
        'data: {"event":"done","data":{}}',
      ])
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts text + image parts and streams the reply', async () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
    await useChatStore.getState().sendMessage('这是什么', [
      { id: 'img-1', name: 'shot.png', dataUrl },
    ])

    const createCall = calls.find((c) => c.url.endsWith('/api/chat'))!
    const body = JSON.parse(String(createCall.init?.body))
    expect(body.messages.at(-1).content).toEqual([
      { type: 'text', text: '这是什么' },
      { type: 'image', image: { media_type: 'image/png', data: 'iVBORw0KGgo=' } },
    ])

    const messages = useChatStore.getState().messages
    expect(messages.at(-1)?.content).toBe('这是红色')
    expect(useChatStore.getState().error).toBeNull()
  })
})
