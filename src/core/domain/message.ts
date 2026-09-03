/**
 * 消息领域类型（设计 §5.2）。
 *
 * 消息 = 类型化 parts 组合（对齐 Vercel AI SDK v5 的数据形状）；
 * 渲染查 §6.2 / §6.3 注册表，找不到就用通用卡。
 */
import type { ID, ISOString } from "./project"

/** 轮次角色（设计 §5.2） */
export type TurnRole = "user" | "assistant" | "system"

/** 一轮的 token 用量（设计 §5.2，字段按 camelCase 归一化） */
export interface TurnUsage {
  inputTokens: number
  outputTokens: number
}

/** 文件变更种类（设计 §5.2 file-change part 的元素） */
export type FileChangeKind = "created" | "modified" | "deleted"

/** 单个文件变更（轮末产物） */
export interface FileChange {
  path: string
  kind: FileChangeKind
  additions?: number
  deletions?: number
}

/** 工具调用四态生命周期（设计 §5.2：input → running → result / error） */
export type ToolCallState = "input" | "running" | "result" | "error"

/**
 * 工具调用 part（设计 §5.2）。
 * 渲染查 §6.2 注册表，未注册的工具回退通用卡（标题 + 状态 + JSON）。
 */
export interface ToolCallPart {
  type: "tool-call"
  toolName: string
  state: ToolCallState
  /** 实现侧用于把 input 更新与 result 关联到同一次调用的 id */
  toolCallId?: string
  input?: unknown
  output?: unknown
  /** state === "error" 时的错误信息 */
  error?: string
}

/**
 * 消息 part 联合（设计 §5.2）。
 * 扩展新消息类型走 custom part + §6.3 渲染器注册，不改动本联合的语义。
 */
export type MessagePart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string; collapsed: boolean }
  | ToolCallPart
  | { type: "file-change"; files: FileChange[] }
  | { type: "error"; message: string }
  | { type: "custom"; partType: string; data: unknown }

/**
 * 一轮对话（设计 §5.2 / §5.3）。
 * 归约器（features/session/model）把 SessionEvent 归约成 Turn + parts。
 */
export interface Turn {
  id: ID
  role: TurnRole
  parts: MessagePart[]
  startedAt: ISOString
  completedAt?: ISOString | null
  model?: string | null
  usage?: TurnUsage | null
}
