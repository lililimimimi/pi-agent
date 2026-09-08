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
}

// ── SSE event types from backend ──

export type SSEEventData =
  | { event: 'text'; data: { content: string } }
  | { event: 'tool_call'; data: { tool_call_id: string; tool_name: string; arguments: Record<string, unknown> } }
  | { event: 'tool_result'; data: { tool_call_id: string; output: string; is_error: boolean } }
  | { event: 'usage'; data: { input_tokens: number; output_tokens: number } }
  | { event: 'done'; data: Record<string, never> }
  | { event: 'permission_request'; data: { tool_call_id: string; tool_name: string; arguments: Record<string, unknown> } }
  | { event: 'error'; data: { message: string } }
