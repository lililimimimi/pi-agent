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
    expect(screen.getByText(/3 个会话/)).toBeTruthy()
  })

  it('explains what each of the two delete buttons does', () => {
    renderDialog()
    expect(screen.getByText('桌面上的文件夹和里面的文件都保留，只是应用里不再显示它。')).toBeTruthy()
    expect(screen.getByText('除了上面的操作，还会把整个文件夹移到废纸篓，之后可以从废纸篓恢复。')).toBeTruthy()
  })

  it('cancel deletes nothing', () => {
    const { onCancel, onConfirm } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onCancel).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('"仅移除项目和会话" does not ask to delete the folder', () => {
    const { onConfirm } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: '仅移除项目和会话' }))
    expect(onConfirm).toHaveBeenCalledWith(false)
  })

  it('"同时移到废纸篓" is the only option that moves the folder', () => {
    const { onConfirm } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: '同时移到废纸篓' }))
    expect(onConfirm).toHaveBeenCalledWith(true)
  })
})
