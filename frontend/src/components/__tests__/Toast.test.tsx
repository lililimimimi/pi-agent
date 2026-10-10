import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderHook } from '@testing-library/react'
import { ToastProvider } from '@/components/Toast'
import { useToast } from '@/components/useToast'
import type { ReactNode } from 'react'

function wrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>
}

/** Helper: render the hook inside the provider and show a toast */
function renderToastHook() {
  return renderHook(() => useToast(), { wrapper })
}

describe('Toast', () => {
  it('useToast throws when used outside ToastProvider', () => {
    // Suppress console.error from React for this test
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useToast())).toThrow('useToast must be used within a <ToastProvider>')
    spy.mockRestore()
  })

  it('shows toast message text', () => {
    const { result } = renderToastHook()

    act(() => {
      result.current.showToast({ type: 'info', message: '操作成功' })
    })

    expect(screen.getByText('操作成功')).toBeInTheDocument()
  })

  describe('auto-dismiss', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('auto-dismisses after duration', async () => {
      const { result } = renderToastHook()

      act(() => {
        result.current.showToast({ type: 'success', message: '即将消失', duration: 1000 })
      })

      expect(screen.getByText('即将消失')).toBeInTheDocument()

      // Advance past duration + exit animation (300ms)
      act(() => {
        vi.advanceTimersByTime(1300)
      })

      await waitFor(() => {
        expect(screen.queryByText('即将消失')).not.toBeInTheDocument()
      })
    })
  })

  it('error toast with onRetry shows "Retry" button', () => {
    const onRetry = vi.fn()
    const { result } = renderToastHook()

    act(() => {
      result.current.showToast({ type: 'error', message: '出错了', onRetry })
    })

    expect(screen.getByText('Retry')).toBeInTheDocument()
  })

  it('clicking dismiss (Close) removes the toast', async () => {
    const user = userEvent.setup()
    const { result } = renderToastHook()

    act(() => {
      result.current.showToast({ type: 'info', message: '可以关闭', duration: 0 })
    })

    expect(screen.getByText('可以关闭')).toBeInTheDocument()

    await user.click(screen.getByLabelText('Close'))

    await waitFor(() => {
      expect(screen.queryByText('可以关闭')).not.toBeInTheDocument()
    })
  })
})
