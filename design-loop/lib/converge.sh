# lib/converge.sh — deterministic convergence and stall arithmetic. No model
# judgement here: every number comes from the ledgers the controller owns, so a
# restart recomputes the same answer from the same files.

FE_ROUNDS="$FE_RUN/rounds.tsv"
FE_MECH="$FE_RUN/mechanisms.tsv"

fn_conv_ensure(){
  [ -f "$FE_ROUNDS" ] || printf 'round|holds_major|new_major|closed_major|clean|note|digest|review_holds\n' | fn_write "$FE_ROUNDS"
  [ -f "$FE_MECH" ]   || printf 'mechanism|disposition|failure_scenario|experiment_ref|round\n' | fn_write "$FE_MECH"
}

fn_round_record(){ # <round> <holds_major> <new_major> <closed_major> <clean> <note>
  fn_conv_ensure
  printf '%s|%s|%s|%s|%s|%s|%s|0\n' "$(fn_rid "$1")" "$2" "$3" "$4" "$5" "$(fn_scrub "$6")" "$(fn_best_digest)" >> "$FE_ROUNDS"
  sync "$FE_ROUNDS" 2>/dev/null || true
}

# The round's quiet verdict is only final once the independent review has spoken:
# a review that finds its own hold makes the round not-clean, even if the earlier
# phases looked spotless. This rewrites that round's row in place — history is
# corrected against the same round id, never re-appended as a second clean lie.
fn_round_settle(){ # <round>
  local r="$1" rid num dig holds broken insf clean tmp
  fn_conv_ensure
  rid=$(fn_rid "$r"); num=$((10#${r}))
  dig=$(fn_best_digest) || dig=no-candidate
  holds=$(awk -F'|' -v d="$dig" 'NR>1 && $2==d && $3=="ce" && $5=="holds"{n++} END{print n+0}' "$FE_RULINGS" 2>/dev/null)
  broken=$(awk -F'|' -v d="$dig" 'NR>1 && $2==d && $3=="sc" && $5=="trajectory_broken"{a[$4]=1} END{print length(a)+0}' "$FE_RULINGS" 2>/dev/null)
  insf=$(awk -F'|' -v d="$dig" 'NR>1 && $2==d && $3=="sc" && $5=="insufficient_evidence"{a[$4]=1} END{print length(a)+0}' "$FE_RULINGS" 2>/dev/null)
  clean=1
  { [ "${holds:-0}" -gt 0 ] || [ "${broken:-0}" -gt 0 ]; } && clean=0
  tmp="$FE_TMP/rounds.$$"
  awk -F'|' -v OFS='|' -v rid="$rid" -v num="$num" -v dig="$dig" -v h="${holds:-0}" -v c="$clean" '
    NR==1 { if (NF<8) {print $0"|review_holds"} else print; next }
    $1==rid || $1+0==num { $5=c; $7=dig; $8=h; print; next }
    { if (NF<8) $8="0"; print }' "$FE_ROUNDS" > "$tmp"
  fn_atomic "$FE_ROUNDS" "$tmp"
  fn_note "$rid settled: review_holds=${holds:-0} scenarios_broken=${broken:-0} insufficient=${insf:-0} clean=$clean digest=$(printf %s "$dig" | cut -c1-12)"
  return 0
}

# A clean streak only counts while the saved candidate is the same bytes;
# otherwise "three quiet rounds" could be paid for by rewriting the target.
fn_clean_streak(){
  local dig
  [ -f "$FE_ROUNDS" ] || { echo 0; return 0; }
  dig=$(fn_best_digest) || { echo 0; return 0; }
  awk -F'|' -v d="$dig" 'NR>1 { r[NR]=$0; clean[NR]=$5; dg[NR]=$7 }
    END{ n=0
      for (i = NR; i >= 2; i--) {
        if (clean[i]=="1" && (dg[i]=="" || dg[i]==d)) n++
        else if (clean[i]=="1") continue
        else break
      }
      print n+0 }' "$FE_ROUNDS"
}
fn_rounds_seen(){ awk 'NR>1' "$FE_ROUNDS" 2>/dev/null | wc -l | tr -d ' '; }

# mechanisms with disposition=core but no deletion/delegation experiment, or no
# concrete "removing it breaks scenario X" justification
fn_core_mech_missing_experiment(){
  [ -f "$FE_MECH" ] || { echo 0; return 0; }
  awk -F'|' 'NR>1 && $2=="core" && ($3=="" || $4=="" || $4=="-") {n++} END{print n+0}' "$FE_MECH"
}
fn_mech_count(){
  local f="$FE_MECH"
  [ -f "$f" ] || { echo 0; return 0; }
  awk 'NR>1' "$f" | wc -l | tr -d ' '
}

# best.md digest + attack-dimension digest -> submission key
fn_best_candidate(){ fn_state_get BEST_CANDIDATE; }

# Coverage is NOT the integrator's claim and NOT a format check. A scenario
# counts as covered only when an independent reviewer ruled its trajectory good
# against the exact bytes of the saved candidate.
# how many distinct ids carry a given ruling against the current bytes
fn_ruling_count(){ # <kind> [verdict]
  local kind="$1" want="${2:-}" dig
  dig=$(fn_best_digest) || { echo 0; return 0; }
  case "$dig" in no-candidate|digest-uncomputable|"") echo 0; return 0 ;; esac
  [ -f "$FE_RULINGS" ] || { echo 0; return 0; }
  if [ -n "$want" ]; then
    awk -F'|' -v d="$dig" -v k="$kind" -v w="$want" '$2==d && $3==k && $5==w && $1!="round"{a[$4]=1} END{print length(a)+0}' "$FE_RULINGS"
  else
    awk -F'|' -v d="$dig" -v k="$kind" '$2==d && $3==k && $1!="round"{a[$4]=1} END{print length(a)+0}' "$FE_RULINGS"
  fi
}

# A CLOSED major is only settled once an independent reviewer replayed it and
# passed it against the current candidate bytes; a replay against older bytes
# does not carry over.
fn_ce_pending_replay(){
  local dig id n=0
  [ -f "$FE_LEDGER" ] || { echo 0; return 0; }
  dig=$(fn_best_digest) || { echo 0; return 0; }
  case "$dig" in no-candidate|digest-uncomputable|"") echo 0; return 0 ;; esac
  for id in $(awk -F'|' 'NR>1 && $3=="major" && $4=="CLOSED"{print $1}' "$FE_LEDGER"); do
    [ "$(fn_ruling ce "$id" "$dig")" = "pass" ] || n=$((n+1))
  done
  printf '%s' "$n"
}

