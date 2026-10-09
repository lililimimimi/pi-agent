import { useEffect, useState, useCallback, useRef } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { browseDirs, mkdirApi, type BrowseResult } from '@/services/api'
import { X, FolderOpen, Folder, ChevronRight, Home, Loader2, FolderPlus, Check } from 'lucide-react'

type Props = {
  open: boolean
  onClose: () => void
}

export function AddProjectModal({ open, onClose }: Props) {
  const addProject = useChatStore((s) => s.addProject)
  const [browseData, setBrowseData] = useState<BrowseResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // New folder state
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderError, setNewFolderError] = useState('')
  const [newFolderLoading, setNewFolderLoading] = useState(false)
  const newFolderRef = useRef<HTMLInputElement>(null)

  const navigate = useCallback(async (path?: string) => {
    setLoading(true)
    setError('')
    setCreatingFolder(false)
    setNewFolderName('')
    setNewFolderError('')
    try {
      const data = await browseDirs(path)
      setBrowseData(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to browse directory')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setBrowseData(null)
      setError('')
      setCreatingFolder(false)
      navigate()
    }
  }, [open, navigate])

  useEffect(() => {
    if (creatingFolder) {
      setTimeout(() => newFolderRef.current?.focus(), 30)
    }
  }, [creatingFolder])

  if (!open) return null

  const handleSelect = () => {
    if (!browseData) return
    const current = browseData.current
    const name = current.split('/').filter(Boolean).pop() || current
    addProject(name, current)
    onClose()
  }

  const handleNewFolder = async () => {
    const name = newFolderName.trim()
    if (!name) return
    if (!browseData) return
    setNewFolderLoading(true)
    setNewFolderError('')
    try {
      const newPath = await mkdirApi(browseData.current, name)
      // Navigate into the newly created folder
      await navigate(newPath)
      setCreatingFolder(false)
      setNewFolderName('')
    } catch (e) {
      setNewFolderError(e instanceof Error ? e.message : 'Failed to create folder')
      setNewFolderLoading(false)
    }
  }

  const cancelNewFolder = () => {
    setCreatingFolder(false)
    setNewFolderName('')
    setNewFolderError('')
  }

  const breadcrumbs = browseData
    ? browseData.current
        .split('/')
        .filter(Boolean)
        .map((seg, i, arr) => ({
          name: seg,
          path: '/' + arr.slice(0, i + 1).join('/'),
        }))
    : []

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-2xl shadow-2xl border border-border/50 w-full max-w-lg flex flex-col"
        style={{ maxHeight: '70vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-foreground/60" strokeWidth={1.8} />
            <h2 className="text-lg font-semibold">Open Project</h2>
          </div>
          <div className="flex items-center gap-1">
            {/* New Folder button */}
            {browseData && !creatingFolder && (
              <button
                onClick={() => setCreatingFolder(true)}
                title="New Folder"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <FolderPlus className="h-4 w-4" strokeWidth={1.8} />
              </button>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-accent transition-colors"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Breadcrumb */}
        <div className="px-5 pb-2">
          <div className="flex items-center gap-0.5 text-sm text-foreground/70 overflow-x-auto scrollbar-none">
            <button
              onClick={() => navigate('/')}
              className="shrink-0 p-1 rounded hover:bg-accent hover:text-foreground transition-colors"
            >
              <Home className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
            {breadcrumbs.map((crumb) => (
              <span key={crumb.path} className="flex items-center shrink-0">
                <ChevronRight className="h-3 w-3 text-foreground/30 mx-0.5" strokeWidth={2} />
                <button
                  onClick={() => navigate(crumb.path)}
                  className="px-1.5 py-0.5 rounded hover:bg-accent hover:text-foreground transition-colors truncate max-w-[120px]"
                  title={crumb.name}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Directory list */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-2 border-t border-border/30">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-foreground/70">
              <Loader2 className="h-5 w-5 animate-spin mr-2" strokeWidth={2} />
              <span className="text-sm">Loading…</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : (
            <div className="py-1">
              {/* New folder input row */}
              {creatingFolder && (
                <div className="flex items-center gap-2 px-3 py-2 mb-0.5 rounded-lg bg-accent/50">
                  <Folder className="h-4 w-4 shrink-0 text-foreground/70" strokeWidth={1.8} />
                  <div className="flex-1 min-w-0">
                    <input
                      ref={newFolderRef}
                      value={newFolderName}
                      onChange={(e) => { setNewFolderName(e.target.value); setNewFolderError('') }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleNewFolder()
                        if (e.key === 'Escape') cancelNewFolder()
                        e.stopPropagation()
                      }}
                      placeholder="New folder name…"
                      className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                      disabled={newFolderLoading}
                    />
                    {newFolderError && (
                      <p className="text-sm text-destructive mt-0.5">{newFolderError}</p>
                    )}
                  </div>
                  {newFolderLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-foreground/70 shrink-0" strokeWidth={2} />
                  ) : (
                    <>
                      <button
                        onClick={handleNewFolder}
                        disabled={!newFolderName.trim()}
                        className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md hover:bg-foreground/10 text-foreground/70 hover:text-foreground disabled:opacity-30 transition-colors"
                      >
                        <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                      </button>
                      <button
                        onClick={cancelNewFolder}
                        className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md hover:bg-foreground/10 text-foreground/70 hover:text-foreground transition-colors"
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Existing subdirs */}
              {!creatingFolder && browseData?.dirs.length === 0 && (
                <div className="flex items-center justify-center py-12 text-foreground/70">
                  <p className="text-sm">No subdirectories — create a new folder above</p>
                </div>
              )}
              {browseData?.dirs.map((dir) => (
                <button
                  key={dir.path}
                  onClick={() => navigate(dir.path)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-accent/70 transition-colors group"
                >
                  <Folder
                    className="h-4 w-4 shrink-0 text-foreground/70 group-hover:text-foreground/60"
                    strokeWidth={1.8}
                  />
                  <span className="text-sm truncate">{dir.name}</span>
                  <ChevronRight
                    className="h-3.5 w-3.5 ml-auto shrink-0 text-foreground/20 group-hover:text-foreground/70"
                    strokeWidth={2}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border/30 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground/70 truncate" title={browseData?.current}>
              {browseData?.current ?? '—'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm text-foreground/60 hover:bg-accent transition-colors shrink-0"
          >
            Cancel
          </button>
          <button
            onClick={handleSelect}
            disabled={!browseData}
            className="px-4 py-2 rounded-xl text-sm bg-foreground text-background font-medium hover:opacity-90 transition-opacity disabled:opacity-40 shrink-0"
          >
            Open
          </button>
        </div>
      </div>
    </div>
  )
}
