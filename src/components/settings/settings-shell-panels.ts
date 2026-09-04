/**
 * panels 注册表 ⇄ 设置导航 桥（F6 接线 4，设计 §6.4 / §9-3）。
 *
 * 现有 12 个设置分区在这里注册进 `core/registry/panels`
 * （placement="settings"），settings-shell.tsx 的侧栏导航改为遍历注册表
 * 投影渲染 —— “设置新分区：注册即出现在 UI”。
 *
 * 设置分区当前是静态导出路由（内容在 `/settings/<id>` 页面），导航按
 * href 跳转、不渲染 component —— 注册条目的 `component` 是占位（保留给
 * 未来单页设置形态）。呈现元数据（i18n 标签键 / lucide 图标 / web 环境
 * 可见性）按 id 查表解析内置分区；扩展分区用默认值（href 派生
 * `/settings/<id>`、标签直出注册表 title、通用图标）。
 *
 * 本模块经 settings-shell.tsx 导入（注册是副作用），保证设置壳渲染时
 * 内置分区都已注册。
 */
import {
  Bot,
  BookOpenText,
  Boxes,
  FileSpreadsheet,
  GitBranch,
  Globe,
  Keyboard,
  Palette,
  PlugZap,
  Server,
  Settings,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react"
import { listPanels, registerPanel } from "@/core/registry"
import type { PanelDefinition } from "@/core/registry"

/** 设置导航的 i18n 标签键（SettingsShell.nav.<key>，值类型为字面量联合
 *  以配合 next-intl 的类型化 t()） */
export type SettingsSectionLabelKey =
  | "general"
  | "appearance"
  | "agents"
  | "model_providers"
  | "mcp"
  | "skills"
  | "skill_packs"
  | "shortcuts"
  | "version_control"
  | "system"
  | "web_service"
  | "logs"

/** 设置分区条目 = 注册表条目 + 导航呈现元数据 */
export interface SettingsSectionDescriptor {
  panel: PanelDefinition
  /** 导航目标（静态导出路由；内置与扩展统一按 id 派生） */
  href: string
  /** 内置分区的 i18n 标签键；扩展分区为 null（标签直出注册表 title） */
  labelKey: SettingsSectionLabelKey | null
  icon: LucideIcon
  /** web 运行环境隐藏（web_service 仅桌面/服务器部署有意义） */
  hideOnWeb: boolean
}

/** icon 标识（注册表条目的 `icon` 字符串）→ lucide 图标资源 */
const SETTINGS_SECTION_ICONS: Record<string, LucideIcon> = {
  palette: Palette,
  "sliders-horizontal": SlidersHorizontal,
  "plug-zap": PlugZap,
  "book-open-text": BookOpenText,
  boxes: Boxes,
  bot: Bot,
  server: Server,
  keyboard: Keyboard,
  "git-branch": GitBranch,
  globe: Globe,
  "file-spreadsheet": FileSpreadsheet,
  settings: Settings,
}

/** 内置分区的导航元数据（按注册表 id 查；同 id 覆盖注册只换面板条目） */
const BUILTIN_SECTION_META: Record<
  string,
  { labelKey: SettingsSectionLabelKey; hideOnWeb?: boolean }
> = {
  appearance: { labelKey: "appearance" },
  general: { labelKey: "general" },
  mcp: { labelKey: "mcp" },
  skills: { labelKey: "skills" },
  "skill-packs": { labelKey: "skill_packs" },
  agents: { labelKey: "agents" },
  "model-providers": { labelKey: "model_providers" },
  shortcuts: { labelKey: "shortcuts" },
  "version-control": { labelKey: "version_control" },
  "web-service": { labelKey: "web_service", hideOnWeb: true },
  logs: { labelKey: "logs" },
  system: { labelKey: "system" },
}

/**
 * 占位组件：设置分区是静态导出路由，内容在 `/settings/<id>` 页面里，
 * 导航按 href 跳转、永不挂载 component。字段保留给未来单页设置形态
 * （届时注册真实分区组件即可）。
 */
function RoutedSettingsSection() {
  return null
}

// 现有 12 个设置分区全部注册化（顺序 = 原导航数组；order 留间隔便于插位）。
// title 是扩展分区式回退文案 —— 内置分区渲染时走 i18n，不读它。
registerPanel({
  id: "appearance",
  title: "Appearance",
  icon: "palette",
  placement: "settings",
  order: 10,
  component: RoutedSettingsSection,
})
registerPanel({
  id: "general",
  title: "General",
  icon: "sliders-horizontal",
  placement: "settings",
  order: 20,
  component: RoutedSettingsSection,
})
registerPanel({
  id: "mcp",
  title: "MCP",
  icon: "plug-zap",
  placement: "settings",
  order: 30,
  component: RoutedSettingsSection,
})
registerPanel({
  id: "skills",
  title: "Skills",
  icon: "book-open-text",
  placement: "settings",
  order: 40,
  component: RoutedSettingsSection,
})
registerPanel({
  id: "skill-packs",
  title: "Skill Packs",
  icon: "boxes",
  placement: "settings",
  order: 50,
  component: RoutedSettingsSection,
})
registerPanel({
  id: "agents",
  title: "Agents",
  icon: "bot",
  placement: "settings",
  order: 60,
  component: RoutedSettingsSection,
})
registerPanel({
  id: "model-providers",
  title: "Model Providers",
  icon: "server",
  placement: "settings",
  order: 70,
  component: RoutedSettingsSection,
})
registerPanel({
  id: "shortcuts",
  title: "Shortcuts",
  icon: "keyboard",
  placement: "settings",
  order: 80,
  component: RoutedSettingsSection,
})
registerPanel({
  id: "version-control",
  title: "Version Control",
  icon: "git-branch",
  placement: "settings",
  order: 90,
  component: RoutedSettingsSection,
})
registerPanel({
  id: "web-service",
  title: "Web Service",
  icon: "globe",
  placement: "settings",
  order: 100,
  component: RoutedSettingsSection,
})
registerPanel({
  id: "logs",
  title: "Logs",
  icon: "file-spreadsheet",
  placement: "settings",
  order: 110,
  component: RoutedSettingsSection,
})
registerPanel({
  id: "system",
  title: "System",
  icon: "settings",
  placement: "settings",
  order: 120,
  component: RoutedSettingsSection,
})
// G6：AgentBox profiles 设置分区（agentbox 后端模式；内容在
// /settings/agentbox-profiles，分区组件见 features/agentbox）。
// 未进 BUILTIN_SECTION_META —— en/zh 标签同为 "Profiles"，导航直出
// 注册表 title（扩展分区回退路径），不新增 i18n 键。
registerPanel({
  id: "agentbox-profiles",
  title: "Profiles",
  icon: "boxes",
  placement: "settings",
  order: 130,
  component: RoutedSettingsSection,
})

/**
 * 设置导航数据源 = panels 注册表（placement="settings"，按 order 稳定
 * 排序）。每次调用重读注册表 —— 扩展注册（含测试假件）即时生效。
 */
export function listSettingsSections(): SettingsSectionDescriptor[] {
  return listPanels("settings").map((panel) => {
    const builtin = BUILTIN_SECTION_META[panel.id]
    return {
      panel,
      href: `/settings/${panel.id}`,
      labelKey: builtin?.labelKey ?? null,
      icon: SETTINGS_SECTION_ICONS[panel.icon ?? ""] ?? Settings,
      hideOnWeb: builtin?.hideOnWeb ?? false,
    }
  })
}
