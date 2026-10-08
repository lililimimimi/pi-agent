import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

type DeleteProjectDialogProps = {
  projectName: string
  folderPath: string
  sessionCount: number
  onCancel: () => void
  onConfirm: (deleteFolder: boolean) => void
}

// Asks before removing a project. Deleting the folder is a separate, explicit choice.
export function DeleteProjectDialog({
  projectName, folderPath, sessionCount, onCancel, onConfirm,
}: DeleteProjectDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-project-title"
        className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" strokeWidth={1.8} />
          <div className="space-y-3 text-sm">
            <h2 id="delete-project-title" className="text-base font-semibold">
              Delete project “{projectName}”?
            </h2>
            <p className="text-muted-foreground">
              Either way, the project is removed from the app and its {sessionCount} conversation(s) are deleted.
            </p>
            <p className="break-all rounded-lg bg-foreground/[0.04] px-3 py-2 font-mono text-xs">
              {folderPath}
            </p>
            <dl className="space-y-2 text-muted-foreground">
              <div>
                <dt className="font-medium text-foreground/80">Remove project and conversations only</dt>
                <dd>The folder and its files stay on disk. The app just stops showing it.</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground/80">Also move folder to Trash</dt>
                <dd>Does the same as above, and also moves the whole folder to the Trash. You can restore it from there.</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg px-3 py-2 text-sm text-foreground/70 hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(false)}
            className="rounded-lg bg-foreground/[0.07] px-3 py-2 text-sm font-medium hover:bg-foreground/[0.12] transition-colors"
          >
            Remove project and conversations only
          </button>
          <button
            onClick={() => onConfirm(true)}
            className="rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            Also move folder to Trash
          </button>
        </div>
      </div>
    </div>
  )
}
