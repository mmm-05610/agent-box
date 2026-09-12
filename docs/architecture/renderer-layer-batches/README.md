# Renderer layer — mechanical batches

One document per batch. Each is self-contained: an agent should be able to pick
up a single file and execute it without reading the others.

**Starting a construction run? Read
[`../renderer-layer-master-plan.md`](../renderer-layer-master-plan.md) first** —
it fixes the order, says which batches may run at the same time, specifies the
per-stage review, and lists what is not delegated. Live progress is
[`../renderer-layer-status.md`](../renderer-layer-status.md).

Handing the whole run to an executor? Use
[`EXECUTOR-PROMPT.md`](EXECUTOR-PROMPT.md) — the canonical brief, which points at
the work list instead of restating it.

The analysis behind them — the layer rule, the design knots, the full debt
table, and the candidates that look mechanical but are not — is
[`../renderer-layer-boundary.md`](../renderer-layer-boundary.md). Read it if you
are deciding *what* to do; read a batch document if you are doing it.

| batch | scope | edges paid off |
| --- | --- | --- |
| [01](01-lib-services-to-store.md) | four small stateful `lib/` services → `store/` | 6 |
| [02](02-tour-to-app.md) | `lib/tour/` → `app/tour/` | 2 |
| [03](03-project-session-moves.md) | a misplaced shape and a sidebar label | 3 |
| [04](04-workspace-groups-split.md) | split `workspace-groups.ts`, membership core → `store/` | 4 |
| [06](06-lib-sink-and-move.md) | the rest of station 1: two splits, one injection, two moves | 7 |
| [07](07-split-by-consumer.md) | `lib/keybinds/` and `lib/external-link.tsx`, split by who needs what | 5 |
| [08](08-pane-shell-sink.md) | the pane/layout domain sinks to `lib/` + `store/` | 9 |
| [09](09-plugin-abi.md) | the plugin ABI stops reaching into the app | 14 |
| [10](10-composer-engine.md) | the composer engine leaves `app/` | 22 |
| [11](11-route-vocabulary.md) | the route vocabulary sinks to `lib/` | 3 |
| [12](12-host-views-through-context.md) | the host views ride the plugin context | 3 |
| [13](13-composer-last-edge.md) | the last composer edge: the attachment upload moves out | 1 |
| [14](14-hooks-sink.md) | three hooks sink, and the pet stops reaching up | 3 |
| [15](15-singletons.md) | the last three singletons | 3 |
| [16](16-session-recovery-sink.md) | the session-recovery core sinks — the enabler for 13 | 0 |
| | | **85** |

**All eighty-five.** Every line in the ledger has a work order, and the target is
**0**. Nothing here is waiting on a decision.

## The complete set, and how to read it

Fourteen work orders, written over one night, in the order they should be read:

```
station 1 — lib/           01  02  03  04  06  07        the mechanical moves
station 2 — store/          08                             the pane/layout domain
knots, decided              09  10  11  12               ABI · composer · routes · host views
last edges                  13  14  15                   upload · hooks · singletons
```

Start at [`../renderer-layer-master-plan.md`](../renderer-layer-master-plan.md) —
§3 has the phase order, §4 the waves and what may run together, §6 the silent
failures to watch for. Then take a single work order and execute it: each is
self-contained by design.

