# Executive verdict
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

Checkpoint verdict: **SAFE AFTER LISTED FIXES**

Release verdict: **READY AFTER LISTED FIXES**

The Web/Core/plugin validation is green, but the current working tree is not
safe to checkpoint wholesale. It contains unrelated changes, runtime data,
experimental environments, possible credential files, stale public docs, and
two concrete release issues: the Git plugin composition split and a false
negative in clean-wheel `doctor`.

No Git operation was performed.

# Scope audited

Read in full: `AGENTS.md`, target and Local Web Host architecture,
architecture transition plan, TUI removal ledger, Dispatch/Atomic
Finalization/Git capture/Web retirement validations, Plugin SDK, both READMEs,
and `pyproject.toml`.

Inspected the complete current status/diff metadata, tracked files, submodule,
application/server/extensions/work_core boundaries, five Preview plugin
distributions, Web client/build, CLI, package metadata, and retirement
references.

Temporary audit locations:

- `/tmp/agent-box-release-audit.mlc8HO/repo`
- `/tmp/agent-box-release-audit.mlc8HO/wheels`
- `/tmp/agent-box-release-audit.mlc8HO/site`
- `/tmp/agent-box-clean-venv.utAUCy`
- `/tmp/agent-box-clean-home.nd6uYK`

# Working-tree classification

The tree has 177 tracked changed paths, with 3,349 additions and 20,643
deletions in `git diff --stat`; most untracked content is not included in
that statistic.

Intended Preview paths, pending review:

- `src/agent_box/application/`, `server/`, `extensions/`,
  `resource_contracts/`;
- relevant `work_core/` and `migrations/`;
- `plugins/agent-box-git/`, `agent-box-preview-resources/`,
  `agent-box-codex/`, `agent-box-tmux/`, `agent-box-pi/`;
- current `gui-web/src/App.tsx`, `main.tsx`, `index.css`, Vite/package
  metadata and wheel asset packaging;
- focused tests and current Web/SDK/validation/ledger docs.

Intended retirement deletions:

- `src/agent_box/tui/`;
- `plugins/agent-box-workboard/` and its adapters/tests;
- `gui-web/bridge.py`, `rpc_server.py`, `data_linux.py`,
  `data_wsl.py`, bridge-dependent frontend modules;
- `agent-box-gui.spec` and old GUI build scripts;
- `tests/test_gui_rpc_parity.py`.

The exact TUI/bridge deletions are consistent with the retirement decision.
The broad old frontend component deletion set still deserves human scope
confirmation before staging.

Unrelated or pre-existing material should not be included without separate
review: modified `acs` submodule; deleted
`src/agent_box/work_core/providers/codex*.py` and tests; deleted historical
design documents; the large `CHANGELOG.md` diff; unrelated root source/tests;
`report-source.md`; `spikes/`; and the nested `e2e/` fixture repository.

# Suspected accidental deletions

No explicit TUI/WorkBoard/bridge deletion was identified as accidental.

Manual review is required for the deleted `work_core/providers/codex*.py`
files, their tests, deleted historical documents, and old frontend components.
They are not all directly implied by the retirement gate and were already part
of the dirty-worktree context.

# Runtime/generated/personal files

Exclude:

- `.agent-box/`;
- `.workboard-preview-home/` and `.workboard-showcase-home/` databases;
- `.mcp.json`, `CLAUDE.local.md`;
- `spikes/*/.venv/`, `spikes/*/runtime/`;
- `build/`, `acs/node_modules/`, `acs/src-tauri/target/`;
- all `__pycache__/`, `*.pyc`, `*.egg-info/`, frontend
  `node_modules/`, generated `dist/`;
- screenshots, logs, temporary homes/wheels, and nested fixture Git metadata.

The worktree contains substantial runtime data even where ignore rules do not
cover it. Git status must be the staging authority.

# Secret findings

No secret values were printed or copied.

Potential secret/personal-data paths, all to exclude and manually review:

- `spikes/preview_provider_validation/runtime/claude-home/.credentials.json`
  — credential JSON;
- `spikes/preview_provider_validation/runtime/collaboration/participant-secrets.json`
  — participant secret store;
