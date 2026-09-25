#!/usr/bin/env bash
# be-loop.sh — BE-LOOP-001 THIN central controller (role C).
# Adds ONLY: controlled start/stop, approval-state transitions, idempotent
# messages, atomic budget + the single gated Sol entry, checkpoint records.
# Does NOT rewrite native scheduling; does NOT run a general framework.
# Never launches the real four groups (run-group.sh is FAKE-only this round).
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"           # control/backend-loop
STATE="$HERE/state"; LEDGERDIR="$HERE/ledger"; mkdir -p "$STATE"/{pid,approvals,messages,checkpoints,sol}
BE_GROUPS="server execution harness platform"
export BE_LOOP_CTRL="$ROOT" BE_LOOP_APPROVED_DIR="$STATE/approvals"
. "$ROOT/isolation/impl-binds.sh"
LEDGER="${BE_LOOP_BUDGET:-$LEDGERDIR/budget.json}"; export BE_LOOP_BUDGET="$LEDGER"
BUD="$HERE/budget.py"; LOCK="$STATE/controller.lock"
SOLM="${BE_LOOP_SOL_MODEL:-gpt-5.6-sol}"

die(){ echo "ERROR: $*" >&2; exit 1; }
gcode(){ case "$1" in server) echo S;; execution) echo E;; harness) echo H;; platform) echo P;; *) echo "$1";; esac; }
atomic(){ local p="$1" t="$1.tmp.$$"; cat > "$t"; mv -f "$t" "$p"; }
get_state(){ cat "$STATE/status.$1" 2>/dev/null || echo IDLE; }
set_state(){ printf '%s\n' "$2" | atomic "$STATE/status.$1"; echo "[state] $1 -> $2"; }
group_outbox(){ echo "$ROOT/../../worktrees/backend-loop/$1/outbox"; }
# run body under the controller single-instance lock (serialises all state transitions)
with_lock(){ exec 9>"$LOCK"; flock -x 9; "$@"; local r=$?; flock -u 9; exec 9>&-; return $r; }
# identity-verified liveness: pid alive AND same start-time AND our run-group cmdline with this group
proc_ours(){ local pid="$1" ticks="$2" g="$3"
  [ -d "/proc/$pid" ] || return 1
  local now; now="$(awk '{print $22}' "/proc/$pid/stat" 2>/dev/null)" || return 1
  [ "$now" = "$ticks" ] || return 1
  tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | grep -q "run-group.sh" || return 1
  tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | grep -q "$g"
}
read_pidrec(){ cat "$STATE/pid/$1" 2>/dev/null; }

cmd_start(){ with_lock _start "$@"; }
_start(){ local g="${1:?group}"; local phase="${2:-research}"; local task="${3:-}"
  case " $BE_GROUPS " in *" $g "*) :;; *) die "bad group";; esac
  local rec; rec="$(read_pidrec "$g")"
  if [ -n "$rec" ]; then set -- $rec; if proc_ours "$1" "$2" "$g"; then echo "[start] $g already running pid=$1"; return 0; fi; fi
  local tok="tok-$$-$RANDOM"; local out="$STATE/lastout.$g"; local pid
  setsid env BE_LOOP_GROUP_TOKEN="$tok" bash "$ROOT/isolation/run-group.sh" "$g" "$phase" "$task" >"$out" 2>&1 & pid=$!
  local ticks; ticks="$(awk '{print $22}' "/proc/$pid/stat" 2>/dev/null || echo '?')"
  printf '%s\t%s\t%s\t%s\t%s\n' "$pid" "$ticks" "$tok" "$phase" "$task" | atomic "$STATE/pid/$g"
  printf '%s %s\n' "$phase" "$task" | atomic "$STATE/phase.$g"
  case "$phase" in
    research) [ "$(get_state "$g")" = IDLE ] && set_state "$g" RESEARCH || echo "[start] $g kept state=$(get_state "$g")";;
    impl)     set_state "$g" IMPLEMENTING;;
  esac
  echo "[start] $g phase=$phase pid=$pid (fae-executor, no-model)"
}

cmd_stop(){ with_lock _stop "$@"; }
_stop(){ local t="${1:?group|--all}"; local list="$t"; [ "$t" = --all ] && list="$BE_GROUPS"
  for g in $list; do local rec; rec="$(read_pidrec "$g")"
    [ -z "$rec" ] && { echo "[stop] no owned pid record for $g"; continue; }
    local pid ticks tok ph tk; IFS=$'\t' read -r pid ticks tok ph tk <<< "$rec"
    if proc_ours "$pid" "$ticks" "$g"; then
      kill -TERM -- -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
      echo "[stop] $g killed owned process group -$pid"
    else
      echo "[stop] $g pid=$pid STALE/FOREIGN (identity mismatch, likely recycled) — NOT killing"
    fi
    rm -f "$STATE/pid/$g"
  done
}

