/**
 * 工具调用渲染注册表（设计 §6.2）。
 *
 * 扩展动作：新工具卡 = 一个组件 + 一行注册；
 * 未注册的工具自动回退通用卡（标题 + 状态 + JSON），永不崩。
 * 模块级单例，仅做 Map 存取，不做 React 绑定。
 */
import type { ComponentType } from "react"
import type { ToolCallPart } from "../domain/message"

/** 工具渲染组件的 props（§6.2：Component<{ part: ToolCallPart }>） */
export interface ToolRendererProps {
  part: ToolCallPart
}

/** 工具渲染组件类型 */
export type ToolRenderer = ComponentType<ToolRendererProps>

const renderers = new Map<string, ToolRenderer>()

/** 注册工具渲染组件；同 toolName 重复注册时后者覆盖 */
export function registerToolRenderer(
  toolName: string,
  renderer: ToolRenderer
): void {
  renderers.set(toolName, renderer)
}

/** 按工具名取渲染组件；未注册返回 undefined（调用方回退通用卡） */
export function getToolRenderer(toolName: string): ToolRenderer | undefined {
  return renderers.get(toolName)
}

/** 已注册的全部工具渲染器（调试 / 设置页枚举用） */
export function listToolRenderers(): Map<string, ToolRenderer> {
  return new Map(renderers)
}
