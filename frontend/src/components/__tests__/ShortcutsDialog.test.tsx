import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ShortcutsDialog } from '@/components/ShortcutsDialog'

describe('shortcut list', () => {
  it('lists the chat and window shortcuts', () => {
    render(<ShortcutsDialog onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument()
    expect(screen.getByText('New chat')).toBeInTheDocument()
    expect(screen.getByText('Show or hide the sidebar')).toBeInTheDocument()
  })

  it('Escape closes it', () => {
    const onClose = vi.fn()
    render(<ShortcutsDialog onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
