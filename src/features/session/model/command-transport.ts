/**
 * F3 命令直通 transport（设计 §12.2 runtime 的命令面绑定）。
 *
 * 把 CodegRustSessionRuntime 发出的命令映射到 `lib/api` 的同名命令
 * 函数，而不是裸 `transport.call`：api 层的请求整形（如 `acpPrompt`
 * 对上传图片载荷的剥离）因此保留，既有测试对 `@/lib/api` 的 mock 也
 * 继续命中。adopt 模式（runtime.ts `adopt()`）下 runtime 只会发这里
 * 列出的命令；事件订阅入口惰性落到 `lib/platform`，供未来 connect
 * 模式复用。
 */
import {
  acpAnswerPlanApproval,
  acpAnswerQuestion,
  acpCancel,
  acpDisconnect,
  acpPrompt,
  acpRespondPermission,
} from "@/lib/api"
import type { Transport, UnsubscribeFn } from "@/core/ports/transport"
import type { AttachCapableTransport } from "../runtime"

type PromptBlocks = Parameters<typeof acpPrompt>[1]
type QuestionAnswerPayload = Parameters<typeof acpAnswerQuestion>[2]
type PlanApprovalPayload = Parameters<typeof acpAnswerPlanApproval>[2]

export function createCommandTransport(): AttachCapableTransport {
  const transport: Transport = {
    async call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
      const a = args ?? {}
      switch (command) {
        case "acp_prompt":
          await acpPrompt(
            a.connectionId as string,
            a.blocks as PromptBlocks,
            (a.folderId as number | null | undefined) ?? null,
            (a.conversationId as number | null | undefined) ?? null,
            (a.clientMessageId as string | null | undefined) ?? null
          )
          return undefined as T
        case "acp_cancel":
          await acpCancel(a.connectionId as string)
          return undefined as T
        case "acp_respond_permission":
          await acpRespondPermission(
            a.connectionId as string,
            a.requestId as string,
            a.optionId as string
          )
          return undefined as T
        case "acp_answer_question":
          await acpAnswerQuestion(
            a.connectionId as string,
            a.questionId as string,
            a.answer as QuestionAnswerPayload
          )
          return undefined as T
        case "acp_answer_plan_approval":
          await acpAnswerPlanApproval(
            a.connectionId as string,
            a.approvalId as string,
            a.answer as PlanApprovalPayload
          )
          return undefined as T
        case "acp_disconnect":
          await acpDisconnect(a.connectionId as string)
          return undefined as T
        default:
          throw new Error(
            `[command-transport] unsupported command in adopt mode: ${command}`
          )
      }
    },
    async subscribe<T>(
      event: string,
      handler: (payload: T) => void
    ): Promise<UnsubscribeFn> {
      const { subscribe } = await import("@/lib/platform")
      return (await subscribe(event, handler as never)) as UnsubscribeFn
    },
    // adopt 模式不依赖该判定（桌面/远程的连接建立仍在 provider）；
    // 同步 Tauri 全局探测足够诊断用途。
    isDesktop(): boolean {
      return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
    },
  }
  return transport
}
