/**
 * 工具卡渲染分派点（F6 接线 2，设计 §6.2 / §9-2）。
 *
 * `ToolCallPart`（content-parts-renderer）在进入内置特化分派之前先
 * 查 `core/registry/tool-renderers`：注册了就渲染注册组件，未注册
 * 返回 `null` 让调用方落回内置/通用卡（标题 + 状态 + JSON），永不崩。
 *
 * 注册组件的输入契约是 core 领域模型 `ToolCallPart`（§5.2 四态生命
 * 周期 input → running → result / error），与会话侧 AdaptedToolCallPart
 * 的翻译收敛在本文件 —— 注册表组件因此不依赖任何 session 适配层。
 */
import type { ReactNode } from "react"
import type { ToolCallPart as DomainToolCallPart } from "@/core/domain/message"
import type { ToolCallState as DomainToolCallState } from "@/core/domain/message"
import { getToolRenderer } from "@/core/registry"
import type { ToolRendererProps } from "@/core/registry"
import type {
  AdaptedToolCallPart,
  ToolCallState as AdaptedToolCallState,
} from "@/features/session/model/adapters/ai-elements-adapter"
import { normalizeToolName } from "@/lib/tool-call-normalization"

/** Adapted 四态 → core 领域四态（§5.2） */
const TO_DOMAIN_STATE: Record<AdaptedToolCallState, DomainToolCallState> = {
  "input-available": "input",
  "input-streaming": "running",
  "output-available": "result",
  "output-error": "error",
}

/** core 领域四态 → Adapted 四态（注册包装组件把状态喂回既有卡片） */
export function fromDomainToolCallState(
  state: DomainToolCallState
): AdaptedToolCallState {
  switch (state) {
    case "input":
      return "input-available"
    case "running":
      return "input-streaming"
    case "result":
      return "output-available"
    case "error":
      return "output-error"
  }
}

/** 会话侧工具调用 part → core 领域 ToolCallPart（注册渲染组件的 props） */
export function toDomainToolCallPart(
  part: AdaptedToolCallPart
): DomainToolCallPart {
  return {
    type: "tool-call",
    toolName: normalizeToolName(part.toolName),
    state: TO_DOMAIN_STATE[part.state],
    toolCallId: part.toolCallId,
    input: part.input,
    output: part.output ?? undefined,
    error: part.errorText ?? undefined,
  }
}

/**
 * 查表分派：按归一化工具名（小写）取注册渲染器。
 * 返回 `null` 表示未注册（或组件渲染了 null），调用方回退通用卡。
 */
export function dispatchToolRenderer(part: AdaptedToolCallPart): ReactNode {
  const toolName = normalizeToolName(part.toolName).toLowerCase()
  const Renderer = getToolRenderer(toolName)
  if (!Renderer) return null
  const props: ToolRendererProps = { part: toDomainToolCallPart(part) }
  return <Renderer {...props} />
}
