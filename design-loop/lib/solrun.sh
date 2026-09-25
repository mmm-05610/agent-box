# lib/solrun.sh — Sol review triggers, budget-gated dispatch, verdict record.
# Only four situations may be sent (first complete candidate / unresolved major
# dispute / core boundary materially changed / ready to declare convergence),
# the same candidate+question is never re-sent, and the slot is taken BEFORE the
# call so a failed call still counts.

FE_SOL_VERDICTS="$FE_RUN/sol-verdicts.tsv"
FE_SOL_DIR="$FE_RUN/sol"

fn_sol_ensure_dirs(){ mkdir -p "$FE_SOL_DIR"; [ -f "$FE_SOL_VERDICTS" ] || printf 'call_id|key|slot|kind|trigger|candidate|digest|decision|at\n' | fn_write "$FE_SOL_VERDICTS"; }

fn_core_boundary_digest(){
  local f="$FE_RUN/candidates/best.md"
  [ -s "$f" ] || { printf 'none'; return 0; }
  awk '
    /^```/{inb=!inb; next}
    inb==0 && /^\*\*(Core|Extension|Adaptation) (concepts|mechanisms|responsibilit)/ {print; next}
    inb==0 && /^## 1\./ {grab=1; next}
    inb==0 && /^## /{grab=0}
    grab==1 {print}
  ' "$f" | sed 's/[^A-Za-z0-9]/ /g' | tr 'A-Z' 'a-z' | tr -s ' ' '\n' | sort | sha256sum | cut -c1-16
}

# ---- trigger evaluation ------------------------------------------------------
# prints "<kind>:<trigger>:<key>" or nothing
fn_sol_trigger(){
  local r="$1" best key q trig kind
  best=$(fn_best_candidate)
  [ -n "$best" ] || return 0
  [ -f "$FE_RUN/candidates/best.md" ] || return 0
  key=$(fn_sol_key "$best" coverage)
  # T1 first complete candidate
  if [ "$(fn_state_get SOL_FIRST_DONE)" != "1" ]; then
    printf 'key:FirstCompleteCandidate:%s\n' "$key"; return 0
  fi
  # T2 unresolved major dispute (same CE disputed in 2+ distinct rounds)
  local dup
  dup=$(awk -F'|' 'NR>1 && $4=="DISPUTED" && $3=="major"{print $1}' "$FE_LEDGER" 2>/dev/null | sort | uniq -c | awk '$1>=2{print $2; exit}')
  if [ -n "$dup" ] && ! grep -q "|dispute:$dup|" "$FE_SOL_VERDICTS" 2>/dev/null; then
    key=$(fn_sol_key "$best" "dispute-$dup")
    printf 'key:UnresolvedDispute(%s):%s\n' "$dup" "$key"; return 0
  fi
  # T3 core boundary materially changed
  local cb prev
  cb=$(fn_core_boundary_digest)
  prev=$(fn_state_get CORE_BOUNDARY_DIGEST)
  if [ -n "$prev" ] && [ "$cb" != "$prev" ]; then
    key=$(fn_sol_key "$best" "boundary-$cb")
    printf 'key:CoreBoundaryChanged(%s->%s):%s\n' "$prev" "$cb" "$key"; return 0
  fi
  # T4 convergence pending
  if [ "$(fn_convergence_check | cut -d: -f1)" = "FINAL_REVIEW_DUE" ]; then
    printf 'final:ConvergenceDeclaration:%s\n' "$(fn_sol_key "$best" convergence)"
    return 0
  fi
  return 0
}

fn_sol_key(){ local d; d=$(fn_best_digest) || { printf 'no-candidate'; return 0; }; printf '%s-%s' "$(printf %s "$d" | cut -c1-12)" "$(fn_sha_str "$2")"; }

fn_sol_already_sent(){ fn_sol_key_sent "$1"; }

# ---- the compact material pack ----------------------------------------------
fn_sol_pack(){ # <round> <trigger> <call_id> -> pack file path
  local r="$1" trig="$2" cid="$3" d out b
  fn_sol_ensure_dirs
  d=$(fn_round_dir "$r"); out="$d/sol-pack.md"
  b=$(fn_best_candidate)
  {
    printf '# FE-DESIGN-001 independent review request\n\n'
    printf 'Call id: %s\n\nRound: %s  Trigger: %s  Reviewed artifact: %s\n\n' "$cid" "$(fn_rid "$r")" "$trig" "$b"
    printf '## 1. What to judge (and nothing else)\n\n'
    printf 'The goal is a backend-independent, Agent-facing, extensible Desktop host.\n'
    printf 'Dialogue, tool calling, model config and a plugin host may all be\n'
    printf 'capabilities; none of them is assumed to be the organising centre.\n'
    printf 'Judge whether the host core below is the *minimum set of mechanisms* that\n'
    printf 'satisfies S01-S12 — counting extension and adapter burden, not just core.\n\n'
    printf '## 2. Required scenarios (authoritative)\n\n'
    sed -n '5,17p' "$FE_ROLES/scenarios.tsv"
    printf '\n## 3. Judging rules (authoritative)\n\n'
    sed -n '1,60p' "$FE_ROLES/judging-rubric.md"
    printf '\n## 4. Candidate under review (%s)\n\n' "$b"
    cat "$FE_RUN/candidates/best.md"
    printf '\n## 5. Counterexample ledger — status, not prose\n\n'
    printf 'id|round|sev|status|invariant|title|targets\n'
    awk -F'|' 'NR>1{printf "%s|%s|%s|%s|%s|%s|%s\n",$1,$2,$3,$4,$5,substr($6,1,90),$8}' "$FE_LEDGER" 2>/dev/null
    printf '\n## 6. Unresolved items and deletion experiments\n\n'
    printf '--- open / disputed ---\n'
    fn_regression_list 2>/dev/null
    printf '\n--- mechanism dispositions ---\n'
    cat "$FE_MECH" 2>/dev/null
    printf '\n--- scenario coverage ---\n'
    cat "$FE_SC" 2>/dev/null
    printf '\n## 7. What earlier rounds already established (one line each)\n\n'
    awk -F'|' 'NR>1{printf "R%s: holds_major=%s closed=%s clean=%s\n",$1,$2,$4,$5}' "$FE_ROUNDS" 2>/dev/null
  } | fn_write "$out"
  printf '%s' "$out"
}

fn_sol_instructions(){
  printf 'REPLY FIRST LINE: CALL-ID: %s\n\n' "${1:-unknown}"
  cat <<'EOF'
You are the independent reviewer. You have no stake in this design and no access
to any prior conversation. Do not summarise, do not restate the material, do not
propose an implementation and do not do research.

Answer ONLY the question asked, in this exact format, and be compact:

DECISION: <converged | revise | blocked>
VERDICT: <one short sentence: is this host core the minimum that satisfies S01-S12>
COUNTEREXAMPLE: <id or none> | <scenario id> | <the exact event sequence> | <the invariant broken> | <the text that fails to prevent it>
DISQUALIFIER: <none> | <execute(any) | omnipotent context | arbitrary event bus | complexity hidden in plugin | other> | <where>
UNCOVERED: <none | S0x: what is missing, one line each>
MAJOR: <none | one line each>
MINOR: <none | one line each>

Rules: a COUNTEREXAMPLE line counts only if it names an exact event sequence and
an invariant. "Could be cleaner", "consider adding", "might not scale" are not
findings. If you cannot disqualify it, say so and say DECISION: converged.
EOF
}

# ---- dispatch ----------------------------------------------------------------
# Returns 0 always (a refused review must not break the design loop), and tells
# the caller what happened through state and the record.
fn_sol_dispatch(){
  local r="$1" trig kind key rid best pack out cid rc rcv
  rid=$(fn_rid "$r")
  if ! fn_sol_auto_allowed; then
    fn_state_set "PENDING_INDEPENDENT_REVIEW=1"
    fn_note "sol: automatic dispatch is OFF — $rid candidate marked pending independent review; no call made, no slot spent"
    return 0
  fi
  trig=$(fn_sol_trigger "$r")
  [ -n "$trig" ] || return 0
  kind=$(printf '%s' "$trig" | cut -d: -f1)
  key=$(printf '%s' "$trig" | awk -F: '{print $3}')
  trig=$(printf '%s' "$trig" | cut -d: -f2)
  if fn_sol_already_sent "$key"; then
    fn_note "sol: $key already reviewed for this candidate+question — not re-sent, no slot spent"
    return 0
  fi
  if ! cid=$(fn_sol_reserve "$kind" "$trig" "$key" 2>"$FE_TMP/sol.deny"); then
    fn_note "sol: refused — $(tr -d '\n' < "$FE_TMP/sol.deny")"
    fn_state_set "PENDING_INDEPENDENT_REVIEW=1"
    return 0
  fi
  fn_sol_ensure_dirs
  best=$(fn_best_candidate)
  pack=$(fn_sol_pack "$r" "$trig" "$cid")
  out="$FE_SOL_DIR/$cid.reply.md"
  { fn_sol_instructions "$cid"; printf '\n---\n\n'; cat "$pack"; } | fn_write "$FE_TMP/sol.$cid.prompt"
  fn_atomic "$FE_SOL_DIR/$cid.request.md" "$FE_TMP/sol.$cid.prompt"
  fn_note "sol: dispatching $cid ($trig, slot $(fn_sol_raw SOL_RESERVED)/$(fn_sol_raw SOL_CAP)) model=$FE_SOL_MODEL"

  fn_sol_call "$FE_SOL_TIMEOUT" "$out" "$FE_SOL_DIR/$cid.request.md"; rc=$?
  if [ "$rc" -ne 0 ]; then
    fn_sol_complete "$cid" error
    fn_note "sol: $cid call failed (rc=$rc) — slot still counted; loop continues without independent review"
    return 0
  fi
  if ! grep -q '^DECISION:' "$out"; then
    fn_sol_complete "$cid" bad
    fn_note "sol: $cid returned no DECISION — counted as spent, recorded as NOT a review"
    return 0
  fi
  fn_sol_complete "$cid" ok
  rcv=$(sed -n 's/^DECISION:[[:space:]]*//p' "$out" | tail -1 | tr -d ' ')
  printf '%s|%s|%s|%s|%s|%s|%s|%s|%s\n' "$cid" "$key" "$(fn_sol_raw SOL_RESERVED)" "$kind" \
    "$(fn_scrub_soft "$trig")" "$best" "$(fn_best_digest)" "$rcv" \
    "$(date -u +%FT%TZ)" >> "$FE_SOL_VERDICTS"
  fn_state_set "SOL_FIRST_DONE=1" "PENDING_INDEPENDENT_REVIEW=0"
  fn_note "sol: $cid recorded decision=$rcv against digest $(fn_sha "$FE_RUN/candidates/best.md" | cut -c1-12)"
  return 0
}

# an operator-driven single dispatch, for the manual path while auto is off
fn_sol_dispatch_manual(){
  local r="$1"
  fn_sol_auto_enable
  fn_sol_dispatch "$r"
  local rc=$?
  fn_sol_auto_disable
  return $rc
}
