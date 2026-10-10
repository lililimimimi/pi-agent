import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ChatView } from '@/components/chat/ChatView'
import { ToastProvider } from '@/components/Toast'
import { useChatStore } from '@/stores/chatStore'
import type { Message } from '@/types'

// Ends with an assistant reply, which is what a stream writes into
const longHistory: Message[] = Array.from({ length: 4 }, (_, i) => ({
  id: `m${i}`,
  role: i % 2 === 0 ? 'user' : 'assistant',
  content: `message ${i}`,
}))

// jsdom has no layout, so the scroll container's size and position are set by hand
function setScrollGeometry(el: HTMLElement, scrollTop: number) {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 1000 })
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: 500 })
  Object.defineProperty(el, 'scrollTop', { configurable: true, writable: true, value: scrollTop })
  fireEvent.scroll(el)
}

describe('auto-scroll while a reply streams', () => {
  let scrollIntoView: ReturnType<typeof vi.fn>
  let container: HTMLElement

  beforeEach(() => {
    scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView as unknown as Element['scrollIntoView']
    useChatStore.setState({ messages: longHistory, isStreaming: false, activeId: 's1', error: null })
    render(
      <ToastProvider>
        <ChatView />
      </ToastProvider>,
    )
    container = screen.getByText('message 0').closest('.overflow-y-auto') as HTMLElement
  })

  const streamTokenInto = (text: string) =>
    act(() => {
      useChatStore.setState((s) => ({
        messages: s.messages.map((m, i) => (i === s.messages.length - 1 ? { ...m, content: text } : m)),
        isStreaming: true,
      }))
    })

  it('follows the output while the view is at the bottom', () => {
    setScrollGeometry(container, 500) // distance to bottom: 0
    scrollIntoView.mockClear()
    streamTokenInto('message 2 more text')
    expect(scrollIntoView).toHaveBeenCalled()
  })

  it('does not pull the view back down when the user has scrolled up', () => {
    setScrollGeometry(container, 0) // far from the bottom
    scrollIntoView.mockClear()
    streamTokenInto('message 2 more text')
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('resumes following once the user scrolls back to the bottom', () => {
    setScrollGeometry(container, 0)
    setScrollGeometry(container, 500)
    scrollIntoView.mockClear()
    streamTokenInto('message 2 more text')
    expect(scrollIntoView).toHaveBeenCalled()
  })

  it('brings the view down when the user sends a message, even from up high', () => {
    setScrollGeometry(container, 0)
    scrollIntoView.mockClear()
    act(() => {
      useChatStore.setState((s) => ({
        messages: [...s.messages, { id: 'new', role: 'user', content: 'sent' }],
      }))
    })
    expect(scrollIntoView).toHaveBeenCalled()
  })
})
