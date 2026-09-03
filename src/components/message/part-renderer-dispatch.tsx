/**
 * part 渲染分派点（F6 接线 3，设计 §6.3 / §9-5）。
 *
 * `AdaptedContentPart`（content-parts-renderer）在内置分支全部未命中时
 * （custom / 未知 part 类型）查 `core/registry/part-renderers`：注册了就
 * 渲染注册组件；未注册返回 `null` —— 不渲染，也绝不崩（与内置分支此前
 * 对未知 part 的行为一致）。
 *
 * 注册组件的输入契约是 core 领域模型 `MessagePart` 的 custom 分支
 * （§5.2 `{ type: "custom"; partType; data }`）：查表键落在 `partType`，
 * 会话侧 part 原样挂在 `data` 上。注册表组件因此不依赖任何 session
 * 适配层 —— 与 tool-renderer-dispatch 同一模式。扩展剧本 5（加新消息
 * 类型）= 自定义 part + 渲染器注册，不改 content-parts-renderer。
 */
import type { ReactNode } from "react"
import type { MessagePart } from "@/core/domain/message"
import { getPartRenderer } from "@/core/registry"
import type { PartRendererProps } from "@/core/registry"
import type { AdaptedContentPart } from "@/features/session/model/adapters/ai-elements-adapter"

/**
 * 查表键：自带 `partType` 的 custom part 用 `partType`（领域 custom 分支
 * 的形状），其余（适配层尚未建模的新类型）用 `type` 名兜底。
 */
function partRegistryKey(part: AdaptedContentPart): string {
  const maybeCustom = part as { partType?: unknown }
  if (typeof maybeCustom.partType === "string" && maybeCustom.partType) {
    return maybeCustom.partType
  }
  return part.type
}

/** 会话侧 part → core 领域 custom part（注册渲染组件的 props） */
export function toDomainCustomPart(part: AdaptedContentPart): MessagePart {
  return {
    type: "custom",
    partType: partRegistryKey(part),
    data: part,
  }
}

/**
 * 查表分派：内置分支未命中的 part 查 part-renderers 注册表。
 * 返回 `null` 表示未注册（或组件渲染了 null），调用方不渲染，永不崩。
 */
export function dispatchPartRenderer(part: AdaptedContentPart): ReactNode {
  const Renderer = getPartRenderer(partRegistryKey(part))
  if (!Renderer) return null
  const props: PartRendererProps = { part: toDomainCustomPart(part) }
  return <Renderer {...props} />
}
