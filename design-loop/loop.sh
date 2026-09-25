#!/usr/bin/env bash
# FE-DESIGN-001 design-loop controller.
#
#   ./loop.sh start      launch the outer loop detached
#   ./loop.sh status     where it is, what it holds, what is left
#   ./loop.sh stop       stop only this task's own processes
#   ./loop.sh resume     continue after a stop/crash, from the completed phase
#   ./loop.sh report     one-shot human-readable state
#   ./loop.sh step N     run exactly one round (debugging)
#   ./loop.sh selftest   exercise the controller with fake model responses
#
# RETIRED — do not run. Superseded by I's ruling of 2026-09-21: the outer loop
# is Qoder's native /loop, and the only thing this directory still needs is the
# small active entry point, ./loopctl. The commit helpers this file used were
# moved into lib/handoff.sh, so its phase runner can no longer function; rather
# than let it half-run and spend calls, the supervision verbs below refuse.
#
# Authority: this script is the only writer inside control/reports/FE-DESIGN-001.
# It never touches product code, never starts or stops a product service, never
# commits, merges or pushes, and never dispatches implementation work.
set -uo pipefail

FE_SELF=$(readlink -f "$0")
. "$(dirname "$FE_SELF")/env.conf"
. "$FE_LOOP/lib/common.sh"
. "$FE_LOOP/lib/model.sh"
. "$FE_LOOP/lib/validate.sh"
. "$FE_LOOP/lib/ledger.sh"
. "$FE_LOOP/lib/sol.sh"
. "$FE_LOOP/lib/converge.sh"
. "$FE_LOOP/lib/experiment.sh"
. "$FE_LOOP/lib/material.sh"
. "$FE_LOOP/lib/phases.sh"
. "$FE_LOOP/lib/solrun.sh"

FE_LOCK_TOKEN_VALUE=$(date -u +%s)-$$-$RANDOM

fn_bootstrap(){
  mkdir -p "$FE_RUN" "$FE_LOGS" "$FE_TMP" "$FE_RUN/rounds" "$FE_RUN/candidates" "$FE_RUN/sol"
  fn_ledger_ensure; fn_conv_ensure
  fn_sol_init || fn_note "sol: budget record could not be created or repaired — Sol dispatch will stay denied"
  [ -f "$FE_RUN/sol-automatic" ] || fn_sol_auto_disable
  fn_state_set "STATE=idle" "PID=-"
  # curated read-only copies of the prior survey, so no role can reach the
  # product tree and the digests recorded in prompts stay stable
  mkdir -p "$FE_RUN/material"
  local src dst
  for src in "$FE_CONTROL/reports/C1-001/architecture/01-code-survey.md" \
             "$FE_CONTROL/reports/C1-001/architecture/02-architecture-options.md"; do
    dst="$FE_RUN/material/$(basename "$src")"
    [ -f "$src" ] || continue
    [ -f "$dst" ] && cmp -s "$src" "$dst" && continue
    cp "$src" "$dst"
    printf 'copied: %s\nsource: %s\nread-only in this loop\n' "$(date -u +%FT%TZ)" "$src" >> "$FE_RUN/material/PROVENANCE"
  done
}

fn_env_sanitize(){
  # do not hand this session's harness state to a child role
  unset CLAUDECODE QODER_ENTRYPOINT QODER_SDK_ENTRYPOINT 2>/dev/null || true
  local v
  for v in $(env | cut -d= -f1 | grep -E '^(CLAUDE|QODER)_' 2>/dev/null); do
    case "$v" in QODER_HOME|QODER_CONFIG*|PATH|HOME|USER|LANG|LC_*) continue ;; esac
    unset "$v" 2>/dev/null || true
  done
}

