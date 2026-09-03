/**
 * features/projects barrel（设计 §3 / §8，F5）。
 *
 * 领域模块 = 项目注册表 + 项目树侧栏。数据面：
 * - `store.ts`     工作区共享状态（wire 缓存 + `projects` 领域切片）
 * - `wire.ts`      folder 命令/FolderDetail 保留处（后端替换日只换此层）
 * - `port.ts`      ProjectsPort 的 CodegRust 实现
 * - `runtime.tsx`  事件接线（原 app-workspace-context 实现体）
 * UI 面：`components/`（项目树行、"+"入口、远程连接向导、侧栏会话列表）。
 */
export {
  useAppWorkspaceStore,
  resetAppWorkspaceStore,
  isConversationDeleted,
} from "./store"
export type { AppWorkspaceStoreState } from "./store"
export { AppWorkspaceProvider, ConversationStatusEventBridge } from "./runtime"
export { useActiveFolder, useActiveProject } from "./active-project"
export { folderDetailToProject, projectWireId } from "./wire"
export {
  createCodegRustProjectsPort,
  REMOTE_PROJECTS_UNSUPPORTED,
} from "./port"
export { ProjectRow, ProjectTreeAddButton } from "./components/project-tree"
export { RemoteConnectionWizard } from "./components/remote-connection-wizard"
