# P20 evidence — work status panel (shell, process card, floating placement)

Work order: [`P20-work-status-panel.md`](../work-orders/P20-work-status-panel.md)
Paired backend orders: **59** (hook schema) / **52** (plan/todo) — still pending
upstream; every surface that waits on them is documented here, not faked.

## Delivered

- `features/chat/work-status.ts` — pure facts→presentation layer:
  `workStatusElapsedSeconds` (from the service's own `emittedAt` stamp, never a
  local guess; null stays null), `formatWorkStatusElapsed` (`m:ss`, unbounded
  minutes), `workStatusIsBusy` (queued/dispatched/running/stopping),
  `workStatusPendingQueue` (pending/dispatched/paused — terminal items are
  history), `workStatusLineParts` (assembled by availability, no zero/dash
  padding), `workStatusProcessFacts` (null → the card does not render).
- `application/session/wire-session-projection.ts` — the execution object now
  carries `since?: string`: the CURRENT state's own `emittedAt`, so a joining
  client inherits the replayed service stamp. Absent (local optimistic state)
  means "duration unknown".
- `features/chat/work-status-panel.tsx` — the panel: **collapsed single line**
  (state dot pulsing only while busy · state word · `Queue: N` · `m:ss`), click
  expands the **vertical card stack**, `×` closes, a quiet ghost button reopens.
  Floating top-left over the chat area (`absolute left-2 top-2`), animated with
  the existing `motion` dependency, styled only with existing tokens.
- `features/chat/work-status-pref.ts` — the user's collapsed/expanded/closed
  choice persists in `localStorage` (`agentbox.work-status-panel`), the same
  narrow presentation lease `panes.ts` holds.
- Mounted in `features/chat/agentbox-chat-view.tsx` (one line) with the
  binding's real projection + queue.
- i18n: new `workStatus` section (close/open panel, process card, queue count,
  per-state labels) in all six locales.
- Legacy HUD untouched: `app/windows/hud/**` zero diff (G6).

## Cards — the honesty boundary (G4)

Only the **process card** exists: turn state (+reason when the service sends
one), duration-in-state, and the pending queue items with their text. The four
reference cards without a data source are absent, not stubbed:

| Card | Data source | Status |
| --- | --- | --- |
| Git | wire v1 has no git face | field contract only: `branch` `changedFiles` `additions` `deletions` `ahead` `behind` (for the backend order) |
| Goals | harness plan/todo → backend order 52 | waiting |
| Sub-agents | "profile calls profile" — adjudicated, no order | waiting |
| Background | in-sandbox process list | no face |

## Tests

- `work-status.test.ts` — 9 pure cases: stamp-based elapsed (null when no
  stamp, clamped when the stamp is in the future), unbounded m:ss, busy set,
  pending queue filter, line assembly by availability, process-facts null.
- `work-status-panel.test.tsx` — 6 component cases: collapsed line from real
  facts, no-facts renders nothing (no empty shell, no ghost), expand→process
  card→queue items, close→ghost + persisted choice, reopen restores collapsed,
  expanded choice survives remount.
- Gates on the Windows tree: `tsc` all three projects exit 0; ui project
  **808/809 files pass** (809 files / 7840 tests — the only failure is the
  long-standing `cron-prompt.test.ts` POSIX-sh environmental baseline);
  electron project 35 failures are the known host-dependent set (darwin
  staging, POSIX fs/ssh/git semantics) — this delivery's diff touches none of
  them (no `electron/**`, no `scripts/**` changes).

## Live run — real service, real panel (11/11 PASS)

`apps/desktop/e2e/p20-panel-shot-driver.mjs` (new): starts the real Pacthold
Server (release Worker, no-model fixtures), registers one WSL workspace, seeds
two fast sessions, starts a slow turn, opens it through the sidebar (the user
path), and photographs the panel.

Result: **executed 11 → allOk=true; PASS 11 / FAIL 0** (`panel-results.json`).

Shots (this directory):

- `01-panel-collapsed.png` — panel floating top-left over the open session:
  `Completed 0:00` with static dot — the state and duration are the service's
  own records. (The slow fixture answered early this run, so the captured
  state is `completed` rather than `running`; the running/pulse behaviour is
  pinned by unit tests and the dot logic is identical.)
- `02-panel-expanded.png` — expanded stack: PROCESS card with the same stamp
  and state word, no invented rows; no Git/Goals/Sub-agents/Background shells.
- `03-panel-closed-ghost.png` — closed: the panel is gone, the ghost affordance
  sits in the corner, transcript unobstructed.

Fit (G2): the panel uses the same border/panel/stroke tokens and text scale as
the surrounding chat surface and the composer below it in the same shots — no
new visual language, no new dependency (`motion` was already in the tree).

## What remains after this delivery

- Git/goals/sub-agents/background cards render when their backend faces land
  (each is a named slot in `work-status.ts`, not an improvisation).
- The reference Git-card interaction (branch dropdown with search/checkmark,
  uncommitted-changes warning, focus refresh) is implemented when the git face
  exists — the display layer cannot fake it today.
