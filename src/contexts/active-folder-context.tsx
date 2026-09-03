"use client"

/**
 * F5 迁移壳：实现体已迁入 `@/features/projects/active-project`。
 * `useActiveFolder` 的 wire 形状（FolderDetail）保留给既有消费点；新代码
 * 读 `useActiveProject`（领域 Project 形状）。
 */
export {
  useActiveFolder,
  useActiveProject,
} from "@/features/projects/active-project"
