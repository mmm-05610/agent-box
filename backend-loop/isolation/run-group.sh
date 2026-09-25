#!/usr/bin/env bash
# Start ONE group as an independent process inside its own bwrap sandbox.
#  REAL mode (NOT this round): inner = qodercli --model Qwen3.8-Flash — needs
#    network egress (G1) + minimal-exposure auth (G2); refused unless I approves.
#  FAKE mode (this round, default): inner = tests/fake-executor.sh — exercises the
#    sandbox + boundaries with zero model calls and zero Sol.
# Usage: run-group.sh <server|execution|harness|platform> [research|impl] [approved-task]
#   - impl REQUIRES an approved task; binds are DERIVED + validated from it (defect 2),
#     never taken from a caller-supplied path list.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/sandbox-lib.sh"
. "$HERE/impl-binds.sh"

group="${1:?usage: run-group.sh <group> [research|impl] [task]}"; phase="${2:-research}"; task="${3:-}"
case "$group" in server|execution|harness|platform) :;; *) echo "unknown group: $group" >&2; exit 2;; esac

if [ "${BE_LOOP_REAL_LAUNCH:-0}" = "1" ]; then
  echo "REAL four-group launch not authorised this round (I approval pending; G1/G2 open). See isolation.md." >&2
  exit 77
fi

if [ "$phase" = "impl" ]; then
  [ -n "$task" ] || { echo "impl phase requires an approved task id" >&2; exit 2; }
  binds="$(gen_binds "$group" "$task")" || { echo "impl aborted: approved paths failed allowlist validation" >&2; exit 3; }
  [ -n "$binds" ] || { echo "impl aborted: no valid approved writable paths for $group/$task" >&2; exit 3; }
  export BE_LOOP_IMPL_BINDS="$binds"
  echo "[run-group] group=$group phase=impl task=$task approved-binds:" >&2
  printf '  %s\n' "$binds" >&2
fi

inner=( /bin/sh /control-loop/tests/fake-executor.sh "$group" "$phase" )
echo "[run-group] group=$group phase=$phase sandbox=per-group-bwrap inner=FAKE(no-model)" >&2
if [ "${BE_LOOP_DRYRUN:-0}" = "1" ]; then
  set -x; sandbox_build "$group" "$phase" "${inner[@]}"; set +x; exit 0
fi
sandbox_build "$group" "$phase" "${inner[@]}"
