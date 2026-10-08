import { useEffect, useMemo, useState } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { useFileBrowserStore } from '@/stores/fileBrowserStore'
import { FileTreeNode } from '@/components/FileTreeNode'
import { FolderPlus, Search } from 'lucide-react'
import type { FileNode } from '@/services/api'

// Files that are already loaded in the tree, matched by name
function searchLoaded(childrenByDir: Record<string, FileNode[]>, query: string): FileNode[] {
  const q = query.toLowerCase()
  return Object.values(childrenByDir)
    .flat()
    .filter((n) => n.type === 'file' && n.name.toLowerCase().includes(q))
}

export function FileBrowser() {
  const activeProjectPath = useChatStore(
    (s) => s.projects.find((p) => p.id === s.activeProjectId)?.path ?? null,
  )
  const rootPath = useFileBrowserStore((s) => s.rootPath)
  const childrenByDir = useFileBrowserStore((s) => s.childrenByDir)
  const error = useFileBrowserStore((s) => s.error)
  const setRootPath = useFileBrowserStore((s) => s.setRootPath)
  const openFile = useFileBrowserStore((s) => s.openFile)

  const [query, setQuery] = useState('')
  const [choosing, setChoosing] = useState(false)
  const [pathInput, setPathInput] = useState('')

  // Follow the active project's folder
  useEffect(() => {
    setRootPath(activeProjectPath)
  }, [activeProjectPath, setRootPath])

  const matches = useMemo(
    () => (query.trim() ? searchLoaded(childrenByDir, query.trim()) : []),
    [childrenByDir, query],
  )

  const rootChildren = childrenByDir['']

  const submitRoot = () => {
    const next = pathInput.trim()
    if (!next) return
    setRootPath(next)
    setChoosing(false)
    setPathInput('')
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col px-3 py-3 gap-2">
      {/* Search */}
      <div className="flex items-center gap-1.5 rounded-lg bg-white/60 px-2.5 py-1.5">
        <Search className="h-3 w-3 text-muted-foreground/40 shrink-0" strokeWidth={1.8} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search files…"
          className="flex-1 min-w-0 bg-transparent text-xs outline-none placeholder:text-muted-foreground/40"
        />
      </div>

      {/* Tree / search results */}
      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
        {!rootPath && (
          <p className="px-2 py-2 text-xs text-muted-foreground/40 italic">
            No project folder selected
          </p>
        )}

        {rootPath && query.trim() && (
          <>
            {matches.length === 0 && (
              <p className="px-2 py-2 text-xs text-muted-foreground/40 italic">
                No matches in loaded folders
              </p>
            )}
            {matches.map((n) => (
              <button
                key={n.path}
                onClick={() => void openFile(n.path)}
                title={n.path}
                className="flex w-full flex-col rounded-md px-2 py-1 text-left hover:bg-black/[0.06] transition-colors"
              >
                <span className="truncate text-xs text-foreground/80">{n.name}</span>
                <span className="truncate text-[10px] text-muted-foreground/50">{n.path}</span>
              </button>
            ))}
          </>
        )}

        {rootPath && !query.trim() && rootChildren && (
          rootChildren.length === 0
            ? <p className="px-2 py-2 text-xs text-muted-foreground/40 italic">Empty folder</p>
            : rootChildren.map((node) => <FileTreeNode key={node.path} node={node} depth={0} />)
        )}

        {error && (
          <p className="px-2 py-2 text-xs text-destructive break-words">{error}</p>
        )}
      </div>

      {/* Root folder picker */}
      <div className="pt-1">
        {choosing ? (
          <input
            autoFocus
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitRoot()
              if (e.key === 'Escape') { setChoosing(false); setPathInput('') }
            }}
            onBlur={() => { setChoosing(false); setPathInput('') }}
            placeholder="/absolute/path/to/project"
            className="w-full rounded-lg bg-white/60 px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground/40"
          />
        ) : (
          <button
            onClick={() => setChoosing(true)}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-black/[0.06] hover:text-foreground transition-colors"
          >
            <FolderPlus className="h-3.5 w-3.5" strokeWidth={1.8} />
            <span className="truncate">Choose root folder</span>
          </button>
        )}
      </div>
    </div>
  )
}
