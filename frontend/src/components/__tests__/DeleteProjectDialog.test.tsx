import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DeleteProjectDialog } from '../DeleteProjectDialog'

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
    expect(screen.getByText(/3 conversation/)).toBeTruthy()
  })

  it('explains what each of the two delete buttons does', () => {
    renderDialog()
    expect(screen.getByText('The folder and its files stay on disk. The app just stops showing it.')).toBeTruthy()
    expect(screen.getByText('Does the same as above, and also moves the whole folder to the Trash. You can restore it from there.')).toBeTruthy()
  })

  it('cancel deletes nothing', () => {
    const { onCancel, onConfirm } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('"Remove project and conversations only" does not ask to delete the folder', () => {
    const { onConfirm } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Remove project and conversations only' }))
    expect(onConfirm).toHaveBeenCalledWith(false)
  })

  it('"Also move folder to Trash" is the only option that moves the folder', () => {
    const { onConfirm } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Also move folder to Trash' }))
    expect(onConfirm).toHaveBeenCalledWith(true)
  })
})
