/**
 * harness（agent 类型）领域类型（设计 §6.1）。
 *
 * HarnessDescriptor 是注册表条目的元数据部分；
 * 连接工厂（connect）在 core/registry/harnesses 的 HarnessDefinition 上。
 */

/** harness 能力开关（设计 §6.1，UI 据此裁剪交互） */
export interface HarnessCapabilities {
  /** 支持续接既有会话（resume） */
  supportsResume: boolean
  /** 支持中途取消当前轮 */
  supportsCancel: boolean
  /** 支持附件输入 */
  supportsAttachments: boolean
  /** 支持计划审批请求（§5 permission.ts） */
  supportsPlanApproval: boolean
  /** 支持问询请求（§5 permission.ts） */
  supportsQuestions: boolean
  /** harness 专有开关，键名由实现自定义 */
  custom?: Record<string, unknown>
}

/** harness 描述符（设计 §6.1 注册条目的元数据部分） */
export interface HarnessDescriptor {
  /** 注册 id，SessionSpec.harnessId 与 Conversation.harnessId 引用它 */
  id: string
  displayName: string
  /** 图标标识（消费方自行映射到具体图标资源） */
  icon?: string
  description?: string
  capabilities: HarnessCapabilities
}
