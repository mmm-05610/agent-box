# Renderer layer — master construction plan

## Current owner override — Workspace sidebar (36)

Work order [36](renderer-layer-batches/36-workspace-sidebar-product.md) is now the only
executable increment. 35 is accepted on `feature/desktop-wsl-round1` at `c8d59f3`, NOT
merged into main. Continue that branch/worktree after importing this documentation-only
dispatch commit. 36 runs exclusively; 34, previews, Codex and Work Core remain paused.
No automatic main merge. This overrides the first-round-only instruction below.

## Previous owner override — WSL first round

The owner authorized a new executor for [work order 35](renderer-layer-batches/35-wsl-workspace-round1.md).
Only that first round is executable in the new session: real Windows Desktop WSL
onboarding on `feature/desktop-wsl-round1` in its own worktree. Batch 34 and preview
development remain paused. No automatic merge into main, no automatic continuation into
Codex/Work Core rounds. This explicit scope overrides the older “all work orders” executor
brief and automatic collision waves. Existing source changes must not run concurrently.

This is the start of the WSL-first route; it preserves the accepted Workspace/private
Connection semantics. Round 1's temporary persistence authority is Electron; Work Core
migration will be separately specified after the Desktop behavior is verified.

This is the governing document for the layer migration. It aggregates every work
order, fixes the order, says what may run at the same time, and says what is not
delegated.

**It is maintained, not frozen.** New module reviews produce new work orders, and
every one of them lands here — see §9 for the exact steps, so updating it is not
a judgement call.

---

## 0 · Precedence — read this before trusting any number in this file

This document is **the plan, not the state**. It is maintained, so parts of it are
summaries, and summaries go stale — including while a batch is running. When two
things disagree, this is the order:

| source of truth | what it owns |
| --- | --- |
| `renderer-layers.debt.ts` | how much work is left. Generated, and the guard fails on a stale line |
| `renderer-layer-batches/NN-*.md` | what each batch does, and how many edges it claims |
| `renderer-layer-batches/batch-manifest.json` | each batch's claimed edges and the modules it touches |
| `renderer-layer-status.md` | which items are merged |
| **this file** | the order, the parallel groups, the rules, and what is not delegated |

So the work list is **not** a list written into this file or into a prompt. It is
the rows in the status file that are not `merged` — every work order, with no
  phase acting as a permission gate. And the target is **not** a number written in §1:

```
expected ledger = ledger now − Σ(edges of the items you are about to do)
```

Re-derive everything with one command:

```bash
cd apps/desktop/src
node ../../../.agents/skills/architecture-tree-report/scripts/batch-collisions.mjs \
  ../../../docs/architecture/renderer-layer-batches/batch-manifest.json
```

It prints each batch's claimed edges, its touched-file count, the current ledger,
the ledger after every batch, and the waves. **If §1 or §3 below states a
different number, this file is stale and the manifest wins.**

Two consequences worth stating, because both have already happened:

- **A prompt handed to an executor must not restate the batch list or the target
  number.** It says where to read them. A prompt that froze "01–07, 27 edges,
  85 → 58" was written from §3's state at that moment and was wrong within the
  hour, when a knot was decided and became batch 08. The executor noticed and
  stopped, which is correct behaviour — but the prompt was the defect. The brief
  is therefore kept as
  [`renderer-layer-batches/EXECUTOR-PROMPT.md`](renderer-layer-batches/EXECUTOR-PROMPT.md),
  versioned with this plan, instead of being pasted from a chat.
- **Re-read §3 and this section at the start of each item, not once at the
  start of the run.** That is what §9 is for.

---

## 1 · The objective, and the one honest measure of it

Every import in the renderer points **down** the layer order:

```
rank 0   api/   types/   i18n/   themes/   lib/
rank 1   store/
rank 2   application/
rank 4   components/   extension/   dev/
rank 5   app/
```

The measure is
`apps/desktop/src/dev/contracts/renderer-layers.debt.ts` — a frozen ledger of
every import that still points up. It is a **ratchet**: the guard
(`renderer-layers.test.ts`) fails on an edge that is not listed *and* on a listed
line that no longer exists. So the ledger cannot be widened to make something
land, and a round that fixes an edge without touching the ledger leaves the suite
red on purpose.

