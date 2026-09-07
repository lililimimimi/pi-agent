import { useChatStore } from '@/stores/chatStore'
import { ArrowUp, ArrowDown } from 'lucide-react'

export function TokenCounter() {
  const { inputTokens, outputTokens } = useChatStore((s) => s.tokenUsage)
  const total = inputTokens + outputTokens

  if (total === 0) return null

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
      <span className="flex items-center gap-0.5">
        <ArrowUp className="h-3 w-3" />
        {inputTokens.toLocaleString()}
      </span>
      <span className="flex items-center gap-0.5">
        <ArrowDown className="h-3 w-3" />
        {outputTokens.toLocaleString()}
      </span>
      <span className="text-foreground/50">•</span>
      <span>{total.toLocaleString()}</span>
    </div>
  )
}