- `spikes/preview_provider_validation/langgraph_app/.env`;
- tracked `src/agent_box/templates/hermes/.env` — placeholder status unknown;
- `.mcp.json`;
- runtime evidence under `.agent-box/runtime/`.

Finding: **potential secret material is present in untracked/runtime paths; no
confirmed secret value was disclosed**.

# TUI/GUI retirement findings

Supported source and packaging code has no remaining
`agent_box_workboard`, `agent_box.tui`, `textual`, PyWebView,
`data_linux`, `data_wsl`, or `workboard_*` references.

Remaining “TUI” wording in Codex/Pi source refers to their native Harness
interface in an external terminal. Historical docs retain old architecture
descriptions.

# Plugin registration matrix

| Distribution | Version | Plugin id | Entry point | Contracts | ExecutionProviders | ResourceProviders | Selectors | Contributors | Host controls | Dependencies |
|---|---:|---|---|---|---|---|---|---|---|---|
| agent-box-git | 0.1.0 | git | `agent_box_git.plugin:create_plugin` | none | none | `git-workspace` | separate selector entry point | `git-workspace` | none | agent-box-cli >=1.9.0 |
| agent-box-preview-resources | 0.1.0 | preview-resources | `agent_box_preview_resources.plugin:create_plugin` | built-in | none | profile, artifact, `git-worktree` | Git, profile, responsibility | none | none | agent-box-cli >=1.9.0 |
| agent-box-codex | 0.1.0 | codex | `agent_box_codex.plugin:create_plugin` | Codex continuation | App Server, tmux | none | none | none | Codex tmux | agent-box-cli, agent-box-tmux |
| agent-box-tmux | 0.1.0 | tmux | `agent_box_tmux.plugin:create_plugin` | console, pane | none | tmux console | tmux pane | none | none | agent-box-cli |
| agent-box-pi | 0.1.0 | pi | `agent_box_pi.plugin:create_plugin` | Pi continuation | Pi | Pi session | none | none | none | agent-box-cli, agent-box-tmux |

# Git provider collision result

There is no direct registry ID collision: `git-workspace` and
`git-worktree` are distinct, and all five distributions loaded READY in the
clean registry.

There is nevertheless a functional release conflict:

1. preview-resources selectors prepare `git-worktree` refs;
2. external agent-box-git finalization handles `git-workspace` refs;
3. the external Git selector entry point group is not consumed by the loader;
4. installing only external Git gives Web no loaded selector, while installing
   both exposes two non-equivalent Git paths.

This is a **BLOCKER BEFORE CHECKPOINT** until one authoritative Git composition
is defined.

# Current venv vs clean venv

Current environment reports `agent-box-cli 1.0.0` from
`/home/maoqh/.local/lib/python3.12/site-packages`, while repository metadata
is 1.9.0. It also has globally installed Textual and PyWebView, although they
are no longer project dependencies. Plugin distributions are not installed.
The current environment is not a release smoke environment.

# Wheel contents

All six wheels built successfully into
`/tmp/agent-box-release-audit.mlc8HO/wheels`:

- root `agent_box_cli-1.9.0`;
- agent-box-git, preview-resources, codex, tmux, and pi, all 0.1.0.

The root wheel contains migrations and production Web assets under
`share/agent-box/web`, and does not contain retired TUI/bridge code.

# Clean-install smoke

Using installed wheels, a fresh temporary home, and a temporary dependency
site:

- `agent-box --version`: passed, 1.9.0;
- `plugins list --json`: five plugins, all READY;
- Web static root: HTTP 200;
- `GET /api/v1/health`: passed;
- Web started on loopback without Vite;
- no WorkBoard/Textual/PyWebView package required.

`doctor --json` returned a false
`frontend_static_build: false`: it checks only checkout
`gui-web/dist/index.html`, not the installed wheel data-files path. The Host
itself serves the wheel assets correctly. This is a **BLOCKER BEFORE
CHECKPOINT**.

# Web Host smoke

Passed loopback enforcement, bounded JSON, mutation lock admission, static
serving, plugin/provider/health routes, and absence of arbitrary shell/file
APIs.

