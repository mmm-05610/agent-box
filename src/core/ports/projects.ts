/**
 * 项目 port（设计 §3 / §4：项目 CRUD + 变更事件）。
 */
import type { ID, Project, ProjectOrigin } from "../domain"
import type { Subscribable } from "./transport"

/** 新建项目入参（设计 §5.1） */
export interface CreateProjectInput {
  name: string
  origin: ProjectOrigin
}

/** 项目更新补丁（仅传需要变更的字段） */
export interface UpdateProjectInput {
  name?: string
  lastActiveSessionId?: ID | null
}

/** 项目变更事件（订阅方据此增量更新本地列表） */
export type ProjectChange =
  | { kind: "created"; project: Project }
  | { kind: "updated"; project: Project }
  | { kind: "removed"; projectId: ID }

/**
 * 项目 port 接口（设计 §4）。
 * UI/store 只依赖本接口；Rust 后端与未来 agent-box-web
 * 各自提供实现（§4.2 后端替换插槽）。
 */
export interface ProjectsPort {
  list(): Promise<Project[]>
  create(input: CreateProjectInput): Promise<Project>
  update(id: ID, patch: UpdateProjectInput): Promise<Project>
  remove(id: ID): Promise<void>
  /** 项目增删改变更流（重连后的重放由实现保证） */
  changes: Subscribable<ProjectChange>
}
