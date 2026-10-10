import type { ReactNode } from 'react'

/** The plain text inside a rendered Markdown node, used for copying */
export function extractText(node: ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (!node) return ''
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (typeof node === 'object' && 'props' in node) {
    return extractText((node as React.ReactElement<{ children?: ReactNode }>).props.children)
  }
  return ''
}

/** Read the language name from <code className="language-xxx"> */
export function extractLang(node: ReactNode): string {
  if (!node || typeof node !== 'object' || !('props' in node)) return ''
  const cls = (node as React.ReactElement<{ className?: string }>).props.className ?? ''
  const m = cls.match(/language-(\w+)/)
  return m ? m[1] : ''
}
