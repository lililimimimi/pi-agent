import { useEffect, useRef } from 'react'
import { MessageBubble } from '@/components/MessageBubble'
import { useChatStore } from '@/stores/chatStore'


export function ChatView() {
  const messages = useChatStore((s) => s.messages)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const error = useChatStore((s) => s.error)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-6">
      <div className="max-w-2xl mx-auto py-8 space-y-6">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {isStreaming && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl px-4 py-3 text-sm text-muted-foreground">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
              </div>
              <span>Thinking…</span>
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
