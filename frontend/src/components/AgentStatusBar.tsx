import { useEffect, useState } from 'react'
import { useChatStore, type AgentStatus } from '@/stores/chatStore'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Brain, Wrench, ShieldAlert, Circle, Square } from 'lucide-react'

const IDLE_TIMEOUT_MS = 30_000

const statusConfig: Record<AgentStatus, {
  label: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  animate?: boolean
}> = {
  idle: {
    label: 'Idle',
    icon: Circle,
    color: 'text-muted-foreground',
  },
  thinking: {
    label: 'Thinking…',
    icon: Brain,
    color: 'text-blue-500',
    animate: true,
  },
  tool_calling: {
    label: 'Executing tool…',
    icon: Wrench,
    color: 'text-amber-500',
    animate: true,
  },
  awaiting_approval: {
    label: 'Awaiting approval',
    icon: ShieldAlert,
    color: 'text-destructive',
    animate: true,
  },
}

export function AgentStatusBar() {
  const agentStatus = useChatStore((s) => s.agentStatus)
  const lastEventAt = useChatStore((s) => s.lastEventAt)
  const stopAgent = useChatStore((s) => s.stopAgent)
  const [displayStatus, setDisplayStatus] = useState<AgentStatus>(agentStatus)

  // Auto-idle after 30s of no events
  useEffect(() => {
    setDisplayStatus(agentStatus)

    if (agentStatus === 'idle') return

    const timer = setTimeout(() => {
      setDisplayStatus('idle')
    }, IDLE_TIMEOUT_MS)

    return () => clearTimeout(timer)
  }, [agentStatus, lastEventAt])

  const config = statusConfig[displayStatus]
  const Icon = config.icon

  if (displayStatus === 'idle') return null

  return (
    <div className="flex items-center justify-center py-1.5 px-4 border-b border-border/30 bg-background/80 backdrop-blur-sm">
      <Badge
        variant="outline"
        className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${config.color} border-current/20`}
      >
        <Icon className={`h-3.5 w-3.5 ${config.animate ? 'animate-pulse' : ''}`} />
        <span>{config.label}</span>
      </Badge>
      <Button
        variant="outline"
        size="sm"
        className="ml-2 h-6 px-2 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
        onClick={stopAgent}
      >
        <Square className="h-3 w-3 mr-1" />
        Stop
      </Button>
    </div>
  )
}
