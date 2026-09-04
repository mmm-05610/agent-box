/**
 * backendSelector 行为测试：localStorage 键读写、缺省回 codeg（null）、
 * 非法值容错、SSR（无 window）安全。
 */
import { afterEach, describe, expect, it } from "vitest"
import {
  AGENTBOX_TOKEN_STORAGE_KEY,
  AGENTBOX_URL_STORAGE_KEY,
  BACKEND_STORAGE_KEY,
  getAgentBoxConnection,
  normalizeBackendId,
  resolveBackend,
  setAgentBoxConnection,
  setActiveBackend,
} from "./backendSelector"

afterEach(() => {
  localStorage.clear()
})

describe("resolveBackend / setActiveBackend", () => {
  it("defaults to null (keep the existing codeg binding) when unset", () => {
    expect(localStorage.getItem(BACKEND_STORAGE_KEY)).toBeNull()
    expect(resolveBackend()).toBeNull()
  })

  it("round-trips both backend ids", () => {
    setActiveBackend("agentbox")
    expect(resolveBackend()).toBe("agentbox")
    expect(localStorage.getItem(BACKEND_STORAGE_KEY)).toBe("agentbox")

    setActiveBackend("codeg")
    expect(resolveBackend()).toBe("codeg")
  })

  it("null clears the key so the codeg default path re-asserts", () => {
    setActiveBackend("agentbox")
    setActiveBackend(null)
    expect(localStorage.getItem(BACKEND_STORAGE_KEY)).toBeNull()
    expect(resolveBackend()).toBeNull()
  })

  it("treats invalid stored values as unset", () => {
    localStorage.setItem(BACKEND_STORAGE_KEY, "codex")
    expect(resolveBackend()).toBeNull()

    localStorage.setItem(BACKEND_STORAGE_KEY, "AGENTBOX")
    expect(resolveBackend()).toBeNull()

    localStorage.setItem(BACKEND_STORAGE_KEY, "")
    expect(resolveBackend()).toBeNull()
  })
})

describe("getAgentBoxConnection / setAgentBoxConnection", () => {
  it("returns null when no url is configured", () => {
    expect(getAgentBoxConnection()).toBeNull()
  })

  it("round-trips url and token, trimming trailing slashes from the url", () => {
    setAgentBoxConnection({ url: "http://localhost:3081/", token: "sekrit" })
    expect(getAgentBoxConnection()).toEqual({
      url: "http://localhost:3081",
      token: "sekrit",
    })
    expect(localStorage.getItem(AGENTBOX_URL_STORAGE_KEY)).toBe(
      "http://localhost:3081"
    )
    expect(localStorage.getItem(AGENTBOX_TOKEN_STORAGE_KEY)).toBe("sekrit")
  })

  it("leaves the token untouched when the update omits it", () => {
    setAgentBoxConnection({ url: "http://x", token: "t1" })
    setAgentBoxConnection({ url: "http://y" })
    expect(getAgentBoxConnection()).toEqual({ url: "http://y", token: "t1" })
  })

  it("null clears individual keys", () => {
    setAgentBoxConnection({ url: "http://x", token: "t1" })
    setAgentBoxConnection({ url: null, token: null })
    expect(getAgentBoxConnection()).toBeNull()
    expect(localStorage.getItem(AGENTBOX_TOKEN_STORAGE_KEY)).toBeNull()
  })
})

describe("normalizeBackendId", () => {
  it("accepts only the exact literal ids", () => {
    expect(normalizeBackendId("codeg")).toBe("codeg")
    expect(normalizeBackendId("agentbox")).toBe("agentbox")
    expect(normalizeBackendId("other")).toBeNull()
    expect(normalizeBackendId(null)).toBeNull()
    expect(normalizeBackendId(undefined)).toBeNull()
  })
})
