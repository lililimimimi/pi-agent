import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { App } from '@/App'
import { ToastProvider } from '@/components/Toast'
import { useChatStore } from '@/stores/chatStore'

// The header says so when the agent is waiting on the user, and says nothing otherwise
describe('header: awaiting approval', () => {
  beforeEach(() => {
    useChatStore.setState({ agentStatus: 'idle', executionPreview: null, permissionRequests: new Map() })
  })

  it('is hidden while nothing is waiting', () => {
    render(
      <ToastProvider>
        <App />
      </ToastProvider>,
    )
    expect(screen.queryByText('Awaiting approval')).toBeNull()
  })

  it('shows while a tool call waits for approval', () => {
    useChatStore.setState({ agentStatus: 'awaiting_approval' })
    render(
      <ToastProvider>
        <App />
      </ToastProvider>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Awaiting approval')
  })

  it('shows while an execution preview waits for an answer', () => {
    useChatStore.setState({
      executionPreview: { previewId: 'pv-1', steps: ['Edit a.ts'], hasWriteOps: true },
    })
    render(
      <ToastProvider>
        <App />
      </ToastProvider>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Awaiting approval')
  })
})
