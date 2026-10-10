import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { screen } from '@testing-library/react'

// Mounts the real entry point (main.tsx), so a broken wiring there fails here
// even when every component test is green.
describe('app entry (smoke)', () => {
  let root: HTMLDivElement

  beforeEach(() => {
    root = document.createElement('div')
    root.id = 'root'
    document.body.appendChild(root)
  })

  afterEach(() => {
    root.remove()
  })

  it('mounts the app with a message input and a New chat button', async () => {
    await import('./main')

    expect(await screen.findByPlaceholderText('Message pi…')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /New chat/ })).toBeInTheDocument()
  })
})
