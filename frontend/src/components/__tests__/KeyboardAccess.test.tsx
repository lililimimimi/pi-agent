import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { SessionRow } from '@/components/sidebar/SessionRow'
import { ToastProvider } from '@/components/Toast'

describe('dialogs and menus can be used from the keyboard', () => {
  it('a dialog takes focus when it opens', () => {
    render(
      <ConfirmDialog
        title="Delete?"
        description="Gone for good."
        confirmLabel="Delete"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete' }))
  })

  it('Tab cycles inside the dialog instead of leaving it', () => {
    render(
      <ConfirmDialog
        title="Delete?"
        description="Gone for good."
        confirmLabel="Delete"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    const last = screen.getByRole('button', { name: 'Cancel' })
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete' }))
  })

  it('a chat menu opens with focus on its first item, moves with arrows, and Escape returns focus to its button', () => {
    render(
      <ToastProvider>
        <SessionRow
          session={{ id: 's1', title: 'Chat', persistId: 'p1' }}
          isActive={false}
          editMode={false}
          selected={false}
          onToggle={vi.fn()}
        />
      </ToastProvider>,
    )
    const trigger = screen.getByRole('button', { name: 'Chat actions' })
    fireEvent.click(trigger)
    const items = screen.getAllByRole('menuitem')
    expect(document.activeElement).toBe(items[0])

    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[1])

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})
