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
              删除项目「{projectName}」？
            </h2>
            <p className="text-muted-foreground">
              无论选哪一个，都会从应用里移除这个项目，并删除它的 {sessionCount} 个会话记录。
            </p>
            <p className="break-all rounded-lg bg-foreground/[0.04] px-3 py-2 font-mono text-xs">
              {folderPath}
            </p>
            <dl className="space-y-2 text-muted-foreground">
              <div>
                <dt className="font-medium text-foreground/80">仅移除项目和会话</dt>
                <dd>桌面上的文件夹和里面的文件都保留，只是应用里不再显示它。</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground/80">同时移到废纸篓</dt>
                <dd>除了上面的操作，还会把整个文件夹移到废纸篓，之后可以从废纸篓恢复。</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg px-3 py-2 text-sm text-foreground/70 hover:bg-accent transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => onConfirm(false)}
            className="rounded-lg bg-foreground/[0.07] px-3 py-2 text-sm font-medium hover:bg-foreground/[0.12] transition-colors"
          >
            仅移除项目和会话
          </button>
          <button
            onClick={() => onConfirm(true)}
            className="rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            同时移到废纸篓
          </button>
        </div>
      </div>
    </div>
  )
}
