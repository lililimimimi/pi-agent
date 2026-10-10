import { useEffect, useRef, useState } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { MessageSquare, MoreHorizontal, Pencil, Trash2, Check, FolderOpen as RevealIcon } from 'lucide-react'
import { revealSessionFile } from '@/services/api/sessions'
import { useToast } from '@/components/useToast'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { RenameInput } from '@/components/sidebar/RenameInput'
import { useMenuKeyboard } from '@/hooks/useFocusManagement'

export function SessionRow({
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
  const [confirmingDelete, setConfirmingDelete] = useState(false)
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

  if (editMode) {
    return (
      <div
        className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm cursor-pointer transition-colors ${
          selected ? 'bg-destructive/10' : 'hover:bg-black/[0.06]'
        }`}
        onClick={onToggle}
      >
        {/* Checkbox */}
        <div
          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
            selected ? 'bg-destructive border-destructive' : 'border-foreground/30'
          }`}
        >
          {selected && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
        </div>
        <span
          className={`truncate flex-1 leading-snug ${selected ? 'text-destructive' : 'text-foreground/60'}`}
        >
          {session.title}
        </span>
      </div>
    )
  }

  return (
    <div
      className={`group/row relative flex items-center gap-2 rounded-xl px-3 py-2 text-sm cursor-pointer transition-colors ${
        isActive
          ? 'bg-white shadow-sm text-foreground font-medium'
          : 'text-foreground/60 hover:bg-black/[0.06]'
      }`}
      onClick={() => {
        if (!renaming) switchSession(session.id)
      }}
    >
      <MessageSquare
        className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-foreground/70' : 'text-muted-foreground'}`}
        strokeWidth={1.8}
      />

      {renaming ? (
        <RenameInput
          value={session.title}
          onCommit={(v) => {
            renameSession(session.id, v)
            setRenaming(false)
          }}
          onCancel={() => setRenaming(false)}
        />
      ) : (
        <span className="truncate flex-1 leading-snug">{session.title}</span>
      )}

      {!renaming && (
        <button
          ref={triggerRef}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Chat actions"
          className="shrink-0 opacity-0 group-hover/row:opacity-100 w-5 h-5 flex items-center justify-center rounded-md hover:bg-foreground/10 transition-all"
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
          {session.persistId && (
            <button
              role="menuitem"
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
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen(false)
              setConfirmingDelete(true)
            }}
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
            Delete
          </button>
        </div>
      )}
      {confirmingDelete && (
        <ConfirmDialog
          title={`Delete “${session.title || 'New chat'}”?`}
          description="This chat is removed from the list and its saved file is deleted. This cannot be undone."
          confirmLabel="Delete"
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            setConfirmingDelete(false)
            deleteSession(session.id)
          }}
        />
      )}
    </div>
  )
}

// ── Project row ───────────────────────────────────────────────────────────────
