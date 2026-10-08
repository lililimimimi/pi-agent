import { useState, useRef, useEffect, type KeyboardEvent, type ChangeEvent, type ClipboardEvent, type DragEvent } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { useFileBrowserStore, type PendingFile } from '@/stores/fileBrowserStore'
import { useToast } from '@/components/Toast'
import {
  readAsDataUrl, validateImageFile, isAllowedImageType, prepareImage,
  imageFilesFromTransfer, MAX_IMAGES_PER_MESSAGE,
} from '@/lib/image'
import { ArrowUp, FileText, Paperclip, Square, X } from 'lucide-react'
import type { ImageAttachment } from '@/types'

let attachCounter = 0

export function InputBar({ bare = false }: { bare?: boolean }) {
  const [text, setText] = useState('')
  const [images, setImages] = useState<ImageAttachment[]>([])
  const { showToast } = useToast()
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
    sendMessage(message, images)
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

  // Validates and reads each image; used by the file picker and by paste
  const addImageFiles = async (files: File[]) => {
    const room = MAX_IMAGES_PER_MESSAGE - images.length
    if (room <= 0) {
      showToast({ type: 'error', message: `每条消息最多 ${MAX_IMAGES_PER_MESSAGE} 张图片` })
      return
    }
    if (files.length > room) {
      showToast({ type: 'error', message: `最多还能添加 ${room} 张图片` })
    }
    for (const file of files.slice(0, room)) {
      const label = file.name || '图片'
      if (!isAllowedImageType(file.type)) {
        showToast({ type: 'error', message: `${label}：只支持 JPEG、PNG、GIF、WebP 图片` })
        continue
      }
      try {
        // Oversized screenshots are downscaled first, then checked against the 5MB limit
        const blob = await prepareImage(file)
        const error = validateImageFile(blob)
        if (error) {
          showToast({ type: 'error', message: `${label}：${error}` })
          continue
        }
        const dataUrl = await readAsDataUrl(blob)
        const attachment: ImageAttachment = { id: `img-${++attachCounter}`, name: file.name || 'pasted-image', dataUrl }
        setImages((prev) => (prev.length >= MAX_IMAGES_PER_MESSAGE ? prev : [...prev, attachment]))
      } catch {
        showToast({ type: 'error', message: '读取图片失败，请重试' })
      }
    }
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    void addImageFiles(files)
  }

  // Pasting an image (including a screenshot or a copied image) attaches it;
  // pasting text falls through to the textarea as usual
  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = imageFilesFromTransfer(e.clipboardData)
    if (files.length === 0) return
    e.preventDefault()
    void addImageFiles(files)
  }

  // Paste anywhere on the page (not only inside the textarea) while no other
  // text field has focus, so a screenshot can be pasted without clicking first
  useEffect(() => {
    const onWindowPaste = (e: Event) => {
      // Already handled by the textarea's onPaste (it bubbles up to window)
      if (e.defaultPrevented) return
      const active = document.activeElement
      const otherField = active instanceof HTMLInputElement || (active instanceof HTMLTextAreaElement && active !== textareaRef.current)
      if (otherField) return
      const files = imageFilesFromTransfer((e as unknown as globalThis.ClipboardEvent).clipboardData)
      if (files.length === 0) return
      e.preventDefault()
      void addImageFiles(files)
    }
    window.addEventListener('paste', onWindowPaste)
    return () => window.removeEventListener('paste', onWindowPaste)
    // addImageFiles reads the current `images`; re-register when it changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length])

  // Drag an image file onto the input area
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault()
  }
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    const files = imageFilesFromTransfer(e.dataTransfer)
    if (files.length === 0) return
    e.preventDefault()
    void addImageFiles(files)
  }

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id))
  }

  const inner = (
    <div className="max-w-2xl mx-auto" onDragOver={handleDragOver} onDrop={handleDrop}>
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
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />

          <button
            onClick={() => fileRef.current?.click()}
            disabled={images.length >= MAX_IMAGES_PER_MESSAGE}
            title={images.length >= MAX_IMAGES_PER_MESSAGE ? `每条消息最多 ${MAX_IMAGES_PER_MESSAGE} 张图片` : '附加图片'}
            className="shrink-0 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Paperclip className="h-4 w-4" />
          </button>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
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
