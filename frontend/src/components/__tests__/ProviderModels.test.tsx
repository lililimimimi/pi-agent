import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/services/api', () => ({
  setEnabledModels: vi.fn(async () => {}),
  testModel: vi.fn(async () => ({ ok: true, ms: 300 })),
}))

import { setEnabledModels, testModel } from '@/services/api'
import { ProviderModels } from '@/components/settings/ProviderModels'

const GROUP = {
  provider: 'deepseek',
  label: 'DeepSeek',
  models: [
    { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', supports_images: false, enabled: true, status: null },
    { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', supports_images: false, enabled: false, status: null },
  ],
}

beforeEach(() => {
  vi.mocked(setEnabledModels).mockClear()
  vi.mocked(testModel).mockClear()
})

function openList() {
  fireEvent.click(screen.getByRole('button', { name: /of 2 enabled/ }))
}

describe('ProviderModels', () => {
  it('is collapsed by default and shows how many models are enabled', () => {
    render(<ProviderModels group={GROUP} onChanged={vi.fn()} />)
    expect(screen.getByText('1 of 2 enabled')).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('turning a model on saves the full enabled list for that provider', async () => {
    const onChanged = vi.fn()
    render(<ProviderModels group={GROUP} onChanged={onChanged} />)
    openList()

    fireEvent.click(screen.getByRole('switch', { name: 'Enable DeepSeek V4 Pro' }))

    await waitFor(() => expect(setEnabledModels).toHaveBeenCalledWith('deepseek', ['deepseek-v4-flash', 'deepseek-v4-pro']))
    expect(onChanged).toHaveBeenCalled()
  })

  it('turning a model off removes it from the list', async () => {
    render(<ProviderModels group={GROUP} onChanged={vi.fn()} />)
    openList()

    fireEvent.click(screen.getByRole('switch', { name: 'Enable DeepSeek V4 Flash' }))

    await waitFor(() => expect(setEnabledModels).toHaveBeenCalledWith('deepseek', []))
  })

  it('search filters the list', () => {
    render(<ProviderModels group={GROUP} onChanged={vi.fn()} />)
    openList()

    fireEvent.change(screen.getByPlaceholderText('Search models'), { target: { value: 'pro' } })

    expect(screen.queryByText('DeepSeek V4 Flash')).toBeNull()
    expect(screen.getByText('DeepSeek V4 Pro')).toBeTruthy()
  })

  it('Test checks that one model and refreshes the status', async () => {
    const onChanged = vi.fn()
    render(<ProviderModels group={GROUP} onChanged={onChanged} />)
    openList()

    fireEvent.click(screen.getAllByRole('button', { name: 'Test' })[1])

    await waitFor(() => expect(testModel).toHaveBeenCalledWith('deepseek', 'deepseek-v4-pro'))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('says so when a provider has no models', () => {
    render(<ProviderModels group={{ ...GROUP, models: [] }} onChanged={vi.fn()} />)
    expect(screen.getByText('No models found.')).toBeTruthy()
  })
})
