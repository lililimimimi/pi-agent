import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { ExecutionPreviewCard } from '@/components/chat/ExecutionPreviewCard'
import * as api from '@/services/api/chat'

// Stub the API calls so no real fetch happens
vi.mock('@/services/api/chat', () => ({
  confirmPreview: vi.fn().mockResolvedValue(undefined),
  cancelPreview: vi.fn().mockResolvedValue(undefined),
}))

const mockPreview = {
  previewId: 'pv-test-1',
  steps: ['Read main.py', 'Edit foo()', 'Run pytest'],
  hasWriteOps: true,
}

describe('ExecutionPreviewCard', () => {
  let onDone: Mock<() => void>

  beforeEach(() => {
    onDone = vi.fn()
    vi.clearAllMocks()
  })

  it('renders the step list', () => {
    render(<ExecutionPreviewCard preview={mockPreview} onDone={onDone} />)
    expect(screen.getByText('Read main.py')).toBeInTheDocument()
    expect(screen.getByText('Edit foo()')).toBeInTheDocument()
    expect(screen.getByText('Run pytest')).toBeInTheDocument()
  })

  it('calls confirmPreview and onDone when "Continue" is clicked', async () => {
    render(<ExecutionPreviewCard preview={mockPreview} onDone={onDone} />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(api.confirmPreview).toHaveBeenCalledWith('pv-test-1'))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('calls cancelPreview and onDone when "Cancel" is clicked', async () => {
    render(<ExecutionPreviewCard preview={mockPreview} onDone={onDone} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(api.cancelPreview).toHaveBeenCalledWith('pv-test-1'))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('shows no countdown and does not cancel on its own', () => {
    vi.useFakeTimers()
    try {
      render(<ExecutionPreviewCard preview={mockPreview} onDone={onDone} />)
      act(() => {
        vi.advanceTimersByTime(10 * 60_000)
      })
      expect(api.cancelPreview).not.toHaveBeenCalled()
      expect(onDone).not.toHaveBeenCalled()
      expect(screen.queryByText(/^\d+s$/)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
