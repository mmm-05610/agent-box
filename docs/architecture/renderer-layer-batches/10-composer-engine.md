# Batch 10 — the composer engine leaves `app/`

**Edges paid off: 22.** Shared rules and the verification recipe:
[README](README.md). Take the ledger's number when you start and subtract 22.

This is knot 1 from
[`../renderer-layer-boundary.md`](../renderer-layer-boundary.md) §2 — **but not the
knot that document describes.** Read the next section before the steps: the fix is
smaller and more mechanical than "merge the two composers", and one of the 23
edges this knot contains cannot be paid here at all.

## What this knot actually is

The boundary document says: *"There is a second composer … either it collapses
into the app's composer, or the shared part is extracted so both sides use one
implementation."* Read the import list and a different shape appears.

`components/assistant-ui/thread/user-edit-composer.tsx` is 929 lines and has
**exactly one consumer** — `components/assistant-ui/thread/index.tsx`, its own
sibling. It is not a rival implementation of the main composer; it is the
transcript's edit-in-place box, and it is perfectly happy where it is. What it
cannot do is reach the engine:

```
components/assistant-ui/thread/user-edit-composer.tsx         (929)
├── 15 modules from app/chat/composer/           the composer engine
└── 2 app actions: use-composer-actions (722) · use-prompt-actions (1128)
```

`app/chat/composer/` is 62 files and 12,446 lines, and it is not one thing
either — the same finding 08 made about `components/pane-shell/`:

```
  ~700 lines   no imports at all              drop-affordance · undo-history · path-refs
                                              url-refs · use-live-completion-adapter
  ~2,500       lib + types only               inline-refs · composer types · the undo and
                                              emoji-completion hooks · slash-refs
  ~4,000       React + stores                 focus · rich-editor · trigger-popover
                                              directive-actions · text-utils · scope …
  ~4,500       the app's own composer         index.tsx · attachments · controls · model-pill
                                              status-stack · use-composer-draft · …
```

**The engine has a consumer below `app/`, so the engine moves — not the
composers.** Nobody has to unify two implementations, and
`user-edit-composer.tsx` does not change a line.

### The 23 lines in this knot, and the 22 in this work order

| the ledger line | step |
| --- | --- |
| `components/assistant-ui/clarify-tool.tsx -> @/app/chat/composer/focus` | 10b |
| `components/assistant-ui/inline-preview-directive.tsx -> @/app/chat/composer/focus` | 10b |
| `components/assistant-ui/thread/changed-files-card.tsx -> @/app/chat/composer/scope` | 10b |
| `user-edit-composer.tsx -> @/app/chat/composer/directive-actions` | 10b |
| `user-edit-composer.tsx -> @/app/chat/composer/drop-affordance` | 10a |
| `user-edit-composer.tsx -> @/app/chat/composer/focus` | 10b |
| `user-edit-composer.tsx -> @/app/chat/composer/hooks/use-at-completions` | 10b |
| `user-edit-composer.tsx -> @/app/chat/composer/hooks/use-composer-trigger` | 10b |
| `user-edit-composer.tsx -> @/app/chat/composer/hooks/use-composer-undo` | 10a |
| `user-edit-composer.tsx -> @/app/chat/composer/hooks/use-emoji-completions` | 10a |
| `user-edit-composer.tsx -> @/app/chat/composer/hooks/use-slash-completions` | 10b |
| `user-edit-composer.tsx -> @/app/chat/composer/inline-refs` | 10a |
| `user-edit-composer.tsx -> @/app/chat/composer/path-refs` | 10a |
| `user-edit-composer.tsx -> @/app/chat/composer/rich-editor` | 10b |
| `user-edit-composer.tsx -> @/app/chat/composer/text-utils` | 10b |
| `user-edit-composer.tsx -> @/app/chat/composer/trigger-popover` | 10b |
| `user-edit-composer.tsx -> @/app/chat/composer/undo-history` | 10a |
| `user-edit-composer.tsx -> @/app/chat/composer/url-refs` | 10a |
| `user-edit-composer.tsx -> @/app/chat/hooks/use-composer-actions` | 10b |
| `user-edit-composer.tsx -> @/app/session/hooks/use-prompt-actions` | **NOT IN THIS BATCH** — see below |
| `store/suggestion-providers/cron.ts -> @/app/chat/composer/focus` | 10c |
| `store/suggestion-providers/github.ts -> @/app/chat/composer/focus` | 10c |
| `store/suggestion-providers/skill.ts -> @/app/chat/composer/focus` | 10c |

