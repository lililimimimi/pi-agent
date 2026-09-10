import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ExecutionPreviewCard } from '@/components/ExecutionPreviewCard'
import * as api from '@/services/api'

// Stub the API calls so no real fetch happens
vi.mock('@/services/api', () => ({
  confirmPreview: vi.fn().mockResolvedValue(undefined),
  cancelPreview: vi.fn().mockResolvedValue(undefined),
}))

const mockPreview = {
  previewId: 'pv-test-1',
  steps: ['读取 main.py', '修改 foo()', '运行 pytest'],
  hasWriteOps: true,
}

describe('ExecutionPreviewCard', () => {
  let onDone: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onDone = vi.fn()
    vi.clearAllMocks()
  })

  it('renders the step list', () => {
    render(<ExecutionPreviewCard preview={mockPreview} onDone={onDone} />)
    expect(screen.getByText('读取 main.py')).toBeInTheDocument()
    expect(screen.getByText('修改 foo()')).toBeInTheDocument()
    expect(screen.getByText('运行 pytest')).toBeInTheDocument()
  })

  it('calls confirmPreview and onDone when "继续执行" is clicked', async () => {
    render(<ExecutionPreviewCard preview={mockPreview} onDone={onDone} />)
    fireEvent.click(screen.getByRole('button', { name: '继续执行' }))
    await waitFor(() => expect(api.confirmPreview).toHaveBeenCalledWith('pv-test-1'))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('calls cancelPreview and onDone when "取消" is clicked', async () => {
    render(<ExecutionPreviewCard preview={mockPreview} onDone={onDone} />)
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    await waitFor(() => expect(api.cancelPreview).toHaveBeenCalledWith('pv-test-1'))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('shows a countdown timer starting at 60', () => {
    render(<ExecutionPreviewCard preview={mockPreview} onDone={onDone} />)
    expect(screen.getByText('60s')).toBeInTheDocument()
  })
})
