import { useEffect, useState } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { AddProjectModal } from '@/components/sidebar/AddProjectModal'
import { FileBrowser } from '@/components/files/FileBrowser'
import { useFileBrowserStore } from '@/stores/fileBrowserStore'
import { useLayoutStore, clampSidebarWidth } from '@/stores/layoutStore'
import { Plus, Settings, Check, FolderPlus, Search } from 'lucide-react'
import {} from '@/services/api/sessions'
import {} from '@/services/api/projects'
import {} from '@/components/useToast'
import { SessionRow } from '@/components/sidebar/SessionRow'
import { ProjectRow } from '@/components/sidebar/ProjectRow'
import {} from '@/components/sidebar/DeleteProjectDialog'
import { isHiddenAutoProject } from '@/lib/projects'

type SidebarProps = {
  onSettingsClick?: () => void
}

export function Sidebar({ onSettingsClick }: SidebarProps) {
  const sidebarWidth = useLayoutStore((s) => s.sidebarWidth)
  const setSidebarWidth = useLayoutStore((s) => s.setSidebarWidth)

  // Drag the right edge to resize
  const handleResizeStart = (e: React.PointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = sidebarWidth
    const onMove = (ev: PointerEvent) => {
      setSidebarWidth(clampSidebarWidth(startWidth + (ev.clientX - startX), window.innerWidth))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const projects = useChatStore((s) => s.projects)
  const activeProjectId = useChatStore((s) => s.activeProjectId)
  const sessions = useChatStore((s) => s.sessions)
  const sessionProjectIds = new Set(sessions.map((x) => x.projectId))
  const activeId = useChatStore((s) => s.activeId)
  const newSession = useChatStore((s) => s.newSession)
  const bulkDeleteSessions = useChatStore((s) => s.bulkDeleteSessions)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const sidebarView = useFileBrowserStore((s) => s.view)
  const setSidebarView = useFileBrowserStore((s) => s.setView)

  const [addingProject, setAddingProject] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Exit edit mode when project switches
  const [editProjectId, setEditProjectId] = useState(activeProjectId)
  if (editProjectId !== activeProjectId) {
    setEditProjectId(activeProjectId)
    setEditMode(false)
    setSelected(new Set())
  }

  // ⌘N shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        newSession()
      }
      if (e.key === 'Escape' && editMode) {
        setEditMode(false)
        setSelected(new Set())
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [newSession, editMode])

  const projectSessions = [...sessions]
    .filter((s) => s.projectId === activeProjectId)
    .reverse()
    .filter((s) => s.messages.length > 0 || s.id === activeId || s.persistId)
    .filter((s) => !searchQuery || s.title.toLowerCase().includes(searchQuery.toLowerCase()))

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    const allIds = projectSessions.map((s) => s.id)
    setSelected((prev) => (prev.size === allIds.length ? new Set() : new Set(allIds)))
  }

  const confirmBulkDelete = () => {
    if (selected.size === 0) return
    bulkDeleteSessions([...selected])
    setSelected(new Set())
    setEditMode(false)
  }

  return (
    <aside
      style={{ width: sidebarWidth }}
      className="relative shrink-0 h-full flex flex-col border-r border-border bg-[#E8E8ED]"
    >
      <div
        onPointerDown={handleResizeStart}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        className="absolute right-0 top-0 bottom-0 z-10 w-1.5 translate-x-1/2 cursor-col-resize hover:bg-foreground/10 transition-colors"
      />
      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-[61px] border-b border-border/40">
        <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-foreground shrink-0">
          <span className="text-background text-sm font-semibold leading-none">π</span>
        </div>
        <span className="text-sm font-semibold tracking-tight truncate flex-1">pi</span>
        <button
          onClick={newSession}
          disabled={isStreaming}
          title="New chat (⌘N)"
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/[0.07] transition-colors disabled:opacity-40"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>

      {/* View switcher */}
      <div className="px-3 pt-3">
        <div className="flex rounded-lg bg-black/[0.05] p-0.5 text-sm font-medium">
          {(['sessions', 'files'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setSidebarView(v)}
              className={`flex-1 rounded-md py-1 transition-colors ${
                sidebarView === v
                  ? 'bg-white shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {v === 'sessions' ? 'Sessions' : 'Files'}
            </button>
          ))}
        </div>
      </div>

      {sidebarView === 'files' && <FileBrowser />}

      {/* Scrollable body */}
      <div hidden={sidebarView === 'files'} className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {/* Global search — above projects */}
        <div className="px-1">
          <div className="flex items-center gap-1.5 rounded-lg bg-white/60 px-2.5 py-1.5">
            <Search className="h-3 w-3 text-muted-foreground shrink-0" strokeWidth={1.8} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sessions…"
              className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Projects section */}
        <div>
          <div className="flex items-center justify-between px-3 pb-1.5">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground select-none">
              Projects
            </span>
            <button
              onClick={() => setAddingProject(true)}
              title="Add Project"
              className="w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <FolderPlus className="h-3.5 w-3.5" strokeWidth={1.8} />
            </button>
          </div>
          <div className="space-y-px">
            {projects
              .filter((p) => !isHiddenAutoProject(p, sessionProjectIds, activeProjectId))
              .map((p) => (
                <ProjectRow key={p.id} project={p} isActive={p.id === activeProjectId} />
              ))}
          </div>
        </div>

        {/* Sessions section */}
        <div>
          {/* Sessions header */}
          <div className="flex items-center justify-between px-3 pb-1.5">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground select-none">
              Sessions
            </span>
            {projectSessions.length > 0 && (
              <button
                onClick={() => {
                  if (editMode) {
                    setEditMode(false)
                    setSelected(new Set())
                  } else setEditMode(true)
                }}
                className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {editMode ? 'Done' : 'Edit'}
              </button>
            )}
          </div>

          {/* Edit mode: select-all row */}
          {editMode && projectSessions.length > 0 && (
            <div className="px-2 pb-1">
              <button
                onClick={selectAll}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm text-foreground/70 hover:bg-black/[0.04] transition-colors"
              >
                <div
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                    selected.size === projectSessions.length && projectSessions.length > 0
                      ? 'bg-foreground/40 border-foreground/40'
                      : 'border-foreground/20'
                  }`}
                >
                  {selected.size === projectSessions.length && projectSessions.length > 0 && (
                    <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                  )}
                </div>
                {selected.size === projectSessions.length && projectSessions.length > 0
                  ? 'Deselect All'
                  : 'Select All'}
              </button>
            </div>
          )}

          {/* Session list */}
          <div className="space-y-px">
            {projectSessions.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted-foreground italic">No sessions yet</p>
            )}
            {projectSessions.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                isActive={s.id === activeId}
                editMode={editMode}
                selected={selected.has(s.id)}
                onToggle={() => toggleSelect(s.id)}
              />
            ))}
          </div>

          {/* Bulk delete bar */}
          {editMode && (
            <div className="mt-2 px-2">
              <button
                onClick={confirmBulkDelete}
                disabled={selected.size === 0}
                className="w-full py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:bg-transparent disabled:text-foreground/30"
              >
                {selected.size === 0
                  ? 'Select to delete'
                  : `Delete ${selected.size} session${selected.size > 1 ? 's' : ''}`}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom: Settings */}
      <div className="px-3 pb-4 border-t border-border/40 pt-3">
        <button
          onClick={onSettingsClick}
          className="flex items-center gap-2.5 w-full rounded-xl px-3 py-2 text-sm text-foreground/60 hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
        >
          <Settings className="h-4 w-4 shrink-0" strokeWidth={1.8} />
          <span>Settings</span>
        </button>
      </div>

      <AddProjectModal open={addingProject} onClose={() => setAddingProject(false)} />
    </aside>
  )
}