Three documents are read-first rather than executable, and they are where the
reasoning lives: [`../renderer-layer-boundary.md`](../renderer-layer-boundary.md)
(what the debt is and the knots it clusters into),
[`../renderer-layer-host-views-decision.md`](../renderer-layer-host-views-decision.md)
(the one decision this migration needed, and why the chosen answer cost an ABI
change), and [`../renderer-layer-status.md`](../renderer-layer-status.md) (live
state — a row only says `merged` when it names a commit and a reviewer's numbers).

`06` and `07` complete station 1 (`lib/`): after both, the only `lib/` entries
left in the ledger belong to `01`–`03`. `08` is station 2's first big item and the
first work order that came out of a knot's decision — see the master plan §9 for
the steps that produced it.

`06` shares no file with `01`–`04` (they take `oneshot`, `yolo-session`,
`session-export`, `guarded-model-switch`, `tour/`, `session-project-label`; it
takes `statusbar`, `session-link-title`, `haptics`, `sound/completion-sound`,
`hooks/use-image-download`), so it can run before or after them. It has its own
internal order — see its own document.

## Phase 3 — dispatched, and what was deliberately left out

Six sink work orders ([17](17-session-remainder-sink.md)–[22](22-session-lists-sink.md))
move **44 files / 4,892 lines** that render nothing and reach only rank ≤ 2, but live
at rank 4/5. All six carry `edges: 0` — the ledger is already 0 and must stay 0.

They exist because the ratchet could only see one defect. It rejected **upward
edges**; it cannot see a module that is *downward-clean* yet still sits at the top of
the ladder, so the UI layer keeps custody of logic that is not presentation.

**Measure a batch's closure over the whole group moving together, never file by
file.** Per-file, `app/starmap/color.ts` reports "drags rank 5" — that rank 5 is its
own sibling, which necessarily travels with it. Nine of the files that a per-file
scan calls "stuck" are dissolved by the group moves in 17–22 for exactly this reason.

### Phase 3 — not dispatched

About **41 files in five decisions**. Each is blocked by *what the module is*, not by
where it could go; a mechanical executor handed one of these would have to invent the
answer. Ordered by how much each unblocks.

**A · Where does the gateway-event projection live?** *(the important one)*

`app/session/hooks/use-message-stream/gateway-event/` — **10 files, 2,349 lines**, and
they are a clean shape already: `index.ts` (270) computes the routing context once per
event and asks an ordered list of family handlers "is this yours?"; each family file
consumes one kind of event and returns `true` if it did.

| file | lines | the events it owns |
| --- | --- | --- |
| `session-info.ts` | 460 | session metadata: title, model, cwd, context usage, subagents |
| `message-stream.ts` | 400 | streaming text and reasoning deltas; sealing a turn |
| `input-requests.ts` | 325 | permission requests and questions → the pending-answer queue |
| `desktop-bridge.ts` | 323 | **the reverse direction** — see below |
| `status.ts` | 226 | busy / idle / error / waiting-for-input status bits |
| `tools.ts` | 150 | tool-call start and completion → the tool cards |
| `lifecycle.ts` | 105 | session created / closed / reclaimed |
| `types.ts` | 71 | the deps contract, the context shape, the handler type |
| `session-control.ts` | 20 | control odds and ends |
| `index.ts` | 270 | routing and the dispatch table |

**The pins, measured across all ten files (corrected — the first version of this
section said "two imports", which was wrong):**

| file | imports anything above rank 2? |
| --- | --- |
| `index.ts` · `types.ts` · `session-control.ts` | no — siblings and `@hermes/shared` only |
| `status.ts` | no — `@/i18n` is rank 0 |
| `lifecycle.ts` | no — `@/application/theme/adapters/backend-sync` is already rank 2 |
| `input-requests.ts` | no — `@/application/session/restore-pending-clarify` is already rank 2 |
| `session-info.ts` | **yes** — `finalizeInterruptedMessages` from `use-prompt-actions/rewind`, plus `../utils` (batch 17's file) |
| `message-stream.ts` | **yes** — `@/components/chat/vibe-hearts` |
| `tools.ts` | **yes** — `@/components/composer/suggestion-providers/{repair,skill}` |
| `desktop-bridge.ts` | **yes** — five, of which three are batches 19/20's own files |

So **six of the ten sink clean today**, and the four that do not are four small,
nameable problems rather than a wall:

- `message-stream.ts` reaches for `burstVibeHearts`, a decorative burst.
- `tools.ts` reaches for `invalidateSkillSuggestionIndex` and `reportMcpToolResult`,
  two cache/repair hooks on the composer's suggestion providers.
- `session-info.ts` needs batch 17 to land, and needs `finalizeInterruptedMessages`
  ("how an interrupted turn is closed out") extracted — that is session semantics, not
  presentation, and it belongs below anyway.
- `desktop-bridge.ts` splits three ways, above.

**The two `components/` pins have a one-line remedy that is also the right design.**
Both files already receive a bag of callbacks (`GatewayEventDeps`) and call them; these
two imports reach *around* that bag to a component. Move them into the bag as two more
deps — "show the hearts", "invalidate the suggestion index" — and the handlers stop
knowing that components exist at all. That is the file's own established pattern, not
a new mechanism.

*Decision:* is event normalisation a core concern (`application/harness/`) or a
session-hook concern? Answering this settles nine of the ten files. `desktop-bridge.ts`
splits, and the split is not a matter of taste — see below.

### A correction: `desktop-bridge.ts` is not "unmovable because it touches the UI"

An earlier draft of this decision said the reverse-direction file could not be split
because every action in it is a UI action. That was wrong, and the wrongness matters
because it hides the more useful rule. The file holds **three** concerns, not one:

| inside it | what it looks like | where it goes |
| --- | --- | --- |
| **protocol** | `terminal.read.request` → `terminal.read.respond`, correlated by `request_id`, the answer serialised into `text` | **sinks** — this is core |
| **policy** | `if (isActiveEvent)` — a background turn must never reach into the page the user is working in (`offer, don't hijack`) | **sinks** — a rule that holds for every harness |
| **implementation** | reading the xterm buffer, reading/driving the embedded browser, revealing a pane, running the tour | **stays** — registered as a declared capability |

The precise rule, which replaces the wrong one:

> **The core can own a data flow's implementation, because that implementation is pure
> computation and the core can simply have it. The core can never own a control flow's
> implementation — that must be supplied on site by the UI. It can own only the control
> flow's protocol and its policy.**

That is the difference between the nine files and this one, and it is about *who
supplies the implementation*, not about whether a file can be taken apart.

Splitting it also buys the thing the Capability work needs: today the backend **blind-fires**
eleven event types into an eleven-branch `if` chain and never asks whether the client can
serve them. After the split the client **declares** what it can do, the backend can ask,
and a missing capability gets an honest "unsupported" instead of a silent failure —
which is the rule `acp-desktop-phase1-design.md` §6.4 already states.

### A — ruled, 2026-09-12

**Build the client's own declaration table first; align the field names with ACP but do
not adopt ACP's `clientCapabilities` mechanism yet.** The ruling came with the ordering
that governs this whole phase:

> 先把 UI 层整理干净，然后再去重组。

So `desktop-bridge.ts` is **not** split in this round. The pattern to split it into is
now written down, and four pieces are named — policy (core), the three event types ACP
already standardises (`terminal.read/agent.terminal.output/terminal.close` →
`clientCapabilities.terminal`), the eight Hermes-only ones (`preview.*`, `window.read`,
`tour.request`, `tip.show`, `pane.reveal`, `layout.apply`, `message.reaction` → `_meta`
extensions), and the eleven implementations (stay, registered as a table). It waits for
the Extension mechanism, because the eight Hermes-only events are an Extension surface
and their shape depends on that mechanism existing.

**Do not dispatch a `desktop-bridge` work order before the mechanism is decided.**

**B · Is the tool-call model fallback logic or presentation?**
`components/assistant-ui/tool/fallback-model/` — `index.ts` 1503 · `format.ts` 154 ·
`types.ts` 89 · `targets.ts` · plus `components/assistant-ui/tool/delegate-model.ts` 159.
"Which model should run this tool call" is a decision, not a rendering; it lives in a
render directory because that is where its first caller was. The family depends on
nothing but itself.
*Decision:* sink the family to `application/tools/`, or declare it presentation.

**C · Is `app/settings/` a domain or a pile of forms?**
`app/settings/constants.ts` 542 · `settings-search.ts` 230 · `billing/errors.ts` 164 ·
`billing/billing-amounts.ts` 124 · `billing/types.ts` 36 · `billing/open-external.ts` 10
(+ `helpers.ts`, and `credential-key-ui.tsx`, which is a component).
*Decision:* if configuration is a domain independent of its forms, it belongs in
`application/settings/`; if the settings page is just forms, the 542-line constants
module stays where it is.

**D · The heaviest single file: `workspace-groups.ts` (673 lines)**
`app/chat/sidebar/projects/` — `workspace-groups.ts` 673 · `session-project-label.ts` 42 ·
`projects/index.ts` 29, plus its only blocker `app/chat/sidebar/order.ts`.
Its per-file blocker is a sibling, so it is a **cluster that can move whole**, not a
knot. The real question is its size: batch [04](04-workspace-groups-split.md) already
split the membership core out of it (see the note at the top of
`store/projects/membership.ts`).
*Decision:* move the cluster to `application/projects/` as-is, or split it further first.

**E · Does `app/routes.ts` sink another layer?**
`app/open-session.ts` 177 is blocked only by `app/routes.ts`, and
`app/session/hooks/session-context-drift.ts` 117 is blocked by it too. Batch
[11](11-route-vocabulary.md) already sank `lib/routes`; `app/routes.ts` is the app-side
remainder.
*Decision:* sink it a layer, or accept it as app-level policy — it blocks more than
one file.

### Settled: these stay at rank 4/5, and that is correct

Not decisions — conclusions, recorded so nobody re-opens them:

- `app/tour/` (`engine.ts` 388 and `collect-targets.ts`): batch
  [02](02-tour-to-app.md) moved it **up** into `app/` on purpose. It drives spotlights
  over the live UI; it can never sink.
- `components/assistant-ui/embeds/providers/*` (7 files, all small): each pulls its own
  logo component. Presentation, and correctly at rank 4.
- `components/composer/text-utils.ts` 232: reaches `directive-text.tsx` and the composer
  rich editor. Presentation.
- `components/pet/roam-behavior.ts` 98: presentation.
- `app/session/hooks/use-session-actions/utils.ts` 42: a re-export barrel for app-side
  consumers, deliberately app-side (batch 16c).

## Batch 05 is a different objective

[`05-hermes-barrel-removal.md`](05-hermes-barrel-removal.md) removes the
`@/hermes` compatibility barrel. It pays off **no** ledger entry and is not part
of the batches above — it is in this directory so the eventual policy document sees
the whole mechanical stack in one place, and because it shares this file's rules.

It has one ordering constraint that matters: it touches 240 files, so it must run
**entirely before or entirely after** batches 01–04, never interleaved. Batch 05's
own document argues for doing it first.

## Run them in order, one at a time

Not a style preference — two batches edit the same files. `01` and `03` both
repoint `app/session/hooks/use-session-actions/session-create.ts`, and every
batch regenerates the same ledger file. Sequential execution is what makes them
independent; running two at once will produce conflicts that look like bugs.

## The rules every batch shares

1. **Never widen the ledger.** It is the record of a problem, not a place to
   record permission. If a move needs an edge that is not already listed, stop
   and report — the batch is wrong, not the guard.
2. **Regenerate, do not hand-edit.** Every entry is keyed by the importer's path
   and the specifier as written, so any file that moves changes the ledger's
   contents. Run `npm run ledger:layers` from `apps/desktop` when the batch is
   done, and commit the result with the move.
3. **No behaviour change.** These are relocations. If a move turns out to need a
   signature change, a merge into an existing module, or a split, it does not
   belong in a mechanical batch — stop and report.
4. **Do not touch in-flight work.** `apps/desktop/src/agentbox/`,
   `apps/desktop/src/plugins/agentbox-lab/`,
   `docs/architecture/acp-desktop-phase1-design.md` and
   `docs/desktop-src-tree.md` are untracked work in progress. Never read,
   modify or stage them.
5. **Stage with explicit pathspecs.** Never `git add -A`, `git add .`, `git reset`
   or `git stash`. Stage the files the batch actually changed and nothing else.
6. **Keep lint clean, minimally.** Import order changes when a specifier changes.
   `npx eslint --fix` on the files the batch touched is fine, but check the
   resulting diff is import lines only — this config's `--fix` can also rewrite
   unrelated statements.

## How to verify any batch

```bash
cd apps/desktop
npm run typecheck
npm run test:ui                                     # renderer project
npx vitest run --project ui src/dev/contracts/renderer-layers.test.ts
npm run ledger:layers                               # then commit the ledger
npm run test:ui                                     # once more, ledger must not move
```

`test:ui` is the renderer project (772 files / 7,462 tests). Plain `npm test`
runs **both** vitest projects and will never match a renderer-only number; two
electron loopback tests fail environmentally there and are unrelated.

The second `test:ui` matters: if the ledger is stale, `renderer-layers.test.ts`
fails with "records no debt that has already been paid", and that failure is the
batch telling you it did not finish.
