# Preview Checkpoint Staging Manifest — 2026-08-28
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

This is the explicit allowlist for the Preview checkpoint staging action.
The allowlist is corrected; staging remains a human action if the Git index is
not writable. Generated/runtime paths remain excluded.

## Superseded ownership entries (Phase 4, 2026-08-30)

The historical package allowlist below predates the completed provider
extraction. Do not stage the deleted `agent-box-preview-resources` or
`agent-box-codex` paths, and do not stage
`src/agent_box/work_core/providers/resources.py` or the removed
`work_core/providers/` package. Stage the new `plugins/agent-box-artifacts/`
package instead; its formal entry point is `artifacts` and it owns
`artifact-file` plus the existing `responsibility` selector. This manifest
remains a historical checkpoint record; the Phase 4 validation report is the
authoritative current package list.

## Commit 1 — Core / Application / Extensions

Stage only:

```text
pyproject.toml
src/agent_box/application/__init__.py
src/agent_box/application/facade.py
src/agent_box/application/operations.py
src/agent_box/application/ownership.py
src/agent_box/extensions/__init__.py
src/agent_box/extensions/api.py
src/agent_box/extensions/bootstrap.py
src/agent_box/extensions/conformance.py
src/agent_box/extensions/diagnostics.py
src/agent_box/extensions/finalization.py
src/agent_box/extensions/loader.py
src/agent_box/resource_contracts/__init__.py
src/agent_box/resource_contracts/agent_box_profile_v1.py
src/agent_box/resource_contracts/prompt_fragment_v1.py
src/agent_box/resource_contracts/workspace_v1.py
src/agent_box/server/__init__.py
src/agent_box/server/host.py
src/agent_box/server/static.py
src/agent_box/work_core/__init__.py
src/agent_box/work_core/errors.py
src/agent_box/work_core/events.py
src/agent_box/work_core/finalization.py
src/agent_box/work_core/providers/__init__.py
src/agent_box/work_core/providers/resources.py
src/agent_box/work_core/resource_observations.py
src/agent_box/work_core/registry.py
src/agent_box/work_core/repository.py
src/agent_box/work_core/services.py
src/agent_box/migrations/003_work_core.sql
src/agent_box/migrations/005_resource_contract_inputs.sql
src/agent_box/migrations/006_resource_contract_inputs.sql
src/agent_box/migrations/007_resource_observations.sql
src/agent_box/migrations/008_resource_observation_evidence_metadata.sql
src/agent_box/migrations/009_execution_finalization.sql
tests/test_extensions.py
tests/test_host_operations.py
tests/test_resource_contracts.py
tests/test_web_static.py
tests/test_work_core.py
tests/test_work_core_finalization.py
tests/test_work_core_input_dispatch.py
tests/test_work_core_real_resource_observation.py
tests/test_work_core_resource_observation.py
tests/test_work_core_resource_observations.py
tests/test_work_core_responsibility.py
tests/test_work_core_contracts.py
tests/test_work_core_repository.py
tests/test_work_core_services.py
tests/test_work_core_vertical_slice.py
tests/test_work_core_real_resource_providers.py
tests/test_work_service.py
src/agent_box/work_core/providers/codex.py
src/agent_box/work_core/providers/codex_jsonl.py
src/agent_box/work_core/providers/codex_launch.py
tests/test_work_core_codex_jsonl.py
tests/test_work_core_codex_launch.py
```

## Commit 2 — Plugins

Stage the explicit plugin distribution files below, excluding every generated
`*.egg-info`, `__pycache__`, runtime, home, and credential path:

```text
plugins/agent-box-git/README.md
plugins/agent-box-git/pyproject.toml
plugins/agent-box-git/src/agent_box_git/__init__.py
plugins/agent-box-git/src/agent_box_git/contributor.py
plugins/agent-box-git/src/agent_box_git/inputs.py
plugins/agent-box-git/src/agent_box_git/plugin.py
plugins/agent-box-git/src/agent_box_git/provider.py
plugins/agent-box-git/tests/test_git_vertical.py
plugins/agent-box-preview-resources/README.md
plugins/agent-box-preview-resources/pyproject.toml
plugins/agent-box-preview-resources/src/agent_box_preview_resources/__init__.py
plugins/agent-box-preview-resources/src/agent_box_preview_resources/plugin.py
plugins/agent-box-preview-resources/src/agent_box_preview_resources/web_selectors.py
plugins/agent-box-preview-resources/tests/test_plugin.py
plugins/agent-box-codex/README.md
plugins/agent-box-codex/pyproject.toml
plugins/agent-box-codex/src/agent_box_codex/__init__.py
plugins/agent-box-codex/src/agent_box_codex/contract.py
plugins/agent-box-codex/src/agent_box_codex/host_control.py
plugins/agent-box-codex/src/agent_box_codex/hook_recorder.py
plugins/agent-box-codex/src/agent_box_codex/plugin.py
plugins/agent-box-codex/src/agent_box_codex/provider.py
plugins/agent-box-codex/src/agent_box_codex/tmux_provider.py
plugins/agent-box-codex/tests/test_codex_plugin.py
plugins/agent-box-codex/tests/test_codex_provider.py
plugins/agent-box-codex/tests/test_codex_tmux_provider.py
plugins/agent-box-tmux/README.md
plugins/agent-box-tmux/pyproject.toml
plugins/agent-box-tmux/src/agent_box_tmux/__init__.py
plugins/agent-box-tmux/src/agent_box_tmux/contract.py
plugins/agent-box-tmux/src/agent_box_tmux/control.py
plugins/agent-box-tmux/src/agent_box_tmux/plugin.py
plugins/agent-box-tmux/src/agent_box_tmux/provider.py
plugins/agent-box-tmux/src/agent_box_tmux/web_selector.py
plugins/agent-box-tmux/tests/test_tmux_provider.py
plugins/agent-box-pi/README.md
plugins/agent-box-pi/pyproject.toml
plugins/agent-box-pi/src/agent_box_pi/__init__.py
plugins/agent-box-pi/src/agent_box_pi/config.py
plugins/agent-box-pi/src/agent_box_pi/contract.py
plugins/agent-box-pi/src/agent_box_pi/plugin.py
plugins/agent-box-pi/src/agent_box_pi/provider.py
plugins/agent-box-pi/src/agent_box_pi/resources.py
plugins/agent-box-pi/src/agent_box_pi/sessions.py
plugins/agent-box-pi/tests/helpers.py
plugins/agent-box-pi/tests/test_pi_config.py
plugins/agent-box-pi/tests/test_pi_plugin.py
plugins/agent-box-pi/tests/test_pi_provider.py
plugins/agent-box-pi/tests/test_pi_resources.py
```

