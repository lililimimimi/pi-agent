import { Copy, Check, Pencil, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import type { ReactNode } from 'react'

const baseClass = cn(
  'flex h-6 w-6 shrink-0 items-center justify-center rounded-lg',
  'text-muted-foreground transition-all duration-200',
  'opacity-0 group-hover/msg:opacity-100',
  'hover:bg-foreground/[0.06] hover:text-foreground/70',
  'cursor-pointer',
)

// Icon button shown on hover under a message
function MessageActionButton({
  label,
  onClick,
  active = false,
  children,
}: {
  label: string
  onClick: () => void
  active?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(baseClass, active && 'opacity-100 text-green-600 hover:text-green-600')}
      aria-label={label}
    >
      {children}
    </button>
  )
}

export function CopyMessageButton({ text, label = 'Copy message' }: { text: string; label?: string }) {
  const { copied, copy } = useCopyToClipboard()
  return (
    <MessageActionButton label={copied ? 'Copied' : label} onClick={() => copy(text)} active={copied}>
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </MessageActionButton>
  )
}

export function RegenerateButton({ onClick }: { onClick: () => void }) {
  return (
    <MessageActionButton label="Regenerate" onClick={onClick}>
      <RefreshCw className="h-3.5 w-3.5" />
    </MessageActionButton>
  )
}

export function EditMessageButton({ onClick }: { onClick: () => void }) {
  return (
    <MessageActionButton label="Edit message" onClick={onClick}>
      <Pencil className="h-3.5 w-3.5" />
    </MessageActionButton>
  )
}
