/**
 * SessionRuntime —— 最重要的一条缝（设计 §4.1）。
 *
 * UI 和 store 只见这个接口：attach 协议、事件去重（event_seq）、
 * 快照/重放决策、waitForReady 时序全部封装在实现里。
 * 当前唯一实现是 CodegRust（features/session/runtime.ts）。
 */
import type {
  ID,
  PermissionAnswer,
  PermissionRequest,
  SessionEvent,
  SessionSnapshot,
} from "../domain"
import type { Subscribable } from "./transport"

/**
 * 会话快照类型从 domain 复用：它是 snapshot-hydrated 事件的载荷
 * （§5.3），也是 restore 的返回类型。在此转发导出便于从 ports 取用。
 */
export type { SessionSnapshot } from "../domain/session-event"

/** 输入附件（设计 §4.1 send 归一化输入的一部分） */
export interface SessionAttachment {
  /** 本地文件路径 */
  path: string
  mimeType?: string
}

/** 归一化输入（设计 §4.1 ComposerInput：文本 / 附件 / 命令） */
export interface ComposerInput {
  text?: string
  attachments?: SessionAttachment[]
  /** 以命令形式发送（如斜杠命令），与 text 互斥 */
  command?: string
}

/** 建连参数（设计 §4.1 SessionSpec：harness + cwd + 续接会话） */
export interface SessionSpec {
  /** harness 注册 id（§6.1） */
  harnessId: string
  /** 工作目录（项目内的路径） */
  cwd: string
  /** 续接的既有会话 id；缺省表示新会话 */
  resumeConversationId?: ID
  /** 附加环境变量 */
  env?: Record<string, string>
}

/**
 * 会话运行时接口（设计 §4.1）。
 * 新 harness = 实现本接口 + 到 §6.1 注册表注册，零 UI 改动。
 */
export interface SessionRuntime {
  /** 建立会话连接（harness + cwd + 续接） */
  connect(spec: SessionSpec): Promise<void>
  /** 断开并释放会话资源（幂等） */
  disconnect(): Promise<void>
  /** 发送一轮输入（文本 / 附件 / 命令，已归一化） */
  send(input: ComposerInput): Promise<void>
  /** 取消当前进行中的轮次 */
  cancel(): Promise<void>
  /** 归一化事件流（§5.3）；seq / 重放 / 快照对齐由实现内部保证 */
  events: Subscribable<SessionEvent>
  /** 当前待处理的中途交互请求（权限 / 问询 / 计划审批） */
  permissions: Subscribable<PermissionRequest[]>
  /** 答复一条交互请求 */
  respondPermission(requestId: ID, answer: PermissionAnswer): Promise<void>
  /** 恢复既有会话：返回"先快照后增量"的起点（§4.1） */
  restore(conversationId: ID): Promise<SessionSnapshot>
}
