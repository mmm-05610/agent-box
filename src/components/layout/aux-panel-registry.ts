/**
 * panels 注册表 ⇄ 右面板标签 桥（F6 接线 4，设计 §6.4 / §9-3）。
 *
 * 现有 4 个 aux 标签在这里注册进 `core/registry/panels`
 * （placement="right-panel"），aux-panel.tsx 的标签头（分段控件 +
 * 收起下拉 + TabsContent）改为遍历注册表投影渲染 —— 为 S2.4 的带标签
 * 右面板（审查 / 浏览器 / 画布类）立骨架。
 *
 * 扩展剧本 3（加右面板标签）：`registerPanel({ id, title, placement:
 * "right-panel", component })` 之后 `listAuxPanelTabs()` 自动出现该条目，
 * 标签头零改动。注册表条目携带 id / title / icon（字符串标识）/ order /
 * component；呈现细节（lucide 图标资源、文件夹作用域、懒挂载、i18n 标签）
 * 是消费端元数据：内置标签按 id 查表，扩展标签用保守默认值（常驻显示、
 * 首次激活懒挂载、标题直出注册表 title）。
 *
 * 本模块经 aux-panel.tsx 导入（注册是副作用），保证任何渲染右面板的
 * 地方内置标签都已注册。
 */
import {
  Folder,
  FolderPen,
  GitCommit,
  PanelRight,
  ReceiptText,
  type LucideIcon,
} from "lucide-react"
import { listPanels, registerPanel } from "@/core/registry"
import type { PanelDefinition } from "@/core/registry"
import { SessionDetailsTab } from "./aux-panel-session-details-tab"
import { FileTreeTab } from "./aux-panel-file-tree-tab"
import { GitChangesTab } from "./aux-panel-git-changes-tab"
import { GitLogTab } from "./aux-panel-git-log-tab"

/** 标签文案来源：内置走 i18n（两个命名空间），扩展直出注册表 title */
export type AuxPanelTabLabel =
  /** Folder.sessionDetails.menuLabel（session details 独立命名空间） */
  | { source: "session-details-menu" }
  /** Folder.auxPanel.tabs.<key>（三个文件夹作用域标签共用） */
  | { source: "folder-tab"; key: "files" | "changes" | "commits" }
  /** 注册表条目的 title（扩展标签，无 i18n 目录可依） */
  | { source: "registry-title" }

/** 右面板标签条目 = 注册表条目 + 消费端呈现元数据 */
export interface AuxPanelTabDescriptor {
  panel: PanelDefinition
  /** lucide 图标（注册表 icon 标识 → 资源映射；未知标识回退通用图标） */
  icon: LucideIcon
  /**
   * 文件夹作用域：仅在打开了文件夹且非 chat 模式时显示
   * （file_tree / changes / git_log）。session_details 与扩展标签常驻 ——
   * 扩展剧本 3 的“注册即出现在 UI”。
   */
  folderScoped: boolean
  /** 首次激活时才挂载内容（重内容懒加载）；session_details 常挂载 */
  lazyMount: boolean
  label: AuxPanelTabLabel
}

/** icon 标识（注册表条目的 `icon` 字符串）→ lucide 图标资源 */
const AUX_TAB_ICONS: Record<string, LucideIcon> = {
  "receipt-text": ReceiptText,
  folder: Folder,
  "folder-pen": FolderPen,
  "git-commit": GitCommit,
}

/** 内置标签的呈现元数据（按注册表 id 查；同 id 覆盖注册只换面板条目，
 *  呈现元数据不变 —— 内置标签的图标/作用域/文案是产品事实） */
const BUILTIN_TAB_META: Record<string, Omit<AuxPanelTabDescriptor, "panel">> = {
  session_details: {
    icon: ReceiptText,
    folderScoped: false,
    lazyMount: false,
    label: { source: "session-details-menu" },
  },
  file_tree: {
    icon: Folder,
    folderScoped: true,
    lazyMount: true,
    label: { source: "folder-tab", key: "files" },
  },
  changes: {
    icon: FolderPen,
    folderScoped: true,
    lazyMount: true,
    label: { source: "folder-tab", key: "changes" },
  },
  git_log: {
    icon: GitCommit,
    folderScoped: true,
    lazyMount: true,
    label: { source: "folder-tab", key: "commits" },
  },
}

// 现有 4 个标签全部注册化（顺序 = 原 TAB_ORDER；order 留间隔便于插位）。
// title 是扩展标签式回退文案 —— 内置标签渲染时走 i18n，不读它。
registerPanel({
  id: "session_details",
  title: "Session Details",
  icon: "receipt-text",
  placement: "right-panel",
  order: 10,
  component: SessionDetailsTab,
})
registerPanel({
  id: "file_tree",
  title: "Files",
  icon: "folder",
  placement: "right-panel",
  order: 20,
  component: FileTreeTab,
})
registerPanel({
  id: "changes",
  title: "Changes",
  icon: "folder-pen",
  placement: "right-panel",
  order: 30,
  component: GitChangesTab,
})
registerPanel({
  id: "git_log",
  title: "Commits",
  icon: "git-commit",
  placement: "right-panel",
  order: 40,
  component: GitLogTab,
})

/**
 * 右面板标签数据源 = panels 注册表（placement="right-panel"，按 order
 * 稳定排序）。每次调用重读注册表 —— 扩展注册（含测试假件）即时生效。
 */
export function listAuxPanelTabs(): AuxPanelTabDescriptor[] {
  return listPanels("right-panel").map((panel) => {
    const builtin = BUILTIN_TAB_META[panel.id]
    if (builtin) {
      return { panel, ...builtin }
    }
    return {
      panel,
      icon: AUX_TAB_ICONS[panel.icon ?? ""] ?? PanelRight,
      folderScoped: false,
      lazyMount: true,
      label: { source: "registry-title" },
    }
  })
}

/**
 * 标签可见性：文件夹作用域标签需要 `showFolderTabs`（打开了文件夹且非
 * chat 模式）；session_details 与扩展标签常驻。
 */
export function isAuxTabVisible(
  tab: AuxPanelTabDescriptor,
  showFolderTabs: boolean
): boolean {
  return !tab.folderScoped || showFolderTabs
}
