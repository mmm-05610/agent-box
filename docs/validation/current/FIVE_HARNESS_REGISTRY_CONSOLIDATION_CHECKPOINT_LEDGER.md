# Five-Harness Registry Consolidation — Manual Checkpoint Ledger

## Branch and base

- Worktree: `/home/maoqh/projects/agent-box-harness-registry`
- Branch: `refactor/harness-registry`
- Base HEAD: `377088c`
- Proposed commit: `refactor: consolidate harnesses behind registry adapters`
- Staging is deferred to the human operator.

## Intended files

The exact allowlist is encoded in
`tools/stage-five-harness-registry-checkpoint.sh`. It includes the registry
(`harnesses.toml` plus typed schema/loader/validation/definitions), generic
factory/store/provider/selector/manager/execution modules, trusted adapters,
native Harness surfaces, six entry points, migrated tests, native bwrap/tmux
fixtures, packaging/CI/release/docs, and the closure report.

The script stages the four deleted distribution trees by their exact original
pathspecs and stages no broad repository update.

## Excluded files and material

Credential/auth/token content, runtime homes, worktree output, native
subscription/model evidence, recovery archives, `node_modules`, `build`,
`dist`, `*.egg-info`, `.pytest_cache`, and any changed path outside the exact
allowlist are excluded. The main worktree is not a candidate path and was not
modified.

## Deletion ledger

Intentionally deleted: `plugins/agent-box-harness-claude/`,
`plugins/agent-box-harness-opencode/`, `plugins/agent-box-harness-hermes/`,
`plugins/agent-box-pi/`, plus obsolete Codex profile
repository/schema/projection/manager/runtime/launch scaffolding.

No forwarding distribution, alias, credential file, runtime output or cache is
staged.

## Revalidation

- `git diff --check`: passed.
- `compileall`: passed.
- Python suite: `154 passed`.
- Native offline bwrap/tmux: `2 passed`.
- Frontend Vitest: `6 passed`; lint/build passed with non-fatal warnings.
- Harness wheel build: passed; one Harness wheel contains six entry points.
- Clean virtualenv install: passed; six entries independently READY.
- `agent-box doctor --json`: passed.
- Old distribution/import and secret scans: passed.
- No real model request and no credential content was read.

## Human action

Review the unstaged diff and execute the companion staging script manually.
It validates worktree identity and refuses pre-existing staged content or
unallowlisted changes. It only stages; it never commits, pushes, tags, resets,
checks out, or enters Resource Routing.

## Verdict

READY FOR MANUAL CHECKPOINT
