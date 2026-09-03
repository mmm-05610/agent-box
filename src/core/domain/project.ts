/**
 * 项目领域类型（设计 §5.1）。
 *
 * Project 落实 D-003：项目是工作区的一等实体，来源覆盖
 * local / ssh / wsl / docker 四种主机形态。
 */

/** 领域实体主键别名（设计 §5 全领域共用） */
export type ID = string

/** ISO 8601 时间戳字符串别名（设计 §5 全领域共用） */
export type ISOString = string

/**
 * 远程主机引用（设计 §5.1）。
 * ssh / wsl / docker 三种远程 origin 共用；local 无需 host。
 */
export interface HostRef {
  /** 主机标识：ssh 的 user@host、wsl 的发行版名、docker 的容器名等 */
  id: string
  /** 可选显示名（缺省时 UI 直接展示 id） */
  label?: string
}

/**
 * 项目来源（设计 §5.1）。
 * local 为本地路径；ssh / wsl / docker 附带 HostRef 与远端路径。
 */
export type ProjectOrigin =
  | { kind: "local"; path: string }
  | { kind: "ssh" | "wsl" | "docker"; host: HostRef; path: string }

/** 项目实体（设计 §5.1） */
export interface Project {
  id: ID
  name: string
  origin: ProjectOrigin
  createdAt: ISOString
  /** 最近活跃会话 id，项目树"继续"入口的数据源 */
  lastActiveSessionId?: ID
}
