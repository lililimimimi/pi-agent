import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { ToolCallCard } from '@/components/chat/ToolCallCard'
import type { ToolCall, ToolResult } from '@/types'
import { cn } from '@/lib/utils'

// Tool calls of one reply, folded under a single line that shows how many have finished
export function ToolCallGroup({
  toolCalls,
  toolResults,
}: {
  toolCalls: ToolCall[]
  toolResults?: ToolResult[]
}) {
  const [open, setOpen] = useState(false)
  const doneCount = toolCalls.filter((tc) =>
    toolResults?.some((tr) => tr.toolCallId === tc.toolCallId),
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
        <ChevronRight className={cn('h-3 w-3 transition-transform duration-150', open && 'rotate-90')} />
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
