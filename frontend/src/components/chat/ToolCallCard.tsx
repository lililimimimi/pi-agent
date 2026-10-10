import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useChatStore } from '@/stores/chatStore'
import type { ToolCall, ToolResult } from '@/types'
import { Wrench, Check, X, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'

type ToolCallStatus = 'pending' | 'running' | 'done' | 'error' | 'rejected'

type ToolCallCardProps = {
  toolCall: ToolCall
  result?: ToolResult
}

function deriveStatus(result?: ToolResult): ToolCallStatus {
  if (!result) return 'running'
  if (result.isError) return 'error'
  return 'done'
}

const statusConfig: Record<
  ToolCallStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }
> = {
  pending: { label: 'pending', variant: 'outline' },
  running: { label: 'running', variant: 'default' },
  done: {
    label: 'done',
    variant: 'outline',
    className: 'bg-green-500/10 text-green-600 border-green-500/20',
  },
  error: { label: 'error', variant: 'destructive' },
  rejected: { label: 'rejected', variant: 'destructive' },
}

/** 解析各种 tool result 格式，提取可读文本 */
function extractResultText(raw: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return raw
  }

  // Array of content blocks (Anthropic / pi SDK format)
  if (Array.isArray(parsed)) {
    const parts: string[] = []
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) continue
      const block = item as Record<string, unknown>
      // text block
      if (typeof block.text === 'string') {
        parts.push(block.text)
        continue
      }
      // exit_code / value block
      if ('exitCode' in block || 'exit_code' in block || 'value' in block) {
        const code = block.exitCode ?? block.exit_code ?? block.value
        if (code !== undefined) parts.push(`Exit code: ${String(code)}`)
        continue
      }
      // any other block with a string field
      for (const v of Object.values(block)) {
        if (typeof v === 'string' && v.length > 0) {
          parts.push(v)
          break
        }
      }
    }
    return parts.length > 0 ? parts.join('\n').trimEnd() : raw
  }

  // Plain object
  if (typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as Record<string, unknown>
    const parts: string[] = []
    for (const key of ['output', 'text', 'content', 'stdout']) {
      if (typeof obj[key] === 'string') parts.push(obj[key] as string)
    }
    if (typeof obj.stderr === 'string' && (obj.stderr as string).length > 0)
      parts.push(`stderr: ${obj.stderr as string}`)
    const code = obj.exitCode ?? obj.exit_code
    if (code !== undefined) parts.push(`Exit code: ${String(code)}`)
    return parts.length > 0 ? parts.join('\n').trimEnd() : raw
  }

  return raw
}

function getSummary(toolName: string, args: Record<string, unknown>): string {
  const name = toolName.toLowerCase()

  if (name === 'read' || name === 'read_file') {
    return typeof args.path === 'string' ? args.path : ''
  }

  if (name === 'bash' || name === 'execute') {
    if (typeof args.command === 'string') {
      return args.command.length > 60 ? args.command.slice(0, 60) + '…' : args.command
    }
    return ''
  }

  if (name === 'write' || name === 'write_file') {
    return typeof args.path === 'string' ? args.path : ''
  }

  if (name === 'edit' || name === 'edit_file') {
    return typeof args.path === 'string' ? args.path : ''
  }

  // Fallback: first string value, truncated
  for (const val of Object.values(args)) {
    if (typeof val === 'string') {
      return val.length > 60 ? val.slice(0, 60) + '…' : val
    }
  }

  return ''
}

export function ToolCallCard({ toolCall, result }: ToolCallCardProps) {
  const approve = useChatStore((s) => s.approveToolCall)
  const [argsExpanded, setArgsExpanded] = useState(false)
  const [resultExpanded, setResultExpanded] = useState(false)

  const status = deriveStatus(result)
  const config = statusConfig[status]
  const summary = getSummary(toolCall.toolName, toolCall.arguments ?? {})

  return (
    <div className="my-1.5 border border-border/30 rounded-lg bg-foreground/[0.02] text-sm">
      {/* Header line */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5">
        {status === 'running' ? (
          <Loader2 className="h-3 w-3 text-muted-foreground animate-spin shrink-0" />
        ) : (
          <Wrench className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
        <span className="font-mono text-sm text-foreground/70">{toolCall.toolName}</span>
        {summary && (
          <span className="font-mono text-sm text-foreground/70 max-w-[300px] truncate">{summary}</span>
        )}
        <Badge
          variant={config.variant}
          className={`text-xs leading-none px-1.5 py-0 rounded font-medium ${config.className ?? ''}`}
        >
          {config.label}
        </Badge>
      </div>

      {/* Toggles + content */}
      <div className="px-2.5 pb-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <button
          type="button"
          onClick={() => setArgsExpanded(!argsExpanded)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          {argsExpanded ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
          <span>Arguments</span>
        </button>

        {result && (
          <button
            type="button"
            onClick={() => setResultExpanded(!resultExpanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            {resultExpanded ? (
              <ChevronDown className="h-2.5 w-2.5" />
            ) : (
              <ChevronRight className="h-2.5 w-2.5" />
            )}
            <span>Result</span>
          </button>
        )}

        {!result && status === 'running' && (
          <div className="flex gap-1.5 ml-auto">
            <Button
              size="sm"
              variant="default"
              onClick={() => approve(toolCall.toolCallId, true)}
              className="rounded text-xs h-6 px-2.5"
            >
              <Check className="h-2.5 w-2.5 mr-1" /> Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => approve(toolCall.toolCallId, false)}
              className="rounded text-xs h-6 px-2.5"
            >
              <X className="h-2.5 w-2.5 mr-1" /> Reject
            </Button>
          </div>
        )}
      </div>

      {/* Expanded panels */}
      {argsExpanded && (
        <pre className="text-sm bg-foreground/[0.03] border-t border-border/20 px-2.5 py-2 overflow-x-auto text-foreground/70">
          {JSON.stringify(toolCall.arguments, null, 2)}
        </pre>
      )}
      {result && resultExpanded && (
        <pre className="text-sm bg-foreground/[0.02] border-t border-border/20 px-2.5 py-2 overflow-x-auto max-h-40 text-foreground/60 whitespace-pre-wrap break-words">
          {extractResultText(result.output)}
        </pre>
      )}
    </div>
  )
}