# ============================ one round ======================================
fn_run_round(){
  local r="$1" rid d conv
  rid=$(fn_rid "$r"); d=$(fn_round_dir "$r")
  mkdir -p "$d"
  fn_state_set "CURRENT_ROUND=$r" "CURRENT_PHASE=plan" "STATE=running" "ROUND_STATUS=$rid:in_progress"
  fn_note "$rid: round start (best=$(fn_best_candidate) sol=$(fn_sol_snapshot))"

  fn_run_phase "$r" plan planner fn_build_plan || return $?
  fn_run_phase "$r" design designer fn_build_design || return $?
  fn_run_phase "$r" attack attacker fn_build_attack || return $?
  fn_run_phase "$r" verify verifier fn_build_verify || return $?
  [ -f "$d/experiment/record.md" ] || [ -f "$FE_RUN/experiments/$rid/record.md" ] \
    || fn_run_experiment "$r" "$d/verify.content.txt"
  fn_run_phase "$r" integrate integrator fn_build_integrate || return $?

  fn_sol_dispatch "$r"
  fn_summary_write "$r"
  conv=$(fn_convergence_check)
  case "$conv" in
    CONVERGED:*)
      fn_state_set "STATE=converged" "CONVERGED_AT=$rid" "ROUND_STATUS=$rid:converged"
      fn_note "$rid: CONVERGED (Sol-verified). Candidate converged only — not user approval, not implementation."
      fn_summary_write "$r"; return 90 ;;
    CONVERGED_UNVERIFIED:*)
      fn_state_set "STATE=converged_unverified" "CONVERGED_AT=$rid" \
        "PENDING_INDEPENDENT_REVIEW=1" "ROUND_STATUS=$rid:converged_pending_independent_review"
      fn_note "$rid: criteria met but Sol budget spent — ending as candidate pending independent review"
      fn_summary_write "$r"; return 90 ;;
    FINAL_REVIEW_DUE:*)
      fn_note "$rid: final review due but slot was unavailable — continuing" ;;
  esac
  if fn_stalled; then
    fn_state_set "STATE=stalled" "ROUND_STATUS=$rid:stalled_need_decision"
    fn_note "$rid: stalled — $FE_STALL_AFTER consecutive rounds with no established major counterexample. Next dimension rotation needed; not polishing the same proposal."
    fn_summary_write "$r"; return 91
  fi
  fn_state_set "ROUND_STATUS=$rid:complete"
  return 0
}

fn_loop(){
  local r start rc
  start=$(fn_state_get CURRENT_ROUND); : "${start:=1}"
  r="$start"
  while :; do
    [ -f "$FE_RUN/stop.signal" ] && { fn_note "stop.signal seen; pausing at round boundary"; fn_state_set "STATE=stopped"; break; }
    if [ "$(fn_state_get STATE)" = "stopping" ]; then fn_state_set "STATE=stopped"; break; fi
    if [ "$r" -gt "$FE_ROUND_CAP" ]; then
      fn_state_set "STATE=round_cap_paused"
      fn_note "reached FE_ROUND_CAP=$FE_ROUND_CAP without convergence — paused for the user; \`resume\` with a higher cap continues"
      break
    fi
    fn_run_round "$r"; rc=$?
    case "$rc" in
      90) break ;;
      91) break ;;
      0)  r=$((r+1)) ;;
      143) fn_state_set "STATE=stopped"; fn_note "stopped inside a phase at round $r"; break ;;
      *)  fn_note "round $r aborted rc=$rc"
          if [ "$(fn_state_get CONSEC_PHASE_FAIL)" -ge "$FE_MAX_CONSEC_PHASE_FAIL" ] || [ "$(fn_state_get STATE)" = "blocked" ]; then
            fn_state_set "STATE=blocked" "ROUND_STATUS=$(fn_rid "$r"):blocked"
            fn_note "infrastructure blocked; state saved; the loop will not idle-retry. Run \`status\`, fix, then \`resume\`."
            break
          fi
          fn_state_set "STATE=retry_pending"; r=$((r+1)) ;;
    esac
    fn_summary_write "$r"
  done
  fn_state_set "PID=-"
  fn_lock_release
  fn_note "loop exited state=$(fn_state_get STATE)"
}

