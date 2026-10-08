import { describe, it, expect } from 'vitest'
import { clampSidebarWidth, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH } from '../layoutStore'

describe('clampSidebarWidth', () => {
  it('keeps the sidebar at least the minimum width', () => {
    expect(clampSidebarWidth(100, 1400)).toBe(SIDEBAR_MIN_WIDTH)
  })

  it('leaves room for the chat column on narrow windows', () => {
    // 900px window: 900 - 480 = 420 is the most the sidebar may take
    expect(clampSidebarWidth(600, 900)).toBe(420)
  })

  it('caps very wide sidebars', () => {
    expect(clampSidebarWidth(700, 2000)).toBe(SIDEBAR_MAX_WIDTH)
  })

  it('passes a reasonable width through unchanged', () => {
    expect(clampSidebarWidth(260, 1400)).toBe(260)
  })
})
