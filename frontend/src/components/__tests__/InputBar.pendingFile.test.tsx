import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { InputBar } from '@/components/chat/InputBar'
import { ToastProvider } from '@/components/Toast'
import { useFileBrowserStore } from '@/stores/fileBrowserStore'

describe('a file clicked in the sidebar', () => {
  beforeEach(() => {
    useFileBrowserStore.setState({ pendingFile: null })
  })

  it('fills the prompt once and clears the request from the store', () => {
    render(
      <ToastProvider>
        <InputBar />
      </ToastProvider>,
    )
    const box = screen.getByPlaceholderText('Message pi…') as HTMLTextAreaElement

    act(() => {
      useFileBrowserStore.setState({
        pendingFile: { path: 'src/main.ts', content: 'export {}' } as never,
      })
    })

    expect(box.value).toContain('Please analyze this file: `src/main.ts`')
    expect(useFileBrowserStore.getState().pendingFile).toBeNull()
  })
})
