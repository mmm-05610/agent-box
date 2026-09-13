// Public surface of the project/worktree sidebar, consumed by the sidebar root.
export { EnteredProjectContent } from './entered-content'
export {
  orderProjectsByIds,
  PROJECT_PREVIEW_COUNT,
  projectTreeCwd,
  sortProjectsForOverview,
  useRepoWorktreeMap
} from './model'
// ProjectOverviewRow retired in 36R: the workspace root list
// (workspace-list/workspace-row.tsx) carries the local rows on the shared
// workspace-row skeleton. The back row and the project icon stay here.
export { ProjectBackRow, projectIcon } from './overview-row'
export { ProjectMenu } from './project-menu'
export { SidebarWorkspaceGroup } from './workspace-group'
export { StartWorkButton } from './workspace-header'
export {
  excludeProjectSessions,
  overlayLiveLanes,
  overlayLivePreviews,
  reconcileEnteredProjectSessions,
  sessionMatchesProjectFilter,
  sessionRecency
} from '@/application/sidebar/workspace-groups'
// The membership core lives in `store/`; the tree-building half stays local.
export {
  liveSessionProjectId,
  type SidebarProjectTree,
  type SidebarSessionGroup,
  type SidebarWorkspaceTree
} from '@/store/projects/membership'
