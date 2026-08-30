# Repository Restructure Checkpoint Staging Ledger
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

Date: 2026-08-30
Branch: `spike/real-governed-binding`
Original HEAD: `e340f3b89d85c13d63fe8fc962cb2126177000c2`

This ledger classifies every path reported by the pre-checkpoint Git
inventory. Only paths in `INCLUDE` are eligible for the checkpoint. Paths are
listed as exact files where the approved manifest requires exact-file staging;
directory entries below mean the complete current source/test subtree after
applying the stated exclusions.

## INCLUDE

- `.gitignore`, `pyproject.toml`, `README.md`, `README_CN.md`.
- `src/agent_box/work_core/` formal source, excluding the standalone deferred
  `src/agent_box/work_core/cli.py` and its test; include approved deleted Core
  Codex provider modules as deletions.
- `src/agent_box/resource_contracts/`, `src/agent_box/extensions/`,
  `src/agent_box/application/`, and `src/agent_box/server/`.
- `src/agent_box/migrations/003_work_core.sql` and migrations `005` through
  `009`; no other migration or generated database file.
- Current formal CLI changes: `src/agent_box/cli/__init__.py`,
  `src/agent_box/cli/shell.py`, and `src/agent_box/cli/commands/`.
- `gui-web` formal frontend source under `src/`, public assets if present,
  package manifests, and configuration, excluding prototype paths,
  `node_modules`, and `dist`; include the approved deleted legacy frontend
  bridge/API/component/domain/hook/page/provider-form paths as deletions.
- Approved legacy retirements: `src/agent_box/tui/__init__.py`,
  `src/agent_box/tui/app.py`, `agent-box-gui.spec`, approved legacy GUI bridge
  files, approved GUI runtime helper scripts, and their approved tests.
- Official plugin source, tests, `README.md`, and `pyproject.toml` for:
  `plugins/agent-box-harnesses`, `plugins/agent-box-codex`,
  `plugins/agent-box-git`, `plugins/agent-box-tmux`, `plugins/agent-box-pi`,
  and `plugins/agent-box-preview-resources`.
- Approved deletions in preview-resources:
  `src/agent_box_preview_resources/config.py` and
  `src/agent_box_preview_resources/git_provider.py`.
- Formal Core/Host/plugin/frontend/browser tests under `tests/` and `e2e/`
  only when explicitly covered by the current checkpoint manifest; nested
  experimental fixtures remain deferred below.
- Valid current-round documents under `docs/adr/`, `docs/architecture/`,
  `docs/product/`, `docs/plans/`, `docs/research/`, and `docs/validation/`,
  including this ledger and the final pre-checkpoint report; historical or
  scope-unclear deletions are not included.
- `docs/README.md`, `docs/index.md`, `docs/plugins/PLUGIN_SDK.md`, and the
  two previously approved checkpoint documents.

## EXCLUDE_GENERATED

- `*.egg-info/`, `__pycache__/`, `*.pyc`, `.pytest_cache/`, `node_modules/`,
  `build/`, `dist/`, `coverage/`, wheels, logs, screenshots, sockets, and
  other build/runtime output.
- `workspace/`, `.agent-box*`, `.workboard-*`, `.worktrees`, local homes,
  runtime/profile directories, databases (`*.db`, `*.sqlite`, `*.sqlite3`),
  and temporary frontend assets.

## EXCLUDE_LOCAL_PRIVATE

- `.env`, `.mcp.json`, `CLAUDE.local.md`, auth/credential/token/secret files,
  local profile/auth homes, and any symlink whose target is outside the
  repository or points into a credential/runtime tree.
- `src/agent_box/templates/codex/auth.json`,
  `src/agent_box/templates/opencode-data/auth.json`, and
  `src/agent_box/templates/hermes/.env` remain excluded from this checkpoint;
  the latter is an empty placeholder fixture, not a reason to stage it.

## EXCLUDE_UNRELATED

- `acs` submodule, including its unconfirmed worktree modifications and
  nested dependencies.
- `report-source.md`.
- `plugins/agent-box-workboard/` generated residue and any workboard-specific
  source not listed in the approved plugin set.
- Unrelated root README/changelog, legacy runtime/config/library/launch
  changes, unrelated tests, and historical document changes outside the
  current restructure result.

## REVIEW_REQUIRED

- Entire `spikes/` tree.
- Entire `e2e/` tree except an individually approved browser test path from
  the manifest.
- `scripts/preview_demo/`, `scripts/tmux-preview.conf`, and
  `scripts/work-acp-probe.py`.
- `gui-web/prototype.html`, `gui-web/src/prototype/`, and any preview-only
  asset or script whose ownership is not formal production source.
- Historical-document deletions and any path whose status or ownership is
  not resolved by the approved manifest.
- `src/agent_box/work/`, `src/agent_box/project_space.py`, and other legacy
  product implementations not explicitly named in the allowlist.

## Secret audit gate

Before and after staging, inspect names and staged content for auth,
credential, token, secret, `.env`, API-key, Bearer-token, and private-key
indicators without printing values. Confirm profile fixtures are placeholders
and reject external-credential symlinks. A confirmed secret changes the
checkpoint verdict to `BLOCKED` and the affected path is not staged.

## Staging rule

Use only `git add -- <one exact path>` for each included file, including
approved deletions. Never use `git add .`, `git add -A`, `git add -u`, broad
globs, `git clean`, reset, checkout, or restore.
