# Unified Web Phase 2 Native Wiring Closure
>
> Historical record — describes an earlier architecture or validation state and is not current implementation guidance.

Date: 2026-08-30

## Verdict

**COMPLETE** for canonical Codex wiring with a fake App Server protocol process. Real model execution was intentionally not run.

## Root cause

The official Harness plugin had no `codex-app-server` HostControl, so Web Observe/Finish could not find the provider control. Its provider also fell back to legacy `build_launch_plan(profile.name, ...)`, which read the Phase 1 profile store and unconditionally used the old bwrap path.

## Canonical launch path

`ProfileRef → CodexProfileProvider.resolve → CodexLaunchAdapter.plan → execution-scoped CODEX_HOME projection → codex app-server --stdio → CodexAppServerClient → CodexAppServerHostControl → HostFinalizationCoordinator`.

The official path is injected by `agent-box-harnesses`; it does not call legacy `build_launch_plan`. The adapter uses the resolved WorkspaceV1 cwd and frozen PromptFragmentV1 input. It does not hard-code bwrap.

The local Codex CLI was checked at `0.149.0`. Local help confirms app-server stdio transport and the configuration layers used by Codex. Official guidance documents user/project/profile config precedence and the App Server surface; see [Codex config basics](https://learn.chatgpt.com/docs/config-file/config-basic) and [Codex App Server](https://learn.chatgpt.com/docs/app-server).

## Profile projection actually consumed

The canonical adapter revalidates revision and digest, materializes a unique execution directory, writes a real `config.toml`, sets `CODEX_HOME` to that directory, and passes the non-secret model/environment settings to the process. The manifest includes projection digest, environment names, shared capability refs, credential locator, and cleanup policy. Two executions receive different projection directories.

## App Server HostControl

`CodexAppServerHostControl` is registered with `provider_id = codex-app-server`. It resolves the accepted Dispatch ID to the same in-process provider handle. `attach_command()` returns unavailable because App Server has no native TUI attach surface. Observe reports ACTIVE while the process is alive; turn completion does not terminalize the Execution.

## Explicit Finish result

Passed. Finish waits for the current turn, marks provider responsibility submitted, closes the App Server client, returns terminal observation with SessionRef/RunRef and event output, and then uses the existing atomic HostFinalizationCoordinator path. The Host does not write Core terminal state directly.

## Fake-protocol native E2E

Passed: `plugins/agent-box-harnesses/tests/test_codex_wiring.py`.

The test launches a real executable process implementing initialize, initialized, thread/start, turn/start, turn/completed, and thread/resume. It verifies P2 projection/config read-back, exact ProfileRef resolution, ACTIVE before Finish, ACTIVE after turn completion, explicit Finish to TERMINAL, native SessionRef/RunRef, atomic finalization, distinct E2 projection, and E1-terminal/new-E2 thread/resume. No FakeExecutionProvider is used.

## Credential safety

Passed. No local `auth.json` or credential value was read. CredentialSourceRef remains locator metadata only. No secret value enters argv, environment, manifest, protocol event log, Binding, Evidence, or HTTP response.

## Clean plugin discovery

Passed in a fresh `/tmp` venv/home after rebuilding and installing local wheels: `agent-box`, `agent-box-harnesses`, `agent-box-codex`, `agent-box-tmux`, `agent-box-git`, and `agent-box-preview-resources`.

Discovery assertions passed: `harnesses` READY; exactly one `codex-app-server` ExecutionProvider; exactly one `codex-app-server` HostControl; exactly one `codex-profile` ResourceProvider; exactly one `agent-box-profile` selector; one `harnesses` entry point; no duplicate registration; no non-READY installed plugin.

## Tests

Passed:

- full pytest: `292 passed, 1 skipped`;
- plugin tests: `19 passed`;
- frontend tests: `6 passed`;
- frontend lint: exit 0;
- frontend build;
- Phase 1 browser E2E: `1 passed`;
- Phase 2 Harness/Profile browser E2E: `1 passed`;
- fake-protocol canonical wiring test: `1 passed`;
- clean-wheel `plugins list --json`;
- clean-wheel `plugins inspect harnesses --json`;
- clean-wheel `doctor --json`;
- `git diff --check`.

Skipped:

- one pre-existing CLI test that avoids launching a real Claude process;
- real Native Codex/model execution, explicitly excluded from this closure.

Failed: none.

## Remaining recovery limitation

Restart recovery for App Server in-memory handles is not implemented. A Host restart after an accepted Dispatch must therefore report recovery as unsupported/unknown rather than reconstructing a handle. This does not affect the same-Host observe/finish closure covered here.

## Ready for REAL Native Codex rehearsal?

YES
