/**
 * 面板注册表（设计 §6.4）。
 *
 * 扩展动作：右面板新标签 / 设置新分区 = 注册即出现在 UI。
 * 模块级单例，仅做 Map 存取，不做 React 绑定。
 */
import type { ComponentType } from "react"

/** 面板挂载位置（设计 §6.4：右面板标签 / 设置分区） */
export type PanelPlacement = "right-panel" | "settings"

/** 面板注册条目（§6.4：{ id, title, icon, component }） */
export interface PanelDefinition {
  id: string
  title: string
  /** 图标标识（消费方自行映射到具体图标资源） */
  icon?: string
  placement: PanelPlacement
  component: ComponentType
  /** 排序权重，小者在前；缺省排末尾 */
  order?: number
}

const panels = new Map<string, PanelDefinition>()

/** 注册面板；同 id 重复注册时后者覆盖 */
export function registerPanel(panel: PanelDefinition): void {
  panels.set(panel.id, panel)
}

/** 按 id 取面板；未注册返回 undefined */
export function getPanel(id: string): PanelDefinition | undefined {
  return panels.get(id)
}

/** 全部已注册面板；可按挂载位置过滤，按 order 稳定排序 */
export function listPanels(placement?: PanelPlacement): PanelDefinition[] {
  return [...panels.values()]
    .filter((panel) => placement === undefined || panel.placement === placement)
    .sort(
      (a, b) =>
        (a.order ?? Number.MAX_SAFE_INTEGER) -
        (b.order ?? Number.MAX_SAFE_INTEGER)
    )
}
