# Batch 28 — the `sessions` pane's derivations, including the 673-line one

**Edges paid off: 0.** 账本前后都是 **0**。

## 为什么是这一批

`app/chat/sidebar/projects/workspace-groups.ts` 是**全仓最重的单个逻辑文件（672 行）**，
它一直被当成"难处理"的东西。查过之后：**它不难，它只是大。**

它的阻塞只有两个，都是同目录/同层的兄弟：

```
workspace-groups.ts → ../order            （242 行，纯排序算法）
workspace-groups.ts → 自己的兄弟          （session-project-label.ts 反向依赖它）
```

**整组一起走，组外闭包只有 7 个模块，全部 rank ≤ 2。** 它之所以看起来像结，
是因为逐文件量的时候，同行的兄弟被当成了阻塞。

## 移动清单 → `application/sidebar/`（basename 不变）

| 从 | 到 | 行数 |
| --- | --- | --- |
| `app/chat/sidebar/order.ts` | `application/sidebar/order.ts` | 242 |
| `app/chat/sidebar/projects/workspace-groups.ts` | `application/sidebar/workspace-groups.ts` | 672 |
| `app/chat/sidebar/projects/session-project-label.ts` | `application/sidebar/session-project-label.ts` | 41 |

**3 个文件 / 955 行。**

```
群 3 个文件 → 目标 rank 2
  组外闭包 7 个模块
  ✓ 干净：组外没有任何高于目标层的东西
```

## 目的地：`application/sidebar/`，不是 `application/projects/`

三个文件各自像不同的东西——`order.ts` 是列表排序，`workspace-groups.ts` 是项目/分支泳道分组，
`session-project-label.ts` 是行上的项目名。**但它们服务的是同一件事：左栏显示什么。**

所以目的地是 `application/sidebar/`，**和 batch [22](22-session-lists-sink.md) 同一个目录**
（22 原定的 `application/session-lists/` 一并改名为 `application/sidebar/`——那个名字更窄也更不准，
项目泳道不是"会话列表"）。两张单子都还没执行，改名不欠账。

## 要改的引用

```
order.ts
  app/chat/sidebar/sessions-section.tsx
  app/chat/sidebar/chat-sidebar.tsx
  app/chat/sidebar/gateway-groups.tsx
  app/chat/sidebar/gateway-group-preferences.ts
  app/chat/sidebar/projects/workspace-group.tsx        （写法是 '../order'）

workspace-groups.ts
  app/chat/sidebar/sessions-section.tsx
  app/chat/sidebar/projects/entered-content.tsx
  app/chat/sidebar/projects/index.ts                   （barrel，见下）
  app/chat/sidebar/projects/model.ts
  app/chat/sidebar/projects/workspace-groups.test.ts   （测试跟着被测文件走）

session-project-label.ts
  app/chat/sidebar/session-row.tsx
```

```bash
cd apps/desktop/src
rg -n "sidebar/order'|'\.\./order'|workspace-groups|session-project-label"
```

**五种写法都要覆盖**（`from`、`import()`、`require()`、`vi.mock()`、副作用 `import '…'`），
**测试文件也要覆盖**。

`projects/index.ts` 是 barrel：它 re-export `workspace-groups` 的名字给外面的消费者。
**它留在原地，只改 re-export 的来源路径**——消费者不动。

## 顺手修一处会变成过期的注释

`store/projects/membership.ts:6` 的注释说"Split out of `app/chat/sidebar/projects/workspace-groups.ts`"。
那个路径本批之后就没了。**改路径，不要改那句话的意思**（它记录的是当初为什么拆，
拆这件事仍然发生过）。

## 不做的事

- **不搬 `projects/model.ts`（178 行）。** 它的闭包是干净的，但它是一个带状态的
  React hook（`useStore`/`useEffect`/`useMemo`/`useState`），并且它从 `desktopGit` 取 worktree。
  它属于"hook 里的逻辑该不该搬"那个问题，不属于本批的"纯算法"。让它单独一批。
- **不搬 `projects/` 下的 8 个 `.tsx`。** 它们是界面。
- **不切 `workspace-groups.ts`。** 672 行原样搬走。切口今天看得见（小工具 / 分组 / 叠加），
  但**搬和切是两件事**：搬可验证，切要判断语义。而且今天没有任何人只要其中一段——
  理由和 batch 26/27 一样。
- **不动 `store/projects/membership.ts` 的代码**，只改注释里的路径。
- **不改任何函数体、不改导出名。**

## 验证

```bash
cd apps/desktop
npm run typecheck && npm run test:ui
npx vitest run --project ui src/dev/contracts/renderer-layers.test.ts
npm run ledger:layers && npm run test:ui
```

基线：**776 文件 / 7466 个**；守卫 **16/16**；账本 **0**（前后都是 0）。

`workspace-groups.test.ts` 跟着走，**断言不许改**。它是这个 672 行文件唯一的测试，
也是这次搬运"行为没变"的证据。

## 停止条件

- **`workspace-groups.ts` 需要 `app/` 或 `components/` 里的东西。** 组外闭包 7 个模块说不需要。
  真出现就报告，不许加转发 shim。
- **`projects/index.ts` 的某个消费者需要改 import。** 它不该改——barrel 的 re-export
  就是不让它们改。真改了说明 re-export 漏了名字。
- **`liveSessionProjectId` 的 re-export 出现两个来源。** 它现在由 `workspace-groups.ts`
  re-export（batch 04 留下的）；搬运后仍然只有这一个来源，只换路径。
- **测试需要改断言。**
- 不要读、改、stage `src/agentbox/`、`src/plugins/agentbox-lab/`、
  `docs/architecture/acp-desktop-phase1-design.md`、`docs/desktop-src-tree.md`。
