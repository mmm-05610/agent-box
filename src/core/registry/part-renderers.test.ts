import { describe, expect, it } from "vitest"

import type { PartRenderer } from "./part-renderers"
import {
  getPartRenderer,
  listPartRenderers,
  registerPartRenderer,
} from "./part-renderers"

const textRenderer: PartRenderer = () => null
const textFallbackRenderer: PartRenderer = () => null
const canvasRenderer: PartRenderer = () => null

describe("part renderer registry", () => {
  it("returns undefined for unregistered part types", () => {
    expect(getPartRenderer("text")).toBeUndefined()
    expect(getPartRenderer("video")).toBeUndefined()
  })

  it("registers a renderer for a built-in part type and retrieves it", () => {
    registerPartRenderer("text", textRenderer)
    expect(getPartRenderer("text")).toBe(textRenderer)
  })

  it("registers a renderer for a custom part type (custom.partType)", () => {
    registerPartRenderer("canvas", canvasRenderer)
    expect(getPartRenderer("canvas")).toBe(canvasRenderer)
  })

  it("lets a later registration with the same part type override the earlier one", () => {
    registerPartRenderer("text", textFallbackRenderer)
    expect(getPartRenderer("text")).toBe(textFallbackRenderer)
    expect(getPartRenderer("text")).not.toBe(textRenderer)
    expect(listPartRenderers().get("text")).toBe(textFallbackRenderer)
    expect(listPartRenderers().size).toBe(2)
  })

  it("lists a detached snapshot copy of the registry", () => {
    const snapshot = listPartRenderers()
    snapshot.set("chart", () => null)
    snapshot.delete("canvas")
    expect(getPartRenderer("canvas")).toBe(canvasRenderer)
    expect(getPartRenderer("chart")).toBeUndefined()
  })

  it("lists all registered renderers keyed by part type", () => {
    const listed = listPartRenderers()
    expect([...listed.keys()].sort()).toEqual(["canvas", "text"])
    expect(listed.get("canvas")).toBe(canvasRenderer)
  })
})