Note the last row of the "not here" item: the three providers can only be paid by
*moving them up*. `focus.ts` cannot sink to `lib/` — `requestComposerFocus` calls
`resolve()`, which calls `resolveActive()`, which reads `$hoveredTreeGroup` from
the pane tree. The DOM-focus bus is presentation behaviour, so the providers that
drive it belong above the store, not in it.

### Why the twenty-third edge is not here

`user-edit-composer.tsx` imports `@/app/session/hooks/use-prompt-actions`, and
that hook cluster cannot leave `app/` yet. Followed to the bottom:

```
app/session/hooks/use-prompt-actions/index.ts        (1128)
├── ./submit.ts   → app/session/hooks/session-context-drift.ts
│                 → app/session/hooks/use-session-actions/utils.ts
├── ./slash.ts    → ./resolve-target-session.ts → use-session-actions/utils.ts
├── ./rewind.ts   → ./utils.ts ...
└── ./queue-if-busy.ts
```

`session-context-drift.ts` imports `isNewChatRoute` / `routeSessionId` from
`@/app/routes`, and `use-session-actions/utils.ts` is a barrel over the session
actions' own helpers. Both are *fixable* — the route classifiers are pure and the
helpers are nearly dependency-free — but they are a different domain from the
composer, and dragging it in would put this batch inside the session-actions
files that batches 01, 03 and 04 already touch. It is left as its own work order,
after the route vocabulary sinks. One edge, and it is the last composer edge.

## How the file list was derived — re-derive it, do not trust it

The list below is a **transitive closure with a fixpoint**, not a reading:

1. seed with the seven consumers that carry the 23 edges;
2. follow every import that lands inside `app/chat/composer/`,
   `app/chat/hooks/use-composer-actions.ts` or
   `app/session/hooks/use-prompt-actions/`;
3. a file may move only if **every** dependency outside the closure is at
   `components/` (rank 4) or below. Nothing may end up importing `@/app/…`;
4. fixpoint: if a dependency has to stay, everything that imports it stays too.

`app/chat/composer/focus.ts` is the one file that decided the shape: it reads
`@/components/pane-shell/tree/store`, so it can live at `components/` and no
lower — which is what pushes it, `scope`, `text-utils`, `use-slash-completions`
and `contrib` out of `lib/` and into `components/`.

Re-run it rather than believing the table. The seed list is the seven consumers,
the domains are the three path prefixes, and the rule is step 3. If a file's
answer differs, the tree moved: report, do not improvise a destination.

## 10a · the pure half → `lib/composer/` — 9 files

Nothing below them is above rank 0, so they can sit at the bottom:

```
app/chat/composer/drop-affordance.ts                 (3)
app/chat/composer/undo-history.ts                  (127)
app/chat/composer/path-refs.ts                     (104)
app/chat/composer/url-refs.ts                      (104)
app/chat/composer/inline-refs.ts                   (195)
app/chat/composer/types.ts                          (74)   → lib/composer/types.ts
app/chat/composer/hooks/use-composer-undo.ts       (120)
app/chat/composer/hooks/use-emoji-completions.ts   (123)
app/chat/composer/hooks/use-live-completion-adapter.ts (158)
```

`hooks/` above means `lib/composer/hooks/`, mirroring where the files came from.
Three hooks stay behind in `app/chat/composer/hooks/` (`use-composer-draft`,
`use-composer-esc-cancel`, `use-composer-trigger` — the last moves to
`components/composer/hooks/`); a half-moved directory is the point, not an
accident: what moves is what a consumer below `app/` needs.

