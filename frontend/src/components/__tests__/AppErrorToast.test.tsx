import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ToastProvider } from '@/components/Toast'
import { reportError } from '@/lib/appError'
import { useChatStore } from '@/stores/chatStore'

describe('errors reported without a component', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the message as an error toast, with the raw error as detail', () => {
    render(
      <ToastProvider>
        <div />
      </ToastProvider>,
    )
    act(() => reportError('Could not rename the chat', new Error('Failed to rename session: 500')))

    expect(screen.getByText('Could not rename the chat')).toBeInTheDocument()
    expect(screen.getByText('Failed to rename session: 500')).toBeInTheDocument()
  })

  it('a failed rename reaches the user instead of disappearing', async () => {
    useChatStore.setState({
      sessions: [
        {
          id: 's1',
          title: 'old',
          projectId: 'p',
          messages: [],
          persistId: 'persisted-1',
          tokenUsage: { inputTokens: 0, outputTokens: 0 },
          backendSessionId: null,
        },
      ],
    })
    render(
      <ToastProvider>
        <div />
      </ToastProvider>,
    )

    useChatStore.getState().renameSession('s1', 'new name')

    expect(await screen.findByText('Could not rename the chat')).toBeInTheDocument()
  })
})
