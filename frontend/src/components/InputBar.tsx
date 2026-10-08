import { useState, useRef, useEffect, type KeyboardEvent, type ChangeEvent } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { useFileBrowserStore, type PendingFile } from '@/stores/fileBrowserStore'
import { ArrowUp, FileText, Paperclip, Square, X } from 'lucide-react'
import type { ImageAttachment } from '@/types'

let attachCounter = 0

export function InputBar({ bare = false }: { bare?: boolean }) {
  const [text, setText] = useState('')
  const [images, setImages] = useState<ImageAttachment[]>([])
  const [attachedFile, setAttachedFile] = useState<PendingFile | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const stopAgent = useChatStore((s) => s.stopAgent)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const pendingFile = useFileBrowserStore((s) => s.pendingFile)
  const clearPendingFile = useFileBrowserStore((s) => s.clearPendingFile)

  // File clicked in the sidebar tree → prefill the prompt and attach its content
  useEffect(() => {
    if (!pendingFile) return
    const prompt = `请分析这个文件：\`${pendingFile.path}\``
    setText((prev) => (prev.trim() ? `${prev.trimEnd()}\n${prompt}` : prompt))
    setAttachedFile(pendingFile)
    clearPendingFile()
    textareaRef.current?.focus()
  }, [pendingFile, clearPendingFile])

  const canSend = text.trim().length > 0 && !isStreaming

  const handleSend = () => {
    if (!canSend) return
    const prompt = text.trim()
    const message = attachedFile
      ? `${prompt}\n\n文件 \`${attachedFile.path}\`：\n\`\`\`\n${attachedFile.content}\n\`\`\``
      : prompt
    sendMessage(message)
    setText('')
    setImages([])
    setAttachedFile(null)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter (no shift) or Cmd+Enter → send
    if (e.key === 'Enter' && (!e.shiftKey || e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    Array.from(files).forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        const attachment: ImageAttachment = {
          id: `img-${++attachCounter}`,
          name: file.name,
          dataUrl: reader.result as string,
        }
        setImages((prev) => [...prev, attachment])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id))
  }

  const inner = (
    <div className="max-w-2xl mx-auto">
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
            <div className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border/50 bg-card px-2.5 py-1 text-xs text-foreground/70">
              <FileText className="h-3 w-3 shrink-0 text-muted-foreground/60" strokeWidth={1.8} />
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
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />

          <button
            onClick={() => fileRef.current?.click()}
            className="shrink-0 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Paperclip className="h-4 w-4" />
          </button>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message pi…"
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none min-h-[24px] max-h-[200px]"
          />

          {isStreaming ? (
            <button
              onClick={stopAgent}
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

        <p className="text-[11px] text-muted-foreground/50 text-center mt-2.5 font-normal">
          Press Enter to send · Shift+Enter for new line
        </p>
    </div>
  )

  if (bare) return inner

  return (
    <div className="px-6 pb-6 pt-2 bg-background">{inner}</div>
  )
}
