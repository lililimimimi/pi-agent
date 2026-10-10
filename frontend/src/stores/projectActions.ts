import { fetchProjects, createProjectApi, deleteProjectApi } from '@/services/api/projects'
import { addProjectPatch, removeProjectPatch, switchProjectPatch } from '@/stores/sessionPatch'
import { reportError } from '@/lib/appError'
import { makeProject } from '@/stores/chatModel'
import type { ChatGet, ChatSet, ChatState } from '@/stores/chatModel'

export function projectActions(
  set: ChatSet,
  get: ChatGet,
): Pick<
  ChatState,
  'loadPersistedProjects' | 'addProject' | 'renameProject' | 'deleteProject' | 'switchProject'
> {
  return {
    // ── Project actions ────────────────────────────────────────────────────────
    loadPersistedProjects: async () => {
      try {
        const remote = await fetchProjects()
        if (remote.length === 0) return
        // Atomic update, fixes StrictMode double-invoke
        set((state) => {
          const existingIds = new Set(state.projects.map((p) => p.id))
          const newProjects = remote
            .filter((r) => !existingIds.has(r.id))
            .map((r) => ({ id: r.id, name: r.name, path: r.path }))
          if (newProjects.length === 0) return state
          return { projects: [...state.projects, ...newProjects] }
        })
      } catch (e) {
        reportError('Could not load your projects', e)
      }
    },

    addProject: (name, path) => {
      const p = makeProject(name)
      // If path provided, also persist to backend
      if (path) {
        createProjectApi(path, name)
          .then((remote) => {
            // Update project with backend ID
            set((s) => ({
              projects: s.projects.map((proj) =>
                proj.id === p.id ? { ...proj, id: remote.id, path: remote.path } : proj,
              ),
            }))
          })
          .catch((e) => reportError('Could not add the project folder', e))
      }
      set(addProjectPatch(get(), p))
    },

    renameProject: (id, name, path) => {
      set((s) => ({
        projects: s.projects.map((p) => (p.id === id ? { ...p, name, ...(path ? { path } : {}) } : p)),
      }))
    },

    deleteProject: (id, deleteFolder = false) => {
      if (get().projects.length === 1) return // can't delete last

      // Confirmation is shown by the UI (DeleteProjectDialog) before this is called.
      // Sessions are always removed with the project; the folder only when asked.
      // Call backend — pi-native projects go to ignored list, regular projects delete from json
      deleteProjectApi(id, { deleteSessions: true, deleteFolder }).catch((e) =>
        reportError('Could not delete the project', e),
      )

      const patch = removeProjectPatch(get(), id)
      if (patch) set(patch)
    },

    switchProject: (id) => {
      const state = get()
      if (id === state.activeProjectId || state.isStreaming) return
      set(switchProjectPatch(state, id))
      // The project's last chat may be saved but not loaded yet
      get().loadActiveMessages()
    },
  }
}
