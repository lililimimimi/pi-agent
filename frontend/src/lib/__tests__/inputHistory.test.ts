import { describe, it, expect } from 'vitest'
import { stepHistory, NOT_BROWSING } from '../inputHistory'

const history = ['first', 'second']

describe('stepHistory', () => {
  it('Up from an empty box recalls the newest message', () => {
    expect(stepHistory(history, NOT_BROWSING, '', -1)).toEqual({
      text: 'second',
      nav: { index: 1, draft: '' },
    })
  })

  it('Up does nothing when there is a draft, so the draft is never replaced', () => {
    expect(stepHistory(history, NOT_BROWSING, 'half a thought', -1)).toBeNull()
  })

  it('Up stops at the oldest message', () => {
    const atOldest = { index: 0, draft: '' }
    expect(stepHistory(history, atOldest, 'first', -1)).toBeNull()
  })

  it('Down moves toward the newest, then returns to the draft', () => {
    const atFirst = { index: 0, draft: 'my draft' }
    const toSecond = stepHistory(history, atFirst, 'first', 1)
    expect(toSecond).toEqual({ text: 'second', nav: { index: 1, draft: 'my draft' } })

    const back = stepHistory(history, toSecond!.nav, 'second', 1)
    expect(back).toEqual({ text: 'my draft', nav: NOT_BROWSING })
  })

  it('Down outside browsing does nothing', () => {
    expect(stepHistory(history, NOT_BROWSING, '', 1)).toBeNull()
  })

  it('once the recalled text is edited, the arrows stop moving through history', () => {
    const browsing = { index: 1, draft: '' }
    expect(stepHistory(history, browsing, 'second, changed', -1)).toBeNull()
    expect(stepHistory(history, browsing, 'second, changed', 1)).toBeNull()
  })

  it('with no history, nothing happens', () => {
    expect(stepHistory([], NOT_BROWSING, '', -1)).toBeNull()
  })
})
