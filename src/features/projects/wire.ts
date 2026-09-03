/**
 * Wire 层（F5，设计 §4.2 / §8）——领域 Project 与后端 folder 命令之间的唯一翻译点。
 *
 * 现有 Rust 后端只有 folder 概念（FolderDetail + folder 命令族），领域模型已改型为
 * Project（core/domain/project.ts，D-003）。本文件把二者接起来：
 * - folder 命令与 FolderDetail 只允许出现在本层（及直接消费 wire 缓存的 store）；
 * - `folderDetailToProject` 是唯一的形状映射；
 * - **后端替换日只换此层**（换成 agent-box-web 的 /api/v1 调用后，store / UI / port
 *   全部零改动）。
 */
import type { Project } from "@/core/domain"
import type { FolderDetail } from "@/lib/types"

// ── folder 命令族（后端现状，整层保留） ─────────────────────────────────────
// 集中 re-export 而非各处直连 @/lib/api：换后端时只需改这一个 import 来源。
// （updateFolderAlias / updateFolderColor / updateFolderDefaultAgent 也在内——
// 侧栏项目行的改名/着色/默认 agent 菜单与 ProjectsPort.create 都经此取用。）
export {
  applySidebarLayout,
  createFolderGroup,
  deleteFolderGroup,
  getFolder,
  listAllFolderDetails,
  listFolderGroups,
  listOpenFolderDetails,
  openFolder,
  openFolderById,
  openWorktreeFolder,
  removeFolderFromWorkspace,
  setFolderGroup,
  updateFolderAlias,
  updateFolderColor,
  updateFolderDefaultAgent,
  updateFolderGroup,
} from "@/lib/api"

/** 项目 id 在领域层是字符串（core/domain 的 ID 别名）；wire 层是 DB 数字主键。 */
export function projectWireId(projectId: string): number {
  return Number(projectId)
}

/**
 * FolderDetail → Project（设计 §5.1）。
 *
 * - id：数字主键转字符串（领域 ID 约定），`projectWireId` 负责往返；
 * - name：用户设置过 alias 时以 alias 为准（alias 就是 Codeg 时代的“项目名”）；
 * - origin：当前后端只有本地目录一种来源，远程（ssh/wsl/docker）等后端支持后
 *   在此分支补齐 HostRef 映射；
 * - createdAt：wire 行没有创建时间列，以 last_opened_at 近似（排序展示够用）；
 * - lastActiveSessionId：wire 行不携带，由会话域聚合推导（见 store 的派生切片），
 *   此处留空。
 */
export function folderDetailToProject(detail: FolderDetail): Project {
  return {
    id: String(detail.id),
    name: detail.alias ?? detail.name,
    origin: { kind: "local", path: detail.path },
    createdAt: detail.last_opened_at,
  }
}
