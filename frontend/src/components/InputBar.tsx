import { useState, useRef, type KeyboardEvent, type ChangeEvent } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { ArrowUp, Paperclip, X } from 'lucide-react'
import type { ImageAttachment } from '@/types'

let attachCounter = 0

export function InputBar({ bare = false }: { bare?: boolean }) {
  const [text, setText] = useState('')
  const [images, setImages] = useState<ImageAttachment[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const isStreaming = useChatStore((s) => s.isStreaming)

  const canSend = text.trim().length > 0 && !isStreaming

  const handleSend = () => {
    if (!canSend) return
    sendMessage(text.trim())
    setText('')
    setImages([])
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
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
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message pi…"
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none min-h-[24px] max-h-[200px]"
          />

          <button
            disabled={!canSend}
            onClick={handleSend}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-foreground text-background disabled:opacity-20 transition-opacity"
          >
            <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
          </button>
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
