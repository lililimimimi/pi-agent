import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DeleteProjectDialog } from '@/components/sidebar/DeleteProjectDialog'

function renderDialog() {
  const onCancel = vi.fn()
  const onConfirm = vi.fn()
  render(
    <DeleteProjectDialog
      projectName="rules"
      folderPath="/Users/me/Desktop/rules"
      sessionCount={3}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />,
  )
  return { onCancel, onConfirm }
}

describe('DeleteProjectDialog', () => {
  it('shows the folder path and session count before anything is deleted', () => {
    renderDialog()
    expect(screen.getByText('/Users/me/Desktop/rules')).toBeTruthy()
    expect(screen.getByText(/3 conversations will be deleted/)).toBeTruthy()
  })

  it('cancel deletes nothing', () => {
    const { onCancel, onConfirm } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('"Remove from app only" does not ask to delete the folder', () => {
    const { onConfirm } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Remove from app only' }))
    expect(onConfirm).toHaveBeenCalledWith(false)
  })

  it('"Move folder to Trash" is the only option that moves the folder', () => {
    const { onConfirm } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Move folder to Trash' }))
    expect(onConfirm).toHaveBeenCalledWith(true)
  })
})
