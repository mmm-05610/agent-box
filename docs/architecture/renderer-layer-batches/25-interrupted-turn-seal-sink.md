# Batch 25 — the interrupted-turn seal sinks, and `session-info.ts` follows it

**Edges paid off: 0.** 账本前后都是 **0**。

**前置：本批要求 batch [17](17-session-remainder-sink.md) 已经落地。**
不去先做 17，`session-info.ts` 走不掉（它 import 的 `../utils` 那时候还在 app 层）。

## 为什么是这一批

`session-info.ts`（459 行）是 `gateway-event/` 里最后一个卡住的文件，它只有**两个**障碍，
而且两个都能干净解掉：

```
session-info.ts
├── ../utils                                        → batch 17 把那个文件搬到了
│                                                     application/session/message-stream-utils.ts
└── ../../use-prompt-actions/rewind 的
    finalizeInterruptedMessages（rewind.ts:395）      → 本批把它抽出来搬下去
```

## `finalizeInterruptedMessages` 是什么，以及为什么它本来就住错了层

它是**纯函数**：`(messages, streamId?, occurredAt?) => messages`。
做的事：把"被中断的回合"收尾——丢掉那些既没内容也没文本的挂起消息，
把还开着的消息封上 `completedAt`，把 `pending` 置回 false。

```ts
// rewind.ts:395 — 它的全部依赖（量过，只有这些）
import { type ChatMessage, chatMessageText, completeOpenTimelineParts } from '@/lib/chat-messages'
```

**只够得着 rank 0。** 它住在 `use-prompt-actions/rewind.ts` 里，是因为
"/rewind" 这个命令第一个用了它——不是因为它属于 rewind。
它是**会话语义**：一个被中断的回合该怎么收尾，这跟哪个按钮触发无关。

它今天在整个仓库里**只有一个外部消费者**：`session-info.ts:372`。

## 本批做三件事

**一、抽出纯函数，搬进 `application/session/`。**

```
app/session/hooks/use-prompt-actions/rewind.ts 的 finalizeInterruptedMessages
  → application/session/finalize-interrupted-turn.ts
```

把函数体**连同它的文档注释逐字搬过去**（那个注释解释了它为什么存在）。
`rewind.ts` 从新路径 re-export 它——它自己是消费者（`rewind.ts:438` 调用它），
其他任何消费者都不动。

**二、`session-info.ts` 改成从新路径导入。**

```ts
import { finalizeInterruptedMessages } from '@/application/session/finalize-interrupted-turn'
```

**三、`session-info.ts` 搬走。**

```
app/session/hooks/use-message-stream/gateway-event/session-info.ts
  → application/session/gateway-event/session-info.ts
```

`../utils` 那一行改成 `@/application/session/message-stream-utils`（17 的产物）。

**1 个新文件（459 行搬走）+ 1 个纯函数改址。**

## 顺序

```
17  先落地（把 ../utils 那个文件搬下去）
23  再做（或并行——见碰撞检查；23 动的是另外六个文件）
25  最后：抽出纯函数 → 改两处 import → 搬 session-info.ts
```

**一件容易搞错的事**：`finalizeInterruptedMessages` 抽走之后，
`rewind.ts` 的 import 块里 `completeOpenTimelineParts`、`chatMessageText` 可能变成未使用。
**如果它们还有别的调用点，保留；真的只剩这一处，删掉那一行 import**——
但只删确实不再使用的那一行，别顺手清理整个 import 块。

## 不做的事

- **不搬 `rewind.ts` 本身。** 它有 460 行、够着 `@/components/…`，是另一件事。
  只抽这一个纯函数出去。
- **不改 `finalizeInterruptedMessages` 的逻辑一行**，包括 `occurredAt` 的默认值
  （`Date.now() / 1000`，秒，不是毫秒——`rewind.ts` 与 `session-info.ts` 都按秒传）。
- **不搬 `desktop-bridge.ts`**（另议）。
- **不顺手把 `gateway-event/` 改名成 `harness/`**（决定 A 未定）。

## 验证

```bash
cd apps/desktop
npm run typecheck && npm run test:ui
npx vitest run --project ui src/dev/contracts/renderer-layers.test.ts
npm run ledger:layers && npm run test:ui
```

基线：**776 文件 / 7466 个**；守卫 **16/16**；账本 **0**（前后都是 0）。

`rewind` 有自己的测试；它必须**不改断言**地通过——那是"抽走了还在原地能用"的证据。

## 停止条件

- **`finalizeInterruptedMessages` 需要 `rewind.ts` 里的别的东西**（比如它引用的
  模块级状态）。量过说不需要（只有两个 rank-0 函数）。真需要就报告，
  **不许把 `rewind.ts` 的一半一起拖下去**。
- **17 没落地。** 那 `session-info.ts` 的 `../utils` 仍然指回 app 层，
  搬它会开 `application → app` 边。**停下来，先做 17。**
- **`rewind.ts` 的 re-export 让某个消费者变了导入路径。** 它不该变——
  re-export 就是为了不让它们变。
- **测试需要改断言。**
- 不要读、改、stage `src/agentbox/`、`src/plugins/agentbox-lab/`、
  `docs/architecture/acp-desktop-phase1-design.md`、`docs/desktop-src-tree.md`。
