# Repository Restructure Phase 5B — Quick Launch
>
> Historical record — describes an earlier architecture or validation state and is not current implementation guidance.
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

## Verdict

COMPLETE. The two audited gaps are closed by the Web Host terminal presenter
and the real-plugin rehearsal recorded in the Phase 5B closure report.

## Quick Launch ownership

Quick Launch is a Web Host convenience workflow. It creates the normal Work
and current Execution draft, then invokes provider-neutral selector IDs for
Git workspace, responsibility artifact, Harness Profile and (for tmux) either
managed console or existing pane. It returns to the ordinary Binding Composer;
requested summaries and exact Refs remain visible, Review remains explicit,
and Freeze/Dispatch is never automatic.

## Repository and responsibility

`agent-box-git` now has a plugin-owned repository library with stable IDs,
display name, validated Git root, managed worktree root, enabled state and
status. The legacy single-repository `config.json` is a read-only compatibility
fallback. No home-directory scan or credential storage was added. The
responsibility selector continues to create a bounded immutable
`PromptFragmentV1` artifact.

## Fresh and continuation

Fresh Quick Launch does not add a continuation input. Terminal native refs from
terminal Executions are exposed through `/api/v1/continuations`; the Harness
`codex-continuation` ResourceProvider accepts only observed Codex App Server or
Codex tmux source identities and resolves an exact `CodexContinuationV1`.
Continue creates a new Execution and Binding with a new overlay/workspace/
terminal; it never reopens the source terminal Execution.

## tmux and attach

The tmux plugin now exposes a managed-console selector in addition to the
existing exact-pane selector. Managed console materialization remains in the
tmux ResourceProvider during Dispatch. Existing panes require live observed
identity and explicit pane selection. Attach returns only provider-generated
validated argv for copy or terminal presentation; no HTTP arbitrary shell/argv
endpoint or `shell=True` terminal opener exists.

## CLI

Root `agent-box launch` is a lazy Web delegate that opens `#/quick-launch`.
Legacy REPL/exec and root launch implementation remain retained for Phase 6;
the new command does not read legacy DB state or start Codex directly.

## Tests

- full Python suite: 283 passed, 1 skipped (pre-existing environment skip);
- Git/tmux/artifacts/Harness/Web plugin tests: 49 passed;
- Quick Launch browser fixture with fake providers: 1 passed;
- existing Web browser regressions: 2 passed;
- frontend tests: 6 passed;
- frontend lint and production build: passed with existing warnings;
- root, Web and Harness wheels were rebuilt after clearing stale build staging;
  Git, tmux and artifacts wheels also built successfully;
- Web wheel contains exactly one current JS asset under `_static/assets`;
- `git diff --check` passed.

The original browser fixture remains controlled form/navigation coverage. The
missing native boundary is now covered separately by the real-plugin,
real-tmux, offline fake-Codex rehearsal and injected browser presenter checks.

## Core and legacy boundary

No Work Core file, ontology, schema or execution semantic was changed. No
legacy root source was deleted. `agent-box-codex` and
`agent-box-preview-resources` remain absent, and no concrete Provider was
restored under Work Core.

## Phase 6 entry

Phase 6 remains a separate legacy deletion operation and was not started by
this closure.
