#!/usr/bin/env bash
set -euo pipefail

# This script is intentionally an exact-path allowlist. It is for a terminal
# where .git/index is writable; review the resulting cached diff before commit.

git add -- .gitignore README.md README_CN.md pyproject.toml
git add -- docs/README.md docs/index.md docs/plugins/PLUGIN_SDK.md
git add -- docs/plans/PREVIEW_CHECKPOINT_STAGING_MANIFEST_2026-08-28.md
git add -- docs/validation/PREVIEW_CHECKPOINT_BLOCKER_FIX_2026-08-28.md
git add -- docs/plans/REPOSITORY_RESTRUCTURE_MASTER_PLAN.md
git add -- docs/plans/RESTRUCTURE_CHECKPOINT_STAGING_LEDGER.md
git add -- docs/validation/RESTRUCTURE_PRECHECKPOINT_2026-08-30.md
git add -- docs/research/REPOSITORY_RESTRUCTURE_LEGACY_OWNERSHIP_AUDIT.md
git add -- docs/research/REPOSITORY_RESTRUCTURE_CORE_FREEZE_AUDIT.md
git add -- docs/research/REPOSITORY_RESTRUCTURE_WEB_PLUGIN_AUDIT.md
git add -- docs/research/REPOSITORY_RESTRUCTURE_HARNESS_PLUGIN_AUDIT.md
git add -- tools/create-restructure-checkpoint.sh

exact_files=(
  src/agent_box/cli/__init__.py src/agent_box/cli/shell.py
  src/agent_box/cli/commands/plugins.py src/agent_box/cli/commands/work.py
  src/agent_box/migrations/003_work_core.sql
  src/agent_box/migrations/005_resource_contract_inputs.sql
  src/agent_box/migrations/006_resource_contract_inputs.sql
  src/agent_box/migrations/007_resource_observations.sql
  src/agent_box/migrations/008_resource_observation_evidence_metadata.sql
  src/agent_box/migrations/009_execution_finalization.sql
  src/agent_box/work_core/__init__.py src/agent_box/work_core/errors.py
  src/agent_box/work_core/events.py src/agent_box/work_core/finalization.py
  src/agent_box/work_core/registry.py src/agent_box/work_core/repository.py
  src/agent_box/work_core/services.py
  src/agent_box/work_core/providers/__init__.py
  src/agent_box/work_core/providers/resources.py
  src/agent_box/work_core/resource_observations.py
)

# Formal source/test subtrees are enumerated into individual exact paths.
for root in src/agent_box/application src/agent_box/extensions \
           src/agent_box/resource_contracts src/agent_box/server \
           plugins/agent-box-harnesses plugins/agent-box-codex \
           plugins/agent-box-git plugins/agent-box-tmux plugins/agent-box-pi \
           plugins/agent-box-preview-resources; do
  while IFS= read -r -d '' path; do
    case "$path" in
      */.egg-info/*|*/*.egg-info/*|*/__pycache__/*|*/node_modules/*|*/dist/*|*/build/*) continue ;;
    esac
    exact_files+=("$path")
  done < <(find "$root" -type f -print0)
done

# Production Web source is a formal checkpoint input. Prototype code remains
# deliberately excluded until its disposition is approved.
for root in gui-web/src gui-web/public; do
  while IFS= read -r -d '' path; do
    case "$path" in
      gui-web/src/prototype/*|*/__pycache__/*|*/node_modules/*|*/dist/*) continue ;;
    esac
    exact_files+=("$path")
  done < <(find "$root" -type f -print0)
done

for path in gui-web/index.html gui-web/package.json gui-web/package-lock.json \
            gui-web/eslint.config.js gui-web/tsconfig.json \
            gui-web/tsconfig.app.json gui-web/tsconfig.node.json; do
  if [[ -f "$path" ]]; then exact_files+=("$path"); fi
done

exact_files+=(
  gui-web/src/App.tsx gui-web/src/api/client.ts gui-web/src/api/query.ts
  gui-web/src/api/types.ts gui-web/src/i18n/en.ts gui-web/src/i18n/index.ts
  gui-web/src/i18n/zh.ts gui-web/src/i18n/workbench.ts gui-web/src/index.css
  gui-web/src/main.tsx gui-web/src/workbench.css gui-web/vite.config.ts
  agent-box-gui.spec gui-web/bridge.py gui-web/data_linux.py gui-web/data_wsl.py
  gui-web/rpc_server.py scripts/build-gui-runtime.sh scripts/diag-gui.bat
  scripts/stage-windows-build.sh scripts/verify-exe-runtime.py
  src/agent_box/tui/__init__.py src/agent_box/tui/app.py
  tests/test_extensions.py tests/test_host_operations.py
  tests/test_resource_contracts.py tests/test_web_static.py
  tests/test_work_core.py tests/test_work_core_finalization.py
  tests/test_work_core_input_dispatch.py
  tests/test_work_core_real_resource_observation.py
  tests/test_work_core_resource_observation.py
  tests/test_work_core_resource_observations.py
  tests/test_work_core_responsibility.py tests/test_work_core_contracts.py
  tests/test_work_core_repository.py tests/test_work_core_services.py
  tests/test_work_core_vertical_slice.py
  tests/test_work_core_real_resource_providers.py tests/test_work_service.py
  tests/test_gui_rpc_parity.py
)

# Approved deleted legacy GUI paths are resolved individually from Git's
# deletion list; no directory or glob is passed to git add.
while IFS= read -r -d '' path; do exact_files+=("$path"); done \
  < <(git diff --name-only --diff-filter=D -z -- gui-web/src)
exact_files+=(
  src/agent_box/work_core/providers/codex.py
  src/agent_box/work_core/providers/codex_jsonl.py
  src/agent_box/work_core/providers/codex_launch.py
  tests/test_work_core_codex_jsonl.py tests/test_work_core_codex_launch.py
  plugins/agent-box-preview-resources/src/agent_box_preview_resources/config.py
  plugins/agent-box-preview-resources/src/agent_box_preview_resources/git_provider.py
)

for path in "${exact_files[@]}"; do
  if [[ -e "$path" || -L "$path" ]] || git ls-files --error-unmatch -- "$path" >/dev/null 2>&1; then
    git add -- "$path"
  fi
done

echo 'Review git diff --cached --name-status, --stat, --check, and secret scan.'
