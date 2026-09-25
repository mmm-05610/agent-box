# lib/sol.sh — the only entry to the Sol call budget.
#
# Design notes, each answering a concrete defect found in the first version:
#   * the budget LOG is authoritative; the .env counters are a cache. A crash
#     between the two can no longer lose or invent a call.
#   * check and reserve happen inside one flock'd transaction, so two callers
#     cannot both pass the ceiling test and both spend the same slot.
#   * every call gets an exact call id at reserve time; completion updates that
#     row and only that row — "complete the newest PENDING" was wrong because a
#     second caller's row could be closed by the first caller's outcome.
#   * a missing or malformed budget is a DENIAL, never a re-initialisation to
#     zero. Only an explicit fn_sol_init may create the record, and it refuses
#     to run when a valid record already exists.
#   * dispatch is not automatic: see fn_sol_auto_allowed.

FE_SOL_LOCK="$FE_RUN/sol.lock"
FE_SOL_REQUIRED="SOL_CAP SOL_RESERVED SOL_OK SOL_BAD SOL_FINAL_RESERVE SOL_INITIALIZED"
FE_SOL_LOG_COLS=8

fn_scrub_soft(){ printf '%s' "$1" | tr '\t\n\r|' '   /'; }

# ---------------------------------------------------------------- locking ----
fn_sol_lock(){
  mkdir -p "$(dirname "$FE_SOL_LOCK")" 2>/dev/null || return 1
  exec 9>"$FE_SOL_LOCK" 2>/dev/null || return 1
  if ! flock -w "${FE_SOL_LOCK_WAIT:-15}" 9; then
    exec 9>&- 2>/dev/null || true
    return 1
  fi
  return 0
}
fn_sol_unlock(){ flock -u 9 2>/dev/null; exec 9>&- 2>/dev/null || true; }

# ------------------------------------------------------------ validation ----
# prints "deny:<reason>" on stdout and returns 1 for anything untrustworthy
fn_sol_validate(){
  local f="$FE_SOL_BUDGET_ENV" l="$FE_SOL_BUDGET_LOG" k missing="" v rows bad n
  [ -f "$f" ] || { printf 'deny:budget-file-missing\n'; return 1; }
  [ -f "$l" ] || { printf 'deny:budget-log-missing\n'; return 1; }
  for k in $FE_SOL_REQUIRED; do
    grep -q "^$k=" "$f" 2>/dev/null || missing="$missing $k"
  done
  if [ -n "$missing" ]; then printf 'deny:budget-keys-absent:%s\n' "$missing"; return 1; fi
  [ "$(fn_sol_raw SOL_INITIALIZED)" = "1" ] \
    || { printf 'deny:not-initialised\n'; return 1; }
  for k in SOL_CAP SOL_RESERVED SOL_OK SOL_BAD SOL_FINAL_RESERVE; do
    v=$(fn_sol_raw "$k")
    printf '%s' "$v" | grep -Eq '^[0-9]+$' \
      || { printf 'deny:non-numeric:%s=%s\n' "$k" "$v"; return 1; }
  done
  n=$(awk 'END{print NR}' "$f")
  [ "$n" -eq "$(awk 'END{print NR}' "$f")" ] || true
  # the log must be well formed: header + 8-field rows, unique call ids
  bad=$(awk -F'|' 'NR==1{next} NF!=c{b++} END{print b+0}' c="$FE_SOL_LOG_COLS" "$l")
  [ "${bad:-0}" -eq 0 ] || { printf 'deny:budget-log-malformed:rows=%s\n' "$bad"; return 1; }
  rows=$(awk 'NR>1' "$l" | wc -l | tr -d ' ')
  n=$(awk -F'|' 'NR>1{print $1}' "$l" | sort | uniq -d | grep -c . || true)
  [ "${n:-0}" -eq 0 ] || { printf 'deny:duplicate-call-ids\n'; return 1; }
  if [ "$(fn_sol_raw SOL_RESERVED)" != "$rows" ]; then
    printf 'deny:cache-deserves-log:cache=%s:log=%s\n' "$(fn_sol_raw SOL_RESERVED)" "$rows"
    return 1
  fi
  [ "$(fn_sol_raw SOL_RESERVED)" -le "$(fn_sol_raw SOL_CAP)" ] \
    || { printf 'deny:reserved-exceeds-cap\n'; return 1; }
  [ "$(fn_sol_raw SOL_CAP)" -gt 0 ] || { printf 'deny:cap-not-positive\n'; return 1; }
  return 0
}
fn_sol_raw(){ sed -n "s/^$1=//p" "$FE_SOL_BUDGET_ENV" 2>/dev/null | tail -1; }

