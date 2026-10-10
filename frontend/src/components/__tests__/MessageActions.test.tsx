import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MessageBubble } from '@/components/chat/MessageBubble'
import type { Message } from '@/types'

const reply: Message = { id: 'a1', role: 'assistant', content: '**Bold** and `code`' }

describe('actions on an assistant reply', () => {
  let writeText: ReturnType<typeof vi.fn>

  beforeEach(() => {
    writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  })

  it('copies the reply text as the model wrote it', async () => {
    render(<MessageBubble message={reply} />)
    await userEvent.click(screen.getByRole('button', { name: 'Copy reply' }))
    expect(writeText).toHaveBeenCalledWith('**Bold** and `code`')
  })

  it('shows Regenerate only when a handler is given', () => {
    const { rerender } = render(<MessageBubble message={reply} />)
    expect(screen.queryByRole('button', { name: 'Regenerate' })).toBeNull()

    rerender(<MessageBubble message={reply} onRegenerate={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeInTheDocument()
  })

  it('Regenerate calls the handler', async () => {
    const onRegenerate = vi.fn()
    render(<MessageBubble message={reply} onRegenerate={onRegenerate} />)
    await userEvent.click(screen.getByRole('button', { name: 'Regenerate' }))
    expect(onRegenerate).toHaveBeenCalledTimes(1)
  })

  it('hides both buttons while the reply is still streaming', () => {
    render(<MessageBubble message={reply} streaming onRegenerate={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Copy reply' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Regenerate' })).toBeNull()
  })
})