cmd_resume(){ with_lock _resume "$@"; }
_resume(){ local t="${1:?group|--all}"; local list="$t"; [ "$t" = --all ] && list="$BE_GROUPS"
  for g in $list; do local st; st="$(get_state "$g")"
    [ "$st" = DONE ] && { echo "[resume] $g DONE, skip"; continue; }
    local rec; rec="$(read_pidrec "$g")"
    if [ -n "$rec" ]; then IFS=$'\t' read -r pid ticks tok ph tk <<< "$rec"; if proc_ours "$pid" "$ticks" "$g"; then echo "[resume] $g alive pid=$pid"; continue; fi; fi
    local ph="research" tk=""; [ -f "$STATE/phase.$g" ] && read -r ph tk < "$STATE/phase.$g"
    echo "[resume] $g state=$st pid-gone -> relaunch SAME phase=$ph task=$tk (no downgrade)"
    _start "$g" "$ph" "$tk"
    set_state "$g" "$st"   # restore the prior state (do not clobber to RESEARCH)
  done
}

cmd_approve(){ with_lock _approve "$@"; }
_approve(){ local g="${1:?group}" task="${2:?task}"; shift 2; local paths=("$@")
  [ "${#paths[@]}" -gt 0 ] || { echo "approve needs >=1 writable path"; return 2; }
  local ok=1 line="" p
  for p in "${paths[@]}"; do
    local rel="${p#/source/}"; rel="${rel#$BE_LOOP_SRC/}"; rel="${rel#./}"
    local chk; chk="$(allowlist_check "$g" "$rel")" || { echo "$chk"; ok=0; continue; }
    line="$line
writable=$rel"
  done
  [ "$ok" = 1 ] || { echo "[approve] REFUSED: one or more paths outside allowlist for $g"; return 3; }
  { echo "group=$g task=$task approved_by=C ts=$(date -Iseconds)"
    printf '%s\n' "$line" | sed '/^$/d'; } | atomic "$STATE/approvals/$g.$task.APPROVED"
  printf '%s %s\n' "impl" "$task" | atomic "$STATE/phase.$g"
  set_state "$g" APPROVED
  echo "[approve] $g task=$task -> APPROVED; impl paths recorded (validated). executor cannot edit this (read-only bind)"
}

cmd_collect(){ with_lock _collect; }
_collect(){ local seen="$STATE/messages/processed.ids"; touch "$seen"
  for g in $BE_GROUPS; do local ob; ob="$(group_outbox "$g")"; [ -d "$ob" ] || continue
    for m in "$ob"/msg.*.json; do [ -e "$m" ] || continue
      local id; id="$(basename "$m" .json)"
      if grep -qxF "$id" "$seen"; then echo "[collect] $g $id already processed (ACK only, no re-dispatch)"; continue; fi
      local typ; typ="$(sed -n 's/.*"type": *"\([A-Z_]*\)".*/\1/p' "$m" | head -1)"
      printf '%s\n' "$id" >> "$seen"
      printf '{"ack_for":"%s","by":"central","ts":"%s"}\n' "$id" "$(date -Iseconds)" | atomic "$STATE/messages/ack.$id.json"
      echo "[collect] $g $id type=$typ -> ACK"
      case "$typ" in DESIGN_READY) set_state "$g" CENTRAL_REVIEW;; CHECKPOINT) set_state "$g" CHECKPOINT_READY;; BLOCKED) echo "[collect] $g BLOCKED";; esac
    done; done
}