# The hard-denial state is sticky and loud: it is never repaired silently.
fn_sol_deny_note(){ fn_reserve_path "$FE_RUN/sol-denied"; printf '%s %s\n' "$(date -u +%FT%TZ)" "$1" > "$FE_RUN/sol-denied"; }
fn_sol_denied_reason(){ [ -s "$FE_RUN/sol-denied" ] && tail -1 "$FE_RUN/sol-denied" | cut -d' ' -f2- || printf ''; }

# ---------------------------------------------------------------- creation ---
# Only bootstrap calls this, once. It refuses to overwrite a live record.
fn_sol_init(){
  local have_env=0 have_log=0
  [ -f "$FE_SOL_BUDGET_ENV" ] && have_env=1
  [ -f "$FE_SOL_BUDGET_LOG" ] && have_log=1
  if [ "$have_env" = 1 ] || [ "$have_log" = 1 ]; then
    # a half-present record is damage, not an empty start: it must never be
    # answered by writing a fresh zero, or every spent slot disappears
    if [ "$have_env" = 1 ] && [ "$have_log" = 1 ] && fn_sol_validate >/dev/null 2>&1; then
      fn_note "sol: existing budget record kept ($(fn_sol_snapshot))"
      return 0
    fi
    fn_sol_deny_note "init-refused-over-damaged-record:env=$have_env:log=$have_log"
    printf 'sol: refusing to init over a partial or damaged record (env=%s log=%s) — reconcile by hand\n' \
      "$have_env" "$have_log" >&2
    return 1
  fi
  mkdir -p "$FE_RUN" "$FE_TMP"
  fn_reserve_path "$FE_SOL_BUDGET_ENV"; fn_reserve_path "$FE_SOL_BUDGET_LOG"
  printf 'seq|reserved_at|kind|reason|key|outcome|completed_at|call_id\n' | fn_write "$FE_SOL_BUDGET_LOG"
  { printf 'SOL_INITIALIZED=1\n'; printf 'SOL_CREATED_AT=%s\n' "$(date -u +%FT%TZ)"
    printf 'SOL_CAP=%s\n' "$FE_SOL_CAP"; printf 'SOL_FINAL_RESERVE=%s\n' "$FE_SOL_FINAL_RESERVE"
    printf 'SOL_RESERVED=0\n'; printf 'SOL_OK=0\n'; printf 'SOL_BAD=0\n'
  } | fn_write "$FE_SOL_BUDGET_ENV"
  fn_note "sol: budget record created at zero (cap=$FE_SOL_CAP, final reserve=$FE_SOL_FINAL_RESERVE)"
  return 0
}

# recomputes the cache from the authoritative log, inside the lock
fn_sol_resync_cache(){
  local rows ok bad tmp
  rows=$(awk 'NR>1' "$FE_SOL_BUDGET_LOG" | wc -l | tr -d ' ')
  ok=$(awk -F'|' 'NR>1 && $6=="ok"{n++} END{print n+0}' "$FE_SOL_BUDGET_LOG")
  bad=$(awk -F'|' 'NR>1 && $6!="ok" && $6!="PENDING"{n++} END{print n+0}' "$FE_SOL_BUDGET_LOG")
  tmp="$FE_TMP/solcache.$$"
  cp "$FE_SOL_BUDGET_ENV" "$tmp"
  sed -e "s|^SOL_RESERVED=.*|SOL_RESERVED=$rows|" -e "s|^SOL_OK=.*|SOL_OK=$ok|" \
      -e "s|^SOL_BAD=.*|SOL_BAD=$bad|" "$tmp" > "$tmp.n" && mv "$tmp.n" "$tmp"
  fn_atomic "$FE_SOL_BUDGET_ENV" "$tmp"
}

