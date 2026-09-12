# Batch 24 — two handlers stop reaching for components, then move

**Edges paid off: 0.** 账本前后都是 **0**。

**这是本目录里第一张不是纯搬运的派工单。** 它要改三行代码——把一个 import 换成一次
回调调用——理由写在下面，且改动是完全确定的：三个具名函数、一个已经存在的回调袋、
一个装配点。执行者不需要做任何判断。

## 为什么是这一批

`gateway-event/` 的十个文件里，`message-stream.ts` 和 `tools.ts` 各有一个障碍，
而**两个障碍是同一件事**：它们绕过自己收到的回调袋，直接去抓了组件。

| 文件 | 行数 | 绕过回调袋抓了什么 | 那是什么 |
| --- | --- | --- | --- |
| `message-stream.ts` | 400 | `burstVibeHearts` （`@/components/chat/vibe-hearts`） | 一个装饰性的爱心爆发 |
| `tools.ts` | 150 | `invalidateSkillSuggestionIndex`（`…/suggestion-providers/skill`） | 让技能建议缓存失效 |
| `tools.ts` | 150 | `reportMcpToolResult`（`…/suggestion-providers/repair`） | MCP 修复流程 |

**这两个文件已经在用回调袋了**（`GatewayEventDeps`：`appendAssistantDelta`、
`upsertToolCall`、`updateSessionState`…）。这三个 import 是绕过袋子直接抓组件——
**不是设计，是顺手。**

## 第一步：把三个调用搬进回调袋

`gateway-event/types.ts` 的 `GatewayEventDeps` 增加三个字段，签名照抄原函数：

```ts
burstVibeHearts: (count?: number) => void
invalidateSkillSuggestionIndex: () => void
reportMcpToolResult: (…原签名…) => void          // 签名从 repair.ts:97 照抄
```

`app/session/hooks/use-message-stream/index.ts` 是**唯一**装配这个袋子的地方
（它已经在那里定义 `appendAssistantDelta`、`upsertToolCall` 并传给 `useGatewayEventHandler`）。
在那个装配点把三个字段填上：两个直接指向组件函数，第三个包一层。
**这是 app 层导入组件，合法**——app 是最高层。

然后两个处理器改成调 `ctx.deps.burstVibeHearts(...)` 等，删掉三个 import。

**行为必须一字不变**：调用的时机、参数、顺序都不动，只是把"直接抓"换成"从袋子里拿"。
`vibe-hearts` 和两个 suggestion provider 的测试必须**不改断言**地通过——那是这一步
没有改变行为的证据。

## 第二步：两个文件搬走

```
app/session/hooks/use-message-stream/gateway-event/message-stream.ts
  → application/session/gateway-event/message-stream.ts
app/session/hooks/use-message-stream/gateway-event/tools.ts
  → application/session/gateway-event/tools.ts
```

**4 + 1 = 两个文件 / 550 行。** 搬完之后它们只够着 `@/lib`、`@/store`、`@/types`
和同目录的兄弟。

## 顺序与碰撞

本批与 batch [23](23-gateway-event-clean-half.md) **共享 `gateway-event/index.ts` 与
`app/session/hooks/use-message-stream/index.ts`**，必须串行（碰撞检查会给出波次）。
先做 23 再做 24 最省事：23 是纯搬运，24 在搬完的树上改。

第一步和第二步**分成两个 commit**：先"改三行 + 装配 + 测试"，再"搬运"。
合并成一个 commit 的话，一旦测试红了就分不清是改坏了还是搬错了。

## 不做的事

- **不把爱心、缓存失效、MCP 修复这三个实现本身下沉。** 它们是界面效果，
  留在 `components/` 是对的；本批移动的只是"谁来调它们"。
- **不改 `GatewayEventDeps` 的现有字段。**
- **不搬 `session-info.ts`**（batch 25）**和 `desktop-bridge.ts`**（另议）。
- **不改这三个被调函数的实现。**

## 验证

```bash
cd apps/desktop
npm run typecheck && npm run test:ui
npx vitest run --project ui src/dev/contracts/renderer-layers.test.ts
npm run ledger:layers && npm run test:ui
# 第一步之后、第二步之前，单独跑这三个的测试：
npx vitest run --project ui src/components/chat src/components/composer/suggestion-providers
```

基线：**776 文件 / 7466 个**；守卫 **16/16**；账本 **0**（前后都是 0）。

## 停止条件

- **`reportMcpToolResult` 的签名带上调用点无法提供的参数。** 照抄签名；如果需要
  改调用点的实参，停下来报告——那说明它不是"绕过袋子"，是真的依赖那里的上下文。
- **出现第四个绕过回调袋的 import。** 报告，不要顺手一起改。
- **`vibe-hearts` 或 suggestion provider 的测试需要改断言。** 那说明行为变了。
- **`GatewayEventDeps` 因此需要变成可选字段。** 不许：袋子是每个事件都要用的，
  三个新字段和现有字段一样，装配点必须全部填上。
- 不要读、改、stage `src/agentbox/`、`src/plugins/agentbox-lab/`、
  `docs/architecture/acp-desktop-phase1-design.md`、`docs/desktop-src-tree.md`。
