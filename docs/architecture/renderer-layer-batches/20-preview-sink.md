# Batch 20 — preview（右栏浏览器）的逻辑搬出 UI 层

**Edges paid off: 0.** 账本前后都是 **0**。

## 为什么是这一批

`app/chat/right-rail/` 是右栏浏览器那一块，24 个文件。其中 10 个不含 JSX：
驱动状态机、导航、脚本执行、控制台状态、提示（nudge）与心理模型（mind）、标注宿主、读取器。
它们住在 rank 5 是因为**同目录还有一堆 `.tsx`**（`preview-pane.tsx` 1392 行、
`preview-file.tsx` 1157 行是这里最大的两个组件）。

搬完之后组件只剩渲染，逻辑落在 `application/preview/`。

## 移动清单 → `application/preview/`（basename 不变）

| 从 `app/chat/right-rail/` | 行数 |
| --- | --- |
| `preview-input.ts` | 57 |
| `preview-nav.ts` | 56 |
| `preview-script-runner.ts` | 39 |
| `preview-drive.ts` | 139 |
| `preview-console-state.ts` | 83 |
| `preview-console-store.ts` | 34 |
| `preview-nudge.ts` | 39 |
| `preview-mind.ts` | 30 |
| `preview-annotate-host.ts` | 127 |
| `preview-reader.ts` | 132 |

**10 个文件 / 736 行。**

## 证据

按整组算，目标 rank 2：

```
群 10 个文件 → 目标 rank 2
  组外闭包 121 个模块 · 外部包: nanostores
  ✓ 干净：组外没有任何高于目标层的东西
```

组外闭包 121 个模块——**这是六批里最大的一次**，所以本批的回归面也最大。
`preview-drive.ts` 的状态机被 `preview-pane.tsx`（1392 行）驱动，
建议先搬它、跑一次测试，再搬其余的，**分成两三个 commit 落地**。

## 要改的引用

已知的非本目录导入者（**不完整，必须自己重算**）：

```
app/tour/run-tour.ts
app/session/hooks/use-message-stream/gateway-event/desktop-bridge.ts
app/contrib/hooks/use-desktop-integrations.ts
app/chat/preview-tile.tsx
```

```bash
cd apps/desktop/src
rg -n "right-rail/preview-" --glob '!app/chat/right-rail/*'
```

**五种写法都要覆盖**（`from`、`import()`、`require()`、`vi.mock()`、副作用 `import '…'`），
**测试文件也要覆盖**。

## 不做的事

- **不搬 `preview-annotate-card.tsx`、`preview-browser-bar.tsx`、`preview-console.tsx`、
  `preview-file.tsx`、`preview-pane.tsx`、`preview.tsx`、`preview-tour.ts`、
  `real-profile-consent-dialog.tsx`** —— 它们都拖 `components/` 或 app 层，
  搬下去会开上行边。
- **不碰 `preview-tour.ts`。** 它同时依赖 `app/tour/engine.ts`，属于 tour 那一域，
  等 tour 批次处理。
- 不重构状态机，不改行为。`preview-drive.ts` 是状态机，搬运时**连注释一起搬**。

## 验证

```bash
cd apps/desktop
npm run typecheck && npm run test:ui
npx vitest run --project ui src/dev/contracts/renderer-layers.test.ts
npm run ledger:layers && npm run test:ui
```

基线：**776 文件 / 7466 个**；守卫 **16/16**；账本 **0**（前后都是 0）。

## 停止条件

- **搬走的文件需要 `app/` 或 `components/` 里的任何东西。** 闭包说不需要。不许加转发 shim。
- **`preview-console.tsx` 因为 `preview-console-state.ts` 搬走而编译不过。**
  那时正确的动作是让 `preview-console.tsx` 改成从 `@/application/preview/preview-console-state`
  导入，**不是**把 `preview-console-state.ts` 留下。
- **某一个文件的 `rg` 导入者是空的**，即它没有任何消费者。那说明它是死代码——
  停下来报告，不要搬一个没人用的东西。
- **测试需要改断言。**
- 不要读、改、stage `src/agentbox/`、`src/plugins/agentbox-lab/`、
  `docs/architecture/acp-desktop-phase1-design.md`、`docs/desktop-src-tree.md`。
