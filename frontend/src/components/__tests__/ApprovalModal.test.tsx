import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApprovalModal } from '@/components/chat/ApprovalModal'
import { useChatStore, type PermissionRequest } from '@/stores/chatStore'

const mockRequest: PermissionRequest = {
  toolCallId: 'tc-1',
  toolName: 'bash',
  arguments: { command: 'rm -rf /tmp/test' },
  status: 'pending',
  createdAt: Date.now(),
}

const safeMockRequest: PermissionRequest = {
  toolCallId: 'tc-2',
  toolName: 'read_file',
  arguments: { path: '/tmp/test.txt' },
  status: 'pending',
  createdAt: Date.now(),
}

describe('ApprovalModal', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // Ensure store has a sessionId so respondPermission works
    useChatStore.setState({ sessionId: 'test-session' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders tool name and arguments', () => {
    render(<ApprovalModal request={mockRequest} />)
    expect(screen.getByText('Tool Approval Required')).toBeInTheDocument()
    expect(screen.getByText('bash')).toBeInTheDocument()
    expect(screen.getByText(/rm -rf/)).toBeInTheDocument()
  })

  it('shows danger badge for dangerous tools', () => {
    render(<ApprovalModal request={mockRequest} />)
    expect(screen.getByText('dangerous')).toBeInTheDocument()
  })

  it('does not show danger badge for safe tools', () => {
    render(<ApprovalModal request={safeMockRequest} />)
    expect(screen.queryByText('dangerous')).not.toBeInTheDocument()
  })

  it('shows risk warning for dangerous tools', () => {
    render(<ApprovalModal request={mockRequest} />)
    expect(screen.getByText(/modify files or execute commands/)).toBeInTheDocument()
  })

  it('shows no countdown', () => {
    render(<ApprovalModal request={mockRequest} />)
    expect(screen.queryByText(/Auto-reject/)).not.toBeInTheDocument()
  })

  it('calls respondPermission with true on Approve click', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const respondSpy = vi.fn()
    useChatStore.setState({ respondPermission: respondSpy } as any)

    render(<ApprovalModal request={mockRequest} />)
    await user.click(screen.getByText('Approve'))
    expect(respondSpy).toHaveBeenCalledWith('tc-1', true)
  })

  it('calls respondPermission with false on Reject click', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const respondSpy = vi.fn()
    useChatStore.setState({ respondPermission: respondSpy } as any)

    render(<ApprovalModal request={mockRequest} />)
    await user.click(screen.getByText('Reject'))
    expect(respondSpy).toHaveBeenCalledWith('tc-1', false)
  })

  it('does not reject on its own, however long the user takes', async () => {
    const respondSpy = vi.fn()
    useChatStore.setState({ respondPermission: respondSpy } as any)

    render(<ApprovalModal request={mockRequest} />)

    await act(async () => {
      vi.advanceTimersByTime(10 * 60_000)
    })

    expect(respondSpy).not.toHaveBeenCalled()
    expect(screen.getByText('Approve')).toBeInTheDocument()
  })
})
