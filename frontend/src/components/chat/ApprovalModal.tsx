import { useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useChatStore, type PermissionRequest } from '@/stores/chatStore'
import { ShieldAlert, Check, X } from 'lucide-react'

const DANGEROUS_TOOLS = new Set(['bash', 'write', 'execute'])

type ApprovalModalProps = {
  request: PermissionRequest
}

export function ApprovalModal({ request }: ApprovalModalProps) {
  const respondPermission = useChatStore((s) => s.respondPermission)

  // Stays open until the user answers; nothing is rejected on its own
  const handleRespond = useCallback(
    (approved: boolean) => {
      respondPermission(request.toolCallId, approved)
    },
    [respondPermission, request.toolCallId],
  )

  const isDangerous = DANGEROUS_TOOLS.has(request.toolName)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <Card className="w-full max-w-lg mx-4 shadow-2xl border-border rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className={`h-5 w-5 ${isDangerous ? 'text-destructive' : 'text-amber-500'}`} />
            <span>Tool Approval Required</span>
            {isDangerous && (
              <Badge variant="destructive" className="text-xs px-1.5 py-0 rounded-md font-medium">
                dangerous
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tool name */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Tool:</span>
            <span className="font-mono text-sm font-medium">{request.toolName}</span>
          </div>

          {/* Risk hint */}
          {isDangerous && (
            <div className="bg-destructive/8 text-destructive text-sm rounded-xl px-4 py-3 border border-destructive/15">
              ⚠️ This tool can modify files or execute commands on your system. Please review carefully before
              approving.
            </div>
          )}

          {/* Arguments */}
          <div>
            <span className="text-sm text-muted-foreground uppercase tracking-wider font-medium">
              Arguments
            </span>
            <pre className="mt-1.5 text-sm bg-foreground/[0.03] border border-border/30 p-3 rounded-xl overflow-x-auto max-h-48 text-foreground/70">
              {JSON.stringify(request.arguments, null, 2)}
            </pre>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <Button onClick={() => handleRespond(true)} className="flex-1 rounded-xl h-10">
              <Check className="h-4 w-4 mr-1.5" /> Approve
            </Button>
            <Button variant="outline" onClick={() => handleRespond(false)} className="flex-1 rounded-xl h-10">
              <X className="h-4 w-4 mr-1.5" /> Reject
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
