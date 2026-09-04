"use client"

/**
 * useAgentBoxEnabled —— 读 backendSelector 的启用态（G6 门面的 React 面）。
 *
 * useSyncExternalStore 三件套：
 * - subscribe：跨文档的原生 storage 事件（仅其他 window 触发）+ 同文档的
 *   notifyAgentBoxConfigChanged() 广播
 * - getSnapshot：isAgentBoxEnabled()（布尔原语，天然快照稳定）
 * - getServerSnapshot：恒 false（SSR/静态导出安全）
 */
import { useSyncExternalStore } from "react"
import {
  AGENTBOX_TOKEN_STORAGE_KEY,
  AGENTBOX_URL_STORAGE_KEY,
  BACKEND_STORAGE_KEY,
} from "@/core/ports/backendSelector"
import { isAgentBoxEnabled, subscribeAgentBoxConfigChanged } from "./api"

/** 启用态涉及的 localStorage 键（storage 事件按键过滤，避免无关噪声） */
const TRACKED_KEYS: ReadonlySet<string> = new Set<string>([
  BACKEND_STORAGE_KEY,
  AGENTBOX_URL_STORAGE_KEY,
  AGENTBOX_TOKEN_STORAGE_KEY,
])

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  const onStorage = (event: StorageEvent) => {
    // key 为 null = clear() 全清，同样可能改变启用态
    if (event.key === null || TRACKED_KEYS.has(event.key)) callback()
  }
  window.addEventListener("storage", onStorage)
  const unsubscribeConfig = subscribeAgentBoxConfigChanged(callback)
  return () => {
    window.removeEventListener("storage", onStorage)
    unsubscribeConfig()
  }
}

/** agentbox 后端是否处于激活态（backend=agentbox 且 url 已配置） */
export function useAgentBoxEnabled(): boolean {
  return useSyncExternalStore(subscribe, isAgentBoxEnabled, () => false)
}
