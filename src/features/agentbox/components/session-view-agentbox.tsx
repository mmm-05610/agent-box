"use client"

/**
 * AgentBox 会话视图占位（G6 两处消费示例之二）——证明门面端到端可用。
 *
 * agentbox 启用时：经门面 transport 建 AgentBoxSessionRuntime（G5 栈：
 * POST /sessions 建会话 + 订阅每会话 WS 频道），composer 渲染 BindingBar
 * （绑定值经 setTurnOptions 进入下一轮 send），输入框 POST
 * /sessions/{id}/turns；转写不做完整渲染，走 GET transcript 刷新
 * （发送后 + turn-completed 事件 + 手动 Refresh），以简单文本行呈现。
 *
 * 不挂进 features/session 的现有视图（本模块零改动约束）；G7 端到端
 * 接线时作为换绑后的会话呈现层替换点。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, RefreshCw, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  AgentBoxSessionRuntime,
  transcriptToSnapshot,
} from "@/core/ports/backend-agentbox"
import type { SessionSnapshot } from "@/core/ports/session-runtime"
import { getAgentBoxTransport } from "../api"
import { useAgentBoxEnabled } from "../use-agent-box-enabled"
import { BindingBar, type BindingBarState } from "./binding-bar"

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export interface SessionViewAgentBoxProps {
  /** harness 注册 id（如 codex / claude-code） */
  harnessId: string
  /** 工作目录（studio session 的 project_path） */
  cwd: string
  /** 续接的既有 studio session id；缺省新建 */
  resumeConversationId?: string
  className?: string
}

const INITIAL_BINDING: BindingBarState = {
  harnessType: "",
  profileLabel: "",
  modelOverlay: "",
  sandbox: "none",
  continuationHint: "",
}

export function SessionViewAgentBox({
  harnessId,
  cwd,
  resumeConversationId,
  className,
}: SessionViewAgentBoxProps) {
  const enabled = useAgentBoxEnabled()

  const runtimeRef = useRef<AgentBoxSessionRuntime | null>(null)
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [binding, setBinding] = useState<BindingBarState>({
    ...INITIAL_BINDING,
    harnessType: harnessId,
  })
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** 转写刷新：GET transcript → 快照水合（不做增量归并） */
  const refreshTranscript = useCallback(async () => {
    const runtime = runtimeRef.current
    const transport = getAgentBoxTransport()
    const active = runtime?.activeSessionId
    if (!runtime || !transport || !active) return
    try {
      const dto = await transport.get<Record<string, unknown>>(
        `sessions/${active}/transcript`
      )
      const next = transcriptToSnapshot(dto)
      next.conversationId = active
      setSnapshot(next)
      setError(null)
    } catch (err) {
      setError(toMessage(err))
    }
  }, [])

  // 建连：runtime 生命周期 = 本组件生命周期（启用态翻转时重建）
  useEffect(() => {
    if (!enabled) return
    const transport = getAgentBoxTransport()
    if (!transport) return

    const runtime = new AgentBoxSessionRuntime({ transport })
    runtimeRef.current = runtime
    const unsubscribe = runtime.events.subscribe((event) => {
      switch (event.type) {
        case "snapshot-hydrated":
          setSnapshot(event.snapshot)
          break
        case "turn-completed":
          // 202 异步编排：完成事件到账后再刷一次 GET transcript
          void refreshTranscript()
          break
        case "session-error":
          setError(event.message)
          break
        default:
          break
      }
    })

    void (async () => {
      try {
        if (resumeConversationId) {
          await runtime.restore(resumeConversationId)
        } else {
          await runtime.connect({ harnessId, cwd })
        }
        setSessionId(runtime.activeSessionId)
        await refreshTranscript()
      } catch (err) {
        setError(toMessage(err))
      }
    })()

    return () => {
      unsubscribe()
      runtimeRef.current = null
      void runtime.disconnect()
    }
  }, [enabled, harnessId, cwd, resumeConversationId, refreshTranscript])

  const send = useCallback(async () => {
    const runtime = runtimeRef.current
    const text = input.trim()
    if (!runtime || !text) return
    // 绑定条 → 每轮绑定参数（下一轮 send 生效）
    runtime.setTurnOptions({
      profileRef: binding.profileLabel || undefined,
      modelOverlay: binding.modelOverlay
        ? { model: binding.modelOverlay }
        : undefined,
      handoffFrom: binding.continuationHint || undefined,
    })
    setSending(true)
    setError(null)
    try {
      await runtime.send({ text })
      setInput("")
      // 轮次是 202 异步编排：先刷一次，完成事件到账后再刷
      await refreshTranscript()
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setSending(false)
    }
  }, [input, binding, refreshTranscript])

  if (!enabled) {
    return (
      <div
        className={
          className ??
          "flex h-full items-center justify-center p-6 text-xs text-muted-foreground"
        }
      >
        AgentBox backend is not enabled — set studio:backend=agentbox and
        studio:agentboxUrl/Token in localStorage.
      </div>
    )
  }

  return (
    <div className={className ?? "flex h-full min-h-0 flex-col gap-2 p-3"}>
      <BindingBar
        value={binding}
        onChange={setBinding}
        sandboxOptions={["none", "bwrap"]}
      />

      <div className="flex items-center gap-2 text-2xs text-muted-foreground">
        <span>
          session: {sessionId ?? "connecting…"}
          {snapshot ? ` · ${snapshot.status}` : ""}
        </span>
        {sending && (
          <Loader2 className="h-3 w-3 animate-spin" aria-label="sending" />
        )}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-6 px-2 text-2xs"
          onClick={() => void refreshTranscript()}
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </Button>
      </div>

      {error && <p className="text-2xs text-red-400">{error}</p>}

      {/* 转写占位：每轮一行 user/assistant 文本（完整渲染归 G7） */}
      <ScrollArea className="min-h-0 flex-1 rounded-md border">
        <div className="space-y-2 p-3 text-xs">
          {!snapshot || snapshot.turns.length === 0 ? (
            <p className="text-muted-foreground">No turns yet.</p>
          ) : (
            snapshot.turns.map((turn) => (
              <div key={turn.id} className="space-y-0.5">
                <div className="text-2xs font-medium text-muted-foreground">
                  {turn.role}
                </div>
                {turn.parts.map((part, index) =>
                  part.type === "text" ? (
                    <p key={index} className="whitespace-pre-wrap">
                      {part.text}
                    </p>
                  ) : null
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* 输入框：POST /sessions/{id}/turns */}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Send a turn…"
          aria-label="Turn input"
          disabled={sending}
          className="h-8 text-xs"
        />
        <Button type="submit" size="sm" disabled={sending || !input.trim()}>
          <Send className="h-3.5 w-3.5" />
          Send
        </Button>
      </form>
    </div>
  )
}
