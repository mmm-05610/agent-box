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
`app/session/hooks/use-message-stream/gateway-event/` — `session-info.ts` 460 ·
`input-requests.ts` 326 · `status.ts` 227 · `lifecycle.ts` 106 (+ `types.ts`,
`message-stream.ts`).
This directory turns gateway events into domain facts. It is the normalisation layer
a harness-neutral core has to own. Today it reaches `use-prompt-actions/rewind.ts`
and `use-prompt-actions/utils.ts` — two app-side hooks — which is what pins it.
*Decision:* is normalisation a core concern (`application/harness/`) or a session-hook
concern? Answering this settles the four files **and** the two hooks they drag.

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
