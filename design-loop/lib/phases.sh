# lib/phases.sh — the round's phase plan. Each phase is one fresh, tool-less
# model call, one atomic commit, one meta file. Output that does not satisfy its
# contract is recorded outcome=bad and never counted as passed.

FE_PHASES="plan design attack verify integrate review"


# =========================== phase runner ====================================
fn_run_phase(){ # fn_run_phase <round> <phase> <role> <builder>
  local r="$1" ph="$2" role="$3" builder="$4"
  local d cf rid att rc=1 outn i content meta
  d=$(fn_round_dir "$r"); rid=$(fn_rid "$r")
  mkdir -p "$d"
  cf="$FE_ROLES/$role.md"
  [ -r "$cf" ] || fn_die "missing role contract: $cf"

  if fn_phase_done "$r" "$ph"; then
    fn_note "$rid/$ph already complete — skipped, budget untouched"
    return 0
  fi

  content="$d/$ph.content.txt"; meta="$d/$ph.meta"
  att=$(fn_state_get "ATT_${rid}_${ph}"); : "${att:=0}"
  i=1
  while [ "$i" -le "$FE_PHASE_ATTEMPTS" ]; do
    [ -f "$FE_RUN/stop.signal" ] && { fn_note "stop requested before $rid/$ph"; return 143; }
    att=$((att+1)); i=$((i+1))
    fn_state_set "ATT_${rid}_${ph}=$att" "CURRENT_ROUND=$r" "CURRENT_PHASE=$ph"
    fn_note "$rid/$ph attempt $att of $FE_PHASE_ATTEMPTS"
    : > "$FE_TMP/ce.accepted"; : > "$FE_TMP/ce.raw"; : > "$FE_TMP/sc.raw"
    : > "$FE_TMP/verdict.raw"; : > "$FE_TMP/mech.raw"; : > "$FE_TMP/replay.raw"

    if ! "$builder" "$r" > "$FE_TMP/$ph.prompt.raw" 2> "$FE_TMP/$ph.prompt.err"; then
      fn_note "$rid/$ph builder error: $(tail -c 200 "$FE_TMP/$ph.prompt.err" | tr '\n' ' ')"
      rc=2; fn_infra_tick; continue
    fi
    fn_write "$d/$ph.prompt.txt" < "$FE_TMP/$ph.prompt.raw"

    if ! fn_pure_call "$rid-$ph-a$att" "$FE_WORKER_MODEL" "$FE_WORKER_TIMEOUT" "$content" "$d/$ph.prompt.txt"; then
      printf 'phase=%s\nrole=%s\nattempt=%s\noutcome=failed\nreason=call_error\nat=%s\n' \
        "$ph" "$role" "$att" "$(date -u +%FT%TZ)" | fn_write "$meta.tmp"
      fn_atomic "$meta" "$meta.tmp"
      rc=1; fn_infra_tick; continue
    fi
    if ! fn_validate_phase "$ph" "$cf" "$content"; then
      printf 'phase=%s\nrole=%s\nattempt=%s\noutcome=bad\nreason=contract_violation\nat=%s\n' \
        "$ph" "$role" "$att" "$(date -u +%FT%TZ)" | fn_write "$meta.tmp"
      fn_atomic "$meta" "$meta.tmp"
      rc=3; continue
    fi
    rc=0; break
  done

  [ "$rc" = 0 ] || { fn_state_set "PHASE_RESULT=$ph:failed:rc$rc"; return "$rc"; }

  # extract every section the role actually produced (validate already required
  # at least the declared number; a designer may produce one per candidate)
  outn=$(fn_section_count "$content")
  i=1
  while [ "$i" -le "$outn" ]; do
    if fn_section "$content" "$i" "$FE_TMP/sec.$i"; then
      fn_atomic "$d/$ph.sec$i.md" "$FE_TMP/sec.$i"
    fi
    i=$((i+1))
  done
  fn_commit_phase "$ph" "$r" "$outn" || {
    printf 'phase=%s\nrole=%s\nattempt=%s\noutcome=bad\nreason=commit_rejected\nat=%s\n' \
      "$ph" "$role" "$att" "$(date -u +%FT%TZ)" | fn_write "$meta.tmp"
    fn_atomic "$meta" "$meta.tmp"
    fn_note "$rid/$ph commit rejected — phase not passed"
    return 4
  }
  fn_cp_snapshot "$r" "$ph"

  printf 'phase=%s\nrole=%s\nmodel=%s\nattempts=%s\ncalls_consumed=%s\noutcome=ok\nsections=%s\nwords=%s\nsha256=%s\nat=%s\n' \
    "$ph" "$role" "$FE_WORKER_MODEL" "$att" "$att" "$outn" "$(fn_wordcount "$content")" \
    "$(fn_sha "$content")" "$(date -u +%FT%TZ)" | fn_write "$meta.tmp"
  fn_atomic "$meta" "$meta.tmp"
  fn_state_set "PHASE_RESULT=$ph:ok" "CONSEC_PHASE_FAIL=0" "CURRENT_PHASE=$ph"
  fn_note "$rid/$ph committed: $outn sections, $(fn_wordcount "$content") words"
  return 0
}

