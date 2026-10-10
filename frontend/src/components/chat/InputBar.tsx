import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { rememberSent, sentHistory, stepHistory, NOT_BROWSING, type HistoryNav } from '@/lib/inputHistory'
import { useFileBrowserStore, type PendingFile } from '@/stores/fileBrowserStore'
import { MAX_IMAGES_PER_MESSAGE } from '@/lib/image'
import { ArrowUp, FileText, Paperclip, Square, X } from 'lucide-react'
import { useImageAttachments } from '@/hooks/useImageAttachments'
import { ApprovalModeMenu } from '@/components/chat/ApprovalModeMenu'

export function InputBar({ bare = false }: { bare?: boolean }) {
  const [text, setText] = useState('')
  const [attachedFile, setAttachedFile] = useState<PendingFile | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { images, setImages, removeImage, handleFileChange, handlePaste, handleDragOver, handleDrop } =
    useImageAttachments(textareaRef)
  // Where the Up/Down arrows are in the sent history (see lib/inputHistory)
  const historyNav = useRef<HistoryNav>(NOT_BROWSING)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const stopAgent = useChatStore((s) => s.stopAgent)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const pendingFile = useFileBrowserStore((s) => s.pendingFile)
  const clearPendingFile = useFileBrowserStore((s) => s.clearPendingFile)

  // File clicked in the sidebar tree → prefill the prompt and attach its content.
  // The last file handled is kept here, so each click is applied once.
  const [handledFile, setHandledFile] = useState<PendingFile | null>(null)
  if (pendingFile && pendingFile !== handledFile) {
    setHandledFile(pendingFile)
    const prompt = `Please analyze this file: \`${pendingFile.path}\``
    setText((prev) => (prev.trim() ? `${prev.trimEnd()}\n${prompt}` : prompt))
    setAttachedFile(pendingFile)
  }
  // Clearing the shared store is a side effect on an external system, so it stays in an effect
  useEffect(() => {
    if (!pendingFile) return
    clearPendingFile()
    textareaRef.current?.focus()
  }, [pendingFile, clearPendingFile])

  // Grow the box with the text; max-h on the textarea caps it and then it scrolls
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])

  const canSend = text.trim().length > 0 && !isStreaming

  const handleSend = () => {
    if (!canSend) return
    const prompt = text.trim()
    const message = attachedFile
      ? `${prompt}\n\nFile \`${attachedFile.path}\`:\n\`\`\`\n${attachedFile.content}\n\`\`\``
      : prompt
    rememberSent(prompt)
    historyNav.current = NOT_BROWSING
    sendMessage(message, images)
    setText('')
    setImages([])
    setAttachedFile(null)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Esc while a reply is being written → stop it
    if (e.key === 'Escape' && isStreaming) {
      e.preventDefault()
      stopAgent()
      return
    }
    // Up / Down → walk back through messages sent on this page
    if (
      (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
      !e.shiftKey &&
      !e.altKey &&
      !e.metaKey &&
      !e.ctrlKey
    ) {
      const step = stepHistory(sentHistory(), historyNav.current, text, e.key === 'ArrowUp' ? -1 : 1)
      if (step) {
        e.preventDefault()
        historyNav.current = step.nav
        setText(step.text)
      }
      return
    }
    // Enter (no shift) or Cmd+Enter → send
    if (e.key === 'Enter' && (!e.shiftKey || e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSend()
    }
  }

  const inner = (
    <div className="mx-auto max-w-3xl" onDragOver={handleDragOver} onDrop={handleDrop}>
      {/* Image previews */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {images.map((img) => (
            <div key={img.id} className="relative group">
              <img
                src={img.dataUrl}
                alt={img.name}
                className="h-16 rounded-xl object-cover border border-border/50"
              />
              <button
                onClick={() => removeImage(img.id)}
                aria-label="Remove image"
                className="absolute -top-1.5 -right-1.5 bg-foreground/80 text-background rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Attached file chip */}
      {attachedFile && (
        <div className="flex mb-3">
          <div className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border/50 bg-card px-2.5 py-1 text-sm text-foreground/70">
            <FileText className="h-3 w-3 shrink-0 text-muted-foreground" strokeWidth={1.8} />
            <span className="truncate">{attachedFile.path}</span>
            <button
              onClick={() => setAttachedFile(null)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Spotlight-style input container */}
      <div className="flex items-end gap-2 bg-card rounded-2xl border border-border shadow-sm px-4 py-3 transition-shadow focus-within:shadow-md focus-within:border-foreground/20">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        <button
          onClick={() => fileRef.current?.click()}
          disabled={images.length >= MAX_IMAGES_PER_MESSAGE}
          title={
            images.length >= MAX_IMAGES_PER_MESSAGE
              ? `Up to ${MAX_IMAGES_PER_MESSAGE} images per message`
              : 'Attach images'
          }
          className="shrink-0 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <Paperclip className="h-4 w-4" />
        </button>

        <ApprovalModeMenu />

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Message pi…"
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none min-h-[24px] max-h-[200px]"
        />

        {isStreaming ? (
          <button
            onClick={stopAgent}
            aria-label="Stop reply"
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-muted text-muted-foreground hover:bg-muted-foreground/20 transition-colors"
          >
            <Square className="h-3 w-3" fill="currentColor" />
          </button>
        ) : (
          <button
            disabled={!canSend}
            onClick={handleSend}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-foreground text-background disabled:opacity-20 transition-opacity"
          >
            <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  )

  if (bare) return inner

  return <div className="px-6 pb-6 pt-2 bg-background">{inner}</div>
}