# ============================ summary page ===================================
fn_summary_write(){
  local r="$1" rid best conv
  rid=$(fn_rid "$r")
  best=$(fn_best_candidate)
  conv=$(fn_convergence_check)
  {
    printf '# FE-DESIGN-001 — latest summary\n\n'
    printf 'As of: %s  round: %s  state: %s  phase: %s\n\n' \
      "$(date -u +%FT%TZ)" "$rid" "$(fn_state_get STATE)" "$(fn_state_get CURRENT_PHASE)"
    printf 'Stop reason is one of: running / converged (design-candidate only) /\n'
    printf 'converged_pending_independent_review / stalled / blocked / stopped.\n'
    printf 'Convergence means a design candidate settled, NOT user approval and NOT\nimplementation.\n\n'
    printf '## Current best candidate\n\n'
    printf 'id: %s   artifact: %s\n\n' "${best:-none}" "candidates/best.md"
    printf '## Substantive change vs the previous version\n\n'
    if [ -f "$(fn_round_dir "$r")/integrate.md" ]; then
      sed -n '/CHANGES_VS_PREVIOUS/,/^##/p' "$(fn_round_dir "$r")/integrate.md" | head -20
    else printf '_not written yet_\n'; fi
    printf '\n## Unresolved counterexamples (full text in counterexamples.tsv)\n\n'
    printf '```\n'; fn_regression_list 2>/dev/null | head -40; printf '```\n\n'
    printf 'open major: %s   any open: %s   closed awaiting replay: %s\n\n' \
      "$(fn_ce_open_major)" "$(fn_ce_any_open)" "$(fn_ce_pending_replay)"
    printf '## Scenario coverage (S01-S12)\n\n'
    printf '`claimed` is the integrator asserting coverage; `covered` requires an\n'
    printf 'independent review ruling against these exact candidate bytes. Format\nvalid output never counts as a semantic pass.\n\n'
    printf '```\n'; cat "$FE_SC" 2>/dev/null; printf '```\n\n'
    printf 'claimed: %s   independently ruled: %s   required: %s\n' \
      "$(awk -F'|' 'NR>1 && ($2=="covered"||$2=="claimed") {n++} END{print n+0}' "$FE_SC" 2>/dev/null)" \
      "$(fn_sc_covered)" "$FE_SCENARIO_MIN_COVER"
    printf '   broken by review: %s   replay still failing: %s\n\n' \
      "$(fn_ruling_count sc trajectory_broken)" "$(fn_ruling_count ce fail)"
    printf '## Mechanism dispositions\n\n```\n'; cat "$FE_MECH" 2>/dev/null; printf '```\n\n'
    printf '## Sol review budget (call count, not tokens)\n\n'
    printf '```\n%s\n```\n\n' "$(fn_sol_status_line)"
    printf 'submissions:\n\n```\n'; cat "$FE_SOL_VERDICTS" 2>/dev/null; printf '```\n\n'
    if [ "$(fn_state_get PENDING_INDEPENDENT_REVIEW)" = "1" ]; then
      printf '**The current best candidate has NOT been independently verified.**\n\n'
    fi
    printf '## Convergence\n\n'
    printf 'check: `%s`\nclean streak: %s (need %s)  rounds: %s\nlast dimension: %s\n\n' \
      "$conv" "$(fn_clean_streak)" "$FE_CLEAN_ROUNDS_REQUIRED" "$(fn_rounds_seen)" \
      "$(fn_round_dimension "$r")"
    printf '## Per round\n\n```\n'; cat "$FE_ROUNDS" 2>/dev/null; printf '```\n\n'
    printf '## Where things are\n\n'
    printf '* ledgers: `counterexamples.tsv` `scenarios.tsv` `mechanisms.tsv` `rounds.tsv`\n'
    printf '* rounds: `rounds/R*/` (prompt, content, meta, committed sections, ledger snapshots)\n'
    printf '* sol: `sol-budget.env` `sol-budget.log` `sol/`\n'
    printf '* controller log: `logs/loop.log`  children: `logs/children.pids`\n'
  } | fn_write "$FE_RUN/latest-summary.md"
}