# ---- THE SOLE Sol entry (defects 1 & 3) ----
cmd_sol(){ with_lock _sol "$@"; }
_sol(){ local g="${1:?group}" rid="${2:?request-id}" milestone="${3:?milestone}" cand="${4:?candidate-file}"
  local rtask="${5:-}" rver="${6:-}"
  local code; code="$(gcode "$g")"
  if { [ "$code" = H ] || [ "$code" = P ]; } && ! ls "$STATE/approvals/$g".*.APPROVED >/dev/null 2>&1; then
    echo "[sol] $g no central plan approval -> refuse before spending"; return 2; fi
  [ -f "$cand" ] || { echo "[sol] candidate file missing"; return 2; }
  local out rc
  out="$(python3 "$BUD" consume --group "$code" --milestone "$milestone" --request-id "$rid" --model "$SOLM")"; rc=$?
  printf '%s\n' "$out"
  if [ "$rc" = 10 ]; then echo "[sol] DUPLICATE request-id -> reviewer NOT called again (idempotent)"; return 0; fi
  if [ "$rc" != 0 ]; then echo "[sol] budget refused -> no reviewer call"; return 2; fi
  # NEW grant (rc 0). resolve reviewer
  local reviewer
  if [ -n "${BE_LOOP_REVIEWER:-}" ]; then reviewer="$BE_LOOP_REVIEWER"
  elif [ "${BE_LOOP_FAKE_REVIEW:-1}" = "1" ]; then reviewer="$ROOT/tests/fake-reviewer.sh"
  else echo "[sol] REAL codex review not authorised this round"; python3 "$BUD" record --request-id "$rid" --result error; return 77; fi
  local rout; rout="$("$reviewer" "$cand")"; local rrc=$?
  if [ "$rrc" != 0 ]; then echo "[sol] reviewer NONZERO exit ($rrc) -> counted, NOT approved"
    python3 "$BUD" record --request-id "$rid" --result error; set_state "$g" CENTRAL_REVIEW; return 3; fi
  # exact-match validation: candidate digest, task, milestone, contract version, schema
  local want_sha; want_sha="$(sha256sum "$cand" | cut -d' ' -f1)"
  local chk; chk="$(printf '%s' "$rout" | MILE="$milestone" RT="$rtask" RV="$rver" WSHA="$want_sha" python3 -c '
import sys,json,os
try: d=json.load(sys.stdin)
except Exception: print("BAD schema"); sys.exit(0)
if d.get("verdict") not in ("accept","reject"): print("BAD verdict"); sys.exit(0)
for k in ("candidate_sha","milestone","evidence_path","reason"):
    if not d.get(k): print("BAD missing "+k); sys.exit(0)
if d["candidate_sha"]!=os.environ["WSHA"]: print("BAD candidate-sha"); sys.exit(0)
if d["milestone"]!=os.environ["MILE"]: print("BAD milestone"); sys.exit(0)
if os.environ["RT"] and d.get("task")!=os.environ["RT"]: print("BAD task"); sys.exit(0)
if os.environ["RV"] and d.get("contract_version")!=os.environ["RV"]: print("BAD version"); sys.exit(0)
print("OK "+d["verdict"])' 2>/dev/null)"
  case "$chk" in
    "OK accept") python3 "$BUD" record --request-id "$rid" --result ok
                 printf '%s\n' "$rout" | atomic "$STATE/sol/$rid.json"; set_state "$g" APPROVED; echo "[sol] VERIFIED ACCEPT -> APPROVED"; return 0;;
    "OK reject") python3 "$BUD" record --request-id "$rid" --result ok
                 printf '%s\n' "$rout" | atomic "$STATE/sol/$rid.json"; set_state "$g" CENTRAL_REVIEW; echo "[sol] verified REJECT -> CENTRAL_REVIEW"; return 0;;
    *) echo "[sol] reviewer output INVALID/MISMATCH [$chk] -> counted, NOT promoted"
       python3 "$BUD" record --request-id "$rid" --result error; set_state "$g" CENTRAL_REVIEW; return 3;;
  esac
}

cmd_checkpoint(){ with_lock _chk "$@"; }
_chk(){ local g="${1:?group}" json="${2:?json}"; printf '%s\n' "$json" | atomic "$STATE/checkpoints/$g.$(date +%s).json"; set_state "$g" CHECKPOINT_READY; echo "[checkpoint] $g recorded by central"
}

cmd_status(){ with_lock _status; }
_status(){ echo "== BE-LOOP-001 central status =="
  echo "baseline(dev-0): b067c5718556c8efa93b054e6573ad3d186b3cf6"
  echo "sol model: $SOLM (slug verified via frontend codex debug models; NOT a live-call proof)"
  for g in $BE_GROUPS; do local rec; rec="$(read_pidrec "$g")"; local pid="-"
    if [ -n "$rec" ]; then IFS=$'\t' read -r p t k ph tk <<< "$rec"; proc_ours "$p" "$t" "$g" && pid="$p" || pid="stale"; fi
    printf '  group %-10s state=%-16s pid=%s\n' "$g" "$(get_state "$g")" "$pid"
  done
  echo "-- sol budget --"; python3 "$BUD" status 2>&1 | sed 's/^/  /'
}

usage(){ cat <<EOF
be-loop.sh <command> [...]
  start <group> [research|impl] [task]     launch FAKE executor in its own bwrap (REAL refused)
  stop   <group>|--all                     kill ONLY identity-verified owned process groups
  resume <group>|--all                     relaunch same phase for non-DONE groups (no state downgrade)
  status                                   one-page: baseline / group phase / sol used·reserved·flex / blocks
  approve <group> <task> <src-relative-paths...>   validate vs allowlist, then write APPROVED (C-only) + open impl paths
  collect                                  process each outbox idempotently (no re-dispatch/re-review)
  sol-review <group> <request-id> <milestone> <candidate-file> [task] [contract-version]
      SOLE Sol entry: consume(new/dup/refuse) -> reviewer -> EXACT-match candidate sha/task/milestone/version
      -> record -> promote only on verified ACCEPT. Duplicate request-id never re-calls.
  checkpoint <group> '<json>'              central records a checkpoint
Env: BE_LOOP_FAKE_REVIEW=1 (default) uses fake-reviewer.sh, never codex.
EOF
}
main(){ c="${1:-}"; shift || true; case "$c" in
  start) cmd_start "$@";; stop) cmd_stop "$@";; resume) cmd_resume "$@";; status) cmd_status "$@";;
  approve) cmd_approve "$@";; collect) cmd_collect "$@";; sol-review) cmd_sol "$@";; checkpoint) cmd_checkpoint "$@";;
  ""|help|-h|--help) usage;; *) usage; exit 2;; esac; }
main "$@"
