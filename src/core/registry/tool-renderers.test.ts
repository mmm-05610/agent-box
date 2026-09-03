import { describe, expect, it } from "vitest"

import type { ToolRenderer } from "./tool-renderers"
import {
  getToolRenderer,
  listToolRenderers,
  registerToolRenderer,
} from "./tool-renderers"

const bashRenderer: ToolRenderer = () => null
const bashFallbackRenderer: ToolRenderer = () => null
const grepRenderer: ToolRenderer = () => null

describe("tool renderer registry", () => {
  it("returns undefined for unregistered tool names", () => {
    expect(getToolRenderer("Bash")).toBeUndefined()
    expect(getToolRenderer("NoSuchTool")).toBeUndefined()
  })

  it("registers a renderer and retrieves it by tool name", () => {
    registerToolRenderer("Bash", bashRenderer)
    expect(getToolRenderer("Bash")).toBe(bashRenderer)
  })

  it("lets a later registration with the same tool name override the earlier one", () => {
    registerToolRenderer("Bash", bashFallbackRenderer)
    expect(getToolRenderer("Bash")).toBe(bashFallbackRenderer)
    expect(getToolRenderer("Bash")).not.toBe(bashRenderer)
    expect(listToolRenderers().get("Bash")).toBe(bashFallbackRenderer)
    expect(listToolRenderers().size).toBe(1)
  })

  it("lists a detached snapshot copy of the registry", () => {
    const snapshot = listToolRenderers()
    // 改副本不影响注册表本体
    snapshot.set("Ghost", grepRenderer)
    snapshot.delete("Bash")
    expect(getToolRenderer("Bash")).toBe(bashFallbackRenderer)
    expect(getToolRenderer("Ghost")).toBeUndefined()
    // 注册表后续新增也不出现在已取得的副本里
    registerToolRenderer("Grep", grepRenderer)
    expect(snapshot.has("Grep")).toBe(false)
    expect(getToolRenderer("Grep")).toBe(grepRenderer)
  })

  it("lists all registered renderers keyed by tool name", () => {
    const listed = listToolRenderers()
    expect([...listed.keys()].sort()).toEqual(["Bash", "Grep"])
    expect(listed.get("Grep")).toBe(grepRenderer)
  })
})
