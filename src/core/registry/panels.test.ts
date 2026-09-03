import { describe, expect, it } from "vitest"

import type { PanelDefinition, PanelPlacement } from "./panels"
import { getPanel, listPanels, registerPanel } from "./panels"

function makePanel(
  id: string,
  placement: PanelPlacement,
  order?: number
): PanelDefinition {
  return {
    id,
    title: `Panel ${id}`,
    placement,
    order,
    component: () => null,
  }
}

// 注册表是模块级单例：各用例用互不重叠的 id 前缀，
// 断言时过滤到自己的前缀，保证与执行顺序无关。
describe("panel registry", () => {
  it("returns undefined for unregistered ids", () => {
    expect(getPanel("no-such-panel")).toBeUndefined()
  })

  it("registers a panel and retrieves it by id", () => {
    const panel = makePanel("basic-outline", "right-panel", 10)
    registerPanel(panel)
    expect(getPanel("basic-outline")).toBe(panel)
  })

  it("lets a later registration with the same id override the earlier one", () => {
    const first = makePanel("override-settings", "settings", 1)
    const second = makePanel("override-settings", "right-panel", 2)
    registerPanel(first)
    registerPanel(second)
    expect(getPanel("override-settings")).toBe(second)
    expect(getPanel("override-settings")).not.toBe(first)
    // 覆盖后按新 placement 归位：不再出现在 settings 过滤里
    const settingsIds = listPanels("settings").map((entry) => entry.id)
    expect(settingsIds).not.toContain("override-settings")
    const rightIds = listPanels("right-panel").map((entry) => entry.id)
    expect(rightIds).toContain("override-settings")
  })

  it("filters listed panels by placement", () => {
    registerPanel(makePanel("docs-outline", "right-panel", 10))
    registerPanel(makePanel("docs-general", "settings", 5))
    registerPanel(makePanel("docs-history", "right-panel"))

    const right = listPanels("right-panel")
      .filter((entry) => entry.id.startsWith("docs-"))
      .map((entry) => entry.id)
    expect(right).toEqual(["docs-outline", "docs-history"])

    const settings = listPanels("settings")
      .filter((entry) => entry.id.startsWith("docs-"))
      .map((entry) => entry.id)
    expect(settings).toEqual(["docs-general"])
  })

  it("orders listed panels by ascending order, undefined order last", () => {
    registerPanel(makePanel("sort-late", "right-panel", 10))
    registerPanel(makePanel("sort-early", "right-panel", 1))
    registerPanel(makePanel("sort-unordered", "right-panel"))

    const ordered = listPanels("right-panel")
      .filter((entry) => entry.id.startsWith("sort-"))
      .map((entry) => entry.id)
    expect(ordered).toEqual(["sort-early", "sort-late", "sort-unordered"])
  })

  it("keeps insertion order for panels sharing the same order weight", () => {
    registerPanel(makePanel("stable-second", "settings", 5))
    registerPanel(makePanel("stable-first", "settings", 5))
    registerPanel(makePanel("stable-tail-a", "settings"))
    registerPanel(makePanel("stable-tail-b", "settings"))

    const ordered = listPanels("settings")
      .filter((entry) => entry.id.startsWith("stable-"))
      .map((entry) => entry.id)
    expect(ordered).toEqual([
      "stable-second",
      "stable-first",
      "stable-tail-a",
      "stable-tail-b",
    ])
  })

  it("lists panels of both placements when no filter is given", () => {
    registerPanel(makePanel("all-right", "right-panel", 0))
    registerPanel(makePanel("all-settings", "settings", 0))
    const ids = listPanels().map((entry) => entry.id)
    expect(ids).toContain("all-right")
    expect(ids).toContain("all-settings")
  })
})
