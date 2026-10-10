import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProviderCard } from '@/components/settings/ProviderCard'
import * as api from '@/services/api/providers'
import type { ProviderInfo } from '@/services/api/providers'

// Only the calls the card makes are replaced; the rest of the module stays real
vi.mock('@/services/api/providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/api/providers')>()),
  testProvider: vi.fn(),
  updateProvider: vi.fn(),
  deleteCustomProvider: vi.fn(),
  logoutProvider: vi.fn(),
}))

const configured: ProviderInfo = {
  id: 'openai',
  label: 'OpenAI',
  key_field: 'api_key',
  placeholder: 'sk-…',
  api_key: 'sk-…abcd',
  base_url: '',
  enabled: true,
  models: [],
  connected: false,
  configured: true,
}

const unconfigured: ProviderInfo = {
  ...configured,
  id: 'deepseek',
  label: 'DeepSeek',
  api_key: '',
  configured: false,
}

describe('ProviderCard wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the label, its status, and the Test and Set controls', () => {
    render(<ProviderCard provider={unconfigured} onUpdate={vi.fn()} />)
    expect(screen.getByText('DeepSeek')).toBeInTheDocument()
    expect(screen.getByText('Not configured')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Test/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set' })).toBeInTheDocument()
  })

  it('Test runs a connection test for this provider and refreshes the parent on success', async () => {
    vi.mocked(api.testProvider).mockResolvedValue({
      ok: true,
      latency_ms: 12,
      models: [],
    } as unknown as api.TestResult)
    const onUpdate = vi.fn()
    render(<ProviderCard provider={configured} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByRole('button', { name: /Test/ }))

    await waitFor(() => expect(api.testProvider).toHaveBeenCalledWith('openai'))
    await waitFor(() => expect(onUpdate).toHaveBeenCalled())
    expect(screen.getByText('Connected')).toBeInTheDocument()
  })

  it('Test is disabled until a key is configured', () => {
    render(<ProviderCard provider={unconfigured} onUpdate={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Test/ })).toBeDisabled()
  })

  it('Set opens the key field for an unconfigured provider', () => {
    render(<ProviderCard provider={unconfigured} onUpdate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Set' }))
    expect(screen.getByPlaceholderText('sk-…')).toBeInTheDocument()
  })

  it('Remove appears only for providers the user added', () => {
    const { rerender } = render(<ProviderCard provider={configured} onUpdate={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()

    rerender(<ProviderCard provider={{ ...configured, custom: true }} onUpdate={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
  })
})
