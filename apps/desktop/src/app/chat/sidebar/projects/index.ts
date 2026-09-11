// Public surface of the project/worktree sidebar, consumed by the sidebar root.
export { EnteredProjectContent } from './entered-content'
export {
  orderProjectsByIds,
  PROJECT_PREVIEW_COUNT,
  projectTreeCwd,
  sortProjectsForOverview,
  useRepoWorktreeMap
} from './model'
export { ProjectBackRow, ProjectOverviewRow } from './overview-row'
export { ProjectMenu } from './project-menu'
export { SidebarWorkspaceGroup } from './workspace-group'
export {
  excludeProjectSessions,
  overlayLiveLanes,
  overlayLivePreviews,
  reconcileEnteredProjectSessions,
  sessionMatchesProjectFilter,
  sessionRecency
} from './workspace-groups'
export { StartWorkButton } from './workspace-header'
// The membership core lives in `store/`; the tree-building half stays local.
export {
  liveSessionProjectId,
  type SidebarProjectTree,
  type SidebarSessionGroup,
  type SidebarWorkspaceTree
} from '@/store/projects/membership'
