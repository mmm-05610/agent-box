/**
 * useAgentBoxEnabled 测试：SSR 缺省 false、localStorage 直改 + 同文档
 * 广播即时生效、跨文档 storage 事件（含 clear 的 key=null）生效。
 */
import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  AGENTBOX_URL_STORAGE_KEY,
  BACKEND_STORAGE_KEY,
} from "@/core/ports/backendSelector"
import { notifyAgentBoxConfigChanged } from "./api"
import { useAgentBoxEnabled } from "./use-agent-box-enabled"

afterEach(() => {
  localStorage.clear()
})

describe("useAgentBoxEnabled", () => {
  it("defaults to false on an empty store", () => {
    const { result } = renderHook(() => useAgentBoxEnabled())
    expect(result.current).toBe(false)
  })

  it("follows same-document config writes via the broadcast", () => {
    const { result } = renderHook(() => useAgentBoxEnabled())

    act(() => {
      localStorage.setItem(BACKEND_STORAGE_KEY, "agentbox")
      localStorage.setItem(AGENTBOX_URL_STORAGE_KEY, "http://studio.test")
      notifyAgentBoxConfigChanged()
    })
    expect(result.current).toBe(true)

    act(() => {
      localStorage.removeItem(BACKEND_STORAGE_KEY)
      notifyAgentBoxConfigChanged()
    })
    expect(result.current).toBe(false)
  })

  it("follows cross-window storage events, including clear()", () => {
    const { result } = renderHook(() => useAgentBoxEnabled())
    expect(result.current).toBe(false)

    act(() => {
      localStorage.setItem(BACKEND_STORAGE_KEY, "agentbox")
      localStorage.setItem(AGENTBOX_URL_STORAGE_KEY, "http://studio.test")
      // 模拟另一个 window 的写入：原生 storage 事件（本窗口不自动触发）
      window.dispatchEvent(
        new StorageEvent("storage", { key: BACKEND_STORAGE_KEY })
      )
    })
    expect(result.current).toBe(true)

    act(() => {
      localStorage.clear()
      // clear() 广播的 storage 事件 key 为 null
      window.dispatchEvent(new StorageEvent("storage", { key: null }))
    })
    expect(result.current).toBe(false)
  })
})
