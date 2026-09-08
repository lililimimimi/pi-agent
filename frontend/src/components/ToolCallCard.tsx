import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useChatStore } from '@/stores/chatStore'
import type { ToolCall, ToolResult } from '@/types'
import { Wrench, Check, X } from 'lucide-react'

type ToolCallCardProps = {
  toolCall: ToolCall
  result?: ToolResult
}

export function ToolCallCard({ toolCall, result }: ToolCallCardProps) {
  const approve = useChatStore((s) => s.approveToolCall)

  return (
    <Card className="my-3 border-border/40 shadow-none bg-foreground/[0.02] rounded-xl">
      <CardHeader className="py-2.5 px-4">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Wrench className="h-3.5 w-3.5 text-muted-foreground/60" />
          <span className="font-mono text-xs text-foreground/70">{toolCall.toolName}</span>
          {result && (
            <Badge
              variant={result.isError ? 'destructive' : 'secondary'}
              className="text-[10px] px-1.5 py-0 rounded-md font-medium"
            >
              {result.isError ? 'error' : 'done'}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-2">
        <pre className="text-xs bg-foreground/[0.03] border border-border/30 p-3 rounded-xl overflow-x-auto text-foreground/70">
          {JSON.stringify(toolCall.arguments, null, 2)}
        </pre>

        {result && (
          <pre className="text-xs bg-foreground/[0.02] border border-border/20 p-3 rounded-xl overflow-x-auto max-h-40 text-foreground/60">
            {result.output}
          </pre>
        )}

        {!result && (
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              variant="default"
              onClick={() => approve(toolCall.toolCallId, true)}
              className="rounded-xl text-xs h-8 px-4"
            >
              <Check className="h-3 w-3 mr-1.5" /> Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => approve(toolCall.toolCallId, false)}
              className="rounded-xl text-xs h-8 px-4"
            >
              <X className="h-3 w-3 mr-1.5" /> Reject
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
