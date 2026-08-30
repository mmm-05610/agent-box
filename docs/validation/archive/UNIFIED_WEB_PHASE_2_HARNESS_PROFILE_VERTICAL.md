# Unified Web Phase 2 Harness/Profile vertical
>
> Historical record — describes an earlier architecture or validation state and is not current implementation guidance.

Date: 2026-08-29

## Verdict

**COMPLETE** for Phase 2 Installation & E2E Closure. Native Codex execution and cc-switch remain intentionally out of scope.

## Installation and discovery

A fresh venv and `AGENT_BOX_HOME` were created under `/tmp/agent-box-phase2-final.qkDzT5`. No existing venv was modified and `--break-system-packages` was not used. Wheels were built from current source and installed without source-directory `PYTHONPATH` dependence.

Installed local wheels: `agent-box-cli`, `agent-box-harnesses`, `agent-box-codex`, `agent-box-tmux`, `agent-box-git`, and `agent-box-preview-resources`.

`agent-box plugins list --json` and `plugins inspect harnesses --json` showed `harnesses` READY. `agent-box doctor --json` reported plugin registry, execution providers, Git, and frontend static build ready.

## Canonical ownership

`agent-box-harnesses` is the only official Harness entry point. It registers exactly one Codex ExecutionProvider: `codex-app-server`; exactly one Profile ResourceProvider: `codex-profile`; and exactly one Profile selector: `agent-box-profile`.

`agent-box-codex` is an installed runtime dependency with no plugin entry point. Its native provider/control/recovery implementation is reused internally. `preview-resources` registers artifact resources only. No duplicate registration was observed.

## Profile and projection verification

The browser vertical created P1, saved P2, verified P1 remained unchanged, rendered a real projection preview, and resolved an exact P2 ProfileRef through the official provider. Frozen Binding carried revision `2` and the P2 digest.

Plugin tests verified immutable revisions, stable digests, CAS, secret rejection, execution-scoped overlay separation, shared capability identity, credential locator retention, and drift protection.

## Tests

Passed:

- stale Preview authority test corrected;
- plugin tests: `17 passed`;
- full pytest: `292 passed, 1 skipped`;
- frontend tests: `6 passed`;
- frontend lint: exit 0;
- frontend build;
- Phase 1 browser E2E: `1 passed`;
- Phase 2 Harness/Profile browser E2E: `1 passed`;
- clean-wheel discovery/unique-registration assertions;
- `plugins list --json`;
- `plugins inspect harnesses --json`;
- `doctor --json`;
- `git diff --check`.

Skipped:

- one existing CLI test that intentionally avoids launching a real Claude process when the native binary is available;
- Native Codex execution, as explicitly required by this closure request.

Failed: none.

## Remaining limitations

cc-switch import remains Phase 2B and was not implemented. Native Codex was not run. Existing frontend lint output retains pre-existing warnings in prototype/i18n/tailwind files, but lint exits successfully.
