import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useKeyboardShortcuts } from '../useKeyboardShortcuts'

function fireKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, metaKey: true, bubbles: true, ...opts }))
}

describe('useKeyboardShortcuts', () => {
  it('Cmd+K triggers onNewChat', () => {
    const onNewChat = vi.fn()
    renderHook(() => useKeyboardShortcuts({ onNewChat }))

    fireKey('k')

    expect(onNewChat).toHaveBeenCalledOnce()
  })

  it('Cmd+, triggers onOpenSettings', () => {
    const onOpenSettings = vi.fn()
    renderHook(() => useKeyboardShortcuts({ onOpenSettings }))

    fireKey(',')

    expect(onOpenSettings).toHaveBeenCalledOnce()
  })

  it('Cmd+/ triggers onFocusInput', () => {
    const onFocusInput = vi.fn()
    renderHook(() => useKeyboardShortcuts({ onFocusInput }))

    fireKey('/')

    expect(onFocusInput).toHaveBeenCalledOnce()
  })

  it('Cmd+Enter only triggers onSend when a textarea is focused', () => {
    const onSend = vi.fn()
    renderHook(() => useKeyboardShortcuts({ onSend }))

    // No textarea focused → should not fire
    fireKey('Enter')
    expect(onSend).not.toHaveBeenCalled()

    // Create and focus a textarea
    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    textarea.focus()

    fireKey('Enter')
    expect(onSend).toHaveBeenCalledOnce()

    // Cleanup
    document.body.removeChild(textarea)
  })
})