fn_sc_covered(){
  local dig sid ok=0
  dig=$(fn_best_digest) || { echo 0; return 0; }
  case "$dig" in no-candidate|digest-uncomputable|"") echo 0; return 0 ;; esac
  [ -f "$FE_RULINGS" ] || { echo 0; return 0; }
  for sid in $(awk -F'|' 'NR>1{print $1}' "$FE_SC" 2>/dev/null | sort -u); do
    case "$(fn_ruling sc "$sid" "$dig")" in
      trajectory_ok) ok=$((ok+1)) ;;
    esac
  done
  printf '%s' "$ok"
}
fn_best_key(){
  local bd ad
  bd=-; ad=-
  [ -f "$FE_RUN/candidates/best.md" ] && bd=$(fn_sha "$FE_RUN/candidates/best.md")
  [ -f "$FE_RUN/attack-dimension.txt" ] && ad=$(tr -d '\n' < "$FE_RUN/attack-dimension.txt")
  fn_sha_str "best=$bd;question=core-boundary-and-scenario-coverage;dim=$ad"
}
fn_sol_key_ok(){ local key="$1"; [ -f "$FE_RUN/sol-verdicts.tsv" ] && awk -F'|' -v k="$key" '$2==k && $3=="pass"{f=1} END{exit !f}' "$FE_RUN/sol-verdicts.tsv"; }
fn_sol_any_verdict(){ local key="$1"; [ -f "$FE_RUN/sol-verdicts.tsv" ] && awk -F'|' -v k="$key" '$2==k{f=1} END{exit !f}' "$FE_RUN/sol-verdicts.tsv"; }

