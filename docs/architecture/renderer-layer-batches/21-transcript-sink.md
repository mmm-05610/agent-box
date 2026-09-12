# Batch 21 — transcript 投影搬出 UI 层

**Edges paid off: 0.** 账本前后都是 **0**。

## 为什么是这一批

"把会话记录投影成可渲染的东西"这件事，今天**分成两半住在两个 UIView 目录里**：
一半在 `app/chat/`，一半在 `components/assistant-ui/thread/`。两处都是纯函数、都不渲染。

这直接挡着你要做的事：**改会话区的形状时，投影逻辑和渲染件混在同一个目录**，
分不清哪个是数据、哪个是样子。本批就是把数据那一半拿走。

## 移动清单 → `application/transcript/`（basename 不变）

| 从 | 行数 |
| --- | --- |
| `app/chat/transcript-window.ts` | 235 |
| `app/chat/transcript-backfill.ts` | 173 |
| `app/chat/thread-loading.ts` | 53 |
| `components/assistant-ui/thread/timeline-data.ts` | 90 |
| `components/assistant-ui/thread/timestamp.ts` | 69 |
| `components/assistant-ui/thread/content.ts` | 64 |
| `components/assistant-ui/thread/turn-activity.ts` | 61 |
| `components/assistant-ui/thread/types.ts` | 5 |

**8 个文件 / 750 行，跨两个区**（`app/` 与 `components/`）——这是同一件事的两半，不该分两批。

## 目的地为什么是 `application/` 而不是 `lib/`

按整组算，目标 rank 2 干净（组外闭包 20 个模块）：

```
群 8 个文件 → 目标 rank 2
  组外闭包 20 个模块
  ✓ 干净：组外没有任何高于目标层的东西
```

里面多数单个文件其实是 rank 0（可以进 `lib/`），但 `transcript-backfill.ts` 够得着
`store/`，所以整组的合法目的地是 rank 2。**把一件事的投影拆到两个家比少降一层的收益更差**——
整组进 `application/transcript/`。

## 要改的引用

已知的非本组导入者（**不完整，必须自己重算**）：

```
app/chat/session-tile.tsx
app/chat/index.tsx
components/assistant-ui/tool/fallback.tsx
components/assistant-ui/thread/*.tsx      ← 同目录的渲染件，改动最多
```

```bash
cd apps/desktop/src
rg -n "assistant-ui/thread/|transcript-window|transcript-backfill|thread-loading" \
   --glob '!components/assistant-ui/thread/*'
```

**五种写法都要覆盖**（`from`、`import()`、`require()`、`vi.mock()`、副作用 `import '…'`），
**测试文件也要覆盖**。

## 一个必须守住的边界

`components/` **不许 import `app/`**（层序铁律）。本批搬完之后，
`components/assistant-ui/thread/*.tsx` 要改成从 `@/application/transcript/...` 导入——
`components → application` 是**下行，合法**，而它今天是靠"同目录"躲过去的。

**这是本批真正的收益**：把一条"靠同目录躲开的跨层引用"变成一条显式的合法依赖。

## 不做的事

- 不搬 `components/assistant-ui/thread/` 下的 `.tsx`（渲染件全留下）。
- 不搬 `assistant-ui/tool/fallback-model/`（1503 行那个 `index.ts`）——它拖的是
  `components/ui`，另议。
- 不重构投影逻辑，不改行为。`content.ts` 和 `timeline-data.ts` 是纯函数，连注释一起搬。

## 验证

```bash
cd apps/desktop
npm run typecheck && npm run test:ui
npx vitest run --project ui src/dev/contracts/renderer-layers.test.ts
npm run ledger:layers && npm run test:ui
```

基线：**776 文件 / 7466 个**；守卫 **16/16**；账本 **0**（前后都是 0）。

## 停止条件

- **搬走的文件需要 `app/` 里的任何东西。** 闭包说不需要。不许加转发 shim。
- **某个 `.tsx` 需要从 `application/transcript/` 反向要一个只在渲染里成立的类型。**
  那说明那个类型该留在原处或上提到 `types/`——报告，不要就地塞进 `application/`。
- **`components/assistant-ui/thread/types.ts` 被别处的 `.tsx` 当作 props 类型用。**
  它只有 5 行，很可能是渲染件的 props——如果是，**它不该跟着走**，留下来并报告。
- **测试需要改断言。**
- 不要读、改、stage `src/agentbox/`、`src/plugins/agentbox-lab/`、
  `docs/architecture/acp-desktop-phase1-design.md`、`docs/desktop-src-tree.md`。
