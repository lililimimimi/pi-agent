import type { ReactNode } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { extractLang, extractText } from '@/components/chat/message/markdownText'

// Characters and words that only show up in real code
const CODE_MARKS = /[{};=()<>]|=>|\b(function|const|let|def|import|return|class)\b/

export function CodeBlock({ children }: { children: ReactNode }) {
  const { copied, copy } = useCopyToClipboard()
  const lang = extractLang(children)
  const text = extractText(children)
  // A language label on text that has no code in it (e.g. a file list labeled "css"): show it plain
  const plain = lang !== '' && !CODE_MARKS.test(text)

  return (
    <div className="group/code relative my-2 overflow-hidden rounded-md bg-zinc-950">
      {/* Language label bar */}
      {lang && (
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-3 py-1.5">
          <span className="text-xs font-mono text-zinc-400">{lang}</span>
        </div>
      )}
      <pre
        className={cn(
          'px-4 py-3 text-sm leading-relaxed text-zinc-200',
          // Unlabeled blocks are usually plain text (file lists, diagrams): wrap them instead of cutting off
          lang && !plain ? 'overflow-x-auto' : 'whitespace-pre-wrap break-words',
        )}
      >
        {plain ? text : children}
      </pre>
      <button
        type="button"
        onClick={() => copy(text)}
        className={cn(
          'absolute right-2.5 flex h-6 w-6 items-center justify-center rounded-lg',
          lang ? 'top-9' : 'top-2.5',
          'text-zinc-500 hover:bg-white/10 hover:text-zinc-300',
          'transition-all duration-200',
          'opacity-0 group-hover/code:opacity-100',
          'cursor-pointer',
          copied &&
            (lang
              ? 'opacity-100 text-green-400 hover:text-green-400'
              : 'opacity-100 text-green-600 hover:text-green-600'),
        )}
        aria-label={copied ? 'Copied' : 'Copy code'}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}
