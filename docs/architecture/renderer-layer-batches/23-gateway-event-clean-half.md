# Batch 23 — the clean half of the gateway-event projection leaves `app/`

**Edges paid off: 0.** 账本前后都是 **0**。

## 为什么是这一批

`app/session/hooks/use-message-stream/gateway-event/` 有 **10 个文件 / 2,349 行**。
把十个文件的 import 全查一遍之后，**六个今天就能干净搬走**——它们够着的最高层是
rank 0（`@/lib`、`@/types`、`@/i18n`）或 rank 2（`@/application/theme`，`@/application/session`）。
它们住在 rank 5，唯一的原因是当初顺手写在 hook 旁边。

| 从 `gateway-event/` | 行数 | 它管的事件 |
| --- | --- | --- |
| `index.ts` | 270 | 路由：每条事件算一次上下文，再按顺序问 8 个家族处理器 |
| `types.ts` | 71 | 契约：`GatewayEventDeps`、`GatewayEventContext`、`GatewayEventHandler` |
| `status.ts` | 226 | 忙碌 / 空闲 / 出错 / 等待输入这些状态位 |
| `lifecycle.ts` | 105 | 会话被创建、关闭、回收 |
| `input-requests.ts` | 325 | 权限请求与提问 → 待答队列 |
| `session-control.ts` | 20 | 控制类杂项 |

**6 个文件 / 1,017 行**，全部搬进 `application/session/gateway-event/`，basename 不变。

**不搬的四个，以及为什么**（见 README 的决定 A）：
`session-info.ts` 与 `message-stream.ts` 与 `tools.ts` 各有一个具名障碍（batch 24/25 处理），
`desktop-bridge.ts` 要拆三份（另议）。

## 目的地为什么是 `application/session/gateway-event/`，而不是 `application/harness/`

因为**那正是决定 A 要回答的问题**：事件归一化是核的事，还是会话 hook 的事。

本批搬到 `application/session/gateway-event/`（同领域、下一层），**这个目的地不需要回答那个问题**。
如果决定 A 最后落在"核心"，那是一次 rank 2 → rank 2 的改名，成本极低。
**本批不预先回答 A，派工单也不许顺手把它命名成 `harness/`。**

## 证据

整组一起算的组外闭包。六个文件互相 import（`index.ts` ← 五个家族文件 ← `types.ts`），
按整组算，落到 rank 2 干净：

```
群 6 个文件 → 目标 rank 2
  ✓ 干净：组外没有任何高于目标层的东西
```

**按整组算，不要逐文件算**——逐文件算会把 `index.ts` 的同目录兄弟报成阻塞。
这条方法在这个阶段已经踩过一次（`app/starmap/color.ts`）。

## 要改的引用

搬完之后，留在 `app/` 的四件（`message-stream.ts`、`tools.ts`、`session-info.ts`、
`desktop-bridge.ts`）以及**它们的上层 hook** 要从新路径导入。已知的导入者：

```
app/session/hooks/use-message-stream/index.ts         ← 上层 hook，导入 useGatewayEventHandler
app/session/hooks/use-message-stream/gateway-event/    ← 同目录四件
```

```bash
cd apps/desktop/src
rg -n "gateway-event" --glob '!app/session/hooks/use-message-stream/gateway-event/*'
```

**五种写法都要覆盖**（`from`、`import()`、`require()`、`vi.mock()`、副作用 `import '…'`），
**测试文件也要覆盖**。这个目录的测试不少（`*.test.ts` 与 `gateway-event/` 同层），
它们跟着被测文件走：测这六件的搬进 `application/session/gateway-event/`，测那四件的留下。

## 不做的事

- **不动那四个文件的一行**，包括不要顺手把 `session-info.ts` 的 `../../use-prompt-actions/rewind`
  改掉——那是 batch 25 的事。
- **不改任何处理逻辑。** 这是搬运：`handleSessionInfoEvent` 的每一行都只换 import 路径。
- **不重命名任何函数**（`handleStatusEvent` 等原名不变）。
- **不要把这个目录命名成 `harness/`**（见上）。

## 验证

```bash
cd apps/desktop
npm run typecheck && npm run test:ui
npx vitest run --project ui src/dev/contracts/renderer-layers.test.ts
npm run ledger:layers && npm run test:ui
```

基线：**776 文件 / 7466 个**；守卫 **16/16**；账本 **0**（前后都是 0）。

## 停止条件

- **六个文件里任何一个需要 rank ≥ 3 的东西。** 上面的表是量出来的；真出现 import，
  说明量错了——报告符号，**不许在 `app/` 里加转发 shim**。
- **`index.ts` 的处理器顺序被打乱。** 那个顺序是语义（先到先认领），不是风格。
- **某个测试需要改断言。** 需要改就说明行为跟着搬家了。
- 不要读、改、stage `src/agentbox/`、`src/plugins/agentbox-lab/`、
  `docs/architecture/acp-desktop-phase1-design.md`、`docs/desktop-src-tree.md`。
