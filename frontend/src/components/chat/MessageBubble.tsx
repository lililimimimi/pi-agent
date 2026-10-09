import { useState, useCallback, useRef, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Copy, Check, ChevronRight } from 'lucide-react'
import { ToolCallCard } from '@/components/chat/ToolCallCard'
import type { Message, ToolCall, ToolResult } from '@/types'
import { cn } from '@/lib/utils'
import { friendlyError } from '@/lib/errors'

function extractText(node: ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (!node) return ''
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (typeof node === 'object' && 'props' in node) {
    return extractText((node as React.ReactElement<{ children?: ReactNode }>).props.children)
  }
  return ''
}

/** 从 <code className="language-xxx"> 提取语言名 */
function extractLang(node: ReactNode): string {
  if (!node || typeof node !== 'object' || !('props' in node)) return ''
  const cls = (node as React.ReactElement<{ className?: string }>).props.className ?? ''
  const m = cls.match(/language-(\w+)/)
  return m ? m[1] : ''
}

function CodeBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null)
  const lang = extractLang(children)

  const handleCopy = useCallback(() => {
    const text = extractText(children)
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 1500)
    })
  }, [children])

  return (
    <div className="group/code relative my-2 rounded-xl overflow-hidden">
      {/* Language label bar */}
      {lang && (
        <div className="flex items-center justify-between bg-zinc-800 px-4 py-1.5">
          <span className="text-xs font-mono text-zinc-400">{lang}</span>
        </div>
      )}
      <pre className={cn(
        'px-4 py-3.5 overflow-x-auto text-sm leading-relaxed',
        lang ? 'bg-zinc-950' : 'bg-foreground/[0.05]',
      )}>
        {children}
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        className={cn(
          'absolute right-2.5 flex h-6 w-6 items-center justify-center rounded-lg',
          lang ? 'top-9' : 'top-2.5',
          lang ? 'text-zinc-500 hover:bg-white/10 hover:text-zinc-300' : 'text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground/70',
          'transition-all duration-200',
          'opacity-0 group-hover/code:opacity-100',
          'cursor-pointer',
          copied && (lang ? 'opacity-100 text-green-400 hover:text-green-400' : 'opacity-100 text-green-600 hover:text-green-600'),
        )}
        aria-label={copied ? 'Copied' : 'Copy code'}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

// ── List block with copy button ─────────────────────────────────────────
function ListBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null)

  const handleCopy = useCallback(() => {
    const text = extractText(children)
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 1500)
    })
  }, [children])

  return (
    <div className="group/list relative rounded-xl border border-border bg-white/60 px-4 py-3 my-1">
      <button
        type="button"
        onClick={handleCopy}
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

// ── Tool call collapsible group ─────────────────────────────────────────────
function ToolCallGroup({ toolCalls, toolResults }: { toolCalls: ToolCall[]; toolResults?: ToolResult[] }) {
  const [open, setOpen] = useState(false)
  const doneCount = toolCalls.filter((tc) =>
    toolResults?.some((tr) => tr.toolCallId === tc.toolCallId)
  ).length
  const total = toolCalls.length
  const allDone = doneCount === total

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground/80 transition-colors cursor-pointer select-none"
      >
        <ChevronRight
          className={cn('h-3 w-3 transition-transform duration-150', open && 'rotate-90')}
        />
        <span>
          {total} tool call{total > 1 ? 's' : ''}
          {allDone ? '' : ` · ${doneCount}/${total}`}
        </span>
      </button>
      {open && (
        <div className="mt-1.5 space-y-1">
          {toolCalls.map((tc) => {
            const result = toolResults?.find((tr) => tr.toolCallId === tc.toolCallId)
            return <ToolCallCard key={tc.toolCallId} toolCall={tc} result={result} />
          })}
        </div>
      )}
    </div>
  )
}

type MessageBubbleProps = {
  message: Message
}

// Custom renderers for assistant messages
const assistantComponents: Components = {
  // Heading: bold + bottom border line
  h1: ({ children }) => (
    <div className="mt-1">
      <p className="font-bold text-[15px] tracking-tight text-foreground">{children}</p>
      <div className="mt-1.5 border-b border-foreground/12" />
    </div>
  ),
  h2: ({ children }) => (
    <div className="mt-1">
      <p className="font-semibold text-[14px] tracking-tight text-foreground">{children}</p>
      <div className="mt-1.5 border-b border-foreground/12" />
    </div>
  ),
  h3: ({ children }) => (
    <div className="mt-1">
      <p className="font-semibold text-sm tracking-tight text-foreground">{children}</p>
      <div className="mt-1 border-b border-foreground/10" />
    </div>
  ),

  // Lists: bordered rounded box with copy button
  ul: ({ children }) => <ListBlock>{children}</ListBlock>,
  ol: ({ children }) => (
    <ol className="space-y-2.5 list-decimal pl-5 m-0">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-sm leading-[1.8] text-foreground/85">{children}</li>
  ),

  // Code block: gray background with copy button
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  code: ({ className, children, ...props }) => {
    // inline code
    const isBlock = !!(props as Record<string, unknown>).node
    if (!className && !isBlock) {
      return (
        <code className="bg-foreground/[0.06] px-1.5 py-0.5 rounded-md text-[0.85em] font-mono">
          {children}
        </code>
      )
    }
    return <code className={className}>{children}</code>
  },

  // Table
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-foreground/[0.04] border-b border-border">{children}</thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-b border-border/50 last:border-0 hover:bg-foreground/[0.02] transition-colors">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-4 py-2.5 text-left text-sm font-semibold text-foreground/60 uppercase tracking-wider whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-2.5 text-sm leading-relaxed text-foreground/80">{children}</td>
  ),

  // Paragraph
  p: ({ children }) => (
    <p className="text-sm leading-[1.85] tracking-[0.01em] text-foreground/85">{children}</p>
  ),

  // Blockquote
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-foreground/20 pl-4 text-foreground/60 italic">
      {children}
    </blockquote>
  ),
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  // A failed turn restored from the session file: same look as the live error banner
  if (message.error) {
    const friendly = friendlyError(message.error)
    return (
      <div className="flex justify-start">
        <div className="w-full rounded-2xl border border-destructive/15 bg-destructive/8 px-5 py-3 text-destructive">
          <p className="text-base font-medium">{friendly.title}</p>
          <p className="mt-1 break-all text-xs opacity-70">{friendly.detail}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'rounded-2xl px-5 py-4',
          isUser
            ? 'max-w-[80%] bg-foreground text-background text-sm leading-relaxed'
            // assistant: 白底无框，撑满宽度
            : 'w-full bg-transparent',
        )}
      >
        {/* User images */}
        {message.images && message.images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {message.images.map((img) => (
              <img key={img.id} src={img.dataUrl} alt={img.name} className="max-h-40 rounded-xl" />
            ))}
          </div>
        )}

        {/* Message content */}
        {message.content && (
          isUser ? (
            <span>{message.content}</span>
          ) : (
            <div className="assistant-prose space-y-3">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={assistantComponents}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )
        )}

        {/* Tool calls — collapsible group */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <ToolCallGroup toolCalls={message.toolCalls} toolResults={message.toolResults} />
        )}
      </div>
    </div>
  )
}
