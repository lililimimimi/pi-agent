import { useEffect, useRef } from 'react'
import { MessageBubble } from '@/components/chat/MessageBubble'
import { ExecutionPreviewCard } from '@/components/chat/ExecutionPreviewCard'
import { useChatStore } from '@/stores/chatStore'
import { useToast } from '@/components/useToast'
import { friendlyError } from '@/lib/errors'

export function ChatView() {
  const messages = useChatStore((s) => s.messages)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const agentStatus = useChatStore((s) => s.agentStatus)
  const error = useChatStore((s) => s.error)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const resendFrom = useChatStore((s) => s.resendFrom)
  const regenerate = useChatStore((s) => s.regenerate)
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
  const activeId = useChatStore((s) => s.activeId)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // True while the view is at (or near) the bottom. Output only pulls the view down while this holds,
  // so reading older messages while a reply streams is not interrupted.
  const followRef = useRef(true)
  const prevErrorRef = useRef<string | null>(null)

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  // Another conversation always opens at its newest message
  useEffect(() => {
    followRef.current = true
  }, [activeId])

  // While a reply streams, jump instead of animating: a smooth scroll on every token makes it stutter
  useEffect(() => {
    // Sending a message always brings its reply into view
    if (messages.at(-1)?.role === 'user') followRef.current = true
    if (!followRef.current) return
    bottomRef.current?.scrollIntoView({ behavior: isStreaming ? 'auto' : 'smooth' })
  }, [messages, isStreaming])

  // Show toast on new errors
  useEffect(() => {
    if (error && error !== prevErrorRef.current) {
      const friendly = friendlyError(error)
      showToast({
        type: 'error',
        message: friendly.title,
        detail: friendly.detail,
        onRetry: lastUserMsg ? () => sendMessage(lastUserMsg) : undefined,
      })
    }
    prevErrorRef.current = error
  }, [error, showToast, lastUserMsg, sendMessage])

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-auto px-6">
      <div className="max-w-2xl mx-auto py-8 space-y-6">
        {messages.map((msg, i) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            streaming={isStreaming && i === messages.length - 1}
            onResend={isStreaming ? undefined : resendFrom}
            onRegenerate={!isStreaming && i === messages.length - 1 ? regenerate : undefined}
          />
        ))}

        {executionPreview && (
          <ExecutionPreviewCard preview={executionPreview} onDone={clearExecutionPreview} />
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
          <div className="rounded-2xl border border-destructive/15 bg-destructive/8 px-5 py-3 text-destructive">
            <p className="text-base font-medium">{friendlyError(error).title}</p>
            <p className="mt-1 break-all text-xs opacity-70">{friendlyError(error).detail}</p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
