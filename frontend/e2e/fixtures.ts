import type { Page, Route, Request } from '@playwright/test'

/** The reply the fake model writes, one text event then done, in the backend's SSE format */
export function replyStream(text: string): string {
  return [
    `data: ${JSON.stringify({ event: 'text', data: { content: text } })}`,
    '',
    `data: ${JSON.stringify({ event: 'done', data: {} })}`,
    '',
    '',
  ].join('\n')
}

/**
 * Answers the backend calls the app makes, so the page works without a backend or model keys.
 * `reply` is what the fake model writes; the calls are recorded in `log` for assertions.
 */
export async function mockBackend(page: Page, options: { reply: () => string }) {
  const log: { method: string; path: string; body: unknown }[] = []

  // Only the backend's own paths (/api/...). Source files such as /src/services/api/... must still load.
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route: Route, request: Request) => {
      const url = new URL(request.url())
      const path = url.pathname
      const method = request.method()
      const body = request.postData() ? JSON.parse(request.postData() as string) : undefined
      log.push({ method, path, body })

      const json = (data: unknown) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })

      if (path === '/api/chat' && method === 'POST') return json({ session_id: 's1', persist_id: 'p1' })
      if (path === '/api/chat/stream/s1') {
        return route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: replyStream(options.reply()),
        })
      }
      if (path.endsWith('/truncate')) return json({ status: 'ok' })
      if (path.startsWith('/api/chat/stop/')) return json({ status: 'ok' })
      if (path === '/api/models/default') return json({ provider: 'mock', model: 'mock-1' })
      if (
        path === '/api/sessions' ||
        path === '/api/projects' ||
        path === '/api/providers' ||
        path === '/api/models' ||
        path === '/api/models/catalog'
      ) {
        return json([])
      }
      return json({})
    },
  )

  return log
}
