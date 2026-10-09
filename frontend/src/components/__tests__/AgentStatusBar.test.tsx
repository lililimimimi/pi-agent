import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ChatView } from '@/components/chat/ChatView'
import { ToastProvider } from '@/components/Toast'
import { useChatStore } from '@/stores/chatStore'

const wrapper = ({ children }: { children: ReactNode }) => (
  <ToastProvider>{children}</ToastProvider>
)

// Mock scrollIntoView
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

describe('ChatView — agent status indicator', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders no status text when not streaming', () => {
    useChatStore.setState({ isStreaming: false, agentStatus: 'idle', messages: [] })
    render(<ChatView />, { wrapper })
    expect(screen.queryByText('Thinking…')).not.toBeInTheDocument()
    expect(screen.queryByText('Executing tool…')).not.toBeInTheDocument()
  })

  it('shows "Thinking…" when streaming and thinking', () => {
    useChatStore.setState({ isStreaming: true, agentStatus: 'thinking', messages: [] })
    render(<ChatView />, { wrapper })
    expect(screen.getByText('Thinking…')).toBeInTheDocument()
  })

  it('shows "Executing tool…" when streaming and tool_calling', () => {
    useChatStore.setState({ isStreaming: true, agentStatus: 'tool_calling', messages: [] })
    render(<ChatView />, { wrapper })
    expect(screen.getByText('Executing tool…')).toBeInTheDocument()
  })

  it('shows "Awaiting approval…" when streaming and awaiting_approval', () => {
    useChatStore.setState({ isStreaming: true, agentStatus: 'awaiting_approval', messages: [] })
    render(<ChatView />, { wrapper })
    expect(screen.getByText('Awaiting approval…')).toBeInTheDocument()
  })

  it('defaults to "Thinking…" for idle status while streaming', () => {
    useChatStore.setState({ isStreaming: true, agentStatus: 'idle', messages: [] })
    render(<ChatView />, { wrapper })
    expect(screen.getByText('Thinking…')).toBeInTheDocument()
  })
})
