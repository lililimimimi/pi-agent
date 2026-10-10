// ── Domain types matching backend SSE events ──

export type Role = 'user' | 'assistant' | 'tool'

export type ImageAttachment = {
  id: string
  name: string
  /** Base64-encoded data URL */
  dataUrl: string
}

export type ToolCall = {
  toolCallId: string
  toolName: string
  arguments: Record<string, unknown>
}

export type ToolResult = {
  toolCallId: string
  output: string
  isError: boolean
}

export type TokenUsage = {
  inputTokens: number
  outputTokens: number
}

export type Message = {
  id: string
  role: Role
  content: string
  toolCalls?: ToolCall[]
  toolResults?: ToolResult[]
  images?: ImageAttachment[]
  /** Set on a failed turn restored from the session file: the raw error text */
  error?: string
}

// ── SSE event types from backend (the schema is the source of truth) ──

export type { SSEEvent as SSEEventData } from '@/lib/schemas'