Potential Preview release issue: generic exception responses echo truncated
exception text in `src/agent_box/server/host.py:79,87`, and plugin diagnostics
return loader error strings at line 44. These can disclose local paths or
provider details and should become stable redacted error codes.

# README/package metadata drift

Public drift found:

- `README.md:271` and `README_CN.md:258` still launch removed
  `gui-web/bridge.py`;
- `pyproject.toml:33` still exposes `gui = ["customtkinter>=5.2"]`;
- `docs/ROADMAP.md:13,46` still presents PyWebView GUI as current;
- current-facing architecture docs still contain “current WorkBoard” phase
  language without clear supersession;
- package description still centers the old isolated launcher and does not
  clearly describe the Web Host.

These are **BLOCKERS BEFORE PREVIEW RELEASE**. Historical changelog entries are
not independently blocking.

# Critical code-boundary findings

No provider-specific conditional was found in the Web client or Host facade.
No new Core entity, arbitrary shell API, or direct SQLite Web access was found.
Finish uses Host operations and the existing finalization coordinator.

The material boundary issues are the Git registration split, doctor path
check, error-message redaction, and the need to confirm read-only discovery
home initialization policy.

# Test results

With bytecode/cache writes disabled:

- full repository pytest: **287 passed, 1 skipped**;
- Web operation/browser E1→E2: **3 passed**;
- key Git/Codex/tmux/Pi/preview plugin tests: **51 passed**;
- frontend tests: **6 passed**;
- frontend production build in `/tmp`: **passed**;
- six wheel builds: **passed**;
- `git diff --check`: **passed**;
- Native Codex E2E: **not executed**.

# Blockers before checkpoint

1. Resolve the authoritative Git plugin/selector/contributor composition.
2. Fix `doctor --json` to recognize installed wheel static assets.
3. Exclude runtime, databases, nested environments, build output, and potential
   credentials.
4. Manually classify broad frontend/Core/document deletions.
5. Separate unrelated pre-existing changes from the Preview checkpoint.

# Blockers before native rehearsal

- resolve Git packaging;
- fix or explicitly waive doctor’s false negative;
- prepare Git configuration in a disposable home;
- then run native Codex rehearsal.

# Blockers before Preview release

- remove bridge launch commands from both READMEs;
- remove/rename the legacy GUI/customtkinter extra if unsupported;
- update current ROADMAP and superseded architecture wording;
- redact HTTP/plugin error responses;
- add a clean-installed-wheel doctor and official-plugin-composition test.

# Deferred issues

Native Codex recording; browser terminal/WebSocket PTY; remote/accounts/
marketplace/scheduler/new providers; historical document cleanup; stale global
environment metadata; and optional native-binary degradation behavior.

# Files to include in checkpoint

After fixes and staging review:

- reviewed application/server/extensions/resource-contract/Core/migrations;
- the five plugin distributions with one resolved Git path;
- current Web source/config/package asset policy and Web/CLI changes;
- focused tests and current validation/SDK/ledger docs;
- explicitly reviewed TUI/bridge retirement deletions;
- corrected README/README_CN/changelog portions.

# Files to exclude

All runtime homes/databases, `.mcp.json`, local files, spikes, nested venvs,
node_modules, target/build/dist/cache/egg-info/pyc files, screenshots/logs,
nested fixture Git data, `acs` submodule changes, credential candidates,
unrelated pre-existing source/docs/tests, and unresolved deletions.

# Manual review required

Credential candidates; tracked Hermes template `.env`; old frontend deletion
scope; deleted Core Codex provider files; deleted historical docs; root
`.gitignore`/metadata; `e2e/`; and `scripts/preview_demo/`.

# Suggested checkpoint structure

After fixes, use four focused commits (suggestion only; no staging performed):

1. Core/application/extensions/migrations and focused tests;
2. plugin distributions and tests;
3. Web/CLI/frontend assets and tests;
4. documentation and explicitly reviewed retirement deletions.

Keep unrelated submodule, spikes, runtime data, credential candidates, and
experiments outside all four.

# Final recommendation

Do not checkpoint the current tree wholesale. Fix the Git composition and
doctor path first, then stage only reviewed Preview paths. Native Codex
rehearsal should follow those fixes.
