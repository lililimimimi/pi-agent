import { describe, it, expect, vi, afterEach } from 'vitest'
import { createChat, streamChat } from '@/services/api/chat'

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

async function collect(gen: AsyncGenerator<unknown>) {
  const out: unknown[] = []
  for await (const item of gen) out.push(item)
  return out
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('responses are checked at the API boundary', () => {
  it('a stream event with an unknown shape is an error, not skipped', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sseResponse(['data: {"event":"bogus","data":{}}'])),
    )
    await expect(collect(streamChat('s1'))).rejects.toThrow('Unexpected response from chat stream')
  })

  it('a malformed stream line is an error, not skipped', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sseResponse(['data: {not json'])),
    )
    await expect(collect(streamChat('s1'))).rejects.toThrow()
  })

  it('valid stream events are passed through unchanged', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse(['data: {"event":"text","data":{"content":"hi"}}', 'data: {"event":"done","data":{}}']),
      ),
    )
    const events = await collect(streamChat('s1'))
    expect(events).toEqual([
      { event: 'text', data: { content: 'hi' } },
      { event: 'done', data: {} },
    ])
  })

  it('createChat without a session id is an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ persist_id: 'p' }), { status: 200 })),
    )
    await expect(createChat([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'Unexpected response from POST /api/chat',
    )
  })
})
