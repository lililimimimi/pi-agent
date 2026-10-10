import type { SessionRecord } from '@/lib/schemas'
/**
 * Converts messages between the chat screen and the API / saved session records.
 * Pure functions: no store state, so they are easy to test on their own.
 */
import type { ContentPart } from '@/services/api/chat'
import type { Message } from '@/types'
import { parseDataUrl, stripImageMarker } from '@/lib/image'

/** Builds the API content for a message: plain text, or text + image parts. */
export function toApiContent(m: Message, includeImages: boolean): string | ContentPart[] {
  const images = includeImages ? (m.images ?? []) : []
  if (images.length === 0) return m.content
  const parts: ContentPart[] = m.content ? [{ type: 'text', text: m.content }] : []
  for (const image of images) {
    const { mediaType, data } = parseDataUrl(image.dataUrl)
    parts.push({ type: 'image', image: { media_type: mediaType, data } })
  }
  return parts
}

/** Converts stored session records into chat messages (text only). */
export function recordsToMessages(records: SessionRecord[]): Message[] {
  let counter = 0
  return records
    .filter((r) => r.type === 'message')
    .map((r): Message => {
      const id = `restored-${++counter}`
      const content = r.content || ''
      // A failed turn is saved as "Error: <text>"; show it as an error, not as a reply
      if (r.role === 'assistant' && content.startsWith('Error: ')) {
        return { id, role: 'assistant', content: '', error: content.slice('Error: '.length) }
      }
      return { id, role: r.role === 'user' ? 'user' : 'assistant', content: stripImageMarker(content) }
    })
}
