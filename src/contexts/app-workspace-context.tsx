"use client"

/**
 * F5 迁移壳（设计 §8）：`AppWorkspaceProvider` / `ConversationStatusEventBridge`
 * 的实现体已迁入 `@/features/projects/runtime`。本文件仅保留既有 import 路径
 * （app/workspace/layout.tsx 等本切片所有权之外的消费点不改）；后续切片收口
 * 后删除。
 */
export {
  AppWorkspaceProvider,
  ConversationStatusEventBridge,
} from "@/features/projects/runtime"
