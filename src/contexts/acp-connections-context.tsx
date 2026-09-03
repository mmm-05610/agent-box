"use client"

/**
 * F3 兼容壳：会话连接域已整体迁入 `features/session`
 * （provider + model，设计 §8 / §13-F3）。本文件只保留对外 re-export，
 * 供尚未迁移的消费方（app 布局挂载点、status-bar、task-transcript、
 * chat 组件等）继续编译；新代码请直接 import `@/features/session`。
 */
export {
  SessionRuntimeProvider,
  AcpConnectionsProvider,
  useAcpActions,
  useAcpEvent,
  useConnectionStore,
  useSessionRuntime,
  type AcpActionsValue,
  type ConnectionStoreApi,
  type LiveMessageSink,
} from "@/features/session/provider"
export type {
  ClaudeApiRetryState,
  ConnectionsMap,
  ConnectionState,
  LiveContentBlock,
  LiveMessage,
  PendingPermission,
  PendingQuestion,
  PendingUserMessage,
  ToolCallImage,
  ToolCallInfo,
  ToolCallMeta,
} from "@/features/session/model/connection-types"
export {
  extractQuestionText,
  getCachedSelectors,
} from "@/features/session/model/connections-reducer"
