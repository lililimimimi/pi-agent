import { API_BASE, requestError } from '@/services/api/client'
import { CreateChatResponseSchema, SSEEventSchema, parseResponse, type SSEEvent } from '@/lib/schemas'

/**
 * Create a chat session, returns { session_id, persist_id }.
 */
export type ContentPart =
  { type: 'text'; text: string } | { type: 'image'; image: { media_type: string; data: string } }

export async function createChat(
  messages: { role: string; content: string | ContentPart[] }[],
  provider = 'mock',
  model = 'mock-1',
  persistId?: string,
  projectPath?: string,
  autoEdits = false,
): Promise<{ session_id: string; persist_id: string }> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // project_path lets the backend add that project's rules to the prompt;
    // auto_edits lets file edits inside the project run without a confirmation
    body: JSON.stringify({
      messages,
      provider,
      model,
      persist_id: persistId ?? '',
      project_path: projectPath ?? '',
      auto_edits: autoEdits,
    }),
  })
  if (!res.ok) throw await requestError(res, 'Failed to create chat')
  return parseResponse(CreateChatResponseSchema, await res.json(), 'POST /api/chat')
}

/**
 * Stream SSE events for a chat session.
 * Yields parsed SSEEventData objects.
 */
export async function* streamChat(sessionId: string, signal?: AbortSignal): AsyncGenerator<SSEEvent> {
  const res = await fetch(`${API_BASE}/chat/stream/${sessionId}`, { signal })
  if (!res.ok) throw await requestError(res, 'Stream failed')
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
        // A bad event is an error: it is reported to the user, not skipped
        yield parseResponse(SSEEventSchema, JSON.parse(json), 'chat stream')
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
  const res = await fetch(`${API_BASE}/tool/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      tool_call_id: toolCallId,
      approved,
    }),
  })
  if (!res.ok) throw await requestError(res, 'Failed to approve tool')
}

/** Ends a streaming reply early; the backend keeps the text written so far. */
export async function stopChatApi(sessionId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/chat/stop/${encodeURIComponent(sessionId)}`, { method: 'POST' })
  if (!res.ok) throw await requestError(res, 'Failed to stop reply')
}

export async function confirmPreview(previewId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/preview/${previewId}/confirm`, { method: 'POST' })
  if (!res.ok) throw await requestError(res, 'Failed to confirm preview')
}

export async function cancelPreview(previewId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/preview/${previewId}/cancel`, { method: 'POST' })
  if (!res.ok) throw await requestError(res, 'Failed to cancel preview')
}
