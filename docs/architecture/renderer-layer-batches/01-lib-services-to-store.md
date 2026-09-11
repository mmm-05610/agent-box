# Batch 01 — four stateful `lib/` services move to `store/`

**Edges paid off: 6.** Shared rules and the verification recipe:
[README](README.md).

## Why these four

`src/lib` is the renderer's leaf layer (`renderer-layers.ts`, rank 0). A module
that reads a store and writes through it is not a helper — it is state. These
four all read `@/store/*` and none of them is a pure function, so each one is a
store living one layer too low.

They are grouped together because they are small, unrelated to each other, and
share no importer with any other batch except where noted below.

## The moves

| from | to | importers to repoint | edges |
| --- | --- | --- | --- |
| `lib/oneshot.ts` (58 lines) | `store/oneshot.ts` | `store/review.ts` | 2 |
| `lib/yolo-session.ts` (77 lines) | `store/yolo-session.ts` | `app/contrib/controller.tsx`, `app/session/hooks/use-session-actions/session-create.ts`, `app/session/hooks/use-prompt-actions/slash.ts` | 2 |
| `lib/guarded-model-switch.ts` (90 lines) | `store/guarded-model-switch.ts` | `app/session/hooks/use-model-controls.ts`, `extension/sdk/index.ts` | 1 |
| `lib/session-export.ts` (59 lines) | `store/session-export.ts` | `app/command-center/index.tsx`, `app/chat/sidebar/session-actions-menu.tsx` | 1 |

Every destination is currently empty, so these are plain moves — no merge into an
existing module, no file split.

Why each is safe to move *up* rather than needing a lower-layer fix: nothing
under `lib/` imports any of them. Verified with
`rg -l "lib/<name>'" --glob '!*.test.*'` — the importer lists above are
exhaustive, and every one sits in `store/`, `app/` or `extension/`.

## Steps

1. `git mv` each file to its destination. Preserve contents exactly; only the
   import specifiers change.
2. Repoint every importer's specifier from `@/lib/<name>` to `@/store/<name>`.
   Some files import two or more of these — check the whole import block, not
   just the first match.
3. Repoint their tests too if the tests live under `src/lib/` and import the
   module by relative path. Tests are not part of the layer guard, but they must
   still compile.
4. `npm run typecheck`.
5. `npm run ledger:layers`, then `npm run test:ui`.

## Ledger

Six lines disappear from `renderer-layers.debt.ts`, all in the `lib/` group — the
ones whose specifier is `@/store/gateway`, `@/store/session`,
`@/store/notifications` or `@/store/haptics` and whose importer is one of the
four files above. Do not delete the lines by hand; regenerating is authoritative
and idempotent.

## Watch out

- `store/review.ts` is also touched by the pane/layout work (K1) in
  [`../renderer-layer-boundary.md`](../renderer-layer-boundary.md). If that work
  is in flight, do this batch first or after, never alongside.
- `extension/sdk/index.ts` is the plugin ABI barrel and is the subject of K3.
  This batch changes one import line in it; keep the change to that line.
- `app/session/hooks/use-session-actions/session-create.ts` is also touched by
  batch [`03`](03-project-session-moves.md). That is the overlap that makes these
  two sequential.

## Stop conditions

- A move needs an existing module to be merged into, or a file to be split —
  report instead. (`lib/haptics.ts` and `lib/sound/completion-sound.ts` are in
  that category and are deliberately **not** in this batch.)
- Something under `lib/` turns out to import one of the four — that would mean
  the move adds an edge instead of removing one. Report and revert.
