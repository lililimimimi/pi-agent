import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useChatStore } from '../chatStore'

describe('stopping a reply', () => {
  let calls: string[]

  beforeEach(() => {
    calls = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(String(url))
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200 })
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks the backend to keep the reply, and aborts the stream', () => {
    const controller = new AbortController()
    useChatStore.setState({ sessionId: 'live-1', abortController: controller, isStreaming: true })

    useChatStore.getState().stopAgent()

    expect(calls).toContain('/api/chat/stop/live-1')
    expect(controller.signal.aborted).toBe(true)
    expect(useChatStore.getState().isStreaming).toBe(false)
  })

  it('still stops when the backend cannot be reached', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network down')
      }),
    )
    const controller = new AbortController()
    useChatStore.setState({ sessionId: 'live-2', abortController: controller, isStreaming: true })

    expect(() => useChatStore.getState().stopAgent()).not.toThrow()
    expect(controller.signal.aborted).toBe(true)
  })
})