fn_sol_counters(){ # call only under lock, after validation
  printf '%s %s %s\n' "$(fn_sol_raw SOL_CAP)" "$(fn_sol_raw SOL_RESERVED)" "$(fn_sol_raw SOL_FINAL_RESERVE)"
}

# ---------------------------------------------------------------- reserve ----
# fn_sol_reserve <kind: key|final> <reason> <key>  -> prints call id, rc 0
# Denied with a specific reason otherwise. The slot is taken before the call is
# made, and a failed call is never given back.
fn_sol_reserve(){
  local kind="$1" reason="$2" key="$3"
  local cap reserved fin floor seq cid deny
  fn_sol_lock || { printf 'deny:lock-timeout\n' >&2; return 1; }
  if ! deny=$(fn_sol_validate); then
    # a stale cache is reconciled from the log; anything else stays a denial
    if printf '%s' "$deny" | grep -q '^deny:cache-deserves-log'; then
      fn_sol_resync_cache
      deny=""
    fi
    if ! deny=$(fn_sol_validate); then
      fn_sol_deny_note "$deny"
      fn_sol_unlock
      printf '%s\n' "$deny" >&2
      return 1
    fi
  fi
  # a repeat of the same candidate+question costs nothing and says more than
  # "budget exhausted", so it is answered before the ceilings are consulted
  if awk -F'|' -v k="$key" 'NR>1 && $5==k{f=1} END{exit !f}' "$FE_SOL_BUDGET_LOG"; then
    fn_sol_unlock; printf 'deny:duplicate-candidate-and-question:%s\n' "$key" >&2; return 2
  fi
  read -r cap reserved fin <<< "$(fn_sol_counters)"
  floor=$((cap - fin))
  if [ "$reserved" -ge "$cap" ]; then
    fn_sol_unlock; printf 'deny:budget-exhausted:%s/%s\n' "$reserved" "$cap" >&2; return 1
  fi
  if [ "$kind" != "final" ] && [ "$reserved" -ge "$floor" ]; then
    fn_sol_unlock
    printf 'deny:key-node-floor-reached:%s/%s (final %s slots held back)\n' "$reserved" "$floor" "$fin" >&2
    return 1
  fi
  seq=$((reserved + 1))
  cid=$(printf 'SOL-%02d-%s%s' "$seq" "$(date -u +%H%M%S)" "$RANDOM")
  printf '%s|%s|%s|%s|%s|PENDING|-|%s\n' "$seq" "$(date -u +%FT%TZ)" "$kind" \
    "$(fn_scrub_soft "$reason")" "$(fn_scrub_soft "$key")" "$cid" >> "$FE_SOL_BUDGET_LOG"
  fn_sol_resync_cache
  fn_sol_unlock
  printf '%s\n' "$cid"
  return 0
}

# --------------------------------------------------------------- complete ----
# exact call id only; an unknown id is an error, never a silent no-op
fn_sol_complete(){
  local cid="$1" outcome="$2" tmp nxt rows
  case "$outcome" in ok|bad|error) : ;; *) printf 'sol_complete: bad outcome %s\n' "$outcome" >&2; return 1 ;; esac
  fn_sol_lock || { printf 'sol_complete: lock timeout for %s\n' "$cid" >&2; return 1; }
  if ! fn_sol_validate >/dev/null 2>&1; then
    fn_sol_unlock; printf 'sol_complete: budget record untrustworthy, refusing to mutate\n' >&2; return 1
  fi
  rows=$(awk -F'|' -v c="$cid" 'NR>1 && $8==c{n++} END{print n+0}' "$FE_SOL_BUDGET_LOG")
  if [ "$rows" != "1" ]; then
    fn_sol_unlock
    printf 'sol_complete: call id %s matches %s rows (need exactly 1) — not updating anything\n' "$cid" "$rows" >&2
    return 1
  fi
  if awk -F'|' -v c="$cid" 'NR>1 && $8==c && $6!="PENDING"{f=1} END{exit !f}' "$FE_SOL_BUDGET_LOG"; then
    fn_sol_unlock; printf 'sol_complete: call id %s already closed\n' "$cid" >&2; return 1
  fi
  tmp="$FE_TMP/solc.$$"
  awk -F'|' -v OFS='|' -v c="$cid" -v o="$outcome" -v t="$(date -u +%FT%TZ)" '
    NR==1 || $8!=c {print; next}
    { $6=o; $7=t; print }' "$FE_SOL_BUDGET_LOG" > "$tmp"
  fn_atomic "$FE_SOL_BUDGET_LOG" "$tmp"
  fn_sol_resync_cache
  fn_sol_unlock
  return 0
}

