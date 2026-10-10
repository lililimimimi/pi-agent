import type { Components } from 'react-markdown'
import { CodeBlock } from '@/components/chat/message/CodeBlock'
import { ListBlock } from '@/components/chat/message/ListBlock'

// Code without a language label is guessed from these, so the guess stays among common languages
export const HIGHLIGHT_LANGS = [
  'typescript',
  'javascript',
  'python',
  'bash',
  'json',
  'css',
  'xml',
  'markdown',
  'sql',
]

// How the assistant's Markdown is drawn
export const assistantComponents: Components = {
  // Heading: bold + bottom border line
  h1: ({ children }) => (
    <div className="mt-1">
      <p className="font-bold text-[15px] tracking-tight text-foreground">{children}</p>
      <div className="mt-1.5 border-b border-foreground/12" />
    </div>
  ),
  h2: ({ children }) => (
    <div className="mt-2">
      <p className="font-semibold text-base tracking-tight text-foreground">{children}</p>
      <div className="mt-1.5 border-b border-foreground/12" />
    </div>
  ),
  h3: ({ children }) => (
    <div className="mt-1">
      <p className="font-semibold text-[15px] tracking-tight text-foreground">{children}</p>
      <div className="mt-1 border-b border-foreground/10" />
    </div>
  ),
  // Bold labels stand out: full-strength text colour and a heavier weight than the body
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,

  // Lists: bordered rounded box with copy button
  ul: ({ children }) => <ListBlock>{children}</ListBlock>,
  ol: ({ children }) => <ol className="space-y-2.5 list-decimal pl-5 m-0">{children}</ol>,
  li: ({ children }) => <li className="text-sm leading-[1.8] text-foreground/85">{children}</li>,

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
    <div className="my-2 overflow-x-auto rounded-md border border-border/40">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-foreground/[0.04] border-b border-border">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-b border-border/50 last:border-0 hover:bg-foreground/[0.02] transition-colors">
      {children}
    </tr>
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
