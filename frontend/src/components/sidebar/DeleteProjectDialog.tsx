import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

type DeleteProjectDialogProps = {
  projectName: string
  folderPath: string
  sessionCount: number
  onCancel: () => void
  onConfirm: (deleteFolder: boolean) => void
}

// Confirms removing a project. Keeps the choice short: remove from the app, or also move the folder to Trash.
export function DeleteProjectDialog({
  projectName, folderPath, sessionCount, onCancel, onConfirm,
}: DeleteProjectDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-project-title"
        className="w-full max-w-sm rounded-2xl border border-border/50 bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="delete-project-title" className="text-base font-semibold">
          Delete “{projectName}”?
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {sessionCount} conversation{sessionCount === 1 ? '' : 's'} will be deleted.
        </p>
        <p className="mt-3 truncate font-mono text-sm text-muted-foreground" title={folderPath}>
          {folderPath}
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <Button variant="destructive" onClick={() => onConfirm(true)}>
            Move folder to Trash
          </Button>
          <Button variant="outline" onClick={() => onConfirm(false)}>
            Remove from app only
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
