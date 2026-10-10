import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { SessionRow } from '@/components/sidebar/SessionRow'
import { ToastProvider } from '@/components/Toast'
import { useChatStore } from '@/stores/chatStore'

const session = { id: 's1', title: 'Fix the parser', persistId: 'p1' }

function renderRow() {
  return render(
    <ToastProvider>
      <SessionRow session={session} isActive={false} editMode={false} selected={false} onToggle={vi.fn()} />
    </ToastProvider>,
  )
}

describe('deleting a chat asks first', () => {
  let deleteSpy: Mock<(id: string) => void>

  beforeEach(() => {
    deleteSpy = vi.fn<(id: string) => void>()
    useChatStore.setState({ deleteSession: deleteSpy })
  })

  it('opens a confirmation instead of deleting straight away', () => {
    renderRow()
    fireEvent.click(screen.getByRole('button', { name: 'Chat actions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(screen.getByRole('dialog')).toHaveTextContent('Delete “Fix the parser”?')
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  it('cancelling keeps the chat', () => {
    renderRow()
    fireEvent.click(screen.getByRole('button', { name: 'Chat actions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    expect(deleteSpy).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('confirming deletes the chat', () => {
    renderRow()
    fireEvent.click(screen.getByRole('button', { name: 'Chat actions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))

    expect(deleteSpy).toHaveBeenCalledWith('s1')
  })
})
