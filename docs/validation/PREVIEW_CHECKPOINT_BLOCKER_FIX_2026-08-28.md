# Preview Checkpoint Blocker Fix — 2026-08-28

## Verdict

**READY AFTER MANUAL ACTION** — the supported Preview path is validated, the
manifest corrections below are applied. Exact staging is blocked by the
read-only Git index in this environment; no commit was performed and human
staging/review remains required.

## Authoritative Git composition

`agent-box-git` is the only Git authority. Its canonical `agent_box.plugins`
registration contributes exactly `git-workspace` ResourceProvider, selector,
and FinalizationContributor. `preview-resources` contributes profile, prompt,
and artifact resources only; its dormant provider/config and unregistered
selector were removed. The prepared
WorkspaceRef has provider `git-workspace`, and the Git contributor accepts the
same Ref. The E1 output Ref identity to E2 input identity remains covered by
the Web product-loop test.

## Plugin discovery result

The loader consumes only the canonical `agent_box.plugins` group, stages each
plugin atomically, isolates failures, and rejects duplicate selector,
contributor, or control IDs explicitly. Host extensions are collected only
from READY registrations, so failed plugins leave no Host extension behind.
The clean wheel discovered five READY plugins and one Git provider, selector,
and contributor.

## Doctor fix

`agent_box.server.static.locate_web_static()` is shared by Web Host and doctor.
It checks `AGENT_BOX_WEB_STATIC`, source checkout `gui-web/dist`, and installed
wheel `share/agent-box/web`, returning the usable directory or `None`. The
clean wheel doctor result was `frontend_static_build: true` and pointed to the
wheel data directory. No Vite server is required.

## Credential/runtime findings

No secret value was printed or copied. Runtime credential candidates are
untracked/ignored, and the LangGraph `.env` now has an exact ignore rule.
`src/agent_box/templates/hermes/.env` contains an empty API-key placeholder:
**PLACEHOLDER VERIFIED**. No confirmed real secret was found.

## Manifest corrections

The Core allowlist now includes the changed public package surface
`work_core/__init__.py`, `errors.py`, and `events.py`, in addition to the
changed registry/repository/services and new finalization/resource-observation
modules. The approved deleted Core Codex provider modules and their two old
Core tests are listed for staging as deletions. `work_core/cli.py` and its test remain
intentionally deferred because that standalone diagnostic CLI is not part of
the Preview Web Host/mainline path.

## Deletion verification

Supported source, packaging, and tests contain no remaining imports or wheel
content for the retired TUI, Textual, PyWebView bridge, or Core Codex provider
modules. The approved TUI/GUI/Core-Codex deletions were not restored. Historical
documents and unrelated legacy changes remain untouched. Native Harness TUI
wording in Codex/Pi is external-terminal behavior and is retained.

## Frontend build reproducibility

The reproducible prerequisite is `cd gui-web && npm ci && npm run build`.
`gui-web/dist` and `gui-web/node_modules` are ignored and are not staged. The
source checkpoint is complete, but it does not itself contain static assets;
the formal wheel build must run the frontend build first so
`pyproject.toml` can package `gui-web/dist` into `share/agent-box/web`.

## Tests

- Core/application/extensions/full pytest: `291 passed, 1 skipped`.
- Git, preview-resources, Codex, tmux, and Pi plugin tests: `53 passed`.
- Frontend: `6 passed`; production build passed.
- Browser E1→E2 product loop and finalization identity tests passed in the
  existing full suite.
- `git diff --check`: passed.
- Native Codex rehearsal/E2E: not run, as required.

## Clean wheel result

All six local wheels built in `/tmp`. A fresh temporary venv and
`AGENT_BOX_HOME` verified `agent-box 1.9.0`, all five plugins READY, Web assets
served from the wheel, health/plugins/execution-provider/resource-selector
routes, and no retired TUI/bridge/Codex files in the root wheel. The formal
selector listed `git-workspace` and prepared a `WorkspaceRef` with provider
`git-workspace`; the formal contributor handled that provider-owned Ref.

## Checkpoint manifest

Use [PREVIEW_CHECKPOINT_STAGING_MANIFEST_2026-08-28.md](../plans/PREVIEW_CHECKPOINT_STAGING_MANIFEST_2026-08-28.md).
It is an allowlist and intentionally excludes all runtime, credential, home,
cache, submodule, spike, fixture, and unrelated paths.

## Staging state

The target state is exact allowlist staging with no commit. This environment
could not create `.git/index.lock` (`Read-only file system`), so no staging was
performed. Review
`git diff --cached --name-status`, `--stat`, and the remaining unstaged changes
before the human checkpoint commit.

## Remaining unrelated changes

The dirty `acs` submodule, `spikes/`, nested `e2e/` fixture, report source,
local homes/databases, old experiment runtime, unrelated README/changelog and
historical-document changes remain outside this checkpoint.

## Blockers before Native Codex rehearsal

Manual checkpoint staging and review of the allowlist. Native Codex rehearsal
itself remains intentionally unrun.

## Blockers before Preview release

Release Prep still needs public narrative/legacy-doc cleanup and the separate
Native Codex rehearsal gate. Those are outside this blocker-fix task.
