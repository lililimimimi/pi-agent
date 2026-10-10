import { useCallback, useEffect, useRef } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { MessageBubble } from '@/components/chat/MessageBubble'
import { ExecutionPreviewCard } from '@/components/chat/ExecutionPreviewCard'
import { useChatStore } from '@/stores/chatStore'
import { useToast } from '@/components/useToast'
import { friendlyError } from '@/lib/errors'
import type { ExecutionPreview } from '@/components/chat/ExecutionPreviewCard'

type FooterContext = {
  executionPreview: ExecutionPreview | null
  onPreviewDone: () => void
  isStreaming: boolean
  agentStatus: string
  error: string | null
}

// Below the last message: the open execution preview, the "thinking" line while a reply streams, and any error
function ChatFooter({ context }: { context?: FooterContext }) {
  if (!context) return null
  const { executionPreview, onPreviewDone, isStreaming, agentStatus, error } = context
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 pb-40 md:px-12">
      {executionPreview && <ExecutionPreviewCard preview={executionPreview} onDone={onPreviewDone} />}

      {isStreaming && (
        <div className="flex justify-start">
          <div className="flex items-center gap-2 rounded-2xl px-4 py-3 text-sm text-muted-foreground">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
            </div>
            <span>{agentStatus === 'tool_calling' ? 'Executing tool…' : 'Thinking…'}</span>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-destructive/15 bg-destructive/8 px-5 py-3 text-destructive">
          <p className="text-base font-medium">{friendlyError(error).title}</p>
          <p className="mt-1 break-all text-xs opacity-70">{friendlyError(error).detail}</p>
        </div>
      )}
    </div>
  )
}

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
  const activeId = useChatStore((s) => s.activeId)
  const { showToast } = useToast()

  const listRef = useRef<VirtuosoHandle>(null)
  const prevErrorRef = useRef<string | null>(null)

  // Sending a message puts it at the top of the view, and the reply grows below it.
  // The view stays pinned there after the reply is done, until the user scrolls or sends again.
  // The pin is re-applied as heights change, because the reply is not tall enough to scroll that
  // far until it has text, and Virtuoso measures it after render.
  const pinnedIndexRef = useRef<number | null>(null)
  const releasePin = useCallback(() => {
    pinnedIndexRef.current = null
  }, [])
  const scrollToPinned = () => {
    if (pinnedIndexRef.current === null) return
    listRef.current?.scrollToIndex({ index: pinnedIndexRef.current, align: 'start', behavior: 'auto' })
  }
  useEffect(() => {
    const last = messages.length - 1
    if (isStreaming && messages[last]?.role === 'user') pinnedIndexRef.current = last
    scrollToPinned()
    // Virtuoso may still settle its own position after this render; pin again once it has
    const timer = window.setTimeout(scrollToPinned, 300)
    return () => window.clearTimeout(timer)
  }, [messages, isStreaming])
  // Any scrolling by the user gives the view back to them
  const watchUserScroll = useCallback(
    (el: HTMLElement | Window | null) => {
      if (!(el instanceof HTMLElement)) return
      el.addEventListener('wheel', releasePin, { passive: true })
      el.addEventListener('touchmove', releasePin, { passive: true })
    },
    [releasePin],
  )

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

  const footerContext: FooterContext = {
    executionPreview,
    onPreviewDone: clearExecutionPreview,
    isStreaming,
    agentStatus,
    error,
  }

  return (
    <Virtuoso
      // A new conversation starts from its newest message, with its own scroll position
      key={activeId}
      ref={listRef}
      className="flex-1 min-h-0"
      data={messages}
      computeItemKey={(_, msg) => msg.id}
      initialTopMostItemIndex={{ index: 'LAST', align: 'end' }}
      // Before the list has measured its viewport, draw the last few messages straight away
      initialItemCount={10}
      atBottomThreshold={80}
      // Heights are measured after render; re-apply the pin once they are known
      totalListHeightChanged={scrollToPinned}
      scrollerRef={watchUserScroll}
      itemContent={(i, msg) => (
        <div className="mx-auto max-w-3xl px-6 pb-6 md:px-12">
          <MessageBubble
            message={msg}
            streaming={isStreaming && i === messages.length - 1}
            onResend={isStreaming ? undefined : resendFrom}
            onRegenerate={!isStreaming && i === messages.length - 1 ? regenerate : undefined}
          />
        </div>
      )}
      components={{ Footer: ChatFooter }}
      context={footerContext}
    />
  )
}