The following preview-resources paths are explicit deletion entries in this
checkpoint (they must be staged as deletions, not omitted from the review):

```text
plugins/agent-box-preview-resources/src/agent_box_preview_resources/config.py
plugins/agent-box-preview-resources/src/agent_box_preview_resources/git_provider.py
```

## Commit 3 — Web / CLI / Retirement

```text
.gitignore
README.md
README_CN.md
src/agent_box/cli/__init__.py
gui-web/src/App.tsx
gui-web/src/index.css
gui-web/src/main.tsx
gui-web/vite.config.ts
agent-box-gui.spec
gui-web/bridge.py
gui-web/data_linux.py
gui-web/data_wsl.py
gui-web/rpc_server.py
scripts/build-gui-runtime.sh
scripts/diag-gui.bat
scripts/stage-windows-build.sh
scripts/verify-exe-runtime.py
src/agent_box/tui/__init__.py
src/agent_box/tui/app.py
tests/test_gui_rpc_parity.py
```

The approved legacy frontend deletion set is every currently deleted bridge/API,
component, domain, hook, page, and provider-form path under `gui-web/src/`,
with each path added individually from the reviewed `git diff --name-only
--diff-filter=D -- gui-web/src` output. The checkpoint retains the complete
remaining frontend source plus the intentional legacy deletions; it does not
stage `gui-web/dist` or `gui-web/node_modules`.

`src/agent_box/work_core/cli.py` and `tests/test_work_core_cli.py` are
intentionally excluded: this standalone diagnostic CLI is not wired into the
Preview Web Host/mainline entry point, and its Codex behavior was removed. The
Preview mainline is covered by the provider-neutral Core, application,
extensions, plugin, and Web Host paths above.

For each listed file, the suggested command shape is `git add -- <one exact
path>`, but it was not executed. Never use `git add -A`, `git add .`, or a
broad directory path.

## Commit 4 — Docs / Validation

```text
docs/README.md
docs/plugins/PLUGIN_SDK.md
docs/validation/PREVIEW_CHECKPOINT_BLOCKER_FIX_2026-08-28.md
docs/plans/PREVIEW_CHECKPOINT_STAGING_MANIFEST_2026-08-28.md
```

## Never stage

```text
.agent-box/
.agent-box/runtime/
.workboard-preview-home/
.workboard-showcase-home/
.mcp.json
CLAUDE.local.md
*.db
*.sqlite
*.sqlite3
*.egg-info/
__pycache__/
*.pyc
node_modules/
build/
dist/
coverage/
spikes/
e2e/
acs/
spikes/preview_provider_validation/runtime/
spikes/preview_provider_validation/langgraph_app/.env
spikes/preview_provider_validation/runtime/claude-home/.credentials.json
spikes/preview_provider_validation/runtime/collaboration/participant-secrets.json
src/agent_box/templates/hermes/.env
temporary homes, wheels, logs, screenshots, and local databases
```

`src/agent_box/templates/hermes/.env` is tracked placeholder content and must
not be staged as a new credential; keep it only if the approved template path
is intentionally included in a later explicit review.

## Manual/deferred

Historical-document deletions whose scope is unclear, unrelated legacy source
and tests, `report-source.md`, preview scripts, nested e2e fixture changes,
spikes, local homes/databases, and the `acs` submodule remain manual/deferred.

## Final manual checklist

Review `git diff --cached --name-status` after explicit staging, confirm no
Never-stage path appears, and confirm the resulting staged set matches these
four lists. This task attempted exact-path staging, but the environment refused
to create `.git/index.lock` (`Read-only file system`); no paths were staged.
It performed no commit, reset, checkout, clean, stash, or Native Codex
rehearsal.

## Frontend build prerequisite

Before building the formal wheel, install frontend dependencies from the
lockfile and build static assets:

```text
cd gui-web && npm ci && npm run build
```

The build writes ignored `gui-web/dist`; the wheel then packages it through
`pyproject.toml`'s `share/agent-box/web` data-files rule. A Git checkpoint
contains frontend source, not static assets, until this build is run.
