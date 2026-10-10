import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { App } from '@/App'
import { ToastProvider } from '@/components/Toast'
import { useChatStore } from '@/stores/chatStore'

describe('opening a saved chat', () => {
  beforeEach(() => {
    useChatStore.setState({
      chatLoading: false,
      sessionsLoading: false,
      agentStatus: 'idle',
      executionPreview: null,
    })
  })

  it('says the chat is loading instead of showing the welcome screen', () => {
    useChatStore.setState({ chatLoading: true })
    render(
      <ToastProvider>
        <App />
      </ToastProvider>,
    )
    expect(screen.getByText('Loading chat…')).toBeInTheDocument()
    expect(screen.queryByText('How can I help you today?')).toBeNull()
  })
})
