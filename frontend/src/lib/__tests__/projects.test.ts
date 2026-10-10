import { describe, it, expect } from 'vitest'
import { isHiddenAutoProject } from '../projects'

describe('isHiddenAutoProject', () => {
  it('hides an auto-detected project with no conversations', () => {
    expect(isHiddenAutoProject({ id: 'pi-native:/Users/me/x' }, new Set(), 'general')).toBe(true)
  })

  it('keeps an auto-detected project that has conversations', () => {
    expect(
      isHiddenAutoProject({ id: 'pi-native:/Users/me/x' }, new Set(['pi-native:/Users/me/x']), 'general'),
    ).toBe(false)
  })

  it('keeps the active project even when it is empty', () => {
    expect(isHiddenAutoProject({ id: 'pi-native:/Users/me/x' }, new Set(), 'pi-native:/Users/me/x')).toBe(
      false,
    )
  })

  it('never hides projects the user added or General', () => {
    expect(isHiddenAutoProject({ id: '32cd8595-pi-agent' }, new Set(), 'general')).toBe(false)
    expect(isHiddenAutoProject({ id: 'proj-1' }, new Set(), 'general')).toBe(false)
  })
})
