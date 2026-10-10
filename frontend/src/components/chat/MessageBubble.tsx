import { memo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { ToolCallGroup } from '@/components/chat/message/ToolCallGroup'
import { EditMessageForm } from '@/components/chat/message/EditMessageForm'
import {
  CopyMessageButton,
  EditMessageButton,
  RegenerateButton,
} from '@/components/chat/message/MessageActions'
import { HIGHLIGHT_LANGS, assistantComponents } from '@/components/chat/message/assistantMarkdown'
import type { Message } from '@/types'
import { cn } from '@/lib/utils'
import { friendlyError } from '@/lib/errors'

type MessageBubbleProps = {
  message: Message
  /** True while this reply is still being written */
  streaming?: boolean
  /** Given on user messages: sends the edited text in place of this message and drops what came after */
  onResend?: (messageId: string, content: string, images?: Message['images']) => void
  /** Given on the last reply only: asks the model again for the user message before it */
  onRegenerate?: () => void
}

// Memoized: while a reply streams, only the last message object changes, so the
// finished messages above it skip re-rendering and re-parsing their Markdown.
export const MessageBubble = memo(function MessageBubble({
  message,
  streaming = false,
  onResend,
  onRegenerate,
}: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const [editing, setEditing] = useState(false)

  // A failed turn restored from the session file: same look as the live error banner
  if (message.error) {
    const friendly = friendlyError(message.error)
    return (
      <div className="flex justify-start">
        <div className="w-full rounded-2xl border border-destructive/15 bg-destructive/8 px-5 py-3 text-destructive">
          <p className="text-base font-medium">{friendly.title}</p>
          <p className="mt-1 break-all text-xs opacity-70">{friendly.detail}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('group/msg flex flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'rounded-2xl px-5 py-4',
          isUser
            ? 'max-w-[80%] bg-foreground text-background text-sm leading-relaxed'
            : // assistant: 白底无框，撑满宽度
              'w-full bg-transparent',
        )}
      >
        {editing && isUser && onResend ? (
          <EditMessageForm
            initial={message.content}
            onCancel={() => setEditing(false)}
            onSave={(text) => {
              setEditing(false)
              onResend(message.id, text, message.images)
            }}
          />
        ) : (
          <>
            {/* User images */}
            {message.images && message.images.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {message.images.map((img) => (
                  <img key={img.id} src={img.dataUrl} alt={img.name} className="max-h-40 rounded-xl" />
                ))}
              </div>
            )}

            {/* Message content */}
            {message.content &&
              (isUser ? (
                <span>{message.content}</span>
              ) : (
                <div className="assistant-prose space-y-3">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    // Guessing the language of unlabeled code is slow, so it waits until the reply is finished
                    rehypePlugins={[[rehypeHighlight, { detect: !streaming, subset: HIGHLIGHT_LANGS }]]}
                    components={assistantComponents}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              ))}

            {/* Tool calls — collapsible group */}
            {message.toolCalls && message.toolCalls.length > 0 && (
              <ToolCallGroup toolCalls={message.toolCalls} toolResults={message.toolResults} />
            )}
          </>
        )}
      </div>
      {isUser && message.content && !editing && (
        <div className="flex items-center gap-1">
          {onResend && <EditMessageButton onClick={() => setEditing(true)} />}
          <CopyMessageButton text={message.content} />
        </div>
      )}
      {!isUser && message.content && !streaming && (
        <div className="flex items-center gap-1">
          {/* The reply's own text, as the model wrote it: no tool cards or labels */}
          <CopyMessageButton text={message.content} label="Copy reply" />
          {onRegenerate && <RegenerateButton onClick={onRegenerate} />}
        </div>
      )}
    </div>
  )
})
