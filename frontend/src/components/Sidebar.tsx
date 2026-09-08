import { useEffect, useRef, useState } from 'react'
import { useChatStore } from '@/stores/chatStore'
import {
  Plus, Settings, MessageSquare, Folder, FolderOpen,
  MoreHorizontal, Pencil, Trash2, Check, FolderPlus,
} from 'lucide-react'

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
function SessionRow({ session, isActive }: { session: { id: string; title: string }; isActive: boolean }) {
  const switchSession = useChatStore((s) => s.switchSession)
  const renameSession = useChatStore((s) => s.renameSession)
  const deleteSession = useChatStore((s) => s.deleteSession)

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

  return (
    <div
      className={`group/row relative flex items-center gap-2 rounded-xl px-3 py-2 text-sm cursor-pointer transition-colors ${
        isActive ? 'bg-white shadow-sm text-foreground font-medium' : 'text-foreground/60 hover:bg-black/[0.06]'
      }`}
      onClick={() => { if (!renaming) switchSession(session.id) }}
    >
      <MessageSquare
        className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-foreground/50' : 'text-muted-foreground/40'}`}
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

      {/* "…" button */}
      {!renaming && (
        <button
          className="shrink-0 opacity-0 group-hover/row:opacity-100 w-5 h-5 flex items-center justify-center rounded-md hover:bg-foreground/10 transition-all"
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v) }}
        >
          <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.8} />
        </button>
      )}

      {/* Dropdown */}
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
function ProjectRow({ project, isActive }: { project: { id: string; name: string }; isActive: boolean }) {
  const switchProject = useChatStore((s) => s.switchProject)
  const renameProject = useChatStore((s) => s.renameProject)
  const deleteProject = useChatStore((s) => s.deleteProject)
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
    <div
      className={`group/proj relative flex items-center gap-2 rounded-xl px-3 py-2 text-sm cursor-pointer transition-colors ${
        isActive ? 'bg-white shadow-sm text-foreground font-medium' : 'text-foreground/60 hover:bg-black/[0.06]'
      }`}
      onClick={() => { if (!renaming) switchProject(project.id) }}
    >
      <Icon
        className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-foreground/50' : 'text-muted-foreground/40'}`}
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
          {projects.length > 1 && (
            <button
              className="flex items-center gap-2 w-full rounded-lg px-3 py-2 hover:bg-destructive/10 text-destructive transition-colors"
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false); deleteProject(project.id) }}
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Add project input ─────────────────────────────────────────────────────────
function AddProjectRow({ onDone }: { onDone: () => void }) {
  const addProject = useChatStore((s) => s.addProject)
  const [text, setText] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { ref.current?.focus() }, [])

  const commit = () => {
    if (text.trim()) addProject(text.trim())
    onDone()
  }

  return (
    <div className="flex items-center gap-2 rounded-xl px-3 py-2 bg-white shadow-sm">
      <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" strokeWidth={1.8} />
      <input
        ref={ref}
        value={text}
        placeholder="Project name…"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') onDone()
        }}
        onBlur={commit}
        className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
      />
      <button onClick={commit} className="shrink-0 text-foreground/50 hover:text-foreground">
        <Check className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </div>
  )
}

// ── Main sidebar ──────────────────────────────────────────────────────────────
export function Sidebar({ onSettingsClick }: SidebarProps) {
  const projects = useChatStore((s) => s.projects)
  const activeProjectId = useChatStore((s) => s.activeProjectId)
  const sessions = useChatStore((s) => s.sessions)
  const activeId = useChatStore((s) => s.activeId)
  const newSession = useChatStore((s) => s.newSession)
  const isStreaming = useChatStore((s) => s.isStreaming)

  const [addingProject, setAddingProject] = useState(false)

  // ⌘N shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') { e.preventDefault(); newSession() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [newSession])

  // Sessions in active project, newest first
  const projectSessions = [...sessions]
    .filter((s) => s.projectId === activeProjectId)
    .reverse()
    .filter((s) => s.messages.length > 0 || s.id === activeId)

  return (
    <aside className="w-52 shrink-0 h-full flex flex-col border-r border-border bg-[#E8E8ED]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-[61px] border-b border-border/40">
        <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-foreground shrink-0">
          <span className="text-background text-[13px] font-semibold leading-none">π</span>
        </div>
        <span className="text-sm font-semibold tracking-tight truncate flex-1">pi</span>
        <button
          onClick={newSession}
          disabled={isStreaming}
          title="New Conversation (⌘N)"
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/[0.07] transition-colors disabled:opacity-40"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">

        {/* Projects section */}
        <div>
          <div className="flex items-center justify-between px-3 pb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 select-none">
              Projects
            </span>
            <button
              onClick={() => setAddingProject(true)}
              title="New Project"
              className="w-4 h-4 flex items-center justify-center text-muted-foreground/50 hover:text-foreground transition-colors"
            >
              <FolderPlus className="h-3.5 w-3.5" strokeWidth={1.8} />
            </button>
          </div>
          <div className="space-y-px">
            {projects.map((p) => (
              <ProjectRow key={p.id} project={p} isActive={p.id === activeProjectId} />
            ))}
            {addingProject && <AddProjectRow onDone={() => setAddingProject(false)} />}
          </div>
        </div>

        {/* Sessions section */}
        <div>
          <div className="flex items-center px-3 pb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 select-none">
              Sessions
            </span>
          </div>
          <div className="space-y-px">
            {projectSessions.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground/40 italic">No sessions yet</p>
            )}
            {projectSessions.map((s) => (
              <SessionRow key={s.id} session={s} isActive={s.id === activeId} />
            ))}
          </div>
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
    </aside>
  )
}
