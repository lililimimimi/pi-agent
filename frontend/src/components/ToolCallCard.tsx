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
    <Card className="my-2 border-dashed">
      <CardHeader className="py-2 px-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Wrench className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono">{toolCall.toolName}</span>
          {result && (
            <Badge variant={result.isError ? 'destructive' : 'secondary'}>
              {result.isError ? 'error' : 'done'}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-2 space-y-2">
        <pre className="text-xs bg-muted p-2 rounded-md overflow-x-auto">
          {JSON.stringify(toolCall.arguments, null, 2)}
        </pre>

        {result && (
          <pre className="text-xs bg-muted/50 p-2 rounded-md overflow-x-auto max-h-40">
            {result.output}
          </pre>
        )}

        {!result && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="default"
              onClick={() => approve(toolCall.toolCallId, true)}
            >
              <Check className="h-3 w-3 mr-1" /> Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => approve(toolCall.toolCallId, false)}
            >
              <X className="h-3 w-3 mr-1" /> Reject
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
