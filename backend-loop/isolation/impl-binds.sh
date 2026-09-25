#!/usr/bin/env bash
# impl-binds.sh — the CONTROLLED entry that turns an APPROVED record into
# sandbox --bind pairs, after validating each against permissions/impl-allow.map.
# Closes defect 2: sandbox impl mounts are NEVER taken from a raw caller-supplied
# path list; they are derived from the approved record and re-validated here.
#
# Sources nothing; provides functions. Used by be-loop.sh (approve) and run-group.sh (impl).

BE_LOOP_ROOT="${BE_LOOP_ROOT:-/home/maoqh/projects/ordessa}"
BE_LOOP_SRC="${BE_LOOP_SRC:-$BE_LOOP_ROOT/worktrees/integration-linux/backend}"
BE_LOOP_CTRL="${BE_LOOP_CTRL:-$BE_LOOP_ROOT/control/backend-loop}"
IMPL_MAP="$BE_LOOP_CTRL/permissions/impl-allow.map"
APPROVED_DIR="${BE_LOOP_APPROVED_DIR:-$BE_LOOP_CTRL/controller/state/approvals}"

# _allowlists <group> -> sets ALLOW_PRE / DENY_PRE (newline-separated)
_allowlists() {
  local g="$1" sec="" a="" d=""
  while IFS= read -r line; do
    case "$line" in ''|\#*) continue;; esac
    if [ "$line" = server ]||[ "$line" = execution ]||[ "$line" = harness ]||[ "$line" = platform ]; then sec="$line"; continue; fi
    [ "$sec" = "$g" ] || continue
    case "$line" in
      allow\ *) a="$a${line#allow }
";; deny\ *) d="$d${line#deny }
";;
    esac
  done < "$IMPL_MAP"
  ALLOW_PRE="$a"; DENY_PRE="$d"
}

# allowlist_check <group> <rel-path-under-source>  -> prints REJECT reason on stdout, exit!=0 on reject
allowlist_check() {
  local g="$1" rel="$2"
  _allowlists "$g"
  case "$rel" in /*) echo "REJECT absolute-path $rel"; return 1;; esac
  printf '%s' "$rel" | grep -q '\.\.' && { echo "REJECT traversal $rel"; return 1; }
  [ "$rel" = "." ] || [ -z "$rel" ] && { echo "REJECT empty/root target"; return 1; }
  # shadow guard: cannot target the whole source root or a mount we pin read-only
  case "$rel" in
    src/agent_box/work_core/*|src/agent_box/work_core) echo "REJECT core-frozen $rel"; return 1;;
  esac
  local matched=0 line
  while IFS= read -r line; do [ -z "$line" ] && continue
    case "$rel" in "$line"|"$line"*) matched=1;; esac
  done <<EOF
$ALLOW_PRE
EOF
  [ "$matched" = 1 ] || { echo "REJECT not-in-allowlist $rel (group $g)"; return 1; }
  while IFS= read -r line; do [ -z "$line" ] && continue
    case "$rel" in "$line"|"$line"*) echo "REJECT excluded $rel"; return 1;; esac
  done <<EOF
$DENY_PRE
EOF
  echo "OK"; return 0
}

# approved_rels <group> <task> -> validated REL paths (one per line); abort on any invalid
approved_rels() {
  local g="$1" task="$2" f="$APPROVED_DIR/$g.$task.APPROVED"
  [ -f "$f" ] || { echo "NO-APPROVED $f" >&2; return 1; }
  local ok=0
  while IFS= read -r line; do
    case "$line" in writable=*) :;; *) continue;; esac
    local rel="${line#writable=}"; rel="${rel#/source/}"; rel="${rel#./}"
    local chk; chk="$(allowlist_check "$g" "$rel")" || { echo "$chk" >&2; ok=1; continue; }
    printf '%s\n' "$rel"
  done < "$f"
  [ "$ok" = 0 ] || return 1
}

# gen_binds <group> <task> -> "host_path:sandbox_path" pairs (host-side absolute)
gen_binds() {
  local g="$1" task="$2" rel
  while IFS= read -r rel; do
    [ -z "$rel" ] && continue
    printf '%s:%s\n' "$BE_LOOP_SRC/$rel" "/source/$rel"
  done < <(approved_rels "$g" "$task")
}
