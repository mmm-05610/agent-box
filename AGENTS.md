# AgentBox Server worktree

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
Do not reset/stash/clean, automatically merge main, push, or edit sibling repositories.

Work Core remains provider-neutral. Server composes plugins; plugins own native
Harness semantics. Windows owns persistent Profile/Session data; remote Workers
own bounded execution projections, not a second authoritative data store.
No real model call or credential-content access until the work order's explicit
source-authorization requirements are satisfied.

Subagents, if used: at most gpt-5.6-sol for review/judgment; Luna/Terra for ordinary
implementation and mechanical work. Follow work-order limits and ownership.
