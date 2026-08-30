# Repository Restructure Phase 3 — Codex Consolidation
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

## Verdict

Implemented in the working tree; native Codex/model execution was intentionally
not run because it can create external requests or consume quota.

## Ownership and dependency result

The official `agent-box-harnesses` package now owns the Codex continuation
contract, Profile/Projection launch adapter, App Server provider/client,
tmux provider/control, and hook recorder. `HarnessesPlugin.build()` constructs
all registrations directly. It no longer imports or invokes
`agent_box_codex.plugin.CodexPlugin`, mutates provider private fields, or
imports `agent_box.launch`.

The former `plugins/agent-box-codex` distribution and its tests were removed
from the repository. The files were moved into the Harnesses Codex driver and
the old directory is not a runtime forwarding package: no external published
import compatibility requirement was found in this repository.

## Registrations

There is exactly one registration for each of:

- `codex-app-server` ExecutionProvider and HostControl;
- `codex-tmux-interactive` ExecutionProvider and HostControl;
- `codex-profile` ResourceProvider;
- `agent-box-profile` selector;
- `agent-box.codex-continuation@1` contract.

Both execution modes use the Harness-owned exact ProfileRef, immutable
projection, `CodexLaunchSpec`, execution-scoped `CODEX_HOME`, bounded
non-secret environment, and locator-only credential facts. The tmux public
controller now accepts bounded environment mappings and launches them with the
same frozen spec; secrets are never placed in argv, evidence, or logs.

## Runtime semantics and evidence boundary

App Server preserves thread/session and turn/run refs, bounded JSONL events,
native process observation, and explicit Finish. tmux preserves exact pane
identity, SessionStart hook artifact, bounded scrollback, pane observation,
attach descriptor, and explicit Finish. These artifacts do not prove model
prompt consumption, capability use, complete history, or anything beyond the
provider/native observations they record.

Terminal projections are sealed (`resumable_now=False`). Native `SessionRef`
continuation is represented by a new Core Execution and new binding/dispatch;
it does not reopen the original terminal Execution.

## Validation

- Harness Codex and profile tests: passed (20 tests).
- Root Core/extension selection: passed (21 tests).
- Frontend unit tests: passed (6 tests).
- Frontend lint: completed with pre-existing duplicate-i18n-key and unused
  import warnings.
- Frontend production build: passed via `npm ci && npm run build`; Vite clears
  and writes the complete package `_static` tree directly.
- Root, Web, Harnesses, tmux, Git, and preview-resources wheels: built.
- Clean wheel inspection: root wheel contains no Web package/static files;
  Web wheel contains its package static tree; Harnesses wheel contains both
  Codex providers and hook module and depends on tmux, not agent-box-codex.
- Clean venv discovery/doctor and Web `/api/v1/health`: passed. `web
  --no-browser` was started with a writable temporary `AGENT_BOX_HOME` and
  terminated after the health check.
- Full browser E1→E2 and Harness/Profile browser E2E: not run in this pass;
  native Codex execution remains intentionally out of scope. They are not
  represented as passed here.
- Legacy import scan: no formal source/test import of `agent_box_codex`,
  `agent_box.application`, `agent_box.server`, `agent_box.launch`, or
  `build_launch_plan` remains in Harness/Codex code.
- Work Core ontology/schema was not changed by this consolidation.

## Legacy retirement candidates and Phase 4 entry

The root `src/agent_box/launch.py`, legacy profile/resource implementation in
`src/agent_box/resources/` and `src/agent_box/work_core/providers/resources.py`,
and their historical tests remain as retirement candidates. They are retained
for the later Legacy Retirement/Core concrete-provider phase and are not used
by the official Harness Codex path.

Phase 4 may begin only after the documented browser regressions are run in an
environment with the required browser tooling. It must remove remaining Core
concrete-provider callers without changing Work Core ontology.
