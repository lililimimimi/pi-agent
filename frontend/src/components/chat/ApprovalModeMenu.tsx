import { useRef, useState } from 'react'
import { Check, Hand, Zap } from 'lucide-react'
import { useChatStore } from '@/stores/chatStore'
import { useMenuKeyboard } from '@/hooks/useFocusManagement'

/** Approval mode: whether file edits inside the project ask first. Commands always ask when they write. */
export function ApprovalModeMenu() {
  const autoEdits = useChatStore((s) => s.autoEdits)
  const setAutoEdits = useChatStore((s) => s.setAutoEdits)
  const [modeOpen, setModeOpen] = useState(false)
  const modeMenuRef = useRef<HTMLDivElement>(null)
  const modeButtonRef = useRef<HTMLButtonElement>(null)
  useMenuKeyboard(modeMenuRef, modeOpen, () => setModeOpen(false), modeButtonRef)

  return (
    <div className="relative shrink-0">
      <button
        ref={modeButtonRef}
        onClick={() => setModeOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={modeOpen}
        aria-label={autoEdits ? 'Approval mode: Auto-edit' : 'Approval mode: Ask for approval'}
        title={autoEdits ? 'Auto-edit: edits inside the project run without asking' : 'Ask for approval'}
        className={`relative flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-accent ${
          autoEdits ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        {autoEdits ? <Zap className="h-4 w-4" /> : <Hand className="h-4 w-4" strokeWidth={1.8} />}
        {autoEdits && (
          <span
            className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-amber-500"
            aria-hidden="true"
          />
        )}
      </button>

      {modeOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setModeOpen(false)} />
          <div
            ref={modeMenuRef}
            role="menu"
            className="absolute bottom-full left-0 z-20 mb-2 w-72 rounded-xl border border-border/60 bg-card p-1 shadow-lg"
          >
            {[
              { on: false, label: 'Ask for approval', desc: 'Ask before every file change' },
              { on: true, label: 'Auto-edit', desc: 'Edits inside this project run without asking' },
            ].map((opt) => (
              <button
                key={opt.label}
                role="menuitemradio"
                aria-checked={autoEdits === opt.on}
                onClick={() => {
                  setAutoEdits(opt.on)
                  setModeOpen(false)
                }}
                className={`flex min-h-[3.25rem] w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-foreground/[0.04] ${
                  autoEdits === opt.on ? 'bg-foreground/[0.07]' : ''
                }`}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={`text-sm ${autoEdits === opt.on ? 'font-medium text-foreground' : 'text-foreground/80'}`}
                  >
                    {opt.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{opt.desc}</span>
                </span>
                {autoEdits === opt.on && (
                  <Check className="h-4 w-4 shrink-0 text-foreground" strokeWidth={2} />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
