# ADR-0010: External Git Detached-Worktree Output Capture

Status: Current — retained as an active architectural decision.

Status: accepted and implemented 2026-08-28.

Git output capture belongs entirely to the external `agent-box-git` plugin.
ExecutionProvider announces native completion; Host routes frozen Binding inputs
to a `FinalizationContributor`; Core only atomically records the resulting
Finalization bundle and terminal projection. ExecutionProvider never calls Git,
and the Git provider never writes Core terminal state.

`WorkspaceRef` represents repository authority, exact commit, exact tree, and
provider identity. The execution-local worktree path is a runtime projection and
is supplied through an ephemeral `ResourceResolutionContext`; it is not durable
Binding identity. Detached worktrees do not require a business branch. An internal
Git ref retains captured output material.

The contributor captures tracked changes, non-ignored untracked files, deletions,
binary data, modes, symlinks where supported, and gitlinks using Git index
semantics. Ignored files are excluded; nested repositories and dirty submodule
contents are not recursively captured; Git LFS remote objects are not independently
preserved. These are explicit coverage limits, not a complete filesystem claim.

After E1 finalization, its output WorkspaceRef is an exact input for E2 (and other
Executions), each of which receives a distinct detached worktree. E2 changes do not
mutate E1's snapshot.
