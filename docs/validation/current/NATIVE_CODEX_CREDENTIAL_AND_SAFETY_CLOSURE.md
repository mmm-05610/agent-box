# Native Codex Credential & Safety Closure

Date: 2026-08-30

## Verdict

COMPLETE for the no-model Native Codex wiring rehearsal boundary. No real model or external service request was made.

## Credential authority

The official `agent-box-harnesses` plugin owns the only supported Codex credential source: `codex-login/default` (“Current Codex ChatGPT login”). The Profile stores only this locator; it does not store a credential Core entity or credential contents.

## Credential projection

At materialization the plugin resolves only the fixed native locator to the current user’s `~/.codex/auth.json`. It validates that the source is a file and creates `CODEX_HOME/auth.json` as a controlled symlink. It never reads, parses, hashes, logs, or copies the file. Cleanup removes only the link and execution projection. Missing or unsupported sources fail closed before the native process starts.

## Local login preflight

Passed without model execution:

`temporary projected CODEX_HOME → controlled auth.json link → codex login status`

Result: `logged-in`; link materialized: `true`. The command output was mapped to a bounded status and no auth payload was emitted.

## Sandbox policy correction

The canonical provider path uses Codex native `workspace-write` and `on-request` policy with the resolved workspace as cwd. It no longer sends `danger-full-access` or `externalSandbox`. The Web profile surface accepts only `read-only` and `workspace-write`; SandboxRef remains a future independent resource.

## Environment policy

The launch adapter passes a bounded inherited set (`PATH`, runtime identity/home, locale, and certificate-path variables), sets `CODEX_HOME` to the execution projection, and rejects secret-shaped explicit environment names. Secret-bearing ambient variables are not copied.

## Secret leakage tests

Passed: auth source remained a symlink; source remained intact after cleanup; manifest contains locator/method/materialized status only; `OPENAI_API_KEY` and its value were absent from launch environment; fake protocol/event data contained no credential value; profile/API paths do not return auth contents.

## Browser/Profile result

The production Harness Studio still uses the real API and now offers explicit `None` / `Current Codex ChatGPT login` selection. Profile persistence remains immutable revision storage; the exact revision and digest enter Binding. Phase 1 and Phase 2 browser paths passed.

## Tests

Passed:

- full pytest: `292 passed`
- Harness/Codex/preview plugin tests: `17 passed`
- credential and canonical fake-protocol tests: `8 passed`
- frontend tests: `6 passed`
- frontend lint and build
- Phase 1 browser E1→E2: `1 passed`
- Phase 2 Harness/Profile browser E2E: `1 passed`
- canonical fake Codex protocol integration: passed
- clean wheel build/install and discovery
- `agent-box plugins list --json`
- `agent-box plugins inspect harnesses --json`
- `agent-box doctor --json`
- `git diff --check`

Skipped:

- full pytest has one pre-existing environment-dependent skip; no required closure test was skipped.

Failed: none.

## Ready for REAL Native Codex rehearsal?

YES — credential projection and login preflight passed, canonical provider consumed the execution projection, and the fake-protocol native path verified explicit Host Finish without running a model. A real rehearsal must still be separately authorized because it can contact external services and consume account quota.
