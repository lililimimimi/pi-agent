import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MessageBubble } from '../MessageBubble'
import type { Message } from '@/types'

const codeMessage: Message = {
  id: '1',
  role: 'assistant',
  content: '```js\nconsole.log("hello")\n```',
}

const writeTextMock = vi.fn().mockResolvedValue(undefined)

describe('CodeBlock (via MessageBubble)', () => {
  beforeEach(() => {
    writeTextMock.mockClear()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    })
  })

  it('renders code block content', () => {
    render(<MessageBubble message={codeMessage} />)
    const codeEl = document.querySelector('code')
    expect(codeEl?.textContent).toContain('console')
    expect(codeEl?.textContent).toContain('log')
  })

  it('has a copy button with aria-label "Copy code"', () => {
    render(<MessageBubble message={codeMessage} />)
    expect(screen.getByLabelText('Copy code')).toBeInTheDocument()
  })

  it('calls navigator.clipboard.writeText with code text on click', async () => {
    render(<MessageBubble message={codeMessage} />)

    fireEvent.click(screen.getByLabelText('Copy code'))

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(
        expect.stringContaining('console'),
      )
    })
  })

  it('changes aria-label to "Copied" after clicking', async () => {
    render(<MessageBubble message={codeMessage} />)

    fireEvent.click(screen.getByLabelText('Copy code'))

    await waitFor(() => {
      expect(screen.getByLabelText('Copied')).toBeInTheDocument()
    })
  })
})
