import { useEffect, useRef, useState } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { AddProjectModal } from '@/components/sidebar/AddProjectModal'
import { FileBrowser } from '@/components/files/FileBrowser'
import { useFileBrowserStore } from '@/stores/fileBrowserStore'
import { useLayoutStore, clampSidebarWidth } from '@/stores/layoutStore'
import {
  Plus, Settings, MessageSquare, Folder, FolderOpen,
  MoreHorizontal, Pencil, Trash2, Check, FolderPlus, Search, FolderOpen as RevealIcon,
} from 'lucide-react'
import { revealSessionFile, revealProjectFolder } from '@/services/api'
import { useToast } from '@/components/Toast'
import { DeleteProjectDialog } from '@/components/sidebar/DeleteProjectDialog'
import { isHiddenAutoProject } from '@/lib/projects'

type SidebarProps = {
  onSettingsClick?: () => void
}

// ── Inline rename input ───────────────────────────────────────────────────────
function RenameInput({
  value,
  onCommit,
  onCancel,
}: {
  value: string
  onCommit: (v: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])

  return (
    <input
      ref={ref}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(text.trim() || value)
        if (e.key === 'Escape') onCancel()
        e.stopPropagation()
      }}
      onBlur={() => onCommit(text.trim() || value)}
      className="flex-1 min-w-0 bg-transparent text-sm outline-none border-b border-foreground/30 leading-snug"
    />
  )
}

// ── Session row ───────────────────────────────────────────────────────────────
function SessionRow({
  session,
  isActive,
  editMode,
  selected,
  onToggle,
}: {
  session: { id: string; title: string; persistId?: string | null }
  isActive: boolean
  editMode: boolean
  selected: boolean
  onToggle: () => void
}) {
  const switchSession = useChatStore((s) => s.switchSession)
  const renameSession = useChatStore((s) => s.renameSession)
  const deleteSession = useChatStore((s) => s.deleteSession)
  const { showToast } = useToast()

  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [menuOpen])

  if (editMode) {
    return (
      <div
        className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm cursor-pointer transition-colors ${
          selected ? 'bg-destructive/10' : 'hover:bg-black/[0.06]'
        }`}
        onClick={onToggle}
      >
        {/* Checkbox */}
        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
          selected ? 'bg-destructive border-destructive' : 'border-foreground/30'
        }`}>
          {selected && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
        </div>
        <span className={`truncate flex-1 leading-snug ${selected ? 'text-destructive' : 'text-foreground/60'}`}>
          {session.title}
        </span>
      </div>
    )
  }

  return (
    <div
      className={`group/row relative flex items-center gap-2 rounded-xl px-3 py-2 text-sm cursor-pointer transition-colors ${
        isActive ? 'bg-white shadow-sm text-foreground font-medium' : 'text-foreground/60 hover:bg-black/[0.06]'
      }`}
      onClick={() => { if (!renaming) switchSession(session.id) }}
    >
      <MessageSquare
        className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-foreground/70' : 'text-muted-foreground'}`}
        strokeWidth={1.8}
      />

      {renaming ? (
        <RenameInput
          value={session.title}
          onCommit={(v) => { renameSession(session.id, v); setRenaming(false) }}
          onCancel={() => setRenaming(false)}
        />
      ) : (
        <span className="truncate flex-1 leading-snug">{session.title}</span>
      )}

      {!renaming && (
        <button
          className="shrink-0 opacity-0 group-hover/row:opacity-100 w-5 h-5 flex items-center justify-center rounded-md hover:bg-foreground/10 transition-all"
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v) }}
        >
          <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.8} />
        </button>
      )}

      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute right-2 top-8 z-50 min-w-[140px] rounded-xl border border-border/60 bg-card shadow-lg p-1 text-sm"
        >
          <button
            className="flex items-center gap-2 w-full rounded-lg px-3 py-2 hover:bg-accent transition-colors text-foreground/80"
            onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setRenaming(true) }}
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />
            Rename
          </button>
          {session.persistId && (
            <button
              className="flex items-center gap-2 w-full rounded-lg px-3 py-2 hover:bg-accent transition-colors text-foreground/80"
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen(false)
                revealSessionFile(session.persistId!).catch((err: Error) =>
                  showToast({ type: 'error', message: err.message }),
                )
              }}
            >
              <RevealIcon className="h-3.5 w-3.5" strokeWidth={1.8} />
              Show in Finder
            </button>
          )}
          <button
            className="flex items-center gap-2 w-full rounded-lg px-3 py-2 hover:bg-destructive/10 text-destructive transition-colors"
            onClick={(e) => { e.stopPropagation(); setMenuOpen(false); deleteSession(session.id) }}
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

