import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MessageBubble } from '@/components/chat/MessageBubble'
import type { Message } from '@/types'

const userMsg: Message = { id: 'u1', role: 'user', content: 'hello there' }

describe('editing a user message', () => {
  it('shows an Edit button next to Copy on user messages', () => {
    render(<MessageBubble message={userMsg} onResend={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Edit message' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy message' })).toBeInTheDocument()
  })

  it('has no Edit button when there is no way to resend', () => {
    render(<MessageBubble message={userMsg} />)
    expect(screen.queryByRole('button', { name: 'Edit message' })).toBeNull()
  })

  it('saves the edited text through onResend', async () => {
    const onResend = vi.fn()
    render(<MessageBubble message={userMsg} onResend={onResend} />)

    await userEvent.click(screen.getByRole('button', { name: 'Edit message' }))
    const box = screen.getByLabelText('Edit message text')
    expect(box).toHaveValue('hello there')

    await userEvent.clear(box)
    await userEvent.type(box, '  changed  ')
    await userEvent.click(screen.getByRole('button', { name: 'Save & resend' }))

    expect(onResend).toHaveBeenCalledWith('u1', 'changed', undefined)
  })

  it('cancel keeps the original message and sends nothing', async () => {
    const onResend = vi.fn()
    render(<MessageBubble message={userMsg} onResend={onResend} />)

    await userEvent.click(screen.getByRole('button', { name: 'Edit message' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onResend).not.toHaveBeenCalled()
    expect(screen.getByText('hello there')).toBeInTheDocument()
  })

  it('does not allow saving an empty message', async () => {
    render(<MessageBubble message={userMsg} onResend={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Edit message' }))
    await userEvent.clear(screen.getByLabelText('Edit message text'))

    expect(screen.getByRole('button', { name: 'Save & resend' })).toBeDisabled()
  })
})
