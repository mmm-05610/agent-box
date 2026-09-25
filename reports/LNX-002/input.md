# LNX-002 — input registration

Recorded 2026-09-21 ~18:05 +08:00 by the LNX-002 executor, **before** any write to a
candidate tree. All values read with read-only git commands.

## Task-declared starting points vs measured

| Role | Ref | Task-declared SHA | Measured SHA | Drift |
| --- | --- | --- | --- | --- |
| backend runtime line | `feature/env-provider-runtime` | `a7b7b6ff15ab127a168ec3715bb5eb4414aa8aaa` | `a7b7b6ff15ab127a168ec3715bb5eb4414aa8aaa` | **none** |
| backend service line | `feature/env-provider-v1` | `003b52b2b18a86547d2819ea8875095442d2011b` | `003b52b2b18a86547d2819ea8875095442d2011b` | **none** |
| desktop chat line | `feature/agentbox-desktop-product` | `08b4eac7fe10aacc3220cca94c52659aaf043cc5` | `08b4eac7fe10aacc3220cca94c52659aaf043cc5` | **none** |
| desktop settings line | `feature/agentbox-desktop-settings` | `01083212aaade2ead3a1be9323943ea3eae3284e` | `01083212aaade2ead3a1be9323943ea3eae3284e` | **none** |

Merge base of the two backend lines: `a4f82566f6718c4af0c58062a44c2107e04e6106`.

## Repository / main state (read-only)

| Entry | Real path | Checked-out branch | HEAD | Dirty work observed |
| --- | --- | --- | --- | --- |
| `repos/backend` | `/home/maoqh/projects/agent-box` | `studio-backend` | `a9f749f6ff8c7595ae714f2fad300158339fb73a` | untracked `.zcode/`, untracked `docs/product/*`, `docs/research/*`, `docs/validation/*` |
| `repos/desktop` | `/home/maoqh/projects/agent-box-desktop-next` | `main` | `e08fa034f2477a2d6cddfdfa6aa1ed9381558859` | ` M docs/architecture/README.md`, ` M docs/night-work-planning/README.md`, untracked `apps/desktop/src/agentbox/`, `apps/desktop/src/plugins/agentbox-lab/`, several `docs/*` |
| `repos/studio-legacy` | `/home/maoqh/projects/agent-box-studio` | `studio-shell` | (not touched by this task) | large uncommitted work — **preserved, not touched** |

Backend publishing `main` = `6c14ea8db8130f1e219328835840b4159fe8c9e7`
(commit `feat: Studio backend core with Official Session Store and five real harnesses (#67)`).
Contains #66/#67; per D-0020 / `LNX-001-review.md` these are **not** absorbed wholesale.

Desktop `main` = `e08fa034f2477a2d6cddfdfa6aa1ed9381558859`.

## Pre-existing integration paths / branches

- `worktrees/integration-linux/` did **not** exist.
- `integration/*` branch did **not** exist in either repository.
- No `/home/maoqh/projects/agent-box-integration*` directory existed.
⇒ Nothing to take over or reuse; both worktrees are newly created (see below).

## Worktrees created (this task)

| Worktree path | Repo | New branch | Start SHA |
| --- | --- | --- | --- |
| `worktrees/integration-linux/backend` | backend | `integration/linux-native-0` | `a7b7b6ff15ab127a168ec3715bb5eb4414aa8aaa` (runtime) |
| `worktrees/integration-linux/desktop` | desktop | `integration/linux-native-0` | `08b4eac7fe10aacc3220cca94c52659aaf043cc5` (chat) |

**Path-shape note.** The task named `worktrees/integration-linux/backend|desktop`.
`ordessa/worktrees/` otherwise holds *symlinks* to real directories under
`/home/maoqh/projects/`. These two worktrees are created as **real directories at the
literal authorized path** (no extra symlink indirection), because the task authorizes
exactly that path and `ordessa/` is not itself a Git repository. Real product worktrees
in place at project root were untouched.

## Source snapshot identity (also the protocol inputs)

| Line | wire contract artifact | sha256 prefix |
| --- | --- | --- |
| service | `docs/server-round1/fullstack/contract/wire-v1.schema.registered-c4255b31.json` | `c4255b31` |
| runtime | `docs/server-round1/fullstack/generated/wire-v1.schema.snapshot-33methods-stale.json` | `a1bd52a4` (self-declared stale, 33 methods) |
| chat | `docs/desktop-product-delivery/contracts/wire-v1/generated/wire-v1.schema.json` | `1a3604ee` |
| settings | same path as chat | `2dd26561` |

These four SHAs are the **input snapshot**, not an output. They are re-measured in
`protocol.md` after integration.
