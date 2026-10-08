export const IMAGE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export function isAllowedImageType(type: string): boolean {
  return (IMAGE_MEDIA_TYPES as readonly string[]).includes(type)
}

/** Returns an error message for a file the backend would reject, or null if it is fine. */
export function validateImageFile(file: { type: string; size: number }): string | null {
  if (!isAllowedImageType(file.type)) {
    return '只支持 JPEG、PNG、GIF、WebP 图片'
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return '图片不能超过 5MB'
  }
  return null
}

/** Longest edge kept when an image is downscaled before upload. */
export const MAX_IMAGE_EDGE = 1568

/** Scales (width, height) so the longest edge is at most maxEdge. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }
  const scale = maxEdge / longest
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

function loadImageElement(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Cannot decode image')) }
    img.src = url
  })
}

/**
 * Returns an upload-ready version of the file. Screenshots are often larger
 * than 5MB, so oversized or very large images are downscaled and re-encoded
 * as JPEG. GIFs are kept as-is because canvas would drop their animation.
 */
export async function prepareImage(file: File): Promise<Blob> {
  if (file.type === 'image/gif') return file
  let img: HTMLImageElement
  try {
    img = await loadImageElement(file)
  } catch {
    return file
  }
  const longest = Math.max(img.naturalWidth, img.naturalHeight)
  if (file.size <= MAX_IMAGE_BYTES && longest <= MAX_IMAGE_EDGE) return file

  const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, MAX_IMAGE_EDGE)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  // JPEG has no alpha channel, so fill transparent areas with white
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
  return blob ?? file
}

/** Reads a file as a base64 data URL. */
export function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** Splits `data:image/png;base64,XXXX` into media type and bare base64. */
export function parseDataUrl(dataUrl: string): { mediaType: string; data: string } {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl)
  if (!match) throw new Error('Invalid image data URL')
  return { mediaType: match[1], data: match[2] }
}

/** Max images per message; keep in sync with MAX_IMAGES_PER_MESSAGE in backend/app/types.py. */
export const MAX_IMAGES_PER_MESSAGE = 4

/**
 * Removes the "[附图 N 张]" marker the backend writes into session files,
 * so restored messages show only what the user typed.
 */
export function stripImageMarker(text: string): string {
  return text.replace(/(\n)?\[附图 \d+ 张\]$/, '')
}

/** Image files in a clipboard or drop item list (screenshots and copied images included). */
export function imageFilesFromItems(items: ArrayLike<DataTransferItem>): File[] {
  const files: File[] = []
  for (const item of Array.from(items)) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue
    const file = item.getAsFile()
    if (file) files.push(file)
  }
  return files
}

/**
 * Image files from a paste or drop. Browsers differ: some expose a screenshot
 * only through `items`, others only through `files`, so both are checked.
 */
export function imageFilesFromTransfer(data: { items?: ArrayLike<DataTransferItem> | null; files?: ArrayLike<File> | null } | null): File[] {
  if (!data) return []
  const fromItems = data.items ? imageFilesFromItems(data.items) : []
  if (fromItems.length > 0) return fromItems
  return Array.from(data.files ?? []).filter((f) => f.type.startsWith('image/'))
}
