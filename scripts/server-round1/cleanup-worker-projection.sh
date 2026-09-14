#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || ! $1 =~ ^server_[a-f0-9]{32}$ ]]; then
  echo "usage: cleanup-worker-projection.sh server_INSTANCE_ID" >&2
  exit 2
fi

root="/tmp/agentbox-worker-r1/$1"
if [[ ! -e "$root" ]]; then
  printf '{"result":"WORKER_PROJECTION_ALREADY_ABSENT","root":"%s"}\n' "$root"
  exit 0
fi
if [[ ! -d "$root" || -L "$root" ]]; then
  echo "cleanup refused: instance root is not a real directory" >&2
  exit 1
fi
# The instance directory is shared by project projections.  If an
# instance-owned marker is present, it must match before inspecting children,
# so a stale/wrong server id can never be treated as our cleanup target.
root_marker="$root/.agentbox-worker-instance"
if [[ -e "$root_marker" &&
      ( ! -f "$root_marker" || -L "$root_marker" ||
        "$(cat -- "$root_marker")" != "$1" ) ]]; then
  echo "cleanup refused: instance owner marker mismatch" >&2
  exit 1
fi

shopt -s nullglob dotglob
children=()
for child in "$root"/*; do
  [[ "$child" == "$root_marker" ]] && continue
  children+=("$child")
done
for child in "${children[@]}"; do
  if [[ ! -d "$child" || -L "$child" || ! -f "$child/.agentbox-worker-root" ||
        -L "$child/.agentbox-worker-root" ]]; then
    echo "cleanup refused: child ownership is not proven: $child" >&2
    exit 1
  fi
  if [[ $(cat -- "$child/.agentbox-worker-root") != "agentbox-worker-r1" ]]; then
    echo "cleanup refused: child marker mismatch: $child" >&2
    exit 1
  fi
done
for child in "${children[@]}"; do
  rm -rf -- "$child"
done
if [[ -e "$root_marker" ]]; then
  rm -- "$root_marker"
fi
rmdir -- "$root"
printf '{"result":"WORKER_PROJECTION_CLEANED","root":"%s"}\n' "$root"
