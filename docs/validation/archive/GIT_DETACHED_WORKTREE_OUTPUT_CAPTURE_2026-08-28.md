# Git Detached-Worktree Output Capture — validation

Date: 2026-08-28

## Result

The external `agent-box-git` plugin provides material WorkspaceRefs, scoped
detached-worktree materialization, internal output refs, and a Host-facing
finalization contributor. A real temporary Git repository test proves E1 output
capture and independent E2 materialization.

## Tested

The vertical tests cover exact commit/tree freeze, detached HEAD, tracked edits,
untracked non-ignored files, ignored-file exclusion, binary content, executable
mode, internal ref retention after cleanup, empty capture, distinct E2 worktree,
and snapshot isolation.

The coordination API is `agent_box.extensions.finalization.HostFinalizationCoordinator`;
it is Host-neutral and can be consumed by a future local Web Host. WorkBoard only
retains a compatibility delegate to this service for existing tests. Remaining
WorkBoard coupling is its legacy resource/control adapter loading and that thin
delegate; the Git plugin itself has no WorkBoard dependency.

Core remains Git-free and terminal entry still uses Atomic Finalization. Native
Codex E2E was not run. Artifact CAS, Sandbox, Web, LangGraph, Actions, and
multi-Harness work are intentionally not included.
