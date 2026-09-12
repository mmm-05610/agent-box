# Batch 19 — terminal 的内部机制搬出 UI 层

**Edges paid off: 0.** 账本前后都是 **0**。

## 为什么是这一批

`app/right-sidebar/terminal/` 有 17 个文件，其中 8 个不含 JSX：ring buffer、选区与剪贴板、
resize 节流、字体度量、终端生命周期表、agent 终端事件流。它们住在 rank 5 只是因为
**同目录还有 7 个 `.tsx`**。

搬完之后 `app/right-sidebar/terminal/` 剩下的都是组件和 hook；`application/terminal/`
是纯粹的终端机制，可以脱离渲染单测。

## 移动清单 → `application/terminal/`（basename 不变）

| 从 `app/right-sidebar/terminal/` | 行数 | 注意 |
| --- | --- | --- |
| `buffer.ts` | 81 | 只依赖 `@xterm/xterm` |
| `active-resize.ts` | 79 | |
| `agent-terminal-stream.ts` | 101 | |
| `clipboard.ts` | 89 | |
| `selection.ts` | 132 | **import react**（见下） |
| `terminal-context-menu.ts` | 37 | |
| `terminal-font.ts` | 139 | 依赖 `nanostores` |
| `terminals.ts` | 399 | 终端生命周期表；被大量 app 文件导入 |

**8 个文件 / 1057 行。**

## 目的地为什么是 `application/` 而不是 `lib/`

因为它们够得着 `store/`。按整组算的组外闭包：

```
群 8 个文件 → 目标 rank 0
  ✗ rank1 store/terminal-takeover.ts
  ✗ rank1 store/session.ts …（共 11 条 store）
群 8 个文件 → 目标 rank 2
  ✓ 干净：组外没有任何高于目标层的东西
```

组外闭包 22 个模块。**目标必须是 rank 2**——发去 `lib/` 会开 `lib → store` 上行边，
账本会涨，那是不允许的。

**`selection.ts` 和 `terminal-font.ts` import react（hooks）**，这不影响判断：
`application/` 现在是允许 React 的（`application/theme` 就是 Provider），
秩规则管的是**层方向**，不是"有没有 React"。但如果某个文件其实是**组件级 hook**
（返回 JSX 或只能在组件内调用），停下来报告——那说明选错了批次。

## 要改的引用

`terminals.ts` 被很多 app 文件导入。已知的导入者（**不完整，必须自己重算**）：

```
styles.css（只是样式注释）
app/session/hooks/use-message-stream/gateway-event/desktop-bridge.ts
app/session/hooks/use-hermes-config.ts
app/context-menu/app-context-menu.tsx · app/context-menu/store.ts
app/hooks/use-keybinds.ts
app/contrib/wiring.tsx · app/contrib/surfaces.tsx
app/settings/terminal-font-setting.tsx
app/chat/close-tab.ts · app/chat/perf-probe.tsx
app/chat/composer/status-stack/status-row.tsx
```

```bash
cd apps/desktop/src
rg -n "right-sidebar/terminal/" --glob '!app/right-sidebar/terminal/*'
```

**五种写法都要覆盖**（`from`、`import()`、`require()`、`vi.mock()`、副作用 `import '…'`）；
测试文件也要覆盖——上一轮就是漏了测试的相对引用才红了 typecheck。

## 不做的事

- 不搬 7 个 `.tsx`（`chrome.tsx`、`instance.tsx`、`rail.tsx`、`persistent.tsx`、
  `workspace.tsx` 等）。
- 不搬 `use-*.ts` 那三个 hook（`use-agent-terminal`、`use-terminal-font`、
  `use-terminal-session`）——它们挂着 React 与 xterm 插件装配，等下一轮单独定。
- 不动 `electron/` 里的 PTY（`terminal-ipc.ts`）。那是宿主层，本批只动渲染器。
- 不重构，不改行为。

## 验证

```bash
cd apps/desktop
npm run typecheck && npm run test:ui
npx vitest run --project ui src/dev/contracts/renderer-layers.test.ts
npm run ledger:layers && npm run test:ui
```

基线：**776 文件 / 7466 个**；守卫 **16/16**；账本 **0**（前后都是 0）。
终端测试跟着被测模块走；断言的**行为**不许变，变了就停下来报告。

## 停止条件

- **搬走的文件需要 `app/` 或 `components/` 里的任何东西**（`components/external-link.tsx`
  就是一个可能的陷阱：`links.ts` 用了它，而 `links.ts` **不在本批清单里**——所以
  不要顺手把它加进来；真需要就报告）。不许加转发 shim。
- **`terminals.ts` 的导入者里出现 `components/` 下的文件。** 那会把 `components → application`
  变成合法但意义不同的边；报告，别自己判断。
- **测试需要改断言。**
- 不要读、改、stage `src/agentbox/`、`src/plugins/agentbox-lab/`、
  `docs/architecture/acp-desktop-phase1-design.md`、`docs/desktop-src-tree.md`。
