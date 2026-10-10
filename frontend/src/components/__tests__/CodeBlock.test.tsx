import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MessageBubble } from '@/components/chat/MessageBubble'
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
      expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining('console'))
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

describe('CodeBlock plain-text rule', () => {
  it('shows a labeled block with no code in it as plain text', () => {
    const message: Message = {
      id: '2',
      role: 'assistant',
      content: '```css\nM TODO.md\n?? src/App.test.tsx\n```',
    }
    render(<MessageBubble message={message} />)
    const codeEl = document.querySelector('pre')
    expect(codeEl?.textContent).toContain('?? src/App.test.tsx')
    expect(codeEl?.querySelector('.hljs-selector-tag, .hljs-attr, .hljs-keyword')).toBeNull()
  })

  it('still highlights a labeled block that is real code', () => {
    const message: Message = {
      id: '3',
      role: 'assistant',
      content: '```ts\nconst x: number = 1\n```',
    }
    render(<MessageBubble message={message} />)
    expect(document.querySelector('pre')?.querySelector('[class*="hljs-"]')).not.toBeNull()
  })
})
