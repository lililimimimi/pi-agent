import { useChatStore } from '@/stores/chatStore'
import { cn } from '@/lib/utils'

const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'claude-sonnet-4-20250514': 200_000,
  'claude-3-5-sonnet-20241022': 200_000,
  'claude-3-5-haiku-20241022': 200_000,
  'claude-3-opus-20240229': 200_000,
  'deepseek-ai/DeepSeek-V3': 64_000,
  'deepseek-ai/DeepSeek-R1': 64_000,
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gemini-2.0-flash': 1_000_000,
  'gemini-2.5-pro': 1_000_000,
}

const DEFAULT_CONTEXT_LIMIT = 128_000

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000
    return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`
  }
  if (tokens >= 1_000) {
    const k = tokens / 1_000
    return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`
  }
  return String(tokens)
}

function getBarColor(percentage: number): string {
  if (percentage >= 95) return 'bg-red-500'
  if (percentage >= 80) return 'bg-yellow-500'
  return 'bg-green-500'
}

export function ContextBar() {
  const { inputTokens } = useChatStore((s) => s.tokenUsage)
  const model = useChatStore((s) => s.model)

  if (inputTokens <= 0) return null

  const limit = MODEL_CONTEXT_LIMITS[model] ?? DEFAULT_CONTEXT_LIMIT
  const percentage = Math.min((inputTokens / limit) * 100, 100)

  return (
    <div className="flex w-[120px] flex-col gap-0.5">
      <span className="text-[11px] tabular-nums text-muted-foreground/70">
        Context {formatTokenCount(inputTokens)} / {formatTokenCount(limit)}
      </span>
      <div className="h-[2px] w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', getBarColor(percentage))}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