| | |
| --- | --- |
| ledger today | **85** *(derived — see §0)* |
| after every work order in §3 | **0** *(derived — see §0)* |
| test baseline | **775 files / 7466 tests** |

**An item is done when the ledger shrank by exactly the number its work order
predicted.** Not when the tests pass — they can pass while the change did nothing.
If the drop is smaller than predicted, a recorded edge was left behind or a
`vi.mock` target was missed. If it is larger, something else was fixed and the
work order under-counted; say so.

Regenerate with `npm run ledger:layers` from `apps/desktop`. It is generated, so
never hand-edit it.

## 2 · Where the tree stands

```
rank 0   api/ types/ i18n/ themes/         ✓ 0
rank 0   lib/                              ⚠ 21   ← station 1, being cleared now
rank 0   hermes.ts                         ⚠ pending deletion (work order 05)
rank 1   store/                            ⚠ 20   ← station 2
rank 2   application/                      ✓ 0
rank 4   components/                       ⚠ 28   ← station 4, the hardest
rank 4   extension/                        ⚠ 16   ← the plugin ABI (work order 09)
rank 4   dev/  plugins/                    ✓ 0
rank 5   app/                              ✓ 0
```

Directions: `components → app` 28, `lib → store` 16, `extension → app` 16,
`store → app` 11, `store → components` 9, `lib → app` 3, `lib → components` 2.

Where the 85 lines go, so the batches can be read against the tree:

