// Messages sent since this page was opened, oldest first. Kept in memory only,
// so a reload starts with an empty history.
const sent: string[] = []

export function rememberSent(text: string): void {
  if (text.trim()) sent.push(text)
}

export function sentHistory(): readonly string[] {
  return sent
}

/** Where the arrows are while browsing: `index` is the position in history, or null when not browsing */
export type HistoryNav = { index: number | null; draft: string }

export const NOT_BROWSING: HistoryNav = { index: null, draft: '' }

/**
 * One Up (dir -1) or Down (dir +1) press in the input box.
 *
 * Up only starts browsing from an empty box, so a draft is never replaced. Once browsing, the
 * arrows move through history only while the box still shows the recalled message; if the user
 * has edited it, the arrows are left to move the cursor. Down past the newest message returns to
 * the draft that was there before browsing started.
 *
 * Returns null when the press should do nothing here (the caller then lets the key act normally).
 */
export function stepHistory(
  history: readonly string[],
  nav: HistoryNav,
  current: string,
  dir: -1 | 1,
): { text: string; nav: HistoryNav } | null {
  if (history.length === 0) return null

  if (nav.index === null) {
    if (dir === 1 || current !== '') return null
    const index = history.length - 1
    return { text: history[index], nav: { index, draft: current } }
  }

  // Edited since it was recalled: this is now a draft, so the arrows do not touch it
  if (current !== history[nav.index]) return null

  if (dir === -1) {
    if (nav.index === 0) return null
    const index = nav.index - 1
    return { text: history[index], nav: { index, draft: nav.draft } }
  }

  if (nav.index < history.length - 1) {
    const index = nav.index + 1
    return { text: history[index], nav: { index, draft: nav.draft } }
  }
  return { text: nav.draft, nav: NOT_BROWSING }
}
