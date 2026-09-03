/**
 * 消息 part 渲染注册表（设计 §6.3）。
 *
 * 扩展动作：新消息类型（画布 / 图表 / …）= 自定义 part
 * （MessagePart 的 custom 分支）+ 在此注册渲染器，不改核心联合。
 * 键为 part 的类型名：内置 type 或 custom part 的 partType。
 * 模块级单例，仅做 Map 存取，不做 React 绑定。
 */
import type { ComponentType } from "react"
import type { MessagePart } from "../domain/message"

/** part 渲染组件的 props（§6.3） */
export interface PartRendererProps {
  part: MessagePart
}

/** part 渲染组件类型 */
export type PartRenderer = ComponentType<PartRendererProps>

const renderers = new Map<string, PartRenderer>()

/** 注册 part 渲染器；同类型重复注册时后者覆盖 */
export function registerPartRenderer(
  partType: string,
  renderer: PartRenderer
): void {
  renderers.set(partType, renderer)
}

/** 按 part 类型取渲染组件；未注册返回 undefined（调用方回退默认渲染） */
export function getPartRenderer(partType: string): PartRenderer | undefined {
  return renderers.get(partType)
}

/** 已注册的全部 part 渲染器（调试 / 设置页枚举用） */
export function listPartRenderers(): Map<string, PartRenderer> {
  return new Map(renderers)
}
