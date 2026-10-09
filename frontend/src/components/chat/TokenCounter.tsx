import { useChatStore } from '@/stores/chatStore'
import { ArrowUp, ArrowDown } from 'lucide-react'

export function TokenCounter() {
  const { inputTokens, outputTokens } = useChatStore((s) => s.tokenUsage)
  const total = inputTokens + outputTokens

  if (total === 0) return null

  return (
    <div className="flex items-center gap-2.5 text-xs text-muted-foreground tabular-nums">
      <span className="flex items-center gap-0.5">
        <ArrowUp className="h-2.5 w-2.5" />
        {inputTokens.toLocaleString()}
      </span>
      <span className="flex items-center gap-0.5">
        <ArrowDown className="h-2.5 w-2.5" />
        {outputTokens.toLocaleString()}
      </span>
      <span className="text-border">·</span>
      <span>{total.toLocaleString()}</span>
    </div>
  )
}