# ============================ subcommands ====================================
cmd_start(){
  local lp
  if lp=$(fn_lock_alive); then echo "already running: pid=$lp" >&2; return 1; fi
  rm -f "$FE_RUN/stop.signal" 2>/dev/null || true
  fn_bootstrap
  fn_env_sanitize
  FE_LOCK_TOKEN_VALUE="$FE_LOCK_TOKEN_VALUE" setsid nohup "$FE_SELF" __run \
    >> "$FE_LOGS/loop.log" 2>&1 < /dev/null &
  local p=$!
  sleep 2
  if fn_pid_alive "$p"; then
    echo "started: pid=$p"
  else
    echo "start failed — see $FE_LOGS/loop.log" >&2
    tail -5 "$FE_LOGS/loop.log" >&2
    return 1
  fi
}
cmd___run(){
  fn_bootstrap
  if ! fn_lock_acquire; then exit 1; fi
  trap 'fn_note "signal received; finishing current step then stopping"; touch "$FE_RUN/stop.signal"' TERM INT
  fn_state_set "PID=$$" "STATE=running" "STARTED_AT=$(date -u +%FT%TZ)" "STOP_REQUESTED=0"
  fn_note "loop up: pid=$$ round=$(fn_state_get CURRENT_ROUND) sol=$(fn_sol_snapshot)"
  fn_loop
}
cmd_status(){
  local lp st
  lp=$(fn_lock_alive) && st="RUNNING pid=$lp" || st="NOT RUNNING"
  printf 'FE-DESIGN-001 controller — %s\n\n' "$st"
  printf 'state file        : %s\n' "$FE_RUN/state.env"
  printf 'log file          : %s\n' "$FE_LOGS/loop.log"
  printf 'summary page      : %s\n\n' "$FE_RUN/latest-summary.md"
  [ -f "$FE_RUN/state.env" ] && sed 's/^/  /' "$FE_RUN/state.env"
  printf '\nsol budget (calls, not tokens): %s\n' "$(fn_sol_status_line 2>/dev/null || echo 'not initialised')"
  printf 'open major counterexamples      : %s\n' "$(fn_ce_open_major 2>/dev/null || echo '?')"
  printf 'scenarios covered               : %s / %s\n' "$(fn_sc_covered 2>/dev/null || echo 0)" "$FE_SCENARIO_MIN_COVER"
  printf 'clean streak                    : %s / %s\n' "$(fn_clean_streak 2>/dev/null || echo 0)" "$FE_CLEAN_ROUNDS_REQUIRED"
  printf 'live children of this task      : %s\n' "$( [ -f "$FE_LOGS/children.pids" ] && awk '$1{ if (system("kill -0 " $1 " 2>/dev/null")==0) c++ } END{print c+0}' "$FE_LOGS/children.pids" 2>/dev/null || echo 0)"
  printf '\nstop:   %s stop\nresume: %s resume\n' "$FE_SELF" "$FE_SELF"
}
cmd_stop(){
  local lp p killed=0
  if ! lp=$(fn_lock_alive); then echo "not running"; fi
  touch "$FE_RUN/stop.signal"
  fn_state_set "STOP_REQUESTED=1"
  if [ -n "${lp:-}" ]; then
    kill -TERM "$lp" 2>/dev/null && fn_note "TERM sent to loop pid $lp"
  fi
  if [ -f "$FE_LOGS/children.pids" ]; then
    while read -r p tag ts; do
      [ -n "$p" ] || continue
      if fn_pid_alive "$p"; then
        fn_kill_child "$p"
        killed=$((killed+1))
        fn_note "killed tracked child pid=$p tag=$tag"
      fi
    done < "$FE_LOGS/children.pids"
  fi
  echo "stop requested; killed $killed tracked child process group(s) of this task only"
  echo "state is preserved under $FE_RUN — 'resume' continues from the last completed phase"
}
cmd_resume(){
  local lp
  if lp=$(fn_lock_alive); then echo "already running: pid=$lp" >&2; return 1; fi
  rm -f "$FE_RUN/stop.signal" 2>/dev/null || true
  [ -f "$FE_RUN/state.env" ] || { echo "no state to resume — use start" >&2; return 1; }
  case "$(fn_state_get STATE)" in
    converged|converged_unverified)
      echo "state is $(fn_state_get STATE); resume is a no-op. Raise FE_ROUND_CAP or reset CURRENT_ROUND deliberately." >&2 ;;
  esac
  fn_state_set "CONSEC_PHASE_FAIL=0"
  echo "resuming from round $(fn_state_get CURRENT_ROUND) phase $(fn_state_get CURRENT_PHASE); sol budget unchanged: $(fn_sol_snapshot)"
  cmd_start
}
cmd_report(){ cmd_status; printf '\n--- latest-summary.md ---\n\n'; cat "$FE_RUN/latest-summary.md" 2>/dev/null; }
cmd_step(){
  local n="${1:-}"
  fn_bootstrap
  if [ -z "$n" ]; then n=$(fn_state_get CURRENT_ROUND); : "${n:=1}"; fi
  FE_LOCK_TOKEN_VALUE="$FE_LOCK_TOKEN_VALUE"
  if ! fn_lock_acquire; then return 1; fi
  fn_run_round "$n"; rc=$?
  fn_lock_release
  return $rc
}

case "${1:-help}" in
  start|resume|step|__run)
    cat >&2 <<EOF
loop.sh: '$1' is the retired bash supervisor and is disabled.
  the outer loop is Qoder's native /loop (dynamic pacing)
  the active entry point is: $FE_LOOP/loopctl
  state and ledgers are unchanged; run: $FE_LOOP/loopctl status
EOF
    exit 64 ;;
  __run) shift; cmd___run "$@" ;;
  status) shift; cmd_status "$@" ;;
  stop) shift; cmd_stop "$@" ;;
  resume) shift; cmd_resume "$@" ;;
  report) shift; cmd_report "$@" ;;
  step) shift; cmd_step "$@" ;;
  selftest) shift; exec "$FE_LOOP/tests/selftest.sh" "$@" ;;
  convergence) shift; fn_bootstrap; fn_convergence_check ;;
  triggers) shift; fn_bootstrap; fn_sol_trigger "${1:-1}" ;;
  sol-status) shift; fn_sol_status_line ;;
  sol-init) shift; fn_bootstrap; fn_sol_init ;;
  sol-enable) shift; fn_sol_ensure_dirs 2>/dev/null; fn_sol_auto_enable; echo "automatic Sol dispatch ENABLED for this run" ;;
  sol-disable) shift; fn_sol_auto_disable; echo "automatic Sol dispatch disabled" ;;
  sol-pending) shift; fn_sol_open_pending ;;
  sol-replay-check) shift; fn_bootstrap; fn_sol_audit ;;
  *) cat <<EOF
usage: loop.sh {start|status|stop|resume|report|step [round]|selftest|convergence|triggers [round]}
  state: $( [ -f "$FE_RUN/state.env" ] && fn_state_get STATE || echo 'uninitialised' )
EOF
  ;;
esac
