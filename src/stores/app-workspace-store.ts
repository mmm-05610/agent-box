/**
 * F5 迁移壳（设计 §8）：`app-workspace-store` 已迁入
 * `@/features/projects/store`（folder→project 领域改型）。本文件仅为保留
 * 海量既有 import 路径而存在——本切片（F5）所有权之外的消费点不改 import；
 * 后续切片把读点收口到 features/projects 后删除。
 */
export {
  useAppWorkspaceStore,
  resetAppWorkspaceStore,
  isConversationDeleted,
} from "@/features/projects/store"
export type { AppWorkspaceStoreState } from "@/features/projects/store"
