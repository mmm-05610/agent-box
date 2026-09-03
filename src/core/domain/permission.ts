/**
 * 中途交互请求领域类型（设计 §4.1、§5）。
 *
 * 覆盖三类阻塞式请求：工具权限、问询（ask_user_question）、
 * 计划审批（exit_plan_mode）。统一经 SessionRuntime 的
 * permissions 通道下发、respondPermission 答复。
 */
import type { ID, ISOString } from "./project"

/** 工具权限请求的可选项（允许一次 / 总是允许 / 拒绝等，harness 翻译） */
export interface PermissionOption {
  optionId: string
  name: string
  /** 选项类别（allow / deny / allow-always 等，字符串由实现归一化） */
  kind: string
  /** 选项的原始元数据（如 permission: {version, changes}），按实现透传 */
  meta?: Record<string, unknown> | null
}

/** 工具调用审批请求（§5.3 permission-requested 的载荷之一） */
export interface ToolPermissionRequest {
  type: "tool"
  id: ID
  conversationId: ID
  title: string
  options: PermissionOption[]
  /** 排队在其后的待处理请求数量（UI 角标用） */
  queuedCount?: number
  createdAt: ISOString
}

/** 问询请求的可选项 */
export interface QuestionOption {
  label: string
  description?: string | null
}

/** 单个问询问题；options 为空表示自由文本输入 */
export interface QuestionSpec {
  questionId: string
  question: string
  header?: string
  multiSelect: boolean
  options: QuestionOption[]
  /** 为 true 时答案输入框掩码显示 */
  isSecret?: boolean
}

/** 问询请求（ask_user_question 的归一化） */
export interface QuestionRequest {
  type: "question"
  id: ID
  conversationId: ID
  questions: QuestionSpec[]
  createdAt: ISOString
}

/** 计划审批决策（approve / request_changes / abandon） */
export type PlanApprovalDecision = "approve" | "request_changes" | "abandon"

/** 计划审批请求（exit_plan_mode 的归一化） */
export interface PlanApprovalRequest {
  type: "plan-approval"
  id: ID
  conversationId: ID
  planMarkdown: string
  createdAt: ISOString
}

/**
 * 中途交互请求联合（设计 §4.1）。
 * runtime permissions 通道的元素类型：Subscribable<PermissionRequest[]>。
 */
export type PermissionRequest =
  | ToolPermissionRequest
  | QuestionRequest
  | PlanApprovalRequest

/** 一条问询的作答：选中的选项 label（含自由文本"其他"） */
export interface QuestionAnswerItem {
  questionId: string
  labels: string[]
}

/**
 * 统一作答载荷（设计 §4.1 respondPermission 的 answer 参数）。
 * 按请求类型三选一：工具权限选项 / 问询作答 / 计划审批决策。
 */
export type PermissionAnswer =
  | { kind: "option"; optionId: string }
  | {
      kind: "question"
      answers: QuestionAnswerItem[]
      /** 用户未作答直接关闭卡片时为 true */
      declined?: boolean
    }
  | {
      kind: "plan-approval"
      decision: PlanApprovalDecision
      /** request_changes 时的修订意见 */
      feedback?: string | null
    }
