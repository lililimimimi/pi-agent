/**
 * ExecutionPreviewCard
 *
 * Shown when the agent emits an `execution_preview` SSE event before its
 * first write tool call. Displays the planned steps and lets the user
 * confirm or cancel. A 60 s countdown auto-cancels if left unattended.
 */
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { confirmPreview, cancelPreview } from '@/services/api'

export type ExecutionPreview = {
  previewId: string
  steps: string[]
  hasWriteOps: boolean
}

type Props = {
  preview: ExecutionPreview
  onDone: () => void
}

const TIMEOUT_S = 60

export function ExecutionPreviewCard({ preview, onDone }: Props) {
  const [remaining, setRemaining] = useState(TIMEOUT_S)
  const [busy, setBusy] = useState(false)

  // Countdown — auto-cancel at 0
  useEffect(() => {
    if (remaining <= 0) {
      handleCancel()
      return
    }
    const id = setInterval(() => setRemaining((r) => r - 1), 1_000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining])

  async function handleConfirm() {
    setBusy(true)
    try {
      await confirmPreview(preview.previewId)
    } catch {
      // best-effort
    } finally {
      onDone()
    }
  }

  async function handleCancel() {
    setBusy(true)
    try {
      await cancelPreview(preview.previewId)
    } catch {
      // best-effort
    } finally {
      onDone()
    }
  }

  return (
    <Card className="p-4 border border-border/60 bg-muted/30 rounded-2xl space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">
          The agent plans to run the following:
        </p>
        <span className="text-xs text-muted-foreground tabular-nums">
          {remaining}s
        </span>
      </div>

      <ol className="space-y-1 pl-1">
        {preview.steps.map((step, i) => (
          <li key={i} className="flex gap-2 text-sm text-muted-foreground">
            <span className="shrink-0 text-xs font-mono text-muted-foreground/60 pt-0.5">
              {i + 1}.
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          onClick={handleConfirm}
          disabled={busy}
          className="rounded-xl"
        >
          Continue
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleCancel}
          disabled={busy}
          className="rounded-xl"
        >
          Cancel
        </Button>
      </div>
    </Card>
  )
}
