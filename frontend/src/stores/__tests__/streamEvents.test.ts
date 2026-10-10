import { describe, it, expect } from 'vitest'
import { streamEventPatch, type StreamState } from '../streamEvents'
import type { SSEEventData } from '@/types'

const session = {
  id: 's1',
  title: 'New',
  messages: [],
  tokenUsage: { inputTokens: 0, outputTokens: 0 },
} as never

function stateWith(messages: StreamState['messages']): StreamState {
  return { messages, permissionRequests: new Map(), sessions: [session], activeId: 's1' }
}

const reply = (content = '') => ({ id: 'a1', role: 'assistant' as const, content })

describe('streamEventPatch', () => {
  it('appends streamed text to the last message', () => {
    const patch = streamEventPatch(stateWith([reply('Hel')]), {
      event: 'text',
      data: { content: 'lo' },
    } as SSEEventData)
    expect(patch.messages?.[0].content).toBe('Hello')
  })

  it('adds a tool call to the last message and marks the agent as calling a tool', () => {
    const event = {
      event: 'tool_call',
      data: { tool_call_id: 't1', tool_name: 'bash', arguments: { command: 'ls' } },
    } as SSEEventData
    const patch = streamEventPatch(stateWith([reply()]), event)
    expect(patch.messages?.[0].toolCalls).toEqual([
      { toolCallId: 't1', toolName: 'bash', arguments: { command: 'ls' } },
    ])
    expect(patch.agentStatus).toBe('tool_calling')
  })

  it('adds a tool result to the last message', () => {
    const event = {
      event: 'tool_result',
      data: { tool_call_id: 't1', output: 'ok', is_error: false },
    } as SSEEventData
    const patch = streamEventPatch(stateWith([reply()]), event)
    expect(patch.messages?.[0].toolResults).toEqual([{ toolCallId: 't1', output: 'ok', isError: false }])
  })

  it('stores a permission request as pending and waits for approval', () => {
    const event = {
      event: 'permission_request',
      data: { tool_call_id: 'p1', tool_name: 'edit', arguments: {} },
    } as SSEEventData
    const patch = streamEventPatch(stateWith([reply()]), event)
    expect(patch.permissionRequests?.get('p1')?.status).toBe('pending')
    expect(patch.agentStatus).toBe('awaiting_approval')
  })

  it('updates token usage on the store and on the active session', () => {
    const event = { event: 'usage', data: { input_tokens: 5, output_tokens: 7 } } as SSEEventData
    const patch = streamEventPatch(stateWith([reply()]), event)
    expect(patch.tokenUsage).toEqual({ inputTokens: 5, outputTokens: 7 })
    expect(patch.sessions?.[0]).toMatchObject({ tokenUsage: { inputTokens: 5, outputTokens: 7 } })
  })

  it('keeps an execution preview for the card to show', () => {
    const event = {
      event: 'execution_preview',
      data: { preview_id: 'x', steps: ['Edit a'], has_write_ops: true },
    } as SSEEventData
    const patch = streamEventPatch(stateWith([reply()]), event)
    expect(patch.executionPreview).toEqual({ previewId: 'x', steps: ['Edit a'], hasWriteOps: true })
  })

  it('removes the empty reply placeholder on error and sets the error', () => {
    const event = { event: 'error', data: { message: 'out of usage' } } as SSEEventData
    const patch = streamEventPatch(stateWith([{ id: 'u1', role: 'user', content: 'hi' }, reply()]), event)
    expect(patch.messages).toEqual([{ id: 'u1', role: 'user', content: 'hi' }])
    expect(patch.error).toBe('out of usage')
    expect(patch.agentStatus).toBe('idle')
  })

  it('keeps a reply that already has text when an error arrives', () => {
    const event = { event: 'error', data: { message: 'boom' } } as SSEEventData
    const patch = streamEventPatch(stateWith([reply('partial answer')]), event)
    expect(patch.messages?.[0].content).toBe('partial answer')
  })

  it('goes back to idle when done', () => {
    const patch = streamEventPatch(stateWith([reply()]), { event: 'done', data: {} } as SSEEventData)
    expect(patch).toEqual({ agentStatus: 'idle' })
  })

  it('changes nothing for an unknown event', () => {
    const patch = streamEventPatch(stateWith([reply()]), {
      event: 'something_new',
      data: {},
    } as unknown as SSEEventData)
    expect(patch).toEqual({})
  })
})
