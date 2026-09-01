#!/usr/bin/env bash
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
cd "$root"
test "$root" = "/home/maoqh/projects/agent-box-harness-registry"
test "$(git branch --show-current)" = "refactor/harness-registry"
case "$(git rev-parse HEAD)" in 377088c*) ;; *) exit 1 ;; esac
git diff --cached --quiet || { echo 'pre-existing staged content' >&2; exit 1; }
paths=(
  .github/workflows/ci.yml .github/workflows/release-please.yml
  README.md README_CN.md pyproject.toml
  docs/architecture/ARCHITECTURE.md docs/getting-started/RELEASE.md
  docs/validation/current/README.md
  docs/validation/current/FIVE_HARNESS_REGISTRY_CONSOLIDATION.md
  docs/validation/current/FIVE_HARNESS_REGISTRY_CONSOLIDATION_CLOSURE.md
  docs/validation/current/FIVE_HARNESS_REGISTRY_CONSOLIDATION_CHECKPOINT_LEDGER.md
  tools/stage-five-harness-registry-checkpoint.sh
  plugins/agent-box-harnesses
  plugins/agent-box-harness-claude plugins/agent-box-harness-opencode
  plugins/agent-box-harness-hermes plugins/agent-box-pi
  tests/test_execution_runtime_composition_native_bwrap.py
  tests/test_execution_runtime_composition_native_tmux.py
)
for path in "${paths[@]}"; do
  case "$path" in
    *node_modules*|*build*|*dist*|*.egg-info*|*.pytest_cache*|*.pyc|*.env*|*auth.json|*credentials.json|*credentials.toml|*credentials.yaml|*/runtime/*|*/cache/*|*/.codex/*|*/.claude/*|*/.agents/*|*/recovery/*)
      echo "forbidden allowlist path: $path" >&2; exit 1;;
  esac
done
is_allowed() {
  local path="$1" item
  for item in "${paths[@]}"; do
    [[ "$path" == "$item" || "$path" == "$item"/* ]] && return 0
  done
  return 1
}
while IFS= read -r path; do
  is_allowed "$path" || { echo "outside checkpoint: $path" >&2; exit 1; }
done < <(git diff --name-only HEAD; git ls-files --others --exclude-standard)
for path in "${paths[@]}"; do git add -A -- "$path"; done
git diff --cached --check
git diff --cached --name-status
