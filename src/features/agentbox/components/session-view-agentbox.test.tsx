/**
 * SessionViewAgentBox 冒烟测试：mock 门面 transport（真实
 * AgentBoxSessionRuntime 驱动）——未启用引导、建会话 + GET transcript
 * 首刷、输入框 POST turns、绑定条 → 每轮绑定参数映射。
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SessionViewAgentBox } from "./session-view-agentbox"

const mocks = vi.hoisted(() => {
  const transport = {
    get: vi.fn(async (path: string) => {
      if (path.includes("/transcript")) {
        return {
          session_id: "s1",
          turns: [
            {
              turn_id: "t1",
              input: "hello",
              status: "completed",
              assistant_text: "hi there",
            },
          ],
        }
      }
      return {}
    }),
    post: vi.fn(async (path: string) => {
      if (path === "sessions") {
        return {
          session: {
            id: "s1",
            project_path: "/repo",
            title: "repo (codex)",
          },
        }
      }
      return { turn_id: "t2", state: "queued" }
    }),
    put: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({})),
    call: vi.fn(async () => ({})),
    subscribe: vi.fn(async () => () => {}),
    onReconnect: vi.fn(() => () => {}),
    isDesktop: () => false,
    destroy: vi.fn(),
  }
  return { enabled: true, transport }
})

vi.mock("../api", () => ({
  getAgentBoxTransport: () => (mocks.enabled ? mocks.transport : null),
}))

vi.mock("../use-agent-box-enabled", () => ({
  useAgentBoxEnabled: () => mocks.enabled,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.enabled = true
})

describe("SessionViewAgentBox", () => {
  it("shows guidance while the agentbox backend is disabled", () => {
    mocks.enabled = false
    render(<SessionViewAgentBox harnessId="codex" cwd="/repo" />)

    expect(screen.getByText(/studio:backend=agentbox/i)).toBeInTheDocument()
    expect(mocks.transport.post).not.toHaveBeenCalled()
  })

  it("connects, hydrates the transcript via GET, and posts turns", async () => {
    render(<SessionViewAgentBox harnessId="codex" cwd="/repo" />)

    // 建会话（POST /sessions）+ 首刷转写（GET transcript）
    await waitFor(() => {
      expect(mocks.transport.post).toHaveBeenCalledWith(
        "sessions",
        expect.objectContaining({ project_path: "/repo" })
      )
    })
    expect(await screen.findByText("hi there")).toBeInTheDocument()
    expect(screen.getByText("hello")).toBeInTheDocument()
    expect(screen.getByText(/session: s1/i)).toBeInTheDocument()

    // 发送一轮：POST /sessions/s1/turns
    fireEvent.change(screen.getByLabelText("Turn input"), {
      target: { value: "run the tests" },
    })
    fireEvent.click(screen.getByRole("button", { name: /send/i }))

    await waitFor(() => {
      expect(mocks.transport.post).toHaveBeenCalledWith(
        "sessions/s1/turns",
        expect.objectContaining({
          input_text: "run the tests",
          harness_type: "codex",
        })
      )
    })
  })

  it("maps binding-bar values into per-turn turn options", async () => {
    render(<SessionViewAgentBox harnessId="codex" cwd="/repo" />)
    await screen.findByText("hi there")

    fireEvent.change(screen.getByLabelText("binding-profile"), {
      target: { value: "work" },
    })
    fireEvent.change(screen.getByLabelText("binding-model"), {
      target: { value: "gpt-5.5" },
    })
    fireEvent.change(screen.getByLabelText("binding-sandbox"), {
      target: { value: "bwrap" },
    })
    fireEvent.change(screen.getByLabelText("binding-continue"), {
      target: { value: "codex-abc123" },
    })
    fireEvent.change(screen.getByLabelText("Turn input"), {
      target: { value: "continue the work" },
    })
    fireEvent.click(screen.getByRole("button", { name: /send/i }))

    await waitFor(() => {
      expect(mocks.transport.post).toHaveBeenCalledWith(
        "sessions/s1/turns",
        expect.objectContaining({
          input_text: "continue the work",
          profile_ref: "work",
          model_overlay: { model: "gpt-5.5" },
          handoff_from: "codex-abc123",
        })
      )
    })
  })
})
