import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChatView } from '@/components/chat/ChatView'
import { ToastProvider } from '@/components/Toast'
import { useChatStore } from '@/stores/chatStore'
import type { Message } from '@/types'

// Ends with an assistant reply, which is what a stream writes into
const history: Message[] = Array.from({ length: 4 }, (_, i) => ({
  id: `m${i}`,
  role: i % 2 === 0 ? 'user' : 'assistant',
  content: `message ${i}`,
}))

function renderChat() {
  return render(
    <ToastProvider>
      <ChatView />
    </ToastProvider>,
  )
}

// The virtual list only draws what fits in its viewport; jsdom has no layout, so give it a size
function fakeViewport(px: number) {
  for (const prop of ['offsetHeight', 'clientHeight']) {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => px })
  }
}

describe('the chat list', () => {
  beforeEach(() => {
    fakeViewport(800)
    useChatStore.setState({ messages: history, isStreaming: false, activeId: 's1', error: null })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows the newest message when a chat opens', () => {
    renderChat()
    expect(screen.getByText('message 3')).toBeInTheDocument()
  })
})
