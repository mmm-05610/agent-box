/**
 * CodegRustProjectsPort —— ProjectsPort 的 CodegRust 后端实现（F5，设计 §4.2）。
 *
 * 把领域接口（core/ports/projects.ts）映射到现有命令面与事件通道：
 * - list/create/update/remove → wire 层的 folder 命令族（open_folder /
 *   remove_folder_from_workspace / update_folder_alias / list_open_folder_details）；
 * - changes → 全局 `folder://changed` 广播（upsert/deleted 翻译为
 *   ProjectChange 的 created/updated/removed）。
 *
 * 与 CodegRustSessionRuntime（features/session/runtime.ts）同构：纯 TS 类，
 * 单测用 mock wire。后端替换日整文件与 wire.ts 一起换掉。
 */
import type {
  CreateProjectInput,
  ProjectChange,
  ProjectsPort,
  UpdateProjectInput,
} from "@/core/ports/projects"
import type { Subscribable, UnsubscribeFn } from "@/core/ports/transport"
import type { Project } from "@/core/domain"
import { subscribe } from "@/lib/platform"
import { FOLDER_CHANGED_EVENT, type FolderChange } from "@/lib/types"
import {
  folderDetailToProject,
  listOpenFolderDetails,
  openFolder,
  projectWireId,
  removeFolderFromWorkspace,
  updateFolderAlias,
} from "./wire"

/** 远程项目尚未有后端命令（D-003 Phase 9），向导 UI 也以此为禁用依据。 */
export const REMOTE_PROJECTS_UNSUPPORTED =
  "Remote project origins (ssh/wsl/docker) are not supported by the current backend"

export interface CodegRustProjectsPortOptions {
  /**
   * 注入式 subscribe（默认 @/lib/platform 的全局广播）。测试用 mock 替换，
   * 生产零配置。
   */
  subscribeFolderChanges?: (
    handler: (change: FolderChange) => void
  ) => Promise<() => void>
}

export function createCodegRustProjectsPort(
  options: CodegRustProjectsPortOptions = {}
): ProjectsPort {
  const subscribeChanges =
    options.subscribeFolderChanges ??
    ((handler: (change: FolderChange) => void) =>
      subscribe<FolderChange>(FOLDER_CHANGED_EVENT, handler))

  // 变更事件的 created/updated 判别依据：本 port 见过的项目 id 集合。没有本地
  // 列表就无法区分“新出现”和“已存在”——list() 调用与 upsert 事件都会充实它；
  // 在任何 list() 之前到达的首个 upsert 记为 created（订阅方对两种 kind 的收敛
  // 都是重读列表，语义无损）。
  const knownIds = new Set<string>()

  return {
    async list(): Promise<Project[]> {
      const details = await listOpenFolderDetails()
      const projects = details.map(folderDetailToProject)
      for (const p of projects) knownIds.add(p.id)
      return projects
    },

    async create(input: CreateProjectInput): Promise<Project> {
      if (input.origin.kind !== "local") {
        throw new Error(REMOTE_PROJECTS_UNSUPPORTED)
      }
      const detail = await openFolder(input.origin.path)
      const project = folderDetailToProject(detail)
      // 领域名（用户在向导里输入的）映射到 wire 的 alias 列。
      if (input.name && input.name !== project.name) {
        await updateFolderAlias(detail.id, input.name)
        knownIds.add(project.id)
        return { ...project, name: input.name }
      }
      knownIds.add(project.id)
      return project
    },

    async update(id: string, patch: UpdateProjectInput): Promise<Project> {
      const wireId = projectWireId(id)
      // 领域名 ↔ wire alias。lastActiveSessionId 在 folder 命令面没有对应物
      // （活跃会话由会话域事件推导），静默忽略。
      if (patch.name !== undefined) {
        await updateFolderAlias(wireId, patch.name)
      }
      const details = await listOpenFolderDetails()
      const detail = details.find((f) => f.id === wireId)
      if (!detail) {
        throw new Error(`Project ${id} not found`)
      }
      const project = folderDetailToProject(detail)
      knownIds.add(project.id)
      return project
    },

    async remove(id: string): Promise<void> {
      await removeFolderFromWorkspace(projectWireId(id))
      knownIds.delete(id)
    },

    changes: makeChangesSubscribable(subscribeChanges, knownIds),
  }
}

/** `folder://changed` → ProjectChange 的懒订阅流（首个订阅者建立真实连接）。 */
function makeChangesSubscribable(
  subscribeChanges: (
    handler: (change: FolderChange) => void
  ) => Promise<() => void>,
  knownIds: Set<string>
): Subscribable<ProjectChange> {
  const listeners = new Set<(change: ProjectChange) => void>()
  let wireDispose: (() => void) | null = null
  // 建立纪元：最后一个订阅者离开时 +1，使彼时仍在途的 wire 订阅在 promise
  // 回来时立即自毁；之后的新订阅者会以新纪元重建连接。杜绝“无监听者的悬空
  // 底层连接”与“二次建立泄漏前一条”两个方向的竞态。
  let epoch = 0

  const broadcast = (change: ProjectChange) => {
    for (const listener of listeners) listener(change)
  }

  const handleWireChange = (change: FolderChange) => {
    if (change.kind === "upsert") {
      const id = String(change.folder.id)
      const projectChange: ProjectChange = knownIds.has(id)
        ? { kind: "updated", project: folderDetailToProject(change.folder) }
        : { kind: "created", project: folderDetailToProject(change.folder) }
      knownIds.add(id)
      broadcast(projectChange)
      return
    }
    const id = String(change.id)
    knownIds.delete(id)
    broadcast({ kind: "removed", projectId: id })
  }

  return {
    subscribe(listener: (change: ProjectChange) => void): UnsubscribeFn {
      listeners.add(listener)
      // 首个订阅者拉起 wire 订阅（懒建立；纪元对不上说明已被取代，当场释放）。
      if (!wireDispose) {
        const myEpoch = epoch
        void subscribeChanges(handleWireChange).then((dispose) => {
          if (epoch !== myEpoch || wireDispose !== null) dispose()
          else wireDispose = dispose
        })
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
          epoch += 1
          if (wireDispose) {
            wireDispose()
            wireDispose = null
          }
        }
      }
    },
  }
}
