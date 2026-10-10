import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { ToastProvider } from '@/components/Toast'
import { useChatStore } from '@/stores/chatStore'

// The controls the user reaches for first: new chat, add project, the two tabs, and settings
describe('Sidebar controls', () => {
  beforeEach(() => {
    useChatStore.setState({ isStreaming: false })
  })

  it('renders the key controls', () => {
    render(
      <ToastProvider>
        <Sidebar onSettingsClick={vi.fn()} />
      </ToastProvider>,
    )
    expect(screen.getByTitle('New chat (⌘N)')).toBeInTheDocument()
    expect(screen.getByTitle('Add Project')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sessions' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Files' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
  })

  it('Settings calls onSettingsClick', () => {
    const onSettingsClick = vi.fn()
    render(
      <ToastProvider>
        <Sidebar onSettingsClick={onSettingsClick} />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(onSettingsClick).toHaveBeenCalledTimes(1)
  })

  it('New chat starts a new session', () => {
    const newSession = vi.fn()
    useChatStore.setState({ newSession })
    render(
      <ToastProvider>
        <Sidebar onSettingsClick={vi.fn()} />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByTitle('New chat (⌘N)'))
    expect(newSession).toHaveBeenCalledTimes(1)
  })
})
