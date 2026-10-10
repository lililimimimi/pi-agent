import { useState, type KeyboardEvent } from 'react'

// Inline editor shown in place of a user's bubble
export function EditMessageForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: string
  onSave: (text: string) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const canSave = draft.trim().length > 0

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') onCancel()
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSave) onSave(draft.trim())
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={Math.min(8, Math.max(2, draft.split('\n').length))}
        aria-label="Edit message text"
        className="w-full resize-none bg-transparent text-sm leading-relaxed text-background outline-none"
      />
      <div className="flex justify-end gap-2 text-xs">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-2.5 py-1 opacity-70 hover:opacity-100 cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave(draft.trim())}
          disabled={!canSave}
          className="rounded-md bg-background px-2.5 py-1 font-medium text-foreground disabled:opacity-40 cursor-pointer"
        >
          Save &amp; resend
        </button>
      </div>
    </div>
  )
}
