/**
 * 注册到 `core/registry/tool-renderers` 的特化工具卡（F6 接线 2）。
 *
 * 从 content-parts-renderer 的内联特化分支迁移而来：组件 + 一行注册
 * （设计 §9-2 扩展剧本“加工具渲染”）。注册组件吃 core 领域
 * `ToolCallPart`（§5.2），在包装层把状态/字段翻译回既有卡片的 props，
 * 渲染外观与迁移前逐像素一致。
 *
 * 本模块经 content-parts-renderer 副作用导入（`import "./registered-tool-cards"`），
 * 保证任何渲染工具卡的地方都已注册。
 */
import { registerToolRenderer } from "@/core/registry"
import type { ToolRendererProps } from "@/core/registry"
import type { ToolCallPart as DomainToolCallPart } from "@/core/domain/message"
import { normalizeToolName } from "@/lib/tool-call-normalization"
import { AskQuestionResultCard } from "./ask-question-result-card"
import { FeedbackCheckResultCard } from "./feedback-check-result-card"
import { PlanModeCard } from "./plan-mode-card"
import { fromDomainToolCallState } from "./tool-renderer-dispatch"

/** core part 的 input/output 是 unknown；既有卡片吃 string | null */
function asText(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

/** codeg-mcp ask_user_question：问询结果只读卡（原内联分支迁移） */
function AskQuestionToolCard({ part }: ToolRendererProps) {
  return (
    <AskQuestionResultCard
      input={asText(part.input)}
      output={asText(part.output)}
      errorText={part.error ?? null}
      state={fromDomainToolCallState(part.state)}
    />
  )
}

/** codeg-mcp check_user_feedback：中途 steering 记录卡（原内联分支迁移） */
function FeedbackCheckToolCard({ part }: ToolRendererProps) {
  return (
    <FeedbackCheckResultCard
      output={asText(part.output)}
      errorText={part.error ?? null}
      state={fromDomainToolCallState(part.state)}
    />
  )
}

/**
 * 计划模式切换工具（EnterPlanMode / ExitPlanMode / switch_mode /
 * codex plan_review）：计划卡（原内联分支迁移，4 个归一化名共用一卡）。
 */
function PlanModeToolCard({ part }: ToolRendererProps) {
  const domain: DomainToolCallPart = part
  return (
    <PlanModeCard
      toolName={normalizeToolName(domain.toolName).toLowerCase()}
      input={asText(part.input)}
      output={asText(part.output)}
      errorText={part.error ?? null}
      state={fromDomainToolCallState(part.state)}
    />
  )
}

registerToolRenderer("question", AskQuestionToolCard)
registerToolRenderer("check_user_feedback", FeedbackCheckToolCard)
registerToolRenderer("enterplanmode", PlanModeToolCard)
registerToolRenderer("exitplanmode", PlanModeToolCard)
registerToolRenderer("switch_mode", PlanModeToolCard)
registerToolRenderer("plan_review", PlanModeToolCard)