// ── Project row ───────────────────────────────────────────────────────────────
function ProjectRow({ project, isActive }: { project: { id: string; name: string; path?: string }; isActive: boolean }) {
  const switchProject = useChatStore((s) => s.switchProject)
  const renameProject = useChatStore((s) => s.renameProject)
  const deleteProject = useChatStore((s) => s.deleteProject)
  const { showToast } = useToast()
  const sessionCountFor = (id: string) => useChatStore.getState().sessions.filter((x) => x.projectId === id).length
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const projects = useChatStore((s) => s.projects)

  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [menuOpen])

  const Icon = isActive ? FolderOpen : Folder

  return (
    <>
    <div
      className={`group/proj relative flex items-center gap-2 rounded-xl px-3 py-2 text-sm cursor-pointer transition-colors ${
        isActive ? 'bg-white shadow-sm text-foreground font-medium' : 'text-foreground/60 hover:bg-black/[0.06]'
      }`}
      onClick={() => { if (!renaming) switchProject(project.id) }}
    >
      <Icon
        className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-foreground/70' : 'text-muted-foreground'}`}
        strokeWidth={1.8}
      />

      {renaming ? (
        <RenameInput
          value={project.name}
          onCommit={(v) => { renameProject(project.id, v); setRenaming(false) }}
          onCancel={() => setRenaming(false)}
        />
      ) : (
        <span className="truncate flex-1 leading-snug">{project.name}</span>
      )}

      {!renaming && (
        <button
          className="shrink-0 opacity-0 group-hover/proj:opacity-100 w-5 h-5 flex items-center justify-center rounded-md hover:bg-foreground/10 transition-all"
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v) }}
        >
          <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.8} />
        </button>
      )}

      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute right-2 top-8 z-50 min-w-[140px] rounded-xl border border-border/60 bg-card shadow-lg p-1 text-sm"
        >
          <button
            className="flex items-center gap-2 w-full rounded-lg px-3 py-2 hover:bg-accent transition-colors text-foreground/80"
            onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setRenaming(true) }}
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />
            Rename
          </button>
          <button
            className="flex items-center gap-2 w-full rounded-lg px-3 py-2 hover:bg-accent transition-colors text-foreground/80"
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen(false)
              revealProjectFolder(project.id).catch((err: Error) => showToast({ type: 'error', message: err.message }))
            }}
          >
            <RevealIcon className="h-3.5 w-3.5" strokeWidth={1.8} />
            Show in Finder
          </button>
          {projects.length > 1 && (
            <button
              className="flex items-center gap-2 w-full rounded-lg px-3 py-2 hover:bg-destructive/10 text-destructive transition-colors"
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setConfirmingDelete(true) }}
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
              Delete
            </button>
          )}
        </div>
      )}
    </div>
    {confirmingDelete && (
      <DeleteProjectDialog
        projectName={project.name}
        folderPath={project.path ?? ''}
        sessionCount={sessionCountFor(project.id)}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={(deleteFolder) => {
          setConfirmingDelete(false)
          deleteProject(project.id, deleteFolder)
        }}
      />
    )}
    </>
  )
}

// ── Main sidebar ──────────────────────────────────────────────────────────────
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
  useEffect(() => {
    setEditMode(false)
    setSelected(new Set())
  }, [activeProjectId])

  // ⌘N shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') { e.preventDefault(); newSession() }
      if (e.key === 'Escape' && editMode) { setEditMode(false); setSelected(new Set()) }
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
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () => {
    const allIds = projectSessions.map((s) => s.id)
    setSelected((prev) =>
      prev.size === allIds.length ? new Set() : new Set(allIds)
    )
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
                sidebarView === v ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {v === 'sessions' ? 'Sessions' : 'Files'}
            </button>
          ))}
        </div>
      </div>

      {sidebarView === 'files' && <FileBrowser />}

      {/* Scrollable body */}
      <div
        hidden={sidebarView === 'files'}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-4"
      >

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
                  if (editMode) { setEditMode(false); setSelected(new Set()) }
                  else setEditMode(true)
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
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                  selected.size === projectSessions.length && projectSessions.length > 0
                    ? 'bg-foreground/40 border-foreground/40'
                    : 'border-foreground/20'
                }`}>
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