```
lib/          21   all of it      01 · 02 · 03 · 06 · 07 · 14
store/        20   all of it      03 · 04 · 08 · 10 · 15
components/   28   all of it      09 (1) · 10 (19) · 11 (3) · 13 · 14 · 15
extension/    16   all of it      09 (13) · 12 (3)
```
lib/          21   all of it      01 · 02 · 03 · 06 · 07        → 0 left
store/        20   18 of it       03 · 04 · 08 · 10            → 2 left
components/   28   20 of it       09 (1) · 10 (19)             → 8 left
extension/    16   13 of it       09                            → 3 left
```

The read-first analysis is
[`renderer-layer-boundary.md`](renderer-layer-boundary.md); the executable work
orders are in
[`renderer-layer-batches/`](renderer-layer-batches/README.md).

## 3 · The run

**Everything in `renderer-layer-batches/` is in scope. There is no permission gate,
and nothing waits for a later instruction.** The ordering below is about *when
things may run relative to each other* — file collisions and review boundaries —
not about what is allowed. A run that finishes Phase 1 and stops has not done the
job; it has done a third of it.

The per-batch edge counts are the ones in the manifest, which is what sums to the
target — see §0.

### Phase 1 — the layer work orders

| work order | scope | edges |
| --- | --- | --- |
| 01 | four small stateful `lib/` services → `store/` | 6 |
| 02 | `lib/tour/` → `app/tour/` | 2 |
| 03 | a misplaced shape and a sidebar label | 3 |
| 04 | split `workspace-groups.ts`, membership core → `store/` | 4 |
| 06 | the rest of station 1: two splits, one injection, two moves | 7 |
| 07 | `lib/keybinds/` and `lib/external-link.tsx`, split by consumer | 5 |
| 08 | the pane/layout domain sinks to `lib/` + `store/` | 9 |
| 09 | the plugin ABI stops reaching into the app | 14 |
| 10 | the composer engine leaves `app/` for `lib/` + `components/` | 22 |
| 11 | the route vocabulary sinks to `lib/` | 3 |
| 12 | the host views ride the plugin context (ABI change) | 3 |
| 13 | the last composer edge: the attachment upload moves out | 1 |
| 14 | three hooks sink, and the pet stops reaching up | 3 |
| 15 | the last three singletons | 3 |
| 16 | the session-recovery core sinks — the enabler for 13 | 0 |

85 edges — **the whole ledger**. Phase 1 and Phase 2 together are the complete set:
every line in the ledger belongs to a work order listed here, and §1's target is 0.
There is no remainder, no "later stage", and nothing waiting on a decision. Parallel
per §4. **Review gate** when the phase's last item merges (§5).

### Phase 2 — work order 05, the `@/hermes` barrel

0 edges, ~240 files, four internal phases. It is its own phase for one reason:
**it must not run concurrently with Phase 1**, because it overlaps most of Phase 1's
files. Before or after are both fine; after is better, because Phase 1's progress is
already banked and reviewed by then.

05 pays no layer debt, so it never moves the ledger. Do not read its completion as
progress on the migration — read the ledger for that. **Review gate** after it, with
its own reviewer, so its result is attributable rather than mixed into a layer
round.

### Phase 3 — UI 下沉与删除（17–29）

Phase 1/2 已经把上行依赖账本归零；Phase 3 处理账本看不见的另一种错位：不渲染的逻辑
仍住在 rank 4/5，以及维护者已经明确删除的产品适配面。每张单 `edges: 0`，所以它们必须
让账本继续保持 0，而不是靠账本证明自己有进展。

17–22 是最初量出的 sink work orders；23–29 是后续讨论作出裁决后动态追加的批次。
实际工作列表仍以 status 中未 merged 的行为准，不把任何一次汇总快照当冻结范围。

两条内容依赖高于碰撞 wave：**17 必须先于 25；23 必须先于 24。**

第三条内容依赖，而且它比前两条强得多：**34 必须在 32 与 33 各自独立复核合并之后**，
并且它在独立分支 `experiment/agentbox-desktop-frontend` 上独占运行。
§4 的碰撞表把 34 排在 wave 2——那是**文件相交的颜色，不是执行顺序**：
碰撞工具只回答"哪些文件相交"，不是业务依赖调度器，显式内容依赖优先。
34 的 touched set 覆盖 `app/`、`features/`、`application/`、`store/`、`api/`，
所以它和几乎每个批次都相交，任何 wave 编号对它都没有意义。

其余按 §4。

### Phase 4 — `app/` 组合根收口（30）

Batch 30 把最高层的组合与产品功能分开：

```text
app/          → index.tsx · routes.ts · composition/ · shell/ · windows/
composition/  → root · wiring · registrations · routing · bridges · dev
shell/        → chrome · layers(hosts) · hooks · platform；不拥有产品菜单内容
features/     → 产品功能整棵迁入，并接收从 contrib/gateway 识别出的功能实现
```

组合根只做实现选择和接线，不实现 Gateway 重连、Session 同步、MCP Dialog 或具体 pane；
这些归属、`panes.tsx` 的机械拆分，以及 Shell host/产品内容的边界已在 Batch 30 锁定。
Context Menu 先拆为 composition 组装、Shell host、Terminal feature section；更深的贡献协议
不在本批发明。

它是**终端结构批次**：必须等 17–29 全部 merged + reviewed 后单独执行。原因不是权限，
而是它会改写 renderer 全树路径；提前运行会让前面每张派工单的路径、碰撞和测试失真。

### Phase 5 — semantic ownership follow-up (31–33; 34 terminal)

Independent review of Batch 30 corrected one ownership decision: Session opening,
owner resolution and Session-scoped request dispatch are application use cases, not
composition routing. Batch 31 moves those three families to `application/session/` and
leaves only overlay presentation routing in `app/composition/routing/`.

Batch 32 then makes Shell a product-neutral host: keybinding/menu/Tour mechanics stay in
Shell while product actions and surface coordination move to composition registrations.

Batch 33 keeps HUD, Pet and Quick Entry as product surfaces while removing backend stream
ownership, backend Ref concepts and direct Hermes bridge access from their UI boundary.
The Work Core multi-consumer ownership decision is recorded separately; this batch does
not invent its eventual wire protocol.

Batch 34 is an isolated experiment-branch programme, currently under a **design hold**.
Batches 32/33 are merged, but the remaining UI content semantics and the frontend ↔
Work Core protocol must be reviewed before execution. A later approved revision will
turn the Port proposal into a self-contained contract. Until then no branch is created
and no executor is authorized to infer the missing protocol.

The product-language source for that classification is
[`app-product-semantics.md`](app-product-semantics.md). Route/sidebar/command/menu/
Settings inventory must be classified against it before Batch 34 becomes executable.

### Completion

整轮只有在 status 中所有 executable work order（现在包括 31–33）都 merged、各自带 reviewer 实测数字、
账本仍为 0 时完成。Phase 1/2 的 ledger green 不再等于整个 renderer 结构工作完成。

## 4 · What may run at the same time

The constraint is **files**, not batches. Two work orders collide when a file
appears in both of their touched sets — where a batch's touched set is every
production file importing a module it moves or changes.

The collision graph is computed, not reasoned about:

```bash
cd apps/desktop/src
node ../../../.agents/skills/architecture-tree-report/scripts/batch-collisions.mjs \
  ../../../docs/architecture/renderer-layer-batches/batch-manifest.json
