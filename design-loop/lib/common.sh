# lib/common.sh — primitives: logging, atomic writes, ledgers, asserts.
# Sourced by loop.sh. No side effects at source time beyond function defs.

fn_die(){ printf '%s\n' "FATAL: $*" >> "$FE_LOGS/loop.log"; printf 'FATAL: %s\n' "$*" >&2; exit 1; }
fn_note(){ mkdir -p "$FE_LOGS" 2>/dev/null; printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$FE_LOGS/loop.log"; }
fn_sha(){ sha256sum "$1" 2>/dev/null | cut -d' ' -f1; }
fn_sha_str(){ printf '%s' "$1" | sha256sum | cut -c1-16; }
fn_scrub(){ printf '%s' "$1" | tr '\t\n\r' '   ' | tr '|' '/'; }

fn_reserve_path(){
  case "$1" in
    "$FE_WRITE_ROOT"/*|"$FE_WRITE_ROOT") return 0 ;;
    "$FE_RUN"/*|"$FE_RUN") return 0 ;;
    *) fn_die "write outside authority: $1" ;;
  esac
}
fn_assert_readonly(){
  local p
  for p in "$@"; do
    case "$p" in "$FE_RUN"*|"$FE_LOOP"*) fn_die "read-only material points at writable area: $p" ;; esac
  done
  return 0
}

fn_atomic(){ # fn_atomic <target> <content-file>
  local t="$1" s="$2" d
  mkdir -p "$FE_TMP" "$(dirname "$t")"
  fn_reserve_path "$t"
  d=$(dirname "$t"); mkdir -p "$d"
  mv -f "$s" "$t"
  sync "$t" 2>/dev/null || true
}
fn_write(){ # fn_write <target> ; content on stdin
  local t="$1" tmp d
  mkdir -p "$FE_TMP" "$(dirname "$t")"
  fn_reserve_path "$t"
  d=$(dirname "$t"); mkdir -p "$d"
  tmp="$FE_TMP/w.$(basename "$t").$$"
  cat > "$tmp"
  mv -f "$tmp" "$t"
  sync "$t" 2>/dev/null || true
}

# ---- state.env (controller checkpoint) --------------------------------------
fn_state_get(){ local k="$1"; [ -f "$FE_RUN/state.env" ] || { printf ''; return 0; }; sed -n "s/^$k=//p" "$FE_RUN/state.env" | tail -1; }
fn_state_set(){ # fn_state_set K=V [K=V ...]  (read-modify-write on a key set)
  local f="$FE_RUN/state.env" tmp k v
  mkdir -p "$FE_TMP"
  tmp="$FE_TMP/state.$$.tmp"
  [ -f "$f" ] && cp "$f" "$tmp" || : > "$tmp"
  for kv in "$@"; do
    k=${kv%%=*}; v=${kv#*=}
    if grep -q "^$k=" "$tmp" 2>/dev/null; then
      sed "s|^$k=.*|$k=$v|" "$tmp" > "$tmp.n" && mv "$tmp.n" "$tmp"
    else
      printf '%s=%s\n' "$k" "$v" >> "$tmp"
    fi
  done
  fn_atomic "$f" "$tmp"
  rm -f "$tmp".n 2>/dev/null || true
}

# ---- generic pipe-separated ledger helpers ----------------------------------
fn_ledger_init(){ local f="$1"; shift; fn_reserve_path "$f"; mkdir -p "$(dirname "$f")"; [ -f "$f" ] || printf '%s\n' "$*" > "$f"; }
fn_ledger_rows(){ local f="$1" skip=1; [ -f "$f" ] || return 0; awk 'NR>1' "$f"; }
fn_ledger_field(){ # fn_ledger_field <file> <idx> [awk-condition on whole line]
  local f="$1" i="$2" cond="${3:-}"
  awk -F'|' -v i="$i" 'NR>1 { print $i }' "$f" 2>/dev/null
}

# ---- counterexample ledger ---------------------------------------------------
# canonical columns (1-based, pipe separated):
# 1 id  2 raised_round  3 severity  4 status  5 invariant  6 title
# 7 evidence  8 target_ce_ids  9 replayed_round
# 7 evidence  8 target_ce_ids  9 replayed_round  10 subject  11 subject_note
FE_CE_COLS='id|raised_round|severity|status|invariant|title|evidence|targets|replayed|subject|subject_note'
FE_LEDGER="$FE_RUN/counterexamples.tsv"

# Attribution matters: a defect belonging to a candidate that is not the saved
# one must not block the saved candidate, and setting that candidate aside is
# not a repair of it. Unknown subject still counts (conservative).
fn_ce_open_major(){ local f="$FE_LEDGER"; [ -f "$f" ] || { echo 0; return 0; }
  awk -F'|' 'NR>1 && ($4=="OPEN"||$4=="DISPUTED") && $3=="major" {
      s = ($10=="" ? "unassigned" : $10)
      if (s != "B-alternative") n++ } END{print n+0}' "$f"; }
# every defect belonging to a discarded alternative, whatever its status: A-side
# rulings must never reduce this number, so the count cannot be zeroed away
fn_ce_deferred_major(){ local f="$FE_LEDGER"; [ -f "$f" ] || { echo 0; return 0; }
  awk -F'|' 'NR>1 && $3=="major" && $10=="B-alternative" {n++} END{print n+0}' "$f"; }
fn_ce_any_open(){ local f="$FE_LEDGER"; [ -f "$f" ] || { echo 0; return 0; }
  awk -F'|' 'NR>1 && ($4=="OPEN"||$4=="DISPUTED") {n++} END{print n+0}' "$f"; }
# CLOSED major not yet replayed against a candidate that claims to fix it
fn_ce_ids(){ local f="$FE_LEDGER"; [ -f "$f" ] || return 0; awk -F'|' 'NR>1{print $1}' "$f"; }

# ---- scenario coverage ledger -------------------------------------------------
# columns: 1 sid  2 status  3 owner  4 mechanism  5 evidence_ref  6 last_round
FE_SC="$FE_RUN/scenarios.tsv"

# ---- locks ------------------------------------------------------------------
fn_pid_alive(){ local p="$1"; [ -n "$p" ] || return 1; kill -0 "$p" 2>/dev/null; }
fn_lock_alive(){
  local lp; [ -f "$FE_LOCK" ] || return 1
  lp=$(sed -n 's/^pid=//p' "$FE_LOCK" 2>/dev/null | head -1)
  fn_pid_alive "$lp" || return 1
  printf '%s' "$lp"
  return 0
}
fn_lock_acquire(){
  mkdir -p "$FE_RUN" "$FE_LOGS" "$FE_TMP"
  if lp=$(fn_lock_alive); then
    printf 'loop already running (pid=%s)\n' "$lp" >&2
    return 1
  fi
  if [ -f "$FE_LOCK" ]; then fn_note "stale lock present, reclaiming"; rm -f "$FE_LOCK"; fi
  fn_reserve_path "$FE_LOCK"
  printf 'pid=%s\ntoken=%s\nstarted=%s\n' "$$" "$FE_LOCK_TOKEN_VALUE" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$FE_LOCK"
  printf '%s' "$FE_LOCK_TOKEN_VALUE" > "$FE_LOCK_TOKEN"
  fn_state_set "PID=$$"
  return 0
}
fn_lock_release(){ rm -f "$FE_LOCK" "$FE_LOCK_TOKEN" 2>/dev/null || true; }
fn_lock_token(){ [ -f "$FE_LOCK_TOKEN" ] && cat "$FE_LOCK_TOKEN" || printf ''; }

# ---- round helpers ----------------------------------------------------------
fn_rid(){ local n="${1:-0}"; case "$n" in ''|*[!0-9]*) n=$(fn_latest_round) ;; esac
  printf 'R%03d' "$((10#$n))"; }
# the round number is a fact on disk, not a piece of session memory: a reopened
# loop must land on the same round without being told
fn_latest_round(){
  local d n=0 v
  for d in "$FE_RUN"/rounds/R*/; do
    [ -d "$d" ] || continue
    v=$(basename "$d" | tr -dc '0-9'); v=$((10#${v:-0}))
    [ "$v" -gt "$n" ] && n=$v
  done
  printf '%s' "$n"
}
fn_round_dir(){ printf '%s/rounds/%s\n' "$FE_RUN" "$(fn_rid "$1")"; }
fn_phase_done(){ local d; d=$(fn_round_dir "$1"); [ -f "$d/$2.meta" ] && grep -qx 'outcome=ok' "$d/$2.meta"; }
fn_phase_outcome(){ local d; d=$(fn_round_dir "$1"); [ -f "$d/$2.meta" ] && sed -n 's/^outcome=//p' "$d/$2.meta" | tail -1 || printf 'none'; }
