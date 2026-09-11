# Batch 04 — split `workspace-groups.ts`, keep the membership core in `store/`

**Edges paid off: 4.** Shared rules and the verification recipe:
[README](README.md).

**This is the only batch in the stack that is a refactor, not a relocation.**
Every other batch moves a whole file. This one divides an 849-line module along
a line that is determinate but has to be traced. If any part of the boundary is
unclear while you are doing it, stop and report the symbol — do not guess, and do
not duplicate a helper to avoid deciding.

## Why

`app/chat/sidebar/projects/workspace-groups.ts` mixes two jobs:

1. **Which project a session belongs to** — a pure question over
   `(session, projectList)`, answered by `liveSessionProjectId`, and the color
   derived from the same answer by `sessionProjectColor`. **`store/` needs this.**
2. **Building and overlaying the sidebar's project tree** — `overlayRepoLanes`,
   `mergeRepoWorktreeGroups`, `excludeProjectSessions`, `overlayLiveLanes`,
   `overlayLivePreviews`, `reconcileEnteredProjectSessions`. Only `app/` needs
   this.

Five `store/` edges exist because job 1 lives in an app module.

## What moves — the required set

Destination: **`store/projects/membership.ts`** (new file; the name is
provisional, the vocabulary pass comes later).

These must move, because `store/` imports them:

| symbol | kind |
| --- | --- |
| `SidebarProjectTree` | type — imported by `store/projects/{crud,refresh,scope}.ts` |
| `NO_PROJECT_ID` | const — imported by `store/projects/scope.ts` |
| `liveSessionProjectId` | function — imported by `store/projects/crud.ts` |
| `sessionProjectColor` | function — imported by `store/session-color.ts` |

`SidebarProjectTree` refers to `SidebarSessionGroup` and `SidebarWorkspaceTree`,
so those types travel with it even though only `app/` names them today.

## What moves with them — the private closure

Everything the four symbols above transitively need. Traced so far:

- `liveSessionProjectId` uses `kanbanWorktreeDir`, `isPathUnder`, `segments`.
- `sessionProjectColor` uses only `liveSessionProjectId`.
- `kanbanWorktreeDir` uses `KANBAN_DIR_RE`.

The rule for the rest:

- **Needed only by the moved set** → move it down.
- **Needed by both halves** → move it down and have the app half import it back.
  `app → store` is a legal direction; duplicating the helper is not. `segments`,
  `kanbanWorktreeDir` and `isPathUnder` are all in this category (the app half
  calls them at roughly lines 106, 321, 505 and 577).

**Nothing may be duplicated.** A copy left behind is a behaviour divergence
waiting to happen, and the guard cannot see it.

## What stays

Job 2 and its private helpers, including `DEFAULT_BRANCH_LABEL`,
`isDetachedSession`, `branchLaneId`, `sessionRecency`, `baseName`,
`sortWorktreeGroups`, `mergeRepoWorktreeGroups`, `sessionBucketId`,
`sessionMatchesProjectFilter`, `overlayRepoLanes`, `excludeProjectSessions`,
`overlayLiveLanes`, `overlayLivePreviews`, `reconcileEnteredProjectSessions`,
and helpers such as `pathKey`, `normalizePath`, `isWindowsPath`,
`comparisonSegments`, `laneRank`, `compareWorktreeGroups`, `livePathForRepo`.

## Importers to repoint

Six files import named symbols today:

- `store/session-color.ts`, `store/projects/crud.ts`, `store/projects/refresh.ts`,
  `store/projects/scope.ts` → all four needed symbols, to the new store module.
- `app/chat/sidebar/projects/entered-content.tsx`,
  `app/chat/sidebar/projects/model.ts` → split their imports: `SidebarProjectTree`
  (and any other moved type) comes from the store module, the rest stays local.

Six more files import from this module without showing up in a single-line
regex — `gateway-group-model.ts`, `gateway-groups.tsx`,
`use-entered-project-sessions.ts`, `projects/index.ts`, `project-menu.tsx`,
`workspace-group.tsx`. **Search for the specifier; do not work from that list.**
Multi-line imports, `import type`, and re-exports all count.

If a re-export exists (`export … from`), decide whether the store module is the
right address for it and report what you did.

## The test

`workspace-groups.test.ts` is 1,250 lines and covers both halves. Split it along
the same line:

- Moving to `store/projects/membership.test.ts`: `liveSessionProjectId` (line 474),
  `sessionProjectColor` (line 563), and the `project filter row rule (#97762)`
  block (line 1236) if it exercises a moved symbol.
- Staying: `baseName`, `kanbanWorktreeDir`, `sortWorktreeGroups`,
  `mergeRepoWorktreeGroups (visual enhancer)`, `overlayLiveLanes`,
  `overlayLivePreviews`, `excludeProjectSessions`.

**Do not delete or weaken an assertion.** If a block tests both halves, keep it
where the majority of its subject sits and repoint its imports.

## Steps

1. Trace the closure and write down the two symbol lists **before** editing, then
   report them.
2. Create `store/projects/membership.ts` with the moved symbols and their imports
   (`@/types/hermes` for `ProjectInfo`/`SessionInfo`, as the original had).
3. Delete them from the app module and import back what it still needs.
4. Repoint every importer.
5. Split the test file.
6. `npm run typecheck`.
7. `npm run ledger:layers`, then `npm run test:ui`.

## Ledger

Four lines disappear, all `store/`:

```
store/projects/crud.ts -> @/app/chat/sidebar/projects/workspace-groups
store/projects/refresh.ts -> @/app/chat/sidebar/projects/workspace-groups
store/projects/scope.ts -> @/app/chat/sidebar/projects/workspace-groups
store/session-color.ts -> @/app/chat/sidebar/projects/workspace-groups
```

A fifth workspace-groups edge — `lib/session-project-label.ts -> …/workspace-groups`
— belongs to batch [`03`](03-project-session-moves.md), which moves that importer
into `app/` and thereby turns the edge downward. Do not expect it here.

Run 03 before 04: both edit `store/projects/crud.ts`.

## Stop conditions

- You cannot tell whether a private helper belongs to the moved set. Report the
  helper and its call sites; do not duplicate it and do not move it on a guess.
- The path normalisation behaviour changes: Windows drive letters, UNC paths,
  `//wsl.localhost/...`, trailing separators, and `.worktrees/t_<hex>` kanban
  paths all have dedicated assertions in that test file. Any of them going red
  means the closure was traced wrong, not that the test is stale.
- More than the six named files turn out to import moved symbols — report the
  full list.
