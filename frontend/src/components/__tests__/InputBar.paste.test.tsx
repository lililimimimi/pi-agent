import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { InputBar } from '@/components/chat/InputBar'
import { ToastProvider } from '@/components/Toast'

// Decoding and canvas work is browser-only; these tests cover the paste wiring
vi.mock('@/lib/image', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/image')>()
  return {
    ...actual,
    prepareImage: vi.fn(async (file: Blob) => file),
    readAsDataUrl: vi.fn(async () => 'data:image/png;base64,AAAA'),
  }
})

function renderInputBar() {
  return render(
    <ToastProvider>
      <InputBar />
    </ToastProvider>,
  )
}

const screenshot = () => new File(['png-bytes'], 'Screenshot.png', { type: 'image/png' })

describe('pasting a screenshot into the input', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('attaches an image pasted from clipboard items into the textarea', async () => {
    renderInputBar()
    const file = screenshot()
    const textarea = screen.getByPlaceholderText('Message pi…')

    fireEvent.paste(textarea, {
      clipboardData: {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
        files: [],
      },
    })

    expect(await screen.findByAltText('Screenshot.png')).toBeTruthy()
  })

  it('falls back to clipboard files when items are empty', async () => {
    renderInputBar()
    const textarea = screen.getByPlaceholderText('Message pi…')

    fireEvent.paste(textarea, {
      clipboardData: { items: [], files: [screenshot()] },
    })

    expect(await screen.findByAltText('Screenshot.png')).toBeTruthy()
  })

  it('attaches a screenshot pasted while focus is outside the textarea', async () => {
    renderInputBar()
    const file = screenshot()

    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }], files: [] },
    })
    window.dispatchEvent(event)

    await waitFor(() => expect(screen.getByAltText('Screenshot.png')).toBeTruthy())
  })

  it('leaves plain text paste alone', () => {
    renderInputBar()
    const textarea = screen.getByPlaceholderText('Message pi…') as HTMLTextAreaElement

    fireEvent.paste(textarea, {
      clipboardData: { items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }], files: [] },
    })

    expect(screen.queryByRole('button', { name: 'Remove image' })).toBeNull()
    expect(textarea.value).toBe('')
  })

  it('attaches an image dropped onto the input area', async () => {
    const { container } = renderInputBar()
    const file = screenshot()
    const area = container.querySelector('.max-w-3xl') as HTMLElement

    fireEvent.drop(area, { dataTransfer: { files: [file], items: [], types: ['Files'] } })

    expect(await screen.findByAltText('Screenshot.png')).toBeTruthy()
  })
})
