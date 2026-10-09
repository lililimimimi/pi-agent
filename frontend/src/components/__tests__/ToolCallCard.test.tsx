import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToolCallCard } from '@/components/chat/ToolCallCard'
import type { ToolCall, ToolResult } from '@/types'

const mockToolCall: ToolCall = {
  toolCallId: 'tc-1',
  toolName: 'read_file',
  arguments: { path: '/tmp/test.txt' },
}

const mockResult: ToolResult = {
  toolCallId: 'tc-1',
  output: 'file content here',
  isError: false,
}

const mockErrorResult: ToolResult = {
  toolCallId: 'tc-1',
  output: 'permission denied',
  isError: true,
}

describe('ToolCallCard', () => {
  it('shows running status when no result', () => {
    render(<ToolCallCard toolCall={mockToolCall} />)
    expect(screen.getByText('running')).toBeInTheDocument()
    expect(screen.getByText('read_file')).toBeInTheDocument()
  })

  it('shows done status when result is present', () => {
    render(<ToolCallCard toolCall={mockToolCall} result={mockResult} />)
    expect(screen.getByText('done')).toBeInTheDocument()
  })

  it('shows error status when result has error', () => {
    render(<ToolCallCard toolCall={mockToolCall} result={mockErrorResult} />)
    expect(screen.getByText('error')).toBeInTheDocument()
  })

  it('shows summary inline in header', () => {
    render(<ToolCallCard toolCall={mockToolCall} />)
    // Summary is always visible in header
    expect(screen.getByText('/tmp/test.txt')).toBeInTheDocument()
  })

  it('toggles arguments full JSON on click', async () => {
    const user = userEvent.setup()
    const tc: ToolCall = { toolCallId: 'tc-2', toolName: 'bash', arguments: { command: 'echo hello', verbose: true } }
    render(<ToolCallCard toolCall={tc} />)

    // Full JSON not visible by default
    expect(screen.queryByText(/"verbose"/)).not.toBeInTheDocument()

    // Click to expand
    await user.click(screen.getByText('Arguments'))
    expect(screen.getByText(/"verbose"/)).toBeInTheDocument()

    // Click to collapse
    await user.click(screen.getByText('Arguments'))
    expect(screen.queryByText(/"verbose"/)).not.toBeInTheDocument()
  })

  it('toggles result visibility on click', async () => {
    const user = userEvent.setup()
    render(<ToolCallCard toolCall={mockToolCall} result={mockResult} />)

    // Result collapsed by default
    expect(screen.queryByText('file content here')).not.toBeInTheDocument()

    // Click to expand
    await user.click(screen.getByText('Result'))
    expect(screen.getByText('file content here')).toBeInTheDocument()
  })

  it('shows approve/reject buttons when running', () => {
    render(<ToolCallCard toolCall={mockToolCall} />)
    expect(screen.getByText('Approve')).toBeInTheDocument()
    expect(screen.getByText('Reject')).toBeInTheDocument()
  })

  it('hides approve/reject buttons when done', () => {
    render(<ToolCallCard toolCall={mockToolCall} result={mockResult} />)
    expect(screen.queryByText('Approve')).not.toBeInTheDocument()
  })
})
