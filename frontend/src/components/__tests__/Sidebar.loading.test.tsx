import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { ToastProvider } from '@/components/Toast'
import { useChatStore } from '@/stores/chatStore'

function renderSidebar() {
  return render(
    <ToastProvider>
      <Sidebar onSettingsClick={() => {}} />
    </ToastProvider>,
  )
}

describe('chat list while it loads', () => {
  beforeEach(() => {
    useChatStore.setState({ sessionsLoading: true, chatLoading: false })
  })

  it('shows a placeholder, not an empty message, while the saved chats are still loading', () => {
    renderSidebar()
    expect(screen.getByLabelText('Loading chats')).toBeInTheDocument()
    expect(screen.queryByText(/No chats yet/)).toBeNull()
  })

  it('once loading has finished, the list shows the current chat instead of the placeholder', () => {
    useChatStore.setState({ sessionsLoading: false })
    renderSidebar()
    expect(screen.queryByLabelText('Loading chats')).toBeNull()
    expect(screen.getByText('New')).toBeInTheDocument()
  })
})