# Persistent infrastructure failure must stop and report, never spin. The bound
# is on consecutive *call* failures, and the state that triggered it is kept.
fn_infra_tick(){
  local n
  n=$(fn_state_get CONSEC_PHASE_FAIL); : "${n:=0}"; n=$((n+1))
  fn_state_set "CONSEC_PHASE_FAIL=$n"
  if [ "$n" -ge "$FE_MAX_CONSEC_PHASE_FAIL" ]; then
    fn_state_set "STATE=blocked" "BLOCK_REASON=$n consecutive model-call failures"
    fn_note "BLOCKED: $n consecutive call failures; state saved at round $(fn_state_get CURRENT_ROUND); no further retries"
  fi
}



# ---- retired ---------------------------------------------------------------
# The commit helpers that are still needed live in lib/handoff.sh, which the
# active path sources. Everything in this file (phase runner, model invocation,
# round loop) is the retired bash supervisor and is no longer sourced by loopctl.

# =========================== prompt builders =================================
fn_build_plan(){
  local r="$1"
  fn_mat_preamble planner "$r" plan
  printf '\n%s\n' "$FE_OUT_CONTRACT_SPEC"
  fn_mat_scenarios
  fn_mat_rubric
  fn_mat_dimensions
  fn_mat_section "design brief (the user-approved statement of goal)" "$FE_CONTROL/product/agent-desktop-design-brief.md" all
  fn_mat_sol_findings
  if [ -s "$FE_RUN/counterexamples.tsv" ] || [ -s "$FE_RUN/candidates/best.md" ]; then
    fn_mat_ledgers
    printf '\n===== PRIOR CANDIDATES =====\n'
    fn_mat_all_candidates
  fi
  printf '\n===== THIS ROUND =====\n%s\n' "$(fn_rid "$r")"
}

fn_build_design(){
  local r="$1"
  fn_mat_preamble designer "$r" design
  printf '\n%s\n' "$FE_OUT_CONTRACT_SPEC"
  fn_mat_scenarios
  fn_mat_rubric
  fn_mat_section "this round's plan" "$(fn_round_dir "$r")/plan.md" all
  fn_mat_ledgers
  fn_mat_sol_findings
  fn_mat_section "read-only survey of the existing implementation" "$FE_RUN/material/01-code-survey.md" 150
  fn_mat_section "prior architecture options (evidence, not the answer)" "$FE_RUN/material/02-architecture-options.md" 150
}

fn_build_attack(){
  local r="$1" f
  fn_mat_preamble attacker "$r" attack
  printf '\n%s\n' "$FE_OUT_CONTRACT_SPEC"
  fn_mat_scenarios
  fn_mat_rubric
  fn_mat_dimensions
  fn_mat_ledgers
  printf '\n===== ASSIGNED ATTACK DIMENSION FOR THIS ROUND =====\n%s\n' "$(fn_round_dimension "$r")"
  printf '\n===== CANDIDATES UNDER ATTACK =====\n'
  for f in "$(fn_round_dir "$r")"/cand-*.md; do [ -f "$f" ] && fn_mat_section "candidate $f" "$f" all; done
}

fn_build_verify(){
  local r="$1" f
  fn_mat_preamble verifier "$r" verify
  printf '\n%s\n' "$FE_OUT_CONTRACT_SPEC"
  fn_mat_scenarios
  fn_mat_rubric
  fn_mat_ledgers
  fn_mat_section "this round's attack report" "$(fn_round_dir "$r")/attack.md" all
  printf '\n===== CANDIDATES AS WRITTEN (check every quoted passage against them) =====\n'
  for f in "$(fn_round_dir "$r")"/cand-*.md; do [ -f "$f" ] && fn_mat_section "candidate $f" "$f" all; done
  if [ "$FE_EXPERIMENTS" = 1 ]; then
    printf '\n===== EXPERIMENT FACILITY =====\n'
    printf 'You may request at most ONE small self-contained python3 model experiment.\n'
    printf 'Put it in a single fenced code block preceded by a line reading exactly EXPERIMENT:\n'
    printf 'The controller runs it in a confined directory, timeout %ss, and records the\n' "$FE_EXPERIMENT_TIMEOUT"
    printf 'transcript. It proves only the model you encoded — never real product behaviour.\n'
  fi
}

fn_build_integrate(){
  local r="$1"
  fn_mat_preamble integrator "$r" integrate
  printf '\n%s\n' "$FE_OUT_CONTRACT_SPEC"
  fn_mat_scenarios
  fn_mat_rubric
  fn_mat_ledgers
  fn_mat_section "this round's plan" "$(fn_round_dir "$r")/plan.md" all
  fn_mat_section "this round's attack report" "$(fn_round_dir "$r")/attack.md" all
  fn_mat_section "this round's verification" "$(fn_round_dir "$r")/verify.md" all
  printf '\n===== CANDIDATES THIS ROUND =====\n'
  local f; for f in "$(fn_round_dir "$r")"/cand-*.md; do [ -f "$f" ] && fn_mat_section "candidate $f" "$f" all; done
  printf '\n===== CURRENT BEST VERSION (compare; last is not automatically best) =====\n'
  if [ -s "$FE_RUN/candidates/best.md" ]; then fn_mat_section "best" "$FE_RUN/candidates/best.md" all
  else printf '_none yet_\n'; fi
}

fn_build_review(){
  local r="$1"
  fn_mat_preamble candidate-reviewer "$r" review
  printf '\n%s\n' "$FE_OUT_CONTRACT_SPEC"
  fn_mat_scenarios
  fn_mat_rubric
  fn_mat_ledgers
  printf '\n===== ARTIFACT UNDER VERIFICATION (digest %s) =====\n' "$(fn_best_digest)"
  fn_mat_section "candidates/best.md" "$FE_RUN/candidates/best.md" all
}