```

Current output is generated from the manifest; re-run the command after each new batch.

```
wave 1: 01 lib-services, 02 tour, 06a2 link-title, 06c1 sound, 07a keybinds, 26 tool-view, 27 settings primitives, 30 app composition root, 31 session routing sink
wave 2: 18 starmap, 34 AgentBox Desktop frontend branch
wave 3: 06c2 image-dl, 09 plugin-abi, 16 session-recovery, 23 gateway-event clean
wave 4: 04 workspace, 07b external-link, 11 route-vocab, 12 host-views, 20 preview, 25 interrupted-turn seal, 29 messaging removal
wave 5: 03 shape+label, 06a1 statusbar, 06b1 haptics, 19 terminal, 24 gateway-event component pins
wave 6: 21 transcript, 28 sidebar derivations, 32 shell host purity
wave 7: 08 pane-shell, 22 session-lists
wave 8: 14 hooks-sink
wave 9: 10 composer-engine
wave 10: 13 composer-last-edge
wave 11: 33 window surfaces neutral
wave 12: 15 singletons
wave 13: 17 session-remainder
```

This is a **collision coloring, not an execution scheduler**. A merged batch whose
patterns now match nothing can share a color with batch 30, but that does not repeal
the content order in §3: batch 30 still waits for 17–29 to be merged and reviewed,
then runs alone. Likewise 17 precedes 25 and 23 precedes 24 even if a coloring could
place them differently.

The collisions that force this:

| pair | shared file |
| --- | --- |
| 01 lib-services ∩ 04 workspace | `app/session/hooks/use-session-actions/session-create.ts` |
| 01 lib-services ∩ 06b1 haptics | `app/chat/sidebar/session-actions-menu.tsx``, ``extension/sdk/index.ts` |
| 01 lib-services ∩ 08 pane-shell | `app/chat/sidebar/session-actions-menu.tsx``, ``app/contrib/controller.tsx`, +3 |
| 01 lib-services ∩ 09 plugin-abi | `app/chat/sidebar/session-actions-menu.tsx``, ``app/contrib/controller.tsx`, +2 |
| 01 lib-services ∩ 10 composer-engine | `app/contrib/controller.tsx``, ``extension/sdk/index.ts` |
| 01 lib-services ∩ 11 route-vocab | `app/contrib/controller.tsx``, ``app/session/hooks/use-session-actions/session-create.ts`, +1 |
| 01 lib-services ∩ 12 host-views | `extension/sdk/index.ts` |
| 01 lib-services ∩ 15 singletons | `app/contrib/controller.tsx` |
| 03 shape+label ∩ 04 workspace | `app/chat/sidebar/gateway-groups.tsx``, ``app/chat/sidebar/projects/entered-content.tsx`, +3 |
| 03 shape+label ∩ 06b1 haptics | `app/chat/sidebar/session-row.tsx` |
| 03 shape+label ∩ 09 plugin-abi | `app/chat/sidebar/chrome.tsx``, ``app/chat/sidebar/gateway-groups.tsx`, +7 |
| 03 shape+label ∩ 11 route-vocab | `app/chat/sidebar/sidebar-constants.tsx``, ``app/chat/sidebar/sidebar-nav-menu.tsx` |
| 04 workspace ∩ 08 pane-shell | `app/session/hooks/use-session-actions/session-create.ts` |
| 04 workspace ∩ 09 plugin-abi | `app/chat/sidebar/gateway-groups.tsx``, ``app/chat/sidebar/projects/entered-content.tsx`, +3 |
| 04 workspace ∩ 11 route-vocab | `app/session/hooks/use-session-actions/session-create.ts` |
| 06a1 statusbar ∩ 08 pane-shell | `app/shell/hooks/use-statusbar-items.tsx` |
| 06a1 statusbar ∩ 09 plugin-abi | `app/shell/hooks/use-statusbar-items.tsx` |
| 06a1 statusbar ∩ 11 route-vocab | `app/shell/hooks/use-statusbar-items.tsx` |
| 06a2 link-title ∩ 06b1 haptics | `components/assistant-ui/directive-text.tsx` |
| 06a2 link-title ∩ 07b external-link | `components/assistant-ui/directive-text.tsx` |
| 06a2 link-title ∩ 09 plugin-abi | `components/assistant-ui/directive-text.tsx` |
| 06b1 haptics ∩ 06c1 sound | `app/session/hooks/use-message-stream/gateway-event/message-stream.ts``, ``app/settings/notifications-settings.tsx` |
| 06b1 haptics ∩ 07a keybinds | `app/chat/composer/hooks/use-composer-esc-cancel.ts``, ``app/settings/index.tsx`, +1 |
| 06b1 haptics ∩ 07b external-link | `app/settings/env-var-actions-menu.tsx``, ``components/assistant-ui/directive-text.tsx` |
| 06b1 haptics ∩ 08 pane-shell | `app/chat/sidebar/session-actions-menu.tsx``, ``app/settings/plugins-settings.tsx`, +2 |
| 06b1 haptics ∩ 09 plugin-abi | `app/chat/sidebar/connection-switcher.tsx``, ``app/chat/sidebar/profile-switcher.tsx`, +9 |
| 06b1 haptics ∩ 10 composer-engine | `app/chat/composer/chat-bar.tsx``, ``app/chat/composer/hooks/use-composer-drop.ts`, +7 |
| 06b1 haptics ∩ 11 route-vocab | `app/chat/sidebar/profile-switcher.tsx``, ``app/pet-generate/pet-generate-content.tsx`, +4 |
| 06b1 haptics ∩ 12 host-views | `extension/sdk/index.ts` |
| 06b1 haptics ∩ 13 composer-last-edge | `app/chat/session-tile-actions.ts``, ``app/session/hooks/use-prompt-actions/index.ts`, +1 |
| 06b1 haptics ∩ 14 hooks-sink | `app/command-palette/pet-palette-page.tsx``, ``app/pet-generate/pet-generate-content.tsx`, +3 |
| 06b1 haptics ∩ 15 singletons | `app/settings/index.tsx` |
| 06c2 image-dl ∩ 07b external-link | `components/assistant-ui/embeds/listing-embed.tsx` |
| 07a keybinds ∩ 08 pane-shell | `app/hooks/use-keybinds.ts``, ``components/pane-shell/tree/renderer/tree-group.tsx` |
| 07a keybinds ∩ 09 plugin-abi | `app/hooks/use-keybinds.ts``, ``app/settings/index.tsx` |
| 07a keybinds ∩ 10 composer-engine | `app/chat/composer/focus-chord.ts``, ``app/chat/composer/hooks/use-composer-esc-cancel.ts`, +3 |
| 07a keybinds ∩ 11 route-vocab | `app/hooks/use-keybinds.ts``, ``app/settings/index.tsx` |
| 07a keybinds ∩ 15 singletons | `app/hooks/use-keybinds.ts``, ``app/settings/index.tsx` |
| 07b external-link ∩ 08 pane-shell | `app/chat/preview-tile.tsx``, ``app/context-menu/app-context-menu.tsx` |
| 07b external-link ∩ 09 plugin-abi | `app/artifacts/index.tsx``, ``app/context-menu/app-context-menu.tsx`, +2 |
| 07b external-link ∩ 11 route-vocab | `app/context-menu/app-context-menu.tsx``, ``app/settings/plugin-install-modal.tsx` |
| 07b external-link ∩ 14 hooks-sink | `app/settings/plugin-install-modal.tsx` |
| 07b external-link ∩ 15 singletons | `components/boot-failure-overlay.tsx` |
| 08 pane-shell ∩ 09 plugin-abi | `app/chat/close-tab.ts``, ``app/chat/index.tsx`, +15 |
| 08 pane-shell ∩ 10 composer-engine | `app/chat/composer/focus.ts``, ``app/chat/index.tsx`, +5 |
| 08 pane-shell ∩ 11 route-vocab | `app/chat/close-tab.ts``, ``app/chat/index.tsx`, +12 |
| 08 pane-shell ∩ 12 host-views | `extension/sdk/index.ts` |
| 08 pane-shell ∩ 13 composer-last-edge | `app/contrib/wiring.tsx` |
| 08 pane-shell ∩ 14 hooks-sink | `app/chat/session-tile.tsx``, ``app/contrib/wiring.tsx`, +2 |
| 08 pane-shell ∩ 15 singletons | `app/contrib/controller.tsx``, ``app/hooks/use-keybinds.ts`, +1 |
| 09 plugin-abi ∩ 10 composer-engine | `app/chat/composer/status-stack/index.tsx``, ``app/chat/index.tsx`, +8 |
| 09 plugin-abi ∩ 11 route-vocab | `app/chat/close-tab.ts``, ``app/chat/composer/status-stack/index.tsx`, +38 |
| 09 plugin-abi ∩ 12 host-views | `extension/sdk/index.ts` |
| 09 plugin-abi ∩ 13 composer-last-edge | `app/contrib/wiring.tsx` |
| 09 plugin-abi ∩ 14 hooks-sink | `app/chat/session-tile.tsx``, ``app/contrib/wiring.tsx`, +6 |
| 09 plugin-abi ∩ 15 singletons | `app/contrib/controller.tsx``, ``app/hooks/use-keybinds.ts`, +1 |
| 10 composer-engine ∩ 11 route-vocab | `app/chat/composer/status-stack/index.tsx``, ``app/chat/index.tsx`, +6 |
| 10 composer-engine ∩ 12 host-views | `extension/sdk/index.ts` |
| 10 composer-engine ∩ 13 composer-last-edge | `app/contrib/wiring.tsx``, ``components/assistant-ui/thread/user-edit-composer.tsx` |
| 10 composer-engine ∩ 14 hooks-sink | `app/chat/session-tile.tsx``, ``app/contrib/wiring.tsx` |
| 10 composer-engine ∩ 15 singletons | `app/contrib/controller.tsx``, ``app/hooks/use-keybinds.ts` |
| 11 route-vocab ∩ 12 host-views | `extension/sdk/index.ts` |
| 11 route-vocab ∩ 13 composer-last-edge | `app/contrib/wiring.tsx` |
| 11 route-vocab ∩ 14 hooks-sink | `app/contrib/wiring.tsx``, ``app/pet-generate/pet-generate-content.tsx`, +2 |
| 11 route-vocab ∩ 15 singletons | `app/contrib/controller.tsx``, ``app/hooks/use-keybinds.ts`, +1 |
| 13 composer-last-edge ∩ 14 hooks-sink | `app/contrib/wiring.tsx` |


Four items are wide, for different reasons and with the same consequence —
treat each as its own slot: `09 plugin-abi` (ten collisions, 78 touched files: it
edits the ABI module that every batch shipping a `lib/` helper re-exports
through), `06b1 haptics` (nine, 55 importers), `08 pane-shell` (eight, 45), and
`10 composer-engine` (five collisions but the widest real footprint in the
migration: 40 production importers plus most of the 49 files inside
`app/chat/composer/`, which the manifest's string patterns can only approximate).
`10` lands alone in the last wave for that reason, and it is also why it should be
written last: by then 09 has already moved `COMPOSER_AREAS` out of the file the two
batches share.

### How to actually run it

- **Rolling queue, not barriers.** A work order may start as soon as every work
  order it collides with has been merged. Waiting for a whole wave wastes time
  when only one partner is slow.
- **Cap at 3 concurrent.** The suite is CPU-heavy (775 files, ~160 s alone) and
  this repo already documents flakes caused by runner contention — see the
  comment in `apps/desktop/vitest.setup.ts` about `waitFor` deadlines tripping on
  saturated runners. If a worker reports a *timeout-shaped* failure, re-run that
  file **alone** before believing it.
- **Concurrent workers must not share a working tree.** Two workers in one tree
  fight over the ledger, and — worse — a test run reads files while the other
  worker is editing them, which produces failures that belong to neither. That
  has already happened once in this project and cost a full suite run. If the
  tool cannot give each worker its own worktree, run them serially in the order
  above instead of pretending.
- **The ledger is generated, so it is not a merge point.** Workers do not
  hand-edit `renderer-layers.debt.ts`. Each may regenerate it locally to verify,
  but the **integration step regenerates it once on the merged tree** and that
  copy is authoritative. This is what makes parallel work safe at all: only the
  source moves can conflict, and those are exactly what the collision check
  mapped.

## 5 · Review: every phase, by someone who did not do the work

Each merged slot gets an **independent reviewer + test subagent**, briefed to
distrust the worker's report. It must:

1. **Run the checks itself** — `npm run typecheck`, `npm run test:ui`, the layer
   guard, `npx eslint` on the changed files, `git diff --check`. Paste the real
   numbers; never quote the worker's.
2. **Confirm the ledger arithmetic** — regenerate it and check the drop equals the
   work order's claimed edge count, no more and no less.
3. **Audit the diff for stray changes.** List every changed line that is not an
   import statement or a relocated block, and account for each one. This is how a
   cosmetic `--fix` rewrite or an accidental edit gets caught.
4. **Hunt §6**, entry by entry, in the files that changed.
5. **Check the test counts.** 775 files / 7466 tests is the baseline. A drop needs
   a per-file explanation; the suites' own diffs are not evidence.
6. **Report disagreement.** A reviewer that returns "looks good" without naming
   anything it verified has not reviewed. It should also say what it could *not*
   verify.

The reviewer's verdict goes into the status file (§8). A slot is not complete
until a reviewer says so.

## 6 · The silent-failure catalogue

Every entry is a failure this project has already produced at least once. They
share one property: **the suite stays green.** That is why a passing run is not
evidence, and why this list is worked through explicitly rather than trusted to
attention.

1. **A `vi.mock` whose module moved.** `vi.mock('@/lib/media')` stops intercepting
   the moment that module's path changes; the test then reaches the real
   implementation and **still passes**. Every moved module that was mocked needs
   its target moved in the same commit. Seen: `store/file-actions.test.ts`.
2. **Partial mocks break when the mocked module gains a caller.**
   `vi.mock('@/lib/query-client', () => ({ oneFn: vi.fn() }))` provides only what
   was needed at the time. Add one import of that module to the code under test
   and the new symbol is `undefined` at call time — and because it throws, it
   silently skips everything after it in the same callback. Seen: seven tests
   failed this way when a profile-switch path gained one call, and the failure
   was pointing at a design smell, not just a narrow mock.
3. **Boundary tests that hard-code paths.** Expected module lists, "allowed
   import" strings, synthetic graphs. A move must update the *model*; never the
   assertion. Seen: `store/profile-store-purity.test.ts` enumerates its leaves;
   `store/store-boundaries.test.ts` lists allowed specifiers.
4. **Reverse controls whose fixture names a deleted path prove nothing.** They are
   the tests that prove a scanner can fail; retarget them at something still
   forbidden, never delete them.
5. **`import type` versus runtime.** A type-only import still counts in the
   ledger but is erased at runtime, so it can never form a cycle. Do not "fix" a
   type edge by making the import runtime.
6. **Glob strings are invisible to the type system.**
   `import.meta.glob('../plugins/…')` is a string; `tsc` and the transform do not
   resolve it, and a directory move changes its meaning silently. Seen when
   `extension/contrib` moved.
7. **`eslint --fix` mutates files.** Any suite run in flight is invalidated by it,
   and it can rewrite statements that are not imports. Re-run the suite after, and
   check the resulting diff is import lines only.
8. **A grep for importers is not a resolution.** `from '../..'` resolves to a
   directory index; a bare `from './model'` matches a *different* module in every
   sibling directory. Use a path resolver — `arch:tree --move`, or the ledger
   scanner — never a string match. Seen four times, most recently
   `narrow-overlays.tsx`'s `from '../..'`.
9. **The same basename in several directories.** `./model`, `./identity`,
   `./registry` each exist in two or three places. A blanket rewrite across a
   search result will corrupt the unrelated ones.

## 7 · What is left

**Nothing.** Every line in the ledger is a work order, and the target is 0 — the
first time in this migration that "done" and "zero" are the same number.

Five knots were decided on 2026-09-12 and written up: layout state became
[08](renderer-layer-batches/08-pane-shell-sink.md); the plugin ABI became
[09](renderer-layer-batches/09-plugin-abi.md) — fourteen of its seventeen edges; the
composer engine became [10](renderer-layer-batches/10-composer-engine.md) —
twenty-two of its twenty-three; the route vocabulary became
[11](renderer-layer-batches/11-route-vocabulary.md); and the three host-view
capability exports became
[12](renderer-layer-batches/12-host-views-through-context.md), which is the one ABI
change in the set ([the decision page](renderer-layer-host-views-decision.md) has the
reasoning). The last three batches —
[13](renderer-layer-batches/13-composer-last-edge.md),
[14](renderer-layer-batches/14-hooks-sink.md) and
[15](renderer-layer-batches/15-singletons.md) — are the seven edges those left, and
none of them needed a decision either.

The last two are a pair with an order: 13 cannot move the attachment upload until
[16](renderer-layer-batches/16-session-recovery-sink.md) has sunk the session-recovery
core it calls — left in `app/`, it would put an `application → app` edge in the
ledger that no work order sanctions. 16 pays 0 and 13 pays the last line, so the
target is 0 either way; the order is what matters.

Two batches carry a documented "not here" of their own, and both are worth reading
before anyone retries them: 09's last section is a module-scope capability read that
runs before any `app/` code (12 solves it by changing what a plugin is handed), and
10's is a hook cluster that reaches into the session-actions domain (13 needs one
function out of it, not the cluster).

**Also not delegated:**
- `apps/desktop/src/agentbox/`, `apps/desktop/src/plugins/agentbox-lab/`,
  `docs/architecture/acp-desktop-phase1-design.md`, `docs/desktop-src-tree.md` —
  untracked work in progress. Never read, modify or stage them.
- Anything that would change behaviour. Every work order but 12 is a relocation or a
  re-wiring; 12 changes the plugin API and says so.


## 8 · The status file

**`docs/architecture/renderer-layer-status.md`** — the run's live state, one row
per work order, updated **after** a reviewer passes it and not before.

It exists so that a human can see where the run is without reading a transcript,
and so the next session can pick up without re-deriving anything. The rule that
keeps it honest: **a row may only claim "merged" when it names a commit and the
reviewer's numbers.** No "in progress, mostly done".

Update it in the same commit as the work, or immediately after — a status file
that lags is worse than none, because it is trusted.

## 9 · Keeping this document current

When a new work order appears — from a module review, or from a knot's decision
being made:

1. Write `renderer-layer-batches/NN-<name>.md`, self-contained, with verified
   destinations and stop conditions.
2. Add its row to `renderer-layer-batches/README.md`.
3. Add it to `renderer-layer-batches/batch-manifest.json` with **both** its
   claimed edge count and the modules it touches. The count is what §1's target is
   derived from, and the collision check now fails if the two disagree.
4. **Re-run the collision check** (§4) and replace both the waves table and §1's
   target. Do not reason about either — the graph and the arithmetic changed, and
   the check will tell you if you got the target wrong.
5. Add it to the right phase table in §3 — which phase is a question about file
   collisions and review boundaries, not about permission.
6. Add its row to the status file.

If it is not in the manifest, its collisions are unknown and it must run alone.

## Appendix · the collision check

`.agents/skills/architecture-tree-report/scripts/batch-collisions.mjs` — no
dependencies, reads the manifest, prints the touched-file counts, every colliding
pair with the shared files, and a greedy grouping into the minimum number of
sequential waves.

The manifest is the one input a human maintains: a batch name mapped to the
ripgrep patterns that find the modules it moves or changes. A batch's touched set
is then every production file importing one of those modules. The ledger file is
excluded on purpose — it collides with everything and would say nothing; it is
the integration step's job instead.