`types.ts` is the composer's shape module — `DroppedFile`, `ChatBarState`,
`ChatBarProps`, the voice shapes. It moves with the engine so the engine's public
types stay beside it.

## 10b · the React and state half → `components/composer/` — 14 files

Every one of these imports something at rank 1–4 and nothing at rank 5:

```
app/chat/composer/focus.ts                         (421)   reads pane-shell/tree/store
app/chat/composer/rich-editor.ts                   (775)   reads assistant-ui/directive-text
app/chat/composer/text-utils.ts                    (232)   reads store/reactions-enabled
app/chat/composer/scope.tsx                         (58)   reads store/{composer,prompts,session}
app/chat/composer/trigger-popover.tsx              (248)   reads components/ui/*
app/chat/composer/directive-actions.tsx            (159)   reads assistant-ui/directive-text
app/chat/composer/composer-utils.ts                (220)   reads store/session
app/chat/composer/completion-drawer.tsx             (52)   reads components/chat/composer-dock
app/chat/composer/slash-refs.ts                    (106)   reads assistant-ui/directive-text
app/chat/composer/contrib.ts                       (162)   reads extension/contrib/react/*
app/chat/composer/hooks/use-at-completions.ts      (240)
app/chat/composer/hooks/use-composer-trigger.ts    (479)
app/chat/composer/hooks/use-slash-completions.ts   (303)   reads store/session
app/chat/hooks/use-composer-actions.ts             (722)   reads store/{composer,notifications}
```

Two of these are dragged in rather than named by a consumer, and the closure is
the only reason they are here: `composer-utils.ts` (via `use-composer-trigger`)
and `completion-drawer.tsx` (via `trigger-popover`). They must move or their
dependants cannot.

**Two pairs are load-bearing and should be checked before you move anything:**
`focus.ts`'s only upward import is `$hoveredTreeGroup`, used by
`visibleChatTarget()` — the *request* half (`requestComposerFocus`,
`requestComposerInsert`, `requestComposerSubmit`, …) is pure but calls `resolve()`
through `requestComposerFocus`, so the file cannot be split along that line. It
moves whole. Same for `rich-editor.ts`: it is 775 lines and everything else in
the engine reads it, which is why it is the batch's centre of gravity.

## 10c · the suggestion providers move up — 5 files, 3 edges

```
store/suggestion-providers/{cron,github,skill,mcp,repair}.ts
  → components/composer/suggestion-providers/
```

Only `cron`, `github` and `skill` import `focus.ts` — those three are the three
edges. `mcp.ts` and `repair.ts` come along because leaving them behind would make
`store/suggestion-providers/` mean something different from its name: this is one
registry's worth of providers (`registerDraftProvider` / `offerSuggestions`), and
three of the five are UI behaviour. The registry itself —
`store/composer-suggestions.ts` — stays in `store/`, which is why the move is
downward-safe: the providers import it, it never imports them.

Their loaders repoint (three files, all by explicit path — the providers register
themselves as a side effect of being imported):

```
app/chat/composer/hooks/use-composer-draft.ts   4 side-effect imports
app/session/hooks/use-message-stream/gateway-event/tools.ts   reportMcpToolResult, invalidateSkillSuggestionIndex
components/assistant-ui/mcp-setup-tool.tsx                  invalidateMcpSuggestionIndex
```

`invalidateSkillSuggestionIndex` is imported by `tools.ts` from the `skill`
provider — a *function*, not just a side effect — so its new path must be
resolvable from `app/` (it is: `app/` may import `components/`).

## 10d · break the composer → prompt-actions coupling — 1 type

`lib/composer/types.ts` cannot import from `app/`, and today it does:

```ts
// app/chat/composer/types.ts:3
import type { SubmitTextOptions } from '@/app/session/hooks/use-prompt-actions/utils'
```

`SubmitTextOptions` is declared in that barrel (`utils.ts:703`) and it is a pure
data shape — `attachments?: ComposerAttachment[]`, `composerScope`, and nothing
else. Sink the **declaration** to `types/composer.ts`, beside `ComposerAttachment`
and `QuickModelOption`, and have `use-prompt-actions/utils.ts` re-export it:

