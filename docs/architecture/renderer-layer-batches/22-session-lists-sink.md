# Batch 22 — 会话列表的派生逻辑搬出 `sessions` pane

**Edges paid off: 0.** 账本前后都是 **0**。

## 为什么是这一批

`sessions` pane（`app/chat/sidebar/`）是左栏。它里面有 7 个不含 JSX 的文件，
做的全是**派生**：把会话行编成索引、算搜索视图、算筛选项、算 profile 作用域、
算 fleet rail 的分组。它们住在 rank 5 只是因为左栏的组件住在旁边。

**这一批直接对着"改 UI 形状"那件事**：左栏是五个 pane 里最重的一块
（`projects/workspace-groups.ts` 673 行是整仓最重的单文件，但**不在本批**，见下）。
把派生拿走之后，剩在 `app/chat/sidebar/` 的就是行、栏、列表和它们的样子。

## 移动清单 → `application/session-lists/`（basename 不变）

| 从 `app/chat/sidebar/` | 行数 |
| --- | --- |
| `fleet-rail.ts` | 107 |
| `session-index.ts` | 96 |
| `session-row-gesture.ts` | 51 |
| `session-row-details.ts` | 38 |
| `search-view-model.ts` | 31 |
| `project-filter.ts` | 23 |
| `profile-scope.ts` | 20 |

**7 个文件 / 366 行。**

## 证据

按整组算，目标 rank 2，组外闭包 17 个模块，干净：

```
群 7 个文件 → 目标 rank 2
  组外闭包 17 个模块
  ✓ 干净：组外没有任何高于目标层的东西
```

## 要改的引用

```bash
cd apps/desktop/src
rg -n "chat/sidebar/(fleet-rail|session-index|session-row-gesture|session-row-details|search-view-model|project-filter|profile-scope)"
```

**五种写法都要覆盖**（`from`、`import()`、`require()`、`vi.mock()`、副作用 `import '…'`），
**测试文件也要覆盖**。

注意别被**同名不同路径**骗到：`components/chat/sidebar/` 是另一个目录
（`connection-glyph.tsx`、`row-lead.tsx`、`row-geometry.ts` 在那），
`extension/sdk/index.ts` 从那里导东西。模式写全路径，不要只写 `sidebar/`。

## 不做的事（记下来，免得下次重复讨论）

- **不搬 `projects/workspace-groups.ts`（673 行）。** 它拖 `store/projects/membership` 之外
  还有 app 层的东西，单独一批处理；`membership.ts` 顶部那句注释解释了它当初是怎么拆出来的。
- **不搬 `connection-switcher.tsx`、`session-row.tsx` 这类组件。**
- **`session-row-gesture.ts` 是纯数值计算**（指针位移 → 手势判定），没有 DOM 依赖，
  所以可以下沉。如果实测发现它 `import` 了只在组件里成立的东西，停下来报告。
- 不重构派生逻辑，不改行为。

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
- **`app/shell/hooks/use-statusbar-items.tsx` 或 `store/projects/membership.ts` 编译不过。**
  这两个文件都**只是提到**这些路径（一个是真导入 `connection-switcher`，一个是注释），
  如果它们真的需要改 import，说明我把它们和 `components/chat/sidebar/` 搞混了——报告。
- **某个文件的 `rg` 导入者是空的**（死代码）。报告，不要搬。
- **测试需要改断言。**
- 不要读、改、stage `src/agentbox/`、`src/plugins/agentbox-lab/`、
  `docs/architecture/acp-desktop-phase1-design.md`、`docs/desktop-src-tree.md`。
