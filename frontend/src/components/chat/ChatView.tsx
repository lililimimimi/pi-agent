import { useEffect, useRef } from 'react'
import { MessageBubble } from '@/components/chat/MessageBubble'
import { ExecutionPreviewCard } from '@/components/chat/ExecutionPreviewCard'
import { useChatStore } from '@/stores/chatStore'
import { useToast } from '@/components/Toast'


export function ChatView() {
  const messages = useChatStore((s) => s.messages)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const agentStatus = useChatStore((s) => s.agentStatus)
  const error = useChatStore((s) => s.error)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const lastUserMsg = useChatStore((s) => {
    const msgs = s.messages
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') return msgs[i].content
    }
    return ''
  })
  const executionPreview = useChatStore((s) => s.executionPreview)
  const clearExecutionPreview = useChatStore((s) => s.clearExecutionPreview)
  const { showToast } = useToast()
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevErrorRef = useRef<string | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Show toast on new errors
  useEffect(() => {
    if (error && error !== prevErrorRef.current) {
      showToast({
        type: 'error',
        message: error,
        onRetry: lastUserMsg ? () => sendMessage(lastUserMsg) : undefined,
      })
    }
    prevErrorRef.current = error
  }, [error, showToast, lastUserMsg, sendMessage])

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-6">
      <div className="max-w-2xl mx-auto py-8 space-y-6">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {executionPreview && (
          <ExecutionPreviewCard
            preview={executionPreview}
            onDone={clearExecutionPreview}
          />
        )}

        {isStreaming && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl px-4 py-3 text-sm text-muted-foreground">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
              </div>
              <span>
                {agentStatus === 'tool_calling'
                  ? 'Executing tool…'
                  : agentStatus === 'awaiting_approval'
                    ? 'Awaiting approval…'
                    : 'Thinking…'}
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-destructive/8 text-destructive text-sm rounded-2xl px-5 py-3 border border-destructive/15">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