# open PENDING rows are how a crash between reserve and complete shows up
fn_sol_open_pending(){
  [ -f "$FE_SOL_BUDGET_LOG" ] || return 0
  awk -F'|' 'NR>1 && $6=="PENDING"{print $8"|"$3"|"$4}' "$FE_SOL_BUDGET_LOG"
}

# ---------------------------------------------------------------- readers ----
fn_sol_remaining(){ local c r; c=$(fn_sol_raw SOL_CAP); r=$(fn_sol_raw SOL_RESERVED); printf '%s' "$(( ${c:-0} - ${r:-0} ))"; }
fn_sol_snapshot(){
  [ -f "$FE_SOL_BUDGET_ENV" ] || { printf 'uninitialised\n'; return 0; }
  printf 'cap=%s reserved=%s ok=%s bad=%s remaining=%s final_reserve=%s' \
    "$(fn_sol_raw SOL_CAP)" "$(fn_sol_raw SOL_RESERVED)" "$(fn_sol_raw SOL_OK)" \
    "$(fn_sol_raw SOL_BAD)" "$(fn_sol_remaining)" "$(fn_sol_raw SOL_FINAL_RESERVE)"
}
fn_sol_key_sent(){ local k="$1"; [ -f "$FE_SOL_BUDGET_LOG" ] && awk -F'|' -v k="$k" 'NR>1 && $5==k{f=1} END{exit !f}' "$FE_SOL_BUDGET_LOG"; }
fn_sol_kind_count(){ local kind="$1"; [ -f "$FE_SOL_BUDGET_LOG" ] && awk -F'|' -v q="$kind" 'NR>1 && $3==q{n++} END{print n+0}' "$FE_SOL_BUDGET_LOG" || printf 0; }

# --------------------------------------------------- automatic dispatch gate --
# Provable enforcement stops at the role workers: they run with every tool
# removed, so they cannot execute anything at all. Above them, the loop process
# could always call the binary directly — a shell function cannot forbid that to
# itself. So dispatch is opt-IN per run, and every dispatch is reconcilable
# after the fact against the log. Until an operator sets the flag, no Sol call
# leaves the controller.
fn_sol_auto_allowed(){
  local f="$FE_RUN/sol-automatic"
  [ -f "$f" ] && [ "$(head -1 "$f" 2>/dev/null | tr -d ' \n')" = "1" ]
}
fn_sol_auto_disable(){ printf '0 disabled-by-default %s\n' "$(date -u +%FT%TZ)" | fn_write "$FE_RUN/sol-automatic"; }
fn_sol_auto_enable(){
  printf '1 enabled %s by operator action\n' "$(date -u +%FT%TZ)" | fn_write "$FE_RUN/sol-automatic"
}
fn_sol_status_line(){
  local d
  if ! d=$(fn_sol_validate 2>&1); then printf 'DENIED (%s)\n' "$d"; return 0; fi
  printf '%s; auto-dispatch=%s; pending=%s\n' "$(fn_sol_snapshot)" \
    "$(fn_sol_auto_allowed && echo on || echo off)" \
    "$(fn_sol_open_pending | wc -l | tr -d ' ')"
}
