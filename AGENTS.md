# AgentBox Server worktree

> **LNX-002 integration tree — historical vs current (2026-09-21)**
>
> This file came from the source lines (`feature/env-provider-runtime` ⊗
> `feature/env-provider-v1`) and was carried into this integration candidate with the
> code. Two things below are **superseded in this tree**. They are kept as history
> rather than deleted:
>
> 1. **Scheduling authority.** `docs/implementation/**` is **no longer** the sole
>    scheduling authority here (lines 6-12 below still say so — that is the source
>    line's wording). The authority for scheduling, work orders, decisions and reports
>    after the merge is **`ordessa/control/`**: `control/README.md`, `control/tasks/**`,
>    `control/decisions.md`, and this task's `control/reports/LNX-002/`. In this tree
>    `docs/implementation/**` is retained as a **historical scheduling record**; LNX-001
>    left its disposition (keep / drop / move to `archive/`) as an open question for I,
>    and LNX-002 does not decide it.
> 2. **"Windows owns persistent Profile/Session data."** That is a source-line
>    deployment statement. A Linux composition of this integration baseline has **no**
>    default SecretStore (`bootstrap/runtime.py` installs a platform store only for
>    `os.name == "nt"`), so the sentence does not describe this tree's current
>    capability. The measured gap is in
>    `control/reports/LNX-002/source-checkpoint.md` and pinned by
>    `tests/server/test_linux_default_secret_store_lnx002.py`.
>
> **Engineering constraints that still apply, unchanged**: Work Core stays
> provider-neutral; the Server composes plugins and plugins own native Harness
> semantics; no real model call and no credential-content access without the work
> order's explicit source authorization; stage explicit paths only; do not
> reset/stash/clean, do not automatically merge main, do not push; sibling repositories
> are read-only.

---

## Source-line text (kept as history)

This worktree is the independent backend implementation, based on `80d2017`.
It is not Hermes Desktop, and it must not inherit the Desktop/Zcode task queue.

Before work and at every stage boundary, read:
- [Master plan](docs/implementation/master-plan.md)
- [Status](docs/implementation/status.md)
- [Manifest](docs/implementation/manifest.json)
- The currently executable work order.

The sole scheduling authority is `docs/implementation/` in this worktree.
Write implementation evidence under `docs/server-round1/`. Preserve unrelated
uncommitted work and concurrent planner edits; stage explicit paths only.
Do not reset/stash/clean, automatically merge main, or push. Sibling repositories
are read-only except Work Order 42's explicitly named Desktop execution worktree
after both implementation-ready gates and its released writer lease are verified.
This exception does not authorize editing the Desktop publishing main.

Work Core remains provider-neutral. Server composes plugins; plugins own native
Harness semantics. Windows owns persistent Profile/Session data; remote Workers
own bounded execution projections, not a second authoritative data store.
No real model call or credential-content access until the work order's explicit
source-authorization requirements are satisfied.

Subagents, if used: at most gpt-5.6-sol for review/judgment; Luna/Terra for ordinary
implementation and mechanical work. Follow work-order limits and ownership.
