"use client"

import { useShallow } from "zustand/react/shallow"
import type { Project } from "@/core/domain"
import type { FolderDetail } from "@/lib/types"
import { useAppWorkspaceStore } from "./store"

/**
 * Active-project view over the projects store（F5，activeFolderId→activeProjectId
 * 改名后的领域读点）。`useShallow` keeps the returned pair stable, so consumers
 * only re-render when the id or the project object itself changes.
 */
export function useActiveProject(): {
  activeProjectId: number | null
  activeProject: Project | null
} {
  return useAppWorkspaceStore(
    useShallow((s) => ({
      activeProjectId: s.activeProjectId,
      activeProject:
        s.activeProjectId == null
          ? null
          : (s.projects.find((p) => p.id === String(s.activeProjectId)) ??
            null),
    }))
  )
}

/**
 * Legacy wire-shaped view（F5 兼容 + wire 豁免）：活动项目的 wire 行（路径/
 * 默认 agent 等 wire 字段在 Project 领域形状上不存在）。`src/contexts/
 * active-folder-context.tsx` 以 re-export 壳保留旧 import 路径；消费点
 * （top-bar / aux-panel / 搜索 / 终端条）不在本切片所有权内，后续切片收口到
 * useActiveProject 后删除。新代码一律读 `useActiveProject`。
 */
export function useActiveFolder(): {
  activeFolderId: number | null
  activeFolder: FolderDetail | null
} {
  return useAppWorkspaceStore(
    useShallow((s) => ({
      activeFolderId: s.activeFolderId,
      activeFolder:
        s.activeFolderId != null
          ? (s.allFolders.find((f) => f.id === s.activeFolderId) ?? null)
          : null,
    }))
  )
}
