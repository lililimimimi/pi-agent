import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/services/api', () => ({
  browseDirs: vi.fn(),
  mkdirApi: vi.fn(),
}))

import { browseDirs } from '@/services/api'
import { AddProjectModal } from '../sidebar/AddProjectModal'

const HOME = { current: '/Users/me', parent: '/Users', dirs: [] }

beforeEach(() => {
  vi.mocked(browseDirs).mockReset()
  vi.mocked(browseDirs).mockResolvedValue(HOME as never)
})

describe('AddProjectModal', () => {
  it('starts in the home folder and offers Desktop, Documents and Downloads', async () => {
    render(<AddProjectModal open onClose={() => {}} />)
    expect(await screen.findByRole('button', { name: 'Desktop' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Documents' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Downloads' })).toBeTruthy()
  })

  it('a typed path opens when Enter is pressed', async () => {
    render(<AddProjectModal open onClose={() => {}} />)
    const input = await screen.findByPlaceholderText('Type a folder path and press Enter')

    fireEvent.change(input, { target: { value: '/Users/me/code/app' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(browseDirs).toHaveBeenCalledWith('/Users/me/code/app'))
  })

  it('a quick link opens that folder', async () => {
    render(<AddProjectModal open onClose={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Desktop' }))

    await waitFor(() => expect(browseDirs).toHaveBeenCalledWith('/Users/me/Desktop'))
  })
})
