import { create } from 'zustand'
import { fetchFileTree, fetchFileContent, type FileNode } from '@/services/api'

export type SidebarView = 'sessions' | 'files'

export const PREVIEW_DEFAULT_WIDTH = 420
export const PREVIEW_MIN_WIDTH = 280
// Leaves room for the sidebar and a usable chat column
const SIDEBAR_AND_CHAT_MIN = 208 + 320

/** Keeps the preview width between a readable minimum and what the window can fit. */
export function clampPreviewWidth(width: number, viewportWidth: number): number {
  const max = Math.max(PREVIEW_MIN_WIDTH, Math.min(900, viewportWidth - SIDEBAR_AND_CHAT_MIN))
  return Math.round(Math.min(max, Math.max(PREVIEW_MIN_WIDTH, width)))
}

// A file the user clicked in the tree, waiting to be attached in InputBar
export type PendingFile = { path: string; content: string }

type FileBrowserState = {
  view: SidebarView
  rootPath: string | null
  // Children of each loaded directory, keyed by path relative to root ('' = root)
  childrenByDir: Record<string, FileNode[]>
  expanded: Set<string>
  loadingDirs: Set<string>
  error: string | null
  pendingFile: PendingFile | null
  // File shown in the right-hand preview pane (stays until closed or the root changes)
  preview: PendingFile | null
  previewWidth: number

  setView: (view: SidebarView) => void
  setRootPath: (path: string | null) => void
  loadDir: (dir: string) => Promise<void>
  toggleDir: (dir: string) => void
  openFile: (path: string) => Promise<void>
  clearPendingFile: () => void
  closePreview: () => void
  setPreviewWidth: (width: number) => void
}

export const useFileBrowserStore = create<FileBrowserState>((set, get) => ({
  view: 'sessions',
  rootPath: null,
  childrenByDir: {},
  expanded: new Set(),
  loadingDirs: new Set(),
  error: null,
  pendingFile: null,
  preview: null,
  previewWidth: PREVIEW_DEFAULT_WIDTH,

  setView: (view) => set({ view }),

  setRootPath: (path) => {
    if (path === get().rootPath) return
    set({ rootPath: path, childrenByDir: {}, expanded: new Set(), error: null, preview: null })
    if (path) void get().loadDir('')
  },

  loadDir: async (dir) => {
    const root = get().rootPath
    if (!root) return
    set((s) => ({ loadingDirs: new Set(s.loadingDirs).add(dir), error: null }))
    try {
      const node = await fetchFileTree(root, dir, 1)
      // Root may have changed while the request was in flight
      if (get().rootPath !== root) return
      set((s) => ({ childrenByDir: { ...s.childrenByDir, [dir]: node.children ?? [] } }))
    } catch (e) {
      if (get().rootPath === root) set({ error: (e as Error).message })
    } finally {
      set((s) => {
        const loadingDirs = new Set(s.loadingDirs)
        loadingDirs.delete(dir)
        return { loadingDirs }
      })
    }
  },

  toggleDir: (dir) => {
    const expanded = new Set(get().expanded)
    if (expanded.has(dir)) {
      expanded.delete(dir)
      set({ expanded })
      return
    }
    expanded.add(dir)
    set({ expanded })
    if (!get().childrenByDir[dir]) void get().loadDir(dir)
  },

  openFile: async (path) => {
    const root = get().rootPath
    if (!root) return
    try {
      const file = await fetchFileContent(root, path)
      if (get().rootPath !== root) return
      // Both: the preview pane shows the file, and InputBar gets it as an attachment
      const opened = { path: file.path, content: file.content }
      set({ pendingFile: opened, preview: opened, error: null })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  clearPendingFile: () => set({ pendingFile: null }),
  closePreview: () => set({ preview: null }),
  setPreviewWidth: (width) => set({ previewWidth: width }),
}))
