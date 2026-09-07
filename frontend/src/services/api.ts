import type { SSEEventData } from '@/types'

const BASE = '/api'

/**
 * Create a chat session, returns session_id.
 */
export async function createChat(
  messages: { role: string; content: string }[],
  provider = 'mock',
  model = 'mock-1',
): Promise<string> {
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, provider, model }),
  })
  if (!res.ok) throw new Error(`Failed to create chat: ${res.status}`)
  const data = await res.json()
  return data.session_id
}

/**
 * Stream SSE events for a chat session.
 * Yields parsed SSEEventData objects.
 */
export async function* streamChat(
  sessionId: string,
  signal?: AbortSignal,
): AsyncGenerator<SSEEventData> {
  const res = await fetch(`${BASE}/chat/stream/${sessionId}`, { signal })
  if (!res.ok) throw new Error(`Stream failed: ${res.status}`)
  if (!res.body) throw new Error('No response body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      // Keep the last potentially incomplete line in the buffer
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data: ')) continue
        const json = trimmed.slice(6)
        if (!json) continue
        try {
          yield JSON.parse(json) as SSEEventData
        } catch {
          // Skip malformed JSON lines
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Approve or reject a tool call.
 */
export async function approveToolCall(
  sessionId: string,
  toolCallId: string,
  approved: boolean,
): Promise<void> {
  const res = await fetch(`${BASE}/tool/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      tool_call_id: toolCallId,
      approved,
    }),
  })
  if (!res.ok) throw new Error(`Failed to approve tool: ${res.status}`)
}

/**
 * Fetch the recommended default provider + model from the backend.
 * Returns null if the backend is unreachable.
 */
export async function fetchDefaultModel(): Promise<{
  provider: string
  model: string
} | null> {
  try {
    const res = await fetch(`${BASE}/models/default`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
