import { describe, it, expect } from 'vitest'
import {
  validateImageFile,
  parseDataUrl,
  MAX_IMAGE_BYTES,
  stripImageMarker,
  imageFilesFromItems,
  fitWithin,
} from '../image'

describe('validateImageFile', () => {
  it('accepts JPEG, PNG, GIF and WebP under 5MB', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/gif', 'image/webp']) {
      expect(validateImageFile({ type, size: 1000 })).toBeNull()
    }
  })

  it('rejects other image types', () => {
    expect(validateImageFile({ type: 'image/svg+xml', size: 10 })).toMatch(/JPEG/)
  })

  it('rejects files over 5MB', () => {
    expect(validateImageFile({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 })).toMatch(/5MB/)
    expect(validateImageFile({ type: 'image/png', size: MAX_IMAGE_BYTES })).toBeNull()
  })
})

describe('parseDataUrl', () => {
  it('splits media type and bare base64', () => {
    expect(parseDataUrl('data:image/png;base64,iVBORw0KGgo=')).toEqual({
      mediaType: 'image/png',
      data: 'iVBORw0KGgo=',
    })
  })

  it('throws on a non-base64 data URL', () => {
    expect(() => parseDataUrl('not-a-data-url')).toThrow()
  })
})

describe('stripImageMarker', () => {
  it('removes the marker written after the text', () => {
    expect(stripImageMarker('describe it\n[1 image attached]')).toBe('describe it')
  })

  it('removes the marker when the message had no text', () => {
    expect(stripImageMarker('[2 images attached]')).toBe('')
  })

  it('leaves ordinary text alone', () => {
    expect(stripImageMarker('[see notes] not a marker')).toBe('[see notes] not a marker')
  })
})

describe('imageFilesFromItems', () => {
  const item = (kind: string, type: string, file: File | null) =>
    ({ kind, type, getAsFile: () => file }) as unknown as DataTransferItem

  it('keeps only image files from clipboard items', () => {
    const png = new File(['a'], 'shot.png', { type: 'image/png' })
    const items = [
      item('string', 'text/plain', null),
      item('file', 'image/png', png),
      item('file', 'application/pdf', new File(['b'], 'doc.pdf')),
    ]
    expect(imageFilesFromItems(items)).toEqual([png])
  })
})

describe('fitWithin', () => {
  it('leaves small images unchanged', () => {
    expect(fitWithin(800, 600, 1568)).toEqual({ width: 800, height: 600 })
  })

  it('scales a large retina screenshot so the longest edge fits', () => {
    expect(fitWithin(2880, 1800, 1568)).toEqual({ width: 1568, height: 980 })
  })

  it('scales portrait images by their height', () => {
    expect(fitWithin(1000, 3000, 1500)).toEqual({ width: 500, height: 1500 })
  })
})
