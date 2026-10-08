import { create } from 'zustand'

export const SIDEBAR_DEFAULT_WIDTH = 208
export const SIDEBAR_MIN_WIDTH = 180
export const SIDEBAR_MAX_WIDTH = 480
// The chat column keeps at least this much room
const CHAT_MIN_WIDTH = 480

/** Keeps the sidebar width readable and leaves room for the chat column. */
export function clampSidebarWidth(width: number, viewportWidth: number): number {
  const max = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, viewportWidth - CHAT_MIN_WIDTH))
  return Math.round(Math.min(max, Math.max(SIDEBAR_MIN_WIDTH, width)))
}

type LayoutState = {
  sidebarWidth: number
  setSidebarWidth: (width: number) => void
}

export const useLayoutStore = create<LayoutState>((set) => ({
  sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
}))
