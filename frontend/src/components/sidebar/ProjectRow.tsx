import { useEffect, useRef, useState } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { Folder, FolderOpen, MoreHorizontal, Pencil, Trash2, FolderOpen as RevealIcon } from 'lucide-react'
import { revealProjectFolder, renameProjectApi } from '@/services/api/projects'
import { useToast } from '@/components/useToast'
import { RenameInput } from '@/components/sidebar/RenameInput'
import { DeleteProjectDialog } from '@/components/sidebar/DeleteProjectDialog'
import { useMenuKeyboard } from '@/hooks/useFocusManagement'

export function ProjectRow({
  project,
  isActive,
}: {
  project: { id: string; name: string; path?: string }
  isActive: boolean
}) {
  const switchProject = useChatStore((s) => s.switchProject)
  const renameProject = useChatStore((s) => s.renameProject)
  // Renames the folder on disk too; the list only changes once the backend has done it
  const handleRename = (name: string) => {
    setRenaming(false)
    const next = name.trim()
    if (!next || next === project.name) return
    renameProjectApi(project.id, next)
      .then((saved) => renameProject(project.id, saved.name, saved.path))
      .catch((err: Error) => showToast({ type: 'error', message: err.message }))
  }
  const deleteProject = useChatStore((s) => s.deleteProject)
  const { showToast } = useToast()
  const sessionCountFor = (id: string) =>
    useChatStore.getState().sessions.filter((x) => x.projectId === id).length
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const projects = useChatStore((s) => s.projects)

  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  useMenuKeyboard(menuRef, menuOpen, () => setMenuOpen(false), triggerRef)

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
          isActive
            ? 'bg-white shadow-sm text-foreground font-medium'
            : 'text-foreground/60 hover:bg-black/[0.06]'
        }`}
        onClick={() => {
          if (!renaming) switchProject(project.id)
        }}
      >
        <Icon
          className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-foreground/70' : 'text-muted-foreground'}`}
          strokeWidth={1.8}
        />

        {renaming ? (
          <RenameInput value={project.name} onCommit={handleRename} onCancel={() => setRenaming(false)} />
        ) : (
          <span className="truncate flex-1 leading-snug">{project.name}</span>
        )}

        {!renaming && (
          <button
            ref={triggerRef}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Project actions"
            className="shrink-0 opacity-0 group-hover/proj:opacity-100 w-5 h-5 flex items-center justify-center rounded-md hover:bg-foreground/10 transition-all"
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen((v) => !v)
            }}
          >
            <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.8} />
          </button>
        )}

        {menuOpen && (
          <div
            ref={menuRef}
            role="menu"
            className="absolute right-2 top-8 z-50 min-w-[140px] rounded-xl border border-border/60 bg-card shadow-lg p-1 text-sm"
          >
            <button
              role="menuitem"
              className="flex items-center gap-2 w-full rounded-lg px-3 py-2 hover:bg-accent transition-colors text-foreground/80"
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen(false)
                setRenaming(true)
              }}
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />
              Rename
            </button>
            <button
              role="menuitem"
              className="flex items-center gap-2 w-full rounded-lg px-3 py-2 hover:bg-accent transition-colors text-foreground/80"
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen(false)
                revealProjectFolder(project.id).catch((err: Error) =>
                  showToast({ type: 'error', message: err.message }),
                )
              }}
            >
              <RevealIcon className="h-3.5 w-3.5" strokeWidth={1.8} />
              Show in Finder
            </button>
            {projects.length > 1 && (
              <button
                role="menuitem"
                className="flex items-center gap-2 w-full rounded-lg px-3 py-2 hover:bg-destructive/10 text-destructive transition-colors"
                onClick={(e) => {
                  e.stopPropagation()
                  setMenuOpen(false)
                  setConfirmingDelete(true)
                }}
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
