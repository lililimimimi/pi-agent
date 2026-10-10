import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InputBar } from '@/components/chat/InputBar'
import { ToastProvider } from '@/components/Toast'
import { useChatStore } from '@/stores/chatStore'

const box = () => screen.getByPlaceholderText('Message pi…') as HTMLTextAreaElement

function renderInputBar() {
  render(
    <ToastProvider>
      <InputBar />
    </ToastProvider>,
  )
  return box()
}

describe('input history with the arrow keys', () => {
  beforeEach(() => {
    useChatStore.setState({ isStreaming: false, sendMessage: vi.fn(async () => {}) })
  })

  it('walks back through sent messages, returns to the draft, and never overwrites a draft or an edit', async () => {
    const user = userEvent.setup()
    const sendSpy = vi.fn(async () => {})
    useChatStore.setState({ sendMessage: sendSpy })
    const input = renderInputBar()

    // Two sent messages
    await user.type(input, 'first{Enter}')
    await user.type(input, 'second{Enter}')
    expect(sendSpy).toHaveBeenCalledTimes(2)
    expect(input.value).toBe('')

    // Up from empty: second, then first; Up again stays at first
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('second')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('first')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('first')

    // Down walks forward, then returns to the empty draft
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.value).toBe('second')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.value).toBe('')

    // A draft in progress is not replaced by Up
    await user.type(input, 'my draft')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('my draft')

    // Recall, then edit the recalled text: Down must not overwrite the edit
    await user.clear(input)
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('second')
    await user.type(input, ' edited')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.value).toBe('second edited')
  })

  it('Cmd+Enter sends, the same as Enter', async () => {
    const sendSpy = vi.fn(async () => {})
    useChatStore.setState({ sendMessage: sendSpy })
    const input = renderInputBar()

    await userEvent.setup().type(input, 'hello')
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true })

    expect(sendSpy).toHaveBeenCalledWith('hello', [])
  })
})

describe('Escape while a reply is being written', () => {
  it('stops the reply', () => {
    const stopSpy = vi.fn()
    useChatStore.setState({ isStreaming: true, stopAgent: stopSpy })
    const input = renderInputBar()

    fireEvent.keyDown(input, { key: 'Escape' })

    expect(stopSpy).toHaveBeenCalledTimes(1)
  })

  it('does nothing when no reply is being written', () => {
    const stopSpy = vi.fn()
    useChatStore.setState({ isStreaming: false, stopAgent: stopSpy })
    const input = renderInputBar()

    fireEvent.keyDown(input, { key: 'Escape' })

    expect(stopSpy).not.toHaveBeenCalled()
  })
})