```ts
export type { SubmitTextOptions } from '@/types/composer'
```

Its fifteen consumers — `app/chat/index.tsx`, `app/chat/session-tile-actions.ts`,
`app/chat/composer/status-stack/*`, `app/session/hooks/use-background-queue-drain.ts`,
the prompt-actions files, two tests — keep their specifier and do not move. Then
`app/chat/composer/types.ts` imports it from `@/types/composer` and the coupling
is gone.

This is the same "sink the data, leave the wiring" step as 09b, and it is a
prerequisite: without it `types.ts` cannot leave `app/` at all.

## The repoint surface — read this before you search

**Forty production files import something this batch moves** (81 including
tests), spread over:

```
17  app/chat/composer/          4  app/chat/            3  app/chat/right-rail/
 3  app/hud/                    3  components/assistant-ui/
 2  app/contrib/                2  components/assistant-ui/thread/
 1  app/chat/hooks/             1  app/contrib/hooks/   1  app/hooks/
 1  app/right-sidebar/review/   1  app/session/hooks/   1  extension/sdk/
```

That last one is `extension/sdk/index.ts`, which re-exports `COMPOSER_AREAS` from
`app/chat/composer/contrib.ts` — batch 09 moves that const to
`lib/contribution-areas.ts` and repoints the same line. **10 and 09 therefore
share two files** (`extension/sdk/index.ts`, `app/chat/composer/contrib.ts`) and
must not run concurrently; the collision check says so, and the manifest is where
it is recorded.

Enumerate the importers with the resolver, never with a specifier grep:

```bash
cd apps/desktop
node ../../.agents/skills/architecture-tree-report/scripts/arch-tree.mjs --move app/chat/composer/focus.ts --to components/
```

Relative spellings are everywhere in this directory (`'./focus'`, `'../composer/types'`,
`'./hooks/use-emoji-completions'`) and invisible to an alias grep. That miss has
already happened five times in this migration.

Move the sibling `*.test.*` files with their module; their own specifiers change
too. And when `dev/contracts/*` fails after a move, it is telling you a modelled
path changed — update the model, never the assertion.

## Verification

```bash
cd apps/desktop
npm run typecheck
npm run test:ui
npx vitest run --project ui src/dev/contracts/renderer-layers.test.ts
npm run ledger:layers
npm run test:ui                                     # again: the ledger must not move
```

Baseline: tests **775 files / 7466**. The ledger drops by **22** from whatever it
reads when you start.

The twenty-two lines that must be gone are the ones marked 10a/10b/10c in the
table at the top. `user-edit-composer.tsx -> @/app/session/hooks/use-prompt-actions`
stays, and so does exactly one line in `app/chat/composer/types.ts`'s old spot if
10d was skipped — if either is missing, a step was done by a route other than the
one written here.

## Stop conditions

- **A moved file still names `@/app/…`.** The closure was wrong, or a destination
  was picked by hand. Report the file and its import; do not add a re-export shim
  in `app/` to bridge it, which would keep the edge while looking green.
- **`focus.ts` looks like it can be split so the store providers import a pure
  half.** It cannot: `requestComposerFocus` resolves the target through
  `resolveActive()` and the pane tree. If you think you have found a clean split,
  the resolution path changed under you — report it rather than building it.
- **A provider in `store/suggestion-providers/` turns out to have a `store/`
  importer.** The move up would create a `store → components` edge. `mcp.ts` and
  `repair.ts` are checked; if a new one appeared, stop.
- **`app/chat/composer/index.tsx` — the app's own composer — turns out to need a
  file this batch is moving in the *other* direction.** It stays in `app/`; it may
  import `components/` and `lib/` freely. If it seems to need something moved up,
  the closure is wrong.
- **You find yourself moving files in `app/session/hooks/use-session-actions/`.**
  That is the twenty-third edge's chain, and it is a separate work order. Stop and
  report.
- Do not read, edit or stage `src/agentbox/`, `src/plugins/agentbox-lab/`,
  `docs/architecture/acp-desktop-phase1-design.md` or `docs/desktop-src-tree.md`.
