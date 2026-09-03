/**
 * 会话领域类型（设计 §3 core/domain、§5）。
 */
import type { ID, ISOString } from "./project"

/**
 * 会话状态（设计 §5）。
 * 会话流内的 status-changed 事件用它；产品级列表状态
 * （conversation_status_changed）走 EventChannel，不混进会话流（§4.1）。
 */
export type ConversationStatus =
  | "in_progress"
  | "pending_review"
  | "completed"
  | "cancelled"

/** 会话实体（设计 §5） */
export interface Conversation {
  id: ID
  /** 所属项目 id；游离会话（import-sessions 等）为 null */
  projectId: ID | null
  /** 所属 harness，即 core/registry/harnesses 的注册 id（§6.1） */
  harnessId: string
  title: string | null
  status: ConversationStatus
  createdAt: ISOString
  lastActiveAt: ISOString | null
  model: string | null
}

/** 会话列表条目（侧栏 / 搜索用的轻量形状，设计 §5） */
export interface ConversationSummary {
  id: ID
  projectId: ID | null
  harnessId: string
  title: string | null
  status: ConversationStatus
  createdAt: ISOString
  lastActiveAt: ISOString | null
  model: string | null
  messageCount: number
}
