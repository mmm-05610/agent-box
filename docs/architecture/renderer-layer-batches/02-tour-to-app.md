# Batch 02 — `lib/tour/` moves to `app/tour/`

**Edges paid off: 2.** Shared rules and the verification recipe:
[README](README.md).

## Why

`lib/tour/` is the guided-tour feature: a driver engine, DOM target collection,
a spotlight-blur renderer, its CSS, and the `runTour` entry points. It contains
no pure helpers that anything below needs — it drives the UI. `app/` is where a
feature that owns DOM interaction belongs, and nothing under it may be imported
back down.

## The move

`lib/tour/` → `app/tour/` — the whole directory, 7 files:

```
app-tour.css
collect-targets.ts
engine.ts
engine.test.ts
index.ts
run-tour.ts
spotlight-blur.ts
```

Importers to repoint (5, all `app/`):

- `app/overlays/overlay-split-layout.tsx`
- `app/settings/config-field.tsx`
- `app/settings/primitives.tsx`
- `app/session/hooks/use-message-stream/gateway-event/desktop-bridge.ts`
- `app/chat/right-rail/preview-tour.ts`

## Why it is safe to move up

Nothing below `app/` imports it. A search for `lib/tour` also matches two things
that are **not** imports and must be left alone:

- `lib/tour/index.ts:10` — a doc comment inside the module itself, showing usage.
- `dev/contracts/renderer-layers.debt.ts` — the ledger entries this batch pays
  off. The ledger is regenerated, not edited.

The directory is self-contained: `run-tour.ts` imports `./collect-targets` and
`./spotlight-blur`, `engine.ts` imports `./collect-targets`, and `index.ts`
re-exports its siblings. No file in it imports outside the directory except
`run-tour.ts`'s two upward edges, which this move removes.

## Steps

1. `git mv lib/tour app/tour`.
2. Repoint the 5 importers above from `@/lib/tour` to `@/app/tour`.
3. `run-tour.ts` imports its stylesheet as `import './app-tour.css'` — a sibling
   import, so it stays correct. Do not touch it.
4. `npm run typecheck`.
5. `npm run ledger:layers`, then `npm run test:ui`.

## Ledger

Two lines disappear, both with importer `lib/tour/run-tour.ts`:

```
lib/tour/run-tour.ts -> @/app/chat/right-rail/preview-tour
lib/tour/run-tour.ts -> @/store/pane-focus
```

After the move those imports are `app → app` and `app → store`, both downward.
Note the second one: `@/store/pane-focus` is a legitimate downward import from
`app/`, which is exactly why moving the file is the fix rather than changing the
import.

## Stop conditions

- A file outside `app/` turns out to import `lib/tour` — that would mean the move
  adds an edge instead of removing one. Report and revert.
- The tour's CSS does not load after the move. The relative import should keep
  working; if it does not, report rather than inventing an alias.
