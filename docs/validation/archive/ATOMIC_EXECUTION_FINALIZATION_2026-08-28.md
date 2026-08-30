# Atomic Execution Finalization — implementation report

Date: 2026-08-28

## Verdict

`COMPLETE` for the requested Atomic Finalization phase. The first terminal
projection is rejected by `apply_observation()` and `observe_projection()` and
must use the typed `apply_finalization()` request. The repository commits the
bundle and receipt under one SQLite transaction. The 009 migration adds only
operation receipt persistence; it does not add a domain entity.

## Verification

The focused Work Core suite and the new finalization tests cover empty-output
finalization, receipt replay, digest/key conflicts, terminal outcome sealing,
and injected failure rollback of refs, projection, version, events, and receipt.
Existing structured observation tests verify late append-only evidence. Existing
continuation tests verify a new Execution and Dispatch.

The Work Core suite, focused finalization tests, Codex, Pi, and WorkBoard plugin
suites passed. The tmux and preview-resource plugin commands were blocked by the
existing test environment because their optional WorkBoard package was not on the
test `PYTHONPATH`. The repository-wide `tests/` run reached 288 passed and one
skipped; six unrelated GUI parity tests failed because the sandbox home/database
is read-only. Native Harness E2E was not run.

## Boundary and risks

Provider/Host decides native completion and owns required-output policy. Host/UI
may display `FINALIZING`; Core has no such phase. Core does not call Git, Codex,
CI, artifact authorities, or workflows. Late evidence cannot alter terminal
projection/outcome. Native Harness E2E is not part of this phase. Git detached
worktree output capture, WorkspaceRef capture, Artifact Store, and WorkBoard Finish
UX remain the next implementation area and were intentionally not started.
