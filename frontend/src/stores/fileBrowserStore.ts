import { create } from 'zustand'
import { fetchFileTree, fetchFileContent, type FileNode } from '@/services/api'

export type SidebarView = 'sessions' | 'files'

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

  setView: (view: SidebarView) => void
  setRootPath: (path: string | null) => void
  loadDir: (dir: string) => Promise<void>
  toggleDir: (dir: string) => void
  openFile: (path: string) => Promise<void>
  clearPendingFile: () => void
}

export const useFileBrowserStore = create<FileBrowserState>((set, get) => ({
  view: 'sessions',
  rootPath: null,
  childrenByDir: {},
  expanded: new Set(),
  loadingDirs: new Set(),
  error: null,
  pendingFile: null,

  setView: (view) => set({ view }),

  setRootPath: (path) => {
    if (path === get().rootPath) return
    set({ rootPath: path, childrenByDir: {}, expanded: new Set(), error: null })
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
      set({ pendingFile: { path: file.path, content: file.content }, error: null })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  clearPendingFile: () => set({ pendingFile: null }),
}))
