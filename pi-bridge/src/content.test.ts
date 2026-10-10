import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { toPromptInput } from './content.js'

describe('toPromptInput', () => {
  it('passes a plain string through with no images', () => {
    assert.deepEqual(toPromptInput('hello'), { text: 'hello', images: [] })
  })

  it('splits text parts and converts image parts to Pi format', () => {
    const result = toPromptInput([
      { type: 'text', text: 'what is this?' },
      { type: 'image', image: { media_type: 'image/png', data: 'BASE64' } },
    ])
    assert.equal(result.text, 'what is this?')
    assert.deepEqual(result.images, [{ type: 'image', data: 'BASE64', mimeType: 'image/png' }])
  })

  it('keeps every image part, in order', () => {
    const result = toPromptInput([
      { type: 'image', image: { media_type: 'image/png', data: 'A' } },
      { type: 'image', image: { media_type: 'image/jpeg', data: 'B' } },
    ])
    assert.deepEqual(
      result.images.map((i) => i.data),
      ['A', 'B'],
    )
  })

  it('joins multiple text parts', () => {
    assert.equal(
      toPromptInput([
        { type: 'text', text: 'a' },
        { type: 'text', text: 'b' },
      ]).text,
      'ab',
    )
  })

  it('rejects unsupported image types', () => {
    assert.throws(
      () => toPromptInput([{ type: 'image', image: { media_type: 'image/svg+xml', data: 'x' } }]),
      /Unsupported image type/,
    )
  })

  it('returns empty input for unknown content shapes', () => {
    assert.deepEqual(toPromptInput(null), { text: '', images: [] })
  })
})
