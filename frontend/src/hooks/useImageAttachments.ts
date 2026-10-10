import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type RefObject,
} from 'react'
import { useToast } from '@/components/useToast'
import {
  readAsDataUrl,
  validateImageFile,
  isAllowedImageType,
  prepareImage,
  imageFilesFromTransfer,
  MAX_IMAGES_PER_MESSAGE,
} from '@/lib/image'
import type { ImageAttachment } from '@/types'

let attachCounter = 0

/** Images attached to the message being written: from the picker, a paste or a drop */
export function useImageAttachments(textareaRef: RefObject<HTMLTextAreaElement | null>) {
  const [images, setImages] = useState<ImageAttachment[]>([])
  const { showToast } = useToast()

  // Validates and reads each image; used by the file picker and by paste
  const addImageFiles = useCallback(
    async (files: File[]) => {
      const room = MAX_IMAGES_PER_MESSAGE - images.length
      if (room <= 0) {
        showToast({ type: 'error', message: `Up to ${MAX_IMAGES_PER_MESSAGE} images per message` })
        return
      }
      if (files.length > room) {
        showToast({ type: 'error', message: `You can add ${room} more image(s)` })
      }
      for (const file of files.slice(0, room)) {
        const label = file.name || 'Image'
        if (!isAllowedImageType(file.type)) {
          showToast({ type: 'error', message: `${label}: only JPEG, PNG, GIF and WebP are supported` })
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
          const attachment: ImageAttachment = {
            id: `img-${++attachCounter}`,
            name: file.name || 'pasted-image',
            dataUrl,
          }
          setImages((prev) => (prev.length >= MAX_IMAGES_PER_MESSAGE ? prev : [...prev, attachment]))
        } catch {
          showToast({ type: 'error', message: 'Could not read the image. Try again.' })
        }
      }
    },
    [images.length, showToast],
  )

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
      const otherField =
        active instanceof HTMLInputElement ||
        (active instanceof HTMLTextAreaElement && active !== textareaRef.current)
      if (otherField) return
      const files = imageFilesFromTransfer((e as unknown as globalThis.ClipboardEvent).clipboardData)
      if (files.length === 0) return
      e.preventDefault()
      void addImageFiles(files)
    }
    window.addEventListener('paste', onWindowPaste)
    return () => window.removeEventListener('paste', onWindowPaste)
  }, [addImageFiles, textareaRef])

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

  return { images, setImages, removeImage, handleFileChange, handlePaste, handleDragOver, handleDrop }
}
