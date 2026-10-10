import { useEffect, useRef } from 'react'
import { useDialogFocus } from '@/hooks/useFocusManagement'

const GROUPS: { title: string; items: [keys: string, what: string][] }[] = [
  {
    title: 'Chat',
    items: [
      ['⌘N or ⌘K', 'New chat'],
      ['Enter', 'Send message'],
      ['⇧Enter', 'New line in the message'],
      ['⌘Enter', 'Send message (same as Enter); saves an edited message'],
      ['Esc', 'Stop the reply being written (click in the message box first)'],
      ['↑ / ↓', 'Go back through messages you sent on this page'],
    ],
  },
  {
    title: 'Window',
    items: [
      ['⌘B', 'Show or hide the sidebar'],
      ['⌘,', 'Open Settings'],
      ['⌘?', 'Show this list'],
    ],
  },
]

// The keyboard shortcuts, in one place. Escape or a click outside closes it.
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogFocus(dialogRef)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="w-full max-w-md rounded-2xl border border-border/50 bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="shortcuts-title" className="text-base font-semibold">
          Keyboard shortcuts
        </h2>
        {GROUPS.map((group) => (
          <section key={group.title} className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.title}
            </h3>
            <dl className="mt-2 space-y-2">
              {group.items.map(([keys, what]) => (
                <div key={keys} className="flex items-baseline gap-3 text-sm">
                  <dt className="w-28 shrink-0 font-mono text-foreground/80">{keys}</dt>
                  <dd className="text-muted-foreground">{what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  )
}
