/**
 * BindingBar 测试（story 式渲染：每个用例即一个场景帧）——
 * 受控值呈现、文本段/下拉段的变更回吐、禁用态、选项注入。
 */
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import {
  BindingBar,
  bindingBarFieldLabel,
  type BindingBarState,
} from "./binding-bar"

const BASE: BindingBarState = {
  harnessType: "codex",
  profileLabel: "work(v3)",
  modelOverlay: "gpt-5.4-mini",
  sandbox: "none",
  continuationHint: "codex-abc123",
}

function labelOf(field: keyof BindingBarState): string {
  return bindingBarFieldLabel(field)
}

describe("BindingBar scenes", () => {
  it("scene: a fully bound turn renders every segment", () => {
    render(<BindingBar value={BASE} />)

    expect(screen.getByLabelText(labelOf("harnessType"))).toHaveValue("codex")
    expect(screen.getByLabelText(labelOf("profileLabel"))).toHaveValue(
      "work(v3)"
    )
    expect(screen.getByLabelText(labelOf("modelOverlay"))).toHaveValue(
      "gpt-5.4-mini"
    )
    expect(screen.getByLabelText(labelOf("sandbox"))).toHaveValue("none")
    expect(screen.getByLabelText(labelOf("continuationHint"))).toHaveValue(
      "codex-abc123"
    )
    // 单行 pill 容器
    expect(screen.getByTestId("binding-bar")).toBeInTheDocument()
  })

  it("scene: an unbound turn shows empty fields", () => {
    render(
      <BindingBar
        value={{
          harnessType: "",
          profileLabel: "",
          modelOverlay: "",
          sandbox: "",
          continuationHint: "",
        }}
      />
    )

    for (const field of Object.keys(BASE) as Array<keyof BindingBarState>) {
      expect(screen.getByLabelText(labelOf(field))).toHaveValue("")
    }
  })

  it("reports the full next state when a text segment changes", () => {
    const onChange = vi.fn()
    render(<BindingBar value={BASE} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText(labelOf("modelOverlay")), {
      target: { value: "gpt-5.5" },
    })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({
      ...BASE,
      modelOverlay: "gpt-5.5",
    })
  })

  it("fires the field-level callback alongside onChange", () => {
    const onChange = vi.fn()
    const onFieldChange = vi.fn()
    render(
      <BindingBar
        value={BASE}
        onChange={onChange}
        onFieldChange={onFieldChange}
      />
    )

    fireEvent.change(screen.getByLabelText(labelOf("continuationHint")), {
      target: { value: "" },
    })

    expect(onFieldChange).toHaveBeenCalledWith("continuationHint", "")
    expect(onChange).toHaveBeenCalledWith({ ...BASE, continuationHint: "" })
  })

  it("scene: injected harness/profile options become dropdowns", () => {
    render(
      <BindingBar
        value={BASE}
        harnessOptions={["codex", "claude-code"]}
        profileOptions={["work(v3)", "spike"]}
      />
    )

    expect(screen.getByLabelText(labelOf("harnessType")).tagName).toBe("SELECT")
    expect(screen.getByLabelText(labelOf("profileLabel")).tagName).toBe(
      "SELECT"
    )
    // model/continue 未注入选项：仍是自由文本
    expect(screen.getByLabelText(labelOf("modelOverlay")).tagName).toBe("INPUT")
  })

  it("picks an option from a dropdown and reports the next state", () => {
    const onChange = vi.fn()
    render(
      <BindingBar
        value={BASE}
        onChange={onChange}
        sandboxOptions={["none", "bwrap"]}
      />
    )

    fireEvent.change(screen.getByLabelText(labelOf("sandbox")), {
      target: { value: "bwrap" },
    })

    expect(onChange).toHaveBeenCalledWith({ ...BASE, sandbox: "bwrap" })
  })

  it("keeps a current value visible even when absent from the options", () => {
    render(
      <BindingBar
        value={{ ...BASE, harnessType: "gemini-cli" }}
        harnessOptions={["codex", "claude-code"]}
      />
    )

    const select = screen.getByLabelText(
      labelOf("harnessType")
    ) as HTMLSelectElement
    expect(select).toHaveValue("gemini-cli")
  })

  it("scene: disabled bar renders every segment disabled", () => {
    const onChange = vi.fn()
    render(<BindingBar value={BASE} onChange={onChange} disabled />)

    for (const field of Object.keys(BASE) as Array<keyof BindingBarState>) {
      expect(screen.getByLabelText(labelOf(field))).toBeDisabled()
    }
    expect(onChange).not.toHaveBeenCalled()
  })
})
