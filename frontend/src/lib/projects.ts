import type { Project } from '@/stores/chatStore'

/**
 * Projects found automatically from Pi's session folders (ids start with "pi-native:")
 * are hidden while they have no conversations, so the list shows only real projects.
 */
export function isHiddenAutoProject(
  project: Pick<Project, 'id'>,
  sessionProjectIds: Set<string>,
  activeProjectId: string,
): boolean {
  return (
    project.id.startsWith('pi-native:') &&
    project.id !== activeProjectId &&
    !sessionProjectIds.has(project.id)
  )
}
