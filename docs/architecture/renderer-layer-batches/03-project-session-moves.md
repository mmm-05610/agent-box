# Batch 03 — two small moves in the project/session area

**Edges paid off: 3.** Shared rules and the verification recipe:
[README](README.md).

## Move A.0 — the two type names the shape needs (amendment, 2026-09-12)

**This step exists because Move A as first written did not work, and the executor was
right to stop.** `NewSessionPlacement`'s members name two `store/` types —
`dir: TileDock` and `route?: AgentProfileRoute | null`. Moved to `types/` (rank 0)
on its own, the interface would pull two `types → store` lines into the ledger: it
would *add* 2 to remove 2, a net zero. Sink the names first, then the shape moves
clean.

**A.0a — `SplitDir` and `TileDock` are pane vocabulary (new file `types/pane-dock.ts`).**

```
store/session-states/session-state-registry.ts:474   export type SplitDir = 'bottom' | 'left' | 'right' | 'top'
store/session-states/session-state-registry.ts:478   export type TileDock = 'center' | SplitDir
```

Both are bare unions over rank-0 needs — nothing else. Move them verbatim to
`types/pane-dock.ts`, and have `session-state-registry.ts` re-export them
(`export type { SplitDir, TileDock } from '@/types/pane-dock'`). Nine production
files read them today, and every one of them reads them through
`@/store/session-states` or that registry (`store/route-tiles.ts`,
`store/session-states/tile-operations.ts`, `app/chat/{new-session-drag,session-drag,pane-mirror}.ts`,
`app/chat/sidebar/{chrome.tsx,split-submenu.tsx}`,
`app/session/hooks/use-session-actions/session-create.ts`) — the re-export is what
keeps all nine where they are. `store → types` is downward: no new line.

**A.0b — the route half is already at rank 0, so name it directly.**

`AgentProfileRoute` is an alias of `SessionOwnerRoute`
(`store/profile/new-chat-state.ts:12`), and `SessionOwnerRoute` **already lives on
the `@/types/session` leaf** — that is the whole point of that leaf's header comment.
So the moved interface declares `route?: SessionOwnerRoute | null` and imports it
from `@/types/session`. The store keeps its own `AgentProfileRoute` alias, which is
store-side naming for store-side readers; nothing about it has to move, and the two
names are the same type, so no caller changes.

*Why not move `AgentProfileRoute` to `types/` too:* it is an alias, and moving an
alias gives the same type two rank-0 spellings after `SessionOwnerRoute` is already
there. `store/session/types.ts:20` already marks its own alias `SessionProfileRoute`
deprecated for exactly that reason — do not add a second one.

## Move A — `NewSessionPlacement` is a shape, not a drag handler

`NewSessionPlacement` is an interface declared at
`app/chat/new-session-drag.ts:63`, inside a 500-line drag-and-drop module. It
describes where a newly created session lands, and **two `store/` files need it**
as a parameter type — which is what makes an app-layer module the wrong address
for it.

| | |
| --- | --- |
| from | `app/chat/new-session-drag.ts:63` (the interface only) |
| to | `types/session-placement.ts` (imports `TileDock` from `@/types/pane-dock`, `SessionOwnerRoute` from `@/types/session`) |
| repoint | `app/chat/new-session-drag.ts`, `app/chat/sidebar/projects/workspace-group.tsx`, `app/chat/sidebar/project-dialog.tsx`, `store/projects/crud.ts`, `store/projects/dialogs.ts` |
| edges | 2 |

Move the interface verbatim — its members, its doc comment, nothing else.
`app/chat/new-session-drag.ts` keeps every behaviour it has and gains an import.

Do **not** leave a re-export behind in `new-session-drag.ts`. The shape is not a
drag concern, and a re-export would give it two addresses, so app-side importers
repoint to `types/` like the store-side ones do.

## Move B — `session-project-label` is a sidebar label

| | |
| --- | --- |
| from | `lib/session-project-label.ts` (40 lines) |
| to | `app/chat/sidebar/projects/session-project-label.ts` |
| repoint | `app/chat/sidebar/session-row.tsx` (the only importer) |
| edges | 1 |

The module is one pure function, `sessionProjectLabel(session, projects) → null | string`,
whose whole job is naming the project line on a sidebar card. Its only non-leaf
dependency is `liveSessionProjectId` from
`app/chat/sidebar/projects/workspace-groups` — a `lib → app` edge. Landing it
beside that file turns the import into a sibling one.

Because the destination is the same directory as the source of its import, change
the specifier to `./workspace-groups` once moved.

## Steps

1. Do Move A.0 (both halves), Move A, then Move B. Repoint at every step; do not
   batch the edits. A.0 moves type declarations only — `typecheck` after it must
   pass with zero other changes, and the ledger must be **unchanged** (those two
   names going down is not an edge; the edge it unblocks is Move A's).
2. `npm run typecheck`.
3. `npm run ledger:layers`, then `npm run test:ui`.

## Ledger

Three lines disappear:

```
store/projects/crud.ts -> @/app/chat/new-session-drag
store/projects/dialogs.ts -> @/app/chat/new-session-drag
lib/session-project-label.ts -> @/app/chat/sidebar/projects/workspace-groups
```

Note that Move B's line is keyed by the **old importer path**. Once the file
moves and regenerates, the line does not exist in any form — a moved file's new
path is not an upward importer any more.

## Watch out

- `app/chat/new-session-drag.ts` was recently touched by the type-sinking round;
  read the current file, not a remembered one.
- Both moves touch files under `app/chat/sidebar/projects/`, and Move B's target
  directory is the subject of batch [`04`](04-workspace-groups-split.md). Run 03
  and 04 in order.

## Stop conditions

- `NewSessionPlacement` turns out to be referenced by a `store/` file through a
  different spelling than the five above — report the full list rather than
  repointing only what this document names.
- `session-project-label.ts` turns out to have more than one importer.
