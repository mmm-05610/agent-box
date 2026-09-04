/**
 * agentbox 门面测试：启用判定、transport/profiles 缓存键控（url+token
 * 变更即重建）、harness 列表端点、配置广播订阅、测试重置。
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  AGENTBOX_TOKEN_STORAGE_KEY,
  AGENTBOX_URL_STORAGE_KEY,
  BACKEND_STORAGE_KEY,
} from "@/core/ports/backendSelector"
import {
  getAgentBoxProfilesApi,
  getAgentBoxTransport,
  isAgentBoxEnabled,
  listAgentBoxHarnesses,
  notifyAgentBoxConfigChanged,
  resetAgentBoxCacheForTests,
  subscribeAgentBoxConfigChanged,
} from "./api"

function enableAgentBox(url = "http://studio.test", token = "t0") {
  localStorage.setItem(BACKEND_STORAGE_KEY, "agentbox")
  localStorage.setItem(AGENTBOX_URL_STORAGE_KEY, url)
  localStorage.setItem(AGENTBOX_TOKEN_STORAGE_KEY, token)
}

afterEach(() => {
  resetAgentBoxCacheForTests()
  localStorage.clear()
})

describe("isAgentBoxEnabled", () => {
  it("is false by default and requires both backend and connection keys", () => {
    expect(isAgentBoxEnabled()).toBe(false)

    localStorage.setItem(BACKEND_STORAGE_KEY, "agentbox")
    expect(isAgentBoxEnabled()).toBe(false)

    localStorage.setItem(AGENTBOX_URL_STORAGE_KEY, "http://studio.test")
    expect(isAgentBoxEnabled()).toBe(true)
  })

  it("stays false for the codeg backend even with a connection", () => {
    enableAgentBox()
    localStorage.setItem(BACKEND_STORAGE_KEY, "codeg")
    expect(isAgentBoxEnabled()).toBe(false)
  })
})

describe("getAgentBoxProfilesApi / getAgentBoxTransport", () => {
  it("returns null while disabled and a stable facade once enabled", () => {
    expect(getAgentBoxProfilesApi()).toBeNull()
    expect(getAgentBoxTransport()).toBeNull()

    enableAgentBox()
    const api = getAgentBoxProfilesApi()
    expect(api).not.toBeNull()
    // 缓存命中：重复取用是同一实例
    expect(getAgentBoxProfilesApi()).toBe(api)
    expect(getAgentBoxTransport()).toBe(getAgentBoxTransport())

    expect(api?.list).toBeTypeOf("function")
    expect(api?.create).toBeTypeOf("function")
    expect(api?.update).toBeTypeOf("function")
    expect(api?.remove).toBeTypeOf("function")
  })

  it("rebuilds the cache when the connection url or token changes", () => {
    enableAgentBox("http://a.test", "t0")
    const first = getAgentBoxProfilesApi()

    enableAgentBox("http://b.test", "t0")
    const second = getAgentBoxProfilesApi()
    expect(second).not.toBe(first)

    enableAgentBox("http://b.test", "t1")
    const third = getAgentBoxProfilesApi()
    expect(third).not.toBe(second)
  })

  it("hits the harnesses endpoint through the cached transport", async () => {
    enableAgentBox()
    expect(getAgentBoxTransport()).not.toBeNull()

    const fetchMock = vi.fn(async () =>
      Response.json(
        { harnesses: [{ harness_type: "codex", display_name: "Codex" }] },
        { status: 200 }
      )
    )
    vi.stubGlobal("fetch", fetchMock)
    try {
      await expect(listAgentBoxHarnesses()).resolves.toEqual([
        { harness_type: "codex", display_name: "Codex" },
      ])
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/harnesses"),
        expect.anything()
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("rejects harness listing while disabled", async () => {
    await expect(listAgentBoxHarnesses()).rejects.toThrow(/not enabled/i)
  })

  it("resetAgentBoxCacheForTests drops the cached facade", () => {
    enableAgentBox()
    const api = getAgentBoxProfilesApi()
    expect(api).not.toBeNull()
    resetAgentBoxCacheForTests()
    expect(getAgentBoxProfilesApi()).not.toBe(api)
  })
})

describe("config change broadcast", () => {
  it("notifies same-document subscribers", () => {
    const listener = vi.fn()
    const unsubscribe = subscribeAgentBoxConfigChanged(listener)

    notifyAgentBoxConfigChanged()
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    notifyAgentBoxConfigChanged()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
