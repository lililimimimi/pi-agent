import { useEffect, useRef, useState } from 'react'

// ── Inline rename input ───────────────────────────────────────────────────────
export function RenameInput({
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

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

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
