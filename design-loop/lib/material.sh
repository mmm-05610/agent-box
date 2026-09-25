# lib/material.sh — the controller curates every byte a role is allowed to see.
# Roles have no tools, so nothing reaches them except these prompt files.
# Counterexample and scenario ledgers are handed over IN FULL (never truncated):
# unresolved counterexamples must not be lost to context pressure.

FE_OUT_CONTRACT_SPEC='OUTPUT CONTRACT (machine-checked; a phase that fails it is recorded as failed, never as passed)
- Every deliverable section must be wrapped, on their own lines, in these two markers, in order:
  <<<FE-OUT-START>>>
  <the section>
  <<<FE-OUT-END>>>
- If a ledger block is required, wrap its rows in:
  <<<FE-LEDGER-START>>>
  FE-CE-NNN|<round>|<severity: major|minor>|<status: OPEN|CLOSED|DISPUTED|REJECTED|SUPERSEDED>|<invariant violated>|<title>|<evidence pointer>|<target CE ids or ->
  <<<FE-LEDGER-END>>>
- If a scenario table is required, wrap it in:
  <<<FE-SCENARIO-START>>>
  S01|<covered|partial|open>|<owner: core|adaptation|extension|unassigned>|<mechanism>|<evidence pointer>
  <<<FE-SCENARIO-END>>>
- If a mechanisms table is required, wrap it in:
  <<<FE-MECH-START>>>
  <mechanism name>|<core|delegated|removed>|<the scenario that fails if it is deleted>|<experiment pointer>
  <<<FE-MECH-END>>>
- One row per line. Exactly the field order above, pipe separated, no header row, no extra prose inside a block.
- Ids: counterexamples FE-CE-001..FE-CE-999, scenarios S01..S12. Propose a fresh FE-CE-NNN for anything new.'

fn_mat_head(){ # fn_mat_head <path> [maxlines] — bounded read-only inclusion
  local p="$1" max="${2:-200}"
  if [ ! -r "$p" ]; then printf '_unreadable: %s_\n' "$p"; return 0; fi
  if [ "$max" = "all" ] || [ "$(wc -l < "$p")" -le "$max" ]; then
    cat "$p"
  else
    head -n "$max" "$p"
    printf '\n_[truncated for this role: %s of %s lines; full file at %s]_\n' \
      "$max" "$(wc -l < "$p" | tr -d ' ')" "$p"
  fi
}
fn_mat_section(){ # fn_mat_section <heading> <path> [maxlines]
  printf '\n===== MATERIAL: %s =====\n(source: %s, sha256: %s)\n\n' "$1" "$2" "$(fn_sha "$2")"
  fn_mat_head "$2" "${3:-200}"
  printf '\n'
}

fn_mat_scenarios(){
  printf '\n===== MATERIAL: required scenario set (authoritative) =====\n\n'
  fn_mat_head "$FE_ROLES/scenarios.md" all
}
fn_mat_rubric(){
  printf '\n===== MATERIAL: judging rubric (authoritative) =====\n\n'
  fn_mat_head "$FE_ROLES/judging-rubric.md" all
}
fn_mat_dimensions(){
  printf '\n===== MATERIAL: attack dimensions =====\n\n'
  fn_mat_head "$FE_ROLES/attack-dimensions.md" all
}

fn_mat_ledgers(){ # full, never truncated
  printf '\n===== MATERIAL: counterexample ledger (authoritative; full) =====\n\n'
  if [ -f "$FE_LEDGER" ]; then fn_regression_list | sed 's/^/REGRESSION  /' ; printf '\n-- all rows --\n'; cat "$FE_LEDGER"; else printf '_empty_\n'; fi
  printf '\n===== MATERIAL: scenario coverage ledger (authoritative; full) =====\n\n'
  [ -f "$FE_SC" ] && cat "$FE_SC" || printf '_empty_\n'
  printf '\n===== MATERIAL: unresolved independent-review findings (full) =====\n\n'
  if [ -f "$FE_RULINGS" ]; then
    printf 'A scenario is only settled when a reviewer ruled its trajectory good against the CURRENT candidate bytes. Anything else is still open:\n'
    local _dig _void
    _dig=$(fn_best_digest 2>/dev/null) || _dig=no-candidate
    printf 'scenario|verdict|round|evidence   (rulings bound to %s…)\n' "$(printf %s "$_dig" | cut -c1-12)"
    awk -F'|' -v d="$_dig" 'NR>1 && $1!="round" && $3=="sc" && $2==d && $5!="trajectory_ok"{print $4"|"$5"|"$1"|"$6}' "$FE_RULINGS" | sort -u
    _void=$(awk -F'|' -v d="$_dig" 'NR>1 && $3=="sc" && $2!=d && $2!=""{a[$2]=1} END{print length(a)+0}' "$FE_RULINGS")
    [ "${_void:-0}" -gt 0 ] && printf '\n_%s ruling set(s) above this line are VOID: they were made against different candidate bytes and are kept only as history._\n' "$_void"
  else
    printf '_none yet_\n'
  fi
  printf '\n===== MATERIAL: mechanism disposition ledger (full) =====\n\n'
  [ -f "$FE_MECH" ] && cat "$FE_MECH" || printf '_empty_\n'
  printf '\n===== MATERIAL: per-round counters (full) =====\n\n'
  [ -f "$FE_ROUNDS" ] && cat "$FE_ROUNDS" || printf '_empty_\n'
}

fn_mat_prior(){ # fn_mat_prior <round> <phase> [...]
  local r="$1"; shift
  local d p
  d=$(fn_round_dir "$r")
  for p in "$@"; do
    [ -f "$d/$p.md" ] || continue
    fn_mat_section "R$(printf '%03d' "$r")/$p" "$d/$p.md" all
  done
}
fn_mat_all_candidates(){
  local d f
  for d in "$FE_RUN"/rounds/R*/; do
    [ -d "$d" ] || continue
    for f in "$d"/cand-*.md; do
      [ -f "$f" ] || continue
      fn_mat_section "candidate artifact $f" "$f" all
    done
  done
}
fn_mat_sol_findings(){
  printf '\n===== MATERIAL: prior independent (Sol) review findings =====\n\n'
  if [ -f "$FE_RUN/sol-verdicts.tsv" ]; then cat "$FE_RUN/sol-verdicts.tsv"
  else printf '_no independent review yet; treat every conclusion below as self-reviewed and mark it as such_\n'; fi
  for f in "$FE_RUN"/sol/*.verdict.md; do [ -f "$f" ] && fn_mat_section "sol finding" "$f" all; done
}

# ---- prompt header every role gets -------------------------------------------
fn_mat_preamble(){ # fn_mat_preamble <role> <round> [phase]
  local role="$1" r="$2" ph="${3:-handoff}" rid
  rid=$(fn_rid "$r")
  cat <<EOF
You are one role in an adversarial design loop for the FE-DESIGN-001 Agent
Desktop design task. Role: **$role**. Round: $rid. Phase: $ph.
Run root: $FE_RUN

Ground rules, non-negotiable:
- You are given every material you are allowed to see, inlined below. You have
  no tools and cannot read anything else. Do not ask to.
- Product code is a migration constraint and evidence, not the answer. Do not
  propose work orders or implementation.
- Never soften, delete or reinterpret a required scenario or an established
  counterexample. If you disagree, say so as a DISPUTED ledger row with a
  concrete reason.
- Be concrete enough that a reader can reject you. Style opinions, adjectives and
  general advice are contract violations.
EOF
}
