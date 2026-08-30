#!/usr/bin/env bash
set -euo pipefail

# Precise staging helper for the restructure checkpoint.
# This script stages only the allowlisted paths below. It never commits,
# pushes, changes working files, or uses `git add .`, `git add -A`, or an
# unbounded `git add -u`.

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || die 'not inside a Git worktree'
cd "$repo_root"

git_dir=$(git rev-parse --git-dir)
index_path=$(git rev-parse --git-path index)
[[ -e "$index_path" ]] || die "Git index does not exist: $index_path"
[[ -r "$index_path" ]] || die "Git index is not readable: $index_path"
[[ -w "$index_path" ]] || die "Git index is not writable: $index_path"
git diff --cached --quiet || die 'pre-existing staged content detected; review it before running this script'

# Re-read status at execution time. The generated allowlist is intentionally
# independent from this status snapshot; only paths matching the allowlist
# and present in this fresh snapshot can be staged.
git status --short --untracked-files=all >&2

# Exact allowlist: current Root, official plugins, Pi example plugin, current
# docs/validation closure, CI/release files, and approved legacy deletions.
allowlist=(
  .github
  .gitignore
  .gitmodules
  CHANGELOG.md
  CLAUDE.md
  CONVENTIONS.md
  CONVENTIONS_FRONTEND.md
  LICENSE
  README.md
  README_CN.md
  pyproject.toml
  release-please-config.json
  .release-please-manifest.json
  docs
  src/agent_box
  plugins/agent-box-web
  plugins/agent-box-harnesses
  plugins/agent-box-git
  plugins/agent-box-tmux
  plugins/agent-box-artifacts
  plugins/agent-box-pi
  plugins/agent-box-codex
  plugins/agent-box-preview-resources
  tests
  tools
  acs
  assets/logo.ico
  assets/logo.png
  gui-web
  scripts/history_test.sh
  scripts/smoke_test_gui.py
  setup.iss
  spikes
  workspace
)

# Verify every allowlist target against either the working tree or the index;
# deleted paths are valid targets because they remain tracked in the index.
for target in "${allowlist[@]}"; do
  if [[ ! -e "$target" && ! -L "$target" ]]; then
    git ls-files --error-unmatch -- "$target" >/dev/null 2>&1 ||
      die "allowlist target is neither present nor tracked: $target"
  fi
done

is_allowed() {
  local path=$1 target
  for target in "${allowlist[@]}"; do
    [[ "$path" == "$target" || "$path" == "$target"/* ]] && return 0
  done
  return 1
}

# Exclude secret-bearing files and local/generated material while retaining
# source code such as a provider's credentials.py module.
is_forbidden() {
  local path=$1 component
  [[ "$path" == report-source.md || "$path" == */report-source.md ]] && return 0
  [[ "$path" == .agent-box* || "$path" == .agent-box*/* ]] && return 0
  [[ "$path" == .claude || "$path" == .claude/* ]] && return 0
  [[ "$path" == .codex || "$path" == .codex/* ]] && return 0
  [[ "$path" == .agents || "$path" == .agents/* ]] && return 0
  [[ "$path" == .worktrees || "$path" == .worktrees/* ]] && return 0
  [[ "$path" == .workboard-* || "$path" == .workboard-*/* ]] && return 0
  [[ "$path" == node_modules || "$path" == node_modules/* ]] && return 0
  [[ "$path" == */node_modules || "$path" == */node_modules/* ]] && return 0
  [[ "$path" == dist || "$path" == dist/* || "$path" == */dist || "$path" == */dist/* ]] && return 0
  [[ "$path" == build || "$path" == build/* || "$path" == */build || "$path" == */build/* ]] && return 0
  [[ "$path" == runtime || "$path" == runtime/* || "$path" == */runtime || "$path" == */runtime/* ]] && return 0
  [[ "$path" == database || "$path" == database/* || "$path" == */database || "$path" == */database/* ]] && return 0
  [[ "$path" == cache || "$path" == cache/* || "$path" == */cache || "$path" == */cache/* ]] && return 0
  [[ "$path" == *.env || "$path" == *.env.* || "$path" == */.env || "$path" == */.env.* ]] && return 0
  [[ "$path" == */auth.json || "$path" == auth.json || "$path" == */auth.toml || "$path" == auth.toml ]] && return 0
  [[ "$path" == */credentials.json || "$path" == credentials.json || "$path" == */credentials.toml || "$path" == credentials.toml || "$path" == */credentials.yaml || "$path" == credentials.yaml || "$path" == */credentials.yml || "$path" == credentials.yml ]] && return 0
  while IFS= read -r component; do
    [[ "$component" == .agent-box* || "$component" == .claude || "$component" == .codex || "$component" == .agents || "$component" == .worktrees || "$component" == node_modules ]] && return 0
  done < <(printf '%s\n' "$path" | tr '/' '\n')
  return 1
}

declare -a candidates=()
declare -A seen=()
while IFS= read -r -d '' path; do
  [[ -n "${seen[$path]+yes}" ]] && continue
  seen["$path"]=1
  candidates+=("$path")
done < <(git diff --name-only -z)
while IFS= read -r -d '' path; do
  [[ -n "${seen[$path]+yes}" ]] && continue
  seen["$path"]=1
  candidates+=("$path")
done < <(git ls-files --others --exclude-standard -z)

declare -a stage_paths=()
for path in "${candidates[@]}"; do
  is_allowed "$path" || continue
  is_forbidden "$path" && continue
  stage_paths+=("$path")
done

[[ ${#stage_paths[@]} -gt 0 ]] || die 'no current changed path matched the allowlist'

# Stage each exact path separately. In particular, deletions are staged by
# their named paths; there is no broad update operation.
for path in "${stage_paths[@]}"; do
  git add -- "$path"
done

if git diff --cached --name-only | while IFS= read -r path; do is_forbidden "$path" && { printf '%s\n' "$path"; break; }; done | rg -q .; then
  die 'forbidden path was staged'
fi

printf '%s\n' '-- git diff --cached --stat --'
git diff --cached --stat
printf '%s\n' '-- git diff --cached --name-status --'
git diff --cached --name-status
printf '%s\n' '-- remaining unstaged/untracked status --'
git status --short --untracked-files=all
