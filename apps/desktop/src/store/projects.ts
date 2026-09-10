// Projects state, decomposed (this file stays the stable import path with
// the unchanged public surface):
// - scope         — cached list/tree atoms, persisted scope, new-chat cwd
// - cwd-identity  — project ownership of a cwd; session follow
// - gateway       — projects.* JSON-RPC plumbing
// - refresh       — list/tree/session-slice refresh; move sessions
// - repo-scan     — repo discovery + recording
// - crud          — create/rename/appearance/folder/delete; optimistic writes
// - dialogs       — project management dialog state
// - worktrees     — worktree/git doors and start-work requests

export {
  $activeProjectId,
  $projectScope,
  $projectTree,
  $projectTreeLoading,
  $projects,
  $projectsRpcAvailable,
  ALL_PROJECTS,
  exitProjectScope,
  projectRootCwd,
  resolveNewSessionCwd
} from './projects/scope'
export {
  projectIdForCwd,
  projectNameForCwd
} from './projects/cwd-identity'
export { projectProfile } from './projects/gateway'
export {
  fetchProjectSessions,
  moveSessionToProject,
  refreshProjectTree,
  refreshProjects
} from './projects/refresh'
export {
  $reposScanning,
  repoDiscoveryPolicyFromConfig,
  repoDiscoveryPolicySignature,
  scanAndRecordRepos,
  type RepoDiscoveryPolicy
} from './projects/repo-scan'
export {
  addProjectFolder,
  createProject,
  deleteProject,
  enterProject,
  followActiveSessionCwd,
  generateProjectIdea,
  renameProject,
  setActiveProject,
  updateProject,
  setProjectAppearance,
  type CreateProjectInput
} from './projects/crud'
export {
  $projectDialog,
  clearNewProjectDropPlacement,
  closeProjectDialog,
  openProjectAddFolder,
  openProjectCreate,
  openProjectRename,
  $newProjectDropPlacement,
  $newProjectSessionRequest,
  type NewProjectSessionRequest,
  type ProjectDialogState
} from './projects/dialogs'
export {
  $startWorkSessionRequest,
  $worktreeDialog,
  $worktreeRefreshToken,
  closeWorktreeDialog,
  copyPath,
  goToProject,
  listBaseBranches,
  listRepoBranches,
  openFolderAsProject,
  pickProjectFolder,
  refreshWorktrees,
  removeWorktreePath,
  requestStartWorkSession,
  revealPath,
  startWorkInRepo,
  switchBranchInRepo,
  type StartWorkSessionRequest,
  type WorktreeDialogState
} from './projects/worktrees'
