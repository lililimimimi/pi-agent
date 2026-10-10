import type { ReactNode } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { extractText } from '@/components/chat/message/markdownText'

// A bulleted or numbered list in a bordered box, with a copy button
export function ListBlock({ children }: { children: ReactNode }) {
  const { copied, copy } = useCopyToClipboard()

  return (
    <div className="group/list relative my-1 rounded-md border-2 border-border bg-background px-4 py-3">
      <button
        type="button"
        onClick={() => copy(extractText(children))}
        className={cn(
          'absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-lg',
          'text-muted-foreground transition-all duration-200',
          'opacity-0 group-hover/list:opacity-100',
          'hover:bg-foreground/[0.06] hover:text-foreground/70',
          'cursor-pointer',
          copied && 'opacity-100 text-green-600 hover:text-green-600',
        )}
        aria-label={copied ? 'Copied' : 'Copy'}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <ul className="space-y-1.5 list-none m-0 p-0">{children}</ul>
    </div>
  )
}