# fn_convergence_check  -> prints "CONVERGED|CONVERGED_UNVERIFIED|NO:<reasons>"
fn_convergence_check(){
  fn_conv_ensure
  local miss=0 why="" cov openmaj pend coremis streak best rev broken rfail
  cov=$(fn_sc_covered); openmaj=$(fn_ce_open_major); pend=$(fn_ce_pending_replay)
  rev=$(fn_ruling_count sc); broken=$(fn_sc_broken); unowned=$(fn_sc_unowned)
  rfail=$(fn_ruling_count ce fail)
  coremis=$(fn_core_mech_missing_experiment); streak=$(fn_clean_streak)
  [ "$cov" -ge "$FE_SCENARIO_MIN_COVER" ] || { miss=1; why="$why scenarios_independently_ruled_covered=$cov<${FE_SCENARIO_MIN_COVER};"; }
  [ "${unowned:-0}" -eq 0 ] || { miss=1; why="$why reviewed_scenarios_without_an_owner=$unowned;"; }
  [ "${rev:-0}" -gt 0 ] || { miss=1; why="$why no independent review rulings exist for the current candidate bytes;"; }
  [ "${broken:-0}" -eq 0 ] || { miss=1; why="$why scenarios_ruled_trajectory_broken=$broken;"; }
  [ "${rfail:-0}" -eq 0 ] || { miss=1; why="$why regression_replays_still_failing=$rfail;"; }
  [ "$openmaj" -eq 0 ] || { miss=1; why="$why open_major_CE=$openmaj;"; }
  [ "$pend" -eq 0 ] || { miss=1; why="$why major_CE_pending_replay=$pend;"; }
  [ "$coremis" -eq 0 ] || { miss=1; why="$why core_mechanisms_without_experiment=$coremis;"; }
  [ "$streak" -ge "$FE_CLEAN_ROUNDS_REQUIRED" ] || { miss=1; why="$why clean_streak=$streak<${FE_CLEAN_ROUNDS_REQUIRED};"; }
  [ -s "$FE_RUN/candidates/best.md" ] || { miss=1; why="$why no_candidate;" ; }
  if [ "$miss" = 1 ]; then printf 'NO:%s\n' "$why"; return 0; fi
  best=$(fn_best_key)
  if fn_sol_key_ok "$best"; then printf 'CONVERGED:%s\n' "$best"; return 0; fi
  if [ "$(fn_sol_remaining)" -le 0 ]; then printf 'CONVERGED_UNVERIFIED:%s\n' "$best"; return 0; fi
  printf 'FINAL_REVIEW_DUE:%s\n' "$best"
}

# stall = 3 consecutive rounds with holds_major==0 and no new mechanism wording
fn_stalled(){
  local n; n=$(awk -F'|' 'NR>1 && $2=="0" {c++} END{print c+0}' "$FE_ROUNDS" 2>/dev/null)
  local last3
  last3=$(tail -n "$FE_STALL_AFTER" "$FE_ROUNDS" 2>/dev/null | awk -F'|' 'NR>0 && $2=="0"{c++} END{print c+0}')
  [ "${last3:-0}" -ge "$FE_STALL_AFTER" ]
}

# --- reviewed scenarios must also be owned somewhere in the record ------------
# An approval with no owner is a fact nobody is responsible for: it must block
# convergence rather than quietly count as coverage.
fn_sc_unowned(){
  local dig i sid owner n=0
  dig=$(fn_best_digest) || { echo 0; return 0; }
  [ -f "$FE_RULINGS" ] && [ -f "$FE_SC" ] || { echo 0; return 0; }
  i=1
  while [ "$i" -le "$FE_SCENARIO_MIN_COVER" ]; do
    sid=$(printf 'S%02d' "$i")
    if [ "$(fn_ruling sc "$sid" "$dig")" = "trajectory_ok" ]; then
      owner=$(awk -F'|' -v k="$sid" '$1==k && ($2=="covered"||$2=="claimed"){print $3}' "$FE_SC" | tail -1)
      case "$owner" in core|adaptation|extension) : ;; *) n=$((n+1)) ;; esac
    fi
    i=$((i+1))
  done
  printf '%s' "$n"
}
fn_sc_broken(){
  local dig i sid n=0
  dig=$(fn_best_digest) || { echo 0; return 0; }
  [ -f "$FE_RULINGS" ] || { echo 0; return 0; }
  i=1
  while [ "$i" -le "$FE_SCENARIO_MIN_COVER" ]; do
    sid=$(printf 'S%02d' "$i")
    [ "$(fn_ruling sc "$sid" "$dig")" = "trajectory_broken" ] && n=$((n+1))
    i=$((i+1))
  done
  printf '%s' "$n"
}
