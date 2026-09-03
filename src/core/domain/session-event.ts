/**
 * 归一化会话事件（设计 §5.3）。
 *
 * 现有 40+ 种 ACP / harness 专有事件在 runtime 边界收敛为本联合；
 * 新增 harness = 在 runtime 实现里翻译成这些事件，不新增 UI 分支。
 * seq / 重放 / 快照对齐由 runtime 内部处理（§4.1），不暴露在载荷上。
 */
import type { ConversationStatus } from "./conversation"
import type { MessagePart, Turn, TurnUsage } from "./message"
import type { PermissionRequest } from "./permission"
import type { ID, ISOString } from "./project"

/**
 * 会话快照（设计 §4.1 / §5.3）。
 * "先快照后增量（seq 单调）"语义的快照载荷；
 * 亦作为 SessionRuntime.restore 的返回类型（§4.1）。
 */
export interface SessionSnapshot {
  conversationId: ID
  status: ConversationStatus
  turns: Turn[]
  /** 待处理的中途交互请求（权限 / 问询 / 计划审批） */
  pendingPermissions: PermissionRequest[]
  /** 快照已应用到的最新事件序号，供续接增量 */
  lastEventSeq?: number
}

/** 归一化会话事件联合（设计 §5.3） */
export type SessionEvent =
  /** 一轮开始（载荷为已建好的空 Turn，归约器直接入列） */
  | { type: "turn-started"; turn: Turn }
  /** 向指定轮追加一个 part */
  | { type: "part-appended"; turnId: ID; part: MessagePart }
  /** 原地更新指定轮的某个 part（如 tool-call 状态推进） */
  | { type: "part-updated"; turnId: ID; part: MessagePart }
  /** 一轮结束（带完成时间与用量） */
  | {
      type: "turn-completed"
      turnId: ID
      completedAt: ISOString
      usage?: TurnUsage | null
    }
  /** 收到新的中途交互请求 */
  | { type: "permission-requested"; request: PermissionRequest }
  /** 交互请求已被答复（含超时 / 撤回） */
  | { type: "permission-resolved"; requestId: ID }
  /** 会话内状态变化（产品级列表状态走 EventChannel，见 §4.1） */
  | { type: "status-changed"; conversationId: ID; status: ConversationStatus }
  /** 会话错误（fatal 为 true 表示会话不可继续） */
  | { type: "session-error"; message: string; code?: string; fatal?: boolean }
  /** 快照水合：restore / 重放对齐时一次性替换本地状态（§4.1） */
  | { type: "snapshot-hydrated"; snapshot: SessionSnapshot }
