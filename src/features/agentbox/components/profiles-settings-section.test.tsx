/**
 * Profiles 设置分区测试（mock 门面）：未启用引导、harness 加载与
 * profile 表格、新建（POST）、编辑回填（GET→PUT 带期望修订）、
 * 删除两步确认、非法 JSON 拦截。
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AgentBoxProfilesSettingsSection } from "./profiles-settings-section"

// ─── 门面 mock（组件经 ../api 与 ../use-agent-box-enabled 消费） ───

const mocks = vi.hoisted(() => ({
  enabled: true,
  profiles: {
    list: vi.fn<() => Promise<unknown[]>>(),
    get: vi.fn<() => Promise<unknown>>(),
    create: vi.fn<() => Promise<unknown>>(),
    update: vi.fn<() => Promise<unknown>>(),
    remove: vi.fn<() => Promise<void>>(),
  },
}))

vi.mock("../api", () => ({
  getAgentBoxProfilesApi: () => mocks.profiles,
  listAgentBoxHarnesses: vi.fn(async () => [
    { harness_type: "codex", display_name: "Codex" },
    { harness_type: "claude-code", display_name: "Claude Code" },
  ]),
}))

vi.mock("../use-agent-box-enabled", () => ({
  useAgentBoxEnabled: () => mocks.enabled,
}))

const PROFILE_ROWS = [
  { profile_id: "work", name: "work", revision: 3, digest: "b6f2c0de" },
  { profile_id: "spike", name: "spike", revision: 1, digest: "a1b2d4e5" },
]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.enabled = true
  mocks.profiles.list.mockResolvedValue(PROFILE_ROWS)
  mocks.profiles.get.mockResolvedValue({
    profile_id: "work",
    name: "work",
    revision: 3,
    digest: "b6f2c0de",
    payload: { model: "gpt-5.4-mini", sandbox: "none" },
  })
  mocks.profiles.create.mockResolvedValue({})
  mocks.profiles.update.mockResolvedValue({})
  mocks.profiles.remove.mockResolvedValue(undefined)
})

function renderSection() {
  return render(<AgentBoxProfilesSettingsSection />)
}

/** 等 harness 选中且 profile 表格就绪 */
async function waitForTable() {
  // 行的 id 与 name 同文，直接等表格元素出现
  await screen.findByRole("table")
}

describe("AgentBoxProfilesSettingsSection", () => {
  it("shows localStorage guidance while the backend is disabled", () => {
    mocks.enabled = false
    renderSection()

    expect(screen.getByText("studio:backend = agentbox")).toBeInTheDocument()
    expect(screen.getByText(/studio:agentboxToken = /)).toBeInTheDocument()
    // 未启用不取数
    expect(mocks.profiles.list).not.toHaveBeenCalled()
  })

  it("lists harnesses and the selected harness's profiles (id/revision/digest)", async () => {
    renderSection()

    await waitForTable()
    expect(mocks.profiles.list).toHaveBeenCalledWith("codex")

    const table = screen.getByRole("table")
    expect(table).toHaveTextContent("work")
    expect(table).toHaveTextContent("v3")
    expect(table).toHaveTextContent("b6f2c0de")
    expect(table).toHaveTextContent("spike")
  })

  it("creates a profile from the name + JSON payload form", async () => {
    renderSection()
    await waitForTable()

    fireEvent.click(screen.getByRole("button", { name: /new profile/i }))
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "work" },
    })
    fireEvent.change(screen.getByLabelText(/payload/i), {
      target: { value: '{"model":"gpt-5.5"}' },
    })
    fireEvent.click(screen.getByRole("button", { name: /create profile/i }))

    await waitFor(() => {
      expect(mocks.profiles.create).toHaveBeenCalledWith("codex", {
        name: "work",
        payload: { model: "gpt-5.5" },
      })
    })
    // 成功后关表单并刷新列表
    await waitFor(() => {
      expect(mocks.profiles.list).toHaveBeenCalledTimes(2)
    })
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument()
  })

  it("blocks submission on invalid JSON without calling the API", async () => {
    renderSection()
    await waitForTable()

    fireEvent.click(screen.getByRole("button", { name: /new profile/i }))
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "broken" },
    })
    fireEvent.change(screen.getByLabelText(/payload/i), {
      target: { value: "{not json" },
    })
    fireEvent.click(screen.getByRole("button", { name: /create profile/i }))

    expect(await screen.findByText(/invalid json/i)).toBeInTheDocument()
    expect(mocks.profiles.create).not.toHaveBeenCalled()
  })

  it("edits a profile: GET backfill then PUT with the expected revision", async () => {
    renderSection()
    await waitForTable()

    fireEvent.click(screen.getByRole("button", { name: "Edit work" }))
    // GET 回填当前版本 payload
    await waitFor(() => {
      expect(mocks.profiles.get).toHaveBeenCalledWith("codex", "work", 3)
    })
    const payloadField = screen.getByLabelText(
      /payload/i
    ) as HTMLTextAreaElement
    await waitFor(() => {
      expect(payloadField.value).toContain("gpt-5.4-mini")
    })

    fireEvent.change(payloadField, {
      target: { value: '{"model":"gpt-5.5"}' },
    })
    fireEvent.click(screen.getByRole("button", { name: /save revision/i }))

    await waitFor(() => {
      expect(mocks.profiles.update).toHaveBeenCalledWith(
        "codex",
        "work",
        { model: "gpt-5.5" },
        3
      )
    })
    expect(mocks.profiles.list).toHaveBeenCalledTimes(2)
  })

  it("deletes a profile through the two-step inline confirmation", async () => {
    renderSection()
    await waitForTable()

    fireEvent.click(screen.getByRole("button", { name: "Delete work" }))
    // 第一步只亮出确认按钮，尚未删除
    expect(mocks.profiles.remove).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: /confirm delete/i }))
    await waitFor(() => {
      expect(mocks.profiles.remove).toHaveBeenCalledWith("codex", "work")
    })
    expect(mocks.profiles.list).toHaveBeenCalledTimes(2)
  })
})
