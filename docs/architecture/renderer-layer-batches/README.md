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
