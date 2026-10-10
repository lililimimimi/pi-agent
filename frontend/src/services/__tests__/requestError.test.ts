import { describe, it, expect, vi, afterEach } from 'vitest'
import { requestError } from '@/services/api/client'
import { fetchSessions } from '@/services/api/sessions'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('requestError', () => {
  it('uses the backend message when the backend sent one', async () => {
    const res = new Response(
      JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Session x not found' } }),
      {
        status: 404,
      },
    )
    const err = await requestError(res, 'Failed to load chat')
    expect(err.message).toBe('Session x not found')
  })

  it('falls back to the given text and status when there is no message', async () => {
    const res = new Response('<html>oops</html>', { status: 502 })
    const err = await requestError(res, 'Failed to load chat')
    expect(err.message).toBe('Failed to load chat: 502')
  })

  it('an API call that fails shows the backend reason, not only the status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: { code: 'INVALID_REQUEST', message: 'Title cannot be empty' } }),
            {
              status: 400,
            },
          ),
      ),
    )
    await expect(fetchSessions()).rejects.toThrow('Title cannot be empty')
  })
})
