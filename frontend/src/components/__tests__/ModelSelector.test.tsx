import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/services/api', () => ({
  fetchModels: vi.fn(),
}))

import { fetchModels } from '@/services/api'
import { ModelSelector } from '@/components/model/ModelSelector'

const ENABLED = [
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', provider: 'deepseek', supports_tools: true, supports_images: false, status: { ok: true, ms: 500 } },
  { id: 'deepseek-v4-flash-vision-exp', name: 'DeepSeek V4 Flash Vision', provider: 'deepseek', supports_tools: true, supports_images: true, status: { ok: false, error: 'out of extra usage' } },
]

beforeEach(() => {
  vi.mocked(fetchModels).mockReset()
})

async function openPicker() {
  render(<ModelSelector />)
  // wait until the enabled models have loaded, then open the picker
  await waitFor(() => expect(screen.queryByText('No model')).toBeNull())
  fireEvent.click(screen.getByRole('button'))
}

describe('ModelSelector', () => {
  it('lists only the models the backend returns as enabled', async () => {
    vi.mocked(fetchModels).mockResolvedValue(ENABLED as never)
    await openPicker()

    expect((await screen.findAllByText('DeepSeek V4 Flash')).length).toBeGreaterThan(0)
    expect(screen.getByText('DeepSeek V4 Flash Vision')).toBeTruthy()
  })

  it('marks image-capable models with an icon', async () => {
    vi.mocked(fetchModels).mockResolvedValue(ENABLED as never)
    await openPicker()

    expect(await screen.findAllByLabelText('Supports images')).toHaveLength(1)
  })

  it('shows a green dot for a working model and red for a failing one', async () => {
    vi.mocked(fetchModels).mockResolvedValue(ENABLED as never)
    await openPicker()

    expect(await screen.findByTitle(/Works/)).toBeTruthy()
    expect(screen.getByTitle('Last test failed')).toBeTruthy()
  })

  it('has no test buttons; testing happens in Settings', async () => {
    vi.mocked(fetchModels).mockResolvedValue(ENABLED as never)
    await openPicker()

    await screen.findAllByText('DeepSeek V4 Flash')
    expect(screen.queryByRole('button', { name: /test/i })).toBeNull()
  })

  it('shows "No model" and opens Settings instead of a popup when none are enabled', async () => {
    vi.mocked(fetchModels).mockResolvedValue([] as never)
    render(<ModelSelector />)

    expect(await screen.findByText('No model')).toBeTruthy()
    const openSettings = vi.fn()
    window.addEventListener('open-settings', openSettings)
    fireEvent.click(screen.getByRole('button'))
    expect(openSettings).toHaveBeenCalled()
    window.removeEventListener('open-settings', openSettings)
    expect(screen.queryByText('DeepSeek V4 Flash')).toBeNull()
  })
})
