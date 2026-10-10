// The project and chat that were open when the page was last used, so a reload returns to them.
// Projects get new ids on every load, so the project is remembered by its folder path;
// chats are remembered by their persisted id.

const KEY = 'pi.lastView'

export type LastView = { projectPath?: string; persistId?: string }

type OpenState = {
  projects: { id: string; path?: string }[]
  activeProjectId: string
  sessions: { id: string; persistId: string | null }[]
  activeId: string
}

export function readLastView(): LastView | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null')
  } catch {
    return null
  }
}

let lastSaved = ''
let restored = false

/** Called once the saved view has been read and applied; saving starts only after this */
export function markViewRestored(): void {
  restored = true
}

export function saveLastView(s: OpenState): void {
  // Loading projects and chats must not overwrite the saved view before it is restored
  if (!restored) return
  const projectPath = s.projects.find((p) => p.id === s.activeProjectId)?.path
  const persistId = s.sessions.find((x) => x.id === s.activeId)?.persistId ?? undefined
  const view = JSON.stringify({ projectPath, persistId })
  if (view === lastSaved) return
  lastSaved = view
  try {
    localStorage.setItem(KEY, view)
  } catch {
    // storage can be unavailable (private windows); restoring is optional
  }
}
