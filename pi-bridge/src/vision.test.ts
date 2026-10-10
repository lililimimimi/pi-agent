import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { pickModelForImages, supportsImages } from './vision.js'

const text = { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', provider: 'deepseek', input: ['text'] }
const vision = {
  id: 'deepseek-v4-flash-vision-exp',
  name: 'DeepSeek V4 Flash Vision',
  provider: 'deepseek',
  input: ['text', 'image'],
}
const claude = {
  id: 'claude-sonnet-4-5',
  name: 'Claude Sonnet 4.5',
  provider: 'anthropic',
  input: ['text', 'image'],
}

describe('supportsImages', () => {
  it('is true only when the model accepts image input', () => {
    assert.equal(supportsImages(text), false)
    assert.equal(supportsImages(vision), true)
    assert.equal(supportsImages({ ...text, input: undefined }), false)
  })
})

describe('pickModelForImages', () => {
  it('switches to a vision model from the same provider', () => {
    const r = pickModelForImages(text, [text, claude, vision])
    assert.deepEqual(r, { kind: 'switch', model: vision })
  })

  it('ignores vision models from other providers', () => {
    const r = pickModelForImages(text, [text, claude])
    assert.deepEqual(r, { kind: 'drop' })
  })

  it('drops images when no vision model exists', () => {
    assert.deepEqual(pickModelForImages(text, [text]), { kind: 'drop' })
  })
})
