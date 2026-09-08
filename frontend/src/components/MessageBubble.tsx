import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { ToolCallCard } from '@/components/ToolCallCard'
import type { Message } from '@/types'
import { cn } from '@/lib/utils'

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
      <p className="font-semibold text-[13px] tracking-tight text-foreground">{children}</p>
      <div className="mt-1 border-b border-foreground/10" />
    </div>
  ),

  // Lists: bordered rounded box
  ul: ({ children }) => (
    <div className="rounded-xl border border-border bg-white/60 px-4 py-3 my-1">
      <ul className="space-y-1.5 list-none m-0 p-0">{children}</ul>
    </div>
  ),
  ol: ({ children }) => (
    <ol className="space-y-2.5 list-decimal pl-5 m-0">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-sm leading-[1.8] text-foreground/85">{children}</li>
  ),

  // Code block: gray background (only for code)
  pre: ({ children }) => (
    <pre className="bg-foreground/[0.06] rounded-xl border border-foreground/8 px-4 py-3.5 overflow-x-auto text-[13px] leading-relaxed my-1">
      {children}
    </pre>
  ),
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
    <th className="px-4 py-2.5 text-left text-xs font-semibold text-foreground/60 uppercase tracking-wider whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-2.5 text-[13px] leading-relaxed text-foreground/80">{children}</td>
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

        {/* Tool calls */}
        {message.toolCalls?.map((tc) => {
          const result = message.toolResults?.find((tr) => tr.toolCallId === tc.toolCallId)
          return <ToolCallCard key={tc.toolCallId} toolCall={tc} result={result} />
        })}
      </div>
    </div>
  )
}
