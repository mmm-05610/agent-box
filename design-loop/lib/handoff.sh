# lib/handoff.sh — the only glue the native loop needs on top of the ledgers.
#
# It is deliberately small: build the material a role is allowed to see, accept
# what comes back through the same gate, and answer two questions about state
# (what is unresolved, and what has been independently ruled). The retired
# process supervisor (lib/model.sh, lib/phases.sh, loop.sh start/stop/resume)
# is NOT sourced here, so nothing in the active path can reach it by accident.

FE_ACTIVE_LIBS="common validate ledger sol material converge handoff"

# ---- mechanism dispositions (moved out of the retired phase runner) ----------
# columns: mechanism|disposition|failure_scenario|experiment_ref|round
fn_mech_merge(){ # <rows-file> <round>
  local f="$1" r="$2" work name disp failsc ref line nxt
  work="$FE_TMP/mech.work.$$"
  [ -f "$FE_MECH" ] && cp "$FE_MECH" "$work" || printf 'mechanism|disposition|failure_scenario|experiment_ref|round\n' > "$work"
  while IFS= read -r line; do
    IFS='|' read -r name disp failsc ref <<< "$line"
    [ -n "$name" ] || continue
    nxt="$FE_TMP/mech.row.$$"
    if grep -q "^$(printf '%s' "$name" | sed 's/[][\.*^$/]/\\&/g')|" "$work"; then
      awk -F'|' -v OFS='|' -v nm="$name" -v d="$disp" -v f="$failsc" -v e="$ref" -v r="$r" '
        NR==1 || $1!=nm {print; next}
        { $2=d; $3=f; $4=e; $5=r; print }' "$work" > "$nxt" && mv "$nxt" "$work"
    else
      printf '%s|%s|%s|%s|%s\n' "$(fn_scrub "$name")" "$(fn_scrub "$disp")" "$(fn_scrub "$failsc")" "$(fn_scrub "$ref")" "$r" >> "$work"
    fi
  done < "$f"
  fn_atomic "$FE_MECH" "$work"
  return 0
}
fn_core_mech_missing_experiment(){
  [ -f "$FE_MECH" ] || { echo 0; return 0; }
  awk -F'|' 'NR>1 && $2=="core" && ($3=="" || $4=="" || $4=="-") {n++} END{print n+0}' "$FE_MECH"
}

# ---- the handoff prompt ------------------------------------------------------
# Roles get no tools: everything they may see is inlined here, and the two
# ledgers that carry obligations (counterexamples, scenarios) are inlined IN
# FULL. Source documents may be head-truncated; the record may not.
fn_build_handoff_prompt(){ # <role> <round-id> [extra-file ...]
  local role="$1" rid="$2"; shift 2
  local cf="$FE_ROLES/$role.md" d="$FE_RUN/rounds/$rid"
  [ -r "$cf" ] || { printf 'missing role contract: %s\n' "$cf" >&2; return 1; }
  {
    fn_mat_preamble "$role" "${rid#R}" "$role"
    printf '\n%s\n' "$FE_OUT_CONTRACT_SPEC"
    fn_mat_section "role contract (authoritative for this call)" "$cf" all
    fn_mat_scenarios
    fn_mat_rubric
    fn_mat_dimensions
    fn_mat_section "design brief (the approved statement of goal)" \
      "$FE_CONTROL/product/agent-desktop-design-brief.md" all
    fn_mat_ledgers
    printf '\n===== SAVED CANDIDATE (digest %s) =====\n' "$(fn_best_digest)"
    if [ -s "$FE_RUN/candidates/best.md" ]; then
      fn_mat_section "candidates/best.md" "$FE_RUN/candidates/best.md" all
    else
      printf '_none yet_\n'
    fi
    for f in "$@"; do
      [ -f "$f" ] && fn_mat_section "this round's artifact $f" "$f" all
    done
    # recency matters: the required blocks are restated last, narrowed to this
    # role only. The gate itself is unchanged — this is presentation, not a
    # looser standard.
    fn_output_reminder "$cf"
  }
}

# restate only the blocks this role's contract demands, immediately before the
# model starts writing, with a literal example row
fn_output_reminder(){
  local cf="$1" spec extra line
  spec=$(fn_spec "$cf" extra)
  printf '\n===== FINAL: THE ONLY ACCEPTABLE ANSWER SHAPE =====\n'
  printf 'Your reply is machine-checked. Anything not inside these markers is read as\n'
  printf 'commentary and cannot enter the record. Emit the sections and blocks below,\n'
  printf 'in this order, with the markers alone on their own lines:\n\n'
  printf '<<<FE-OUT-START>>>\n<deliverable>%s\n<<<FE-OUT-END>>>\n' \
    "$( [ "$(awk -F'|' '$1=="OUTPUT"{c++} END{print c+0}' "$cf")" -gt 1 ] \
       && printf '\n<<<FE-OUT-START>>>\n<one deliverable per declared candidate id>\n<<<FE-OUT-END>>>')"
  for extra in $(printf '%s' "$spec" | tr '+' ' '); do
    case "$extra" in
      ledger)   line="$FE_M_LED_S\nFE-CE-NNN|round|major|OPEN|the invariant broken|short title|evidence pointer|-\n$FE_M_LED_E" ;;
      verdict)
        vk=$(fn_spec "$cf" verdict_kinds); : "${vk:=ce+sc}"
        line="$FE_M_VER_S"
        case "$vk" in *ce*) line="$line\nFE-CE-NNN|holds|which candidate text fails to prevent it|what is still missing" ;; esac
        case "$vk" in *sc*) line="$line\nS01|trajectory_ok|where the ordered trajectory lives|nothing" ;; esac
        line="$line\n$FE_M_VER_E"
        case "$vk" in *sc*) : ;; *) line="$line\n(Scenario rulings are NOT yours to make: an S0x row in your verdict block fails this phase.)" ;; esac ;;
      replay)   line="$FE_M_RPL_S\nFE-CE-NNN|pass|the sequence you replayed|the text that stops it\n$FE_M_RPL_E" ;;
      scenario) line="$FE_M_SCN_S\nS01|covered|core|the mechanism|evidence pointer\n$FE_M_SCN_E" ;;
      mech)     line="$FE_M_MECH_S\nmechanism name|core|the scenario that fails if deleted|experiment pointer\n$FE_M_MECH_E" ;;
      *) continue ;;
    esac
    printf '%b\n' "$line"
  done
  # the named declarations are part of the shape too, and were being missed
  # because only the blocks were restated here (three refusals in a row)
  local rl one
  rl=$(fn_spec "$cf" require_lines)
  if [ -n "$rl" ]; then
    printf '\nYour prose section must also contain these lines verbatim:\n'
    for one in $(printf '%s' "$rl" | tr ',' ' '); do
      printf '  %s <what you found, with the passage>\n' "$one"
    done
  fi
  printf '\nIf a block applies and you leave it empty, that is a failed phase, not an\n'
  printf 'empty result: the verdict block in particular is the only thing that can move\n'
  printf 'a counterexample, and prose verdicts are not read.\n'
}

# write the handoff into the round dir and report where it went
fn_stage_handoff(){ # <role> <round-id> [extra-file ...]
  local role="$1" rid="$2"; shift 2
  local d="$FE_RUN/rounds/$rid" out
  mkdir -p "$d"
  out="$d/$role.prompt.txt"
  fn_build_handoff_prompt "$role" "$rid" "$@" | fn_write "$out"
  # judge by the artifact, not by the pipeline status: fn_write ends in a sync
  # whose exit code says nothing about whether the prompt was produced
  [ -s "$out" ] || { printf 'handoff produced no prompt file: %s\n' "$out" >&2; return 1; }
  printf '%s\n' "$out"
}

# ---- helpers the commits need (moved out of the retired supervisor)

fn_candidate_ids(){ # <round> -> "A B" as declared by the plan
  local d; d=$(fn_round_dir "$1")
  [ -f "$d/plan.md" ] || return 0
  sed -n 's/^CANDIDATES:[[:space:]]*//p' "$d/plan.md" | tail -1 | tr ',' ' ' | tr -s ' ' | tr -d '\r'
}

fn_round_dimension(){
  local d; d=$(fn_round_dir "$1")
  [ -f "$d/dimension.txt" ] && sed -n 's/^DIMENSION:[[:space:]]*//p' "$d/dimension.txt" | tail -1 || printf 'unassigned'
}

fn_commit_phase(){ # <phase> <round> <section_count>
  case "$1" in
    plan) fn_commit_plan "$2" "$3" ;;
    design) fn_commit_design "$2" "$3" ;;
    attack) fn_commit_attack "$2" "$3" ;;
    verify) fn_commit_verify "$2" "$3" ;;
    integrate) fn_commit_integrate "$2" "$3" ;;
    review) fn_commit_review "$2" "$3" ;;
    *) return 0 ;;
  esac
}

fn_cp_snapshot(){ # keep an immutable copy of the ledgers as they stood
  local r="$1" ph="$2" snap
  snap="$(fn_round_dir "$r")/ledger-after-$ph"
  mkdir -p "$snap"
  [ -f "$FE_LEDGER" ] && cp "$FE_LEDGER" "$snap/counterexamples.tsv"
  [ -f "$FE_SC" ] && cp "$FE_SC" "$snap/scenarios.tsv"
  [ -f "$FE_MECH" ] && cp "$FE_MECH" "$snap/mechanisms.tsv"
  [ -f "$FE_ROUNDS" ] && cp "$FE_ROUNDS" "$snap/rounds.tsv"
  return 0
}

# ---- committing a role's accepted output ------------------------------------
# Each commit is pure file arithmetic on the ledgers: no process handling,
# no model call. A role is only ever recorded as accepted after the gate.
fn_commit_plan(){
  local r="$1" n="$2" d sec ids dim
  d=$(fn_round_dir "$r")
  [ "$n" -ge 1 ] || return 1
  sec="$d/plan.sec1.md"
  [ -s "$sec" ] || return 1
  ids=$(sed -n 's/^CANDIDATES:[[:space:]]*//p' "$sec" | tail -1)
  [ -n "$ids" ] || { fn_note "plan rejected: no CANDIDATES: line"; return 1; }
  dim=$(sed -n 's/^DIMENSION:[[:space:]]*//p' "$sec" | tail -1)
  [ -n "$dim" ] || { fn_note "plan rejected: no DIMENSION: line"; return 1; }
  fn_atomic "$d/plan.md" "$sec"
  printf 'DIMENSION: %s\n' "$dim" | fn_write "$d/dimension.txt"
  printf '%s\n' "$dim" | fn_write "$FE_RUN/attack-dimension.txt"
  return 0
}

fn_commit_design(){
  local r="$1" n="$2" d ids k i=1 tmp
  d=$(fn_round_dir "$r")
  ids=$(fn_candidate_ids "$r")
  [ -n "$ids" ] || return 1
  set -- $ids
  # all-or-nothing: a rejected design must leave no candidate behind, or the
  # next round would silently attack a half-accepted artifact
  tmp="$FE_TMP/cand.$$"; mkdir -p "$tmp"
  for k in "$@"; do
    if [ ! -s "$d/design.sec$i.md" ]; then
      fn_note "design rejected: plan declared $(echo "$ids" | wc -w) candidates, section $i ($k) is missing (found $n section(s))"
      rmdir "$tmp" 2>/dev/null; rm -rf "$tmp" 2>/dev/null
      return 1
    fi
    cp "$d/design.sec$i.md" "$tmp/cand-$k.md"
    i=$((i+1))
  done
  for k in "$@"; do
    fn_atomic "$d/cand-$k.md" "$tmp/cand-$k.md"
  done
  rmdir "$tmp" 2>/dev/null
  return 0
}

fn_commit_attack(){
  local r="$1" d
  d=$(fn_round_dir "$r")
  [ -s "$d/attack.sec1.md" ] || return 1
  fn_atomic "$d/attack.md" "$d/attack.sec1.md"
  FE_CE_MAP="$d/ce-id-map.tsv"; : > "$FE_CE_MAP"
  [ -s "$FE_TMP/ce.accepted" ] && fn_ce_merge "$FE_TMP/ce.accepted" "$(fn_rid "$r")"
  return 0
}

fn_commit_verify(){
  local r="$1" d line vid vst _rest
  d=$(fn_round_dir "$r")
  [ -s "$d/verify.sec1.md" ] || return 1
  fn_atomic "$d/verify.md" "$d/verify.sec1.md"
  FE_CE_MAP="$d/ce-id-map.tsv"
  # verdicts overwrite severity/status truth once the verifier has ruled
  if [ -s "$FE_TMP/verdict.raw" ]; then
    while IFS= read -r line; do
      line=$(fn_norm "$line")
      case "$line" in FE-CE-[0-9][0-9][0-9]|*) : ;; *) continue ;; esac
      IFS='|' read -r vid vst _rest <<< "$line"
      vid=$(fn_ce_resolve "$vid")
      # a verdict about the SAVED candidate says nothing about a defect that
      # belongs to a discarded alternative; letting "does_not_hold against A"
      # reject B's row would erase B's book through the verdict door
      if [ "$(fn_ce_subject "$vid")" = "B-alternative" ]; then
        printf 'R%s|%s|ce|%s|not_applicable|ruled against the saved candidate, belongs to a discarded alternative\n' \
          "$(fn_rid "$r")" "$(fn_best_digest)" "$vid" >> "$FE_RULINGS"
        continue
      fi
      case "$vst" in
        holds) fn_ce_set_status "$vid" OPEN "verifier ruled it holds (R$(fn_rid "$r"))" ;;
        does_not_hold) fn_ce_set_status "$vid" REJECTED "verifier ruled it does not hold (R$(fn_rid "$r"))" ;;
        insufficient_evidence) fn_ce_set_status "$vid" DISPUTED "insufficient evidence (R$(fn_rid "$r"))" ;;
        *) : ;;
      esac
    done < "$FE_TMP/verdict.raw"
  fi
  return 0
}

fn_commit_integrate(){
  local r="$1" d k best
  d=$(fn_round_dir "$r")
  [ -s "$d/integrate.sec1.md" ] || return 1
  fn_atomic "$d/integrate.md" "$d/integrate.sec1.md"
  if [ -s "$d/integrate.sec2.md" ]; then
    mkdir -p "$FE_RUN/candidates"
    best=$(fn_candidate_ids "$r" | awk '{print $1}')
    : "${best:=A}"
    # every destination gets its own COPY: fn_atomic moves, so a second target
    # reading the same source silently gets nothing and the saved candidate stays
    # on the previous round's bytes
    cp "$d/integrate.sec2.md" "$d/best-candidate.md"
    cp "$d/integrate.sec2.md" "$FE_RUN/candidates/cand-$best.$(fn_rid "$r").md"
    cp "$d/integrate.sec2.md" "$FE_RUN/candidates/best.md"
    fn_state_set "BEST_CANDIDATE=$best"
  fi
  # the saved candidate anchors every later digest check, so presence is not
  # enough: it must BE this round's bytes
  if [ ! -s "$FE_RUN/candidates/best.md" ]; then
    fn_note "integrate rejected: candidates/best.md is absent or empty"
    return 1
  fi
  if [ -s "$d/best-candidate.md" ] && ! cmp -s "$d/best-candidate.md" "$FE_RUN/candidates/best.md"; then
    fn_note "integrate rejected: candidates/best.md does not match this round's best candidate (stale anchor)"
    return 1
  fi
  FE_CE_MAP="$d/ce-id-map.tsv"
  [ -s "$FE_TMP/ce.accepted" ] && fn_ce_merge "$FE_TMP/ce.accepted" "$(fn_rid "$r")"
  [ -s "$FE_TMP/sc.raw" ] && fn_sc_merge "$FE_TMP/sc.raw" "$(fn_rid "$r")"
  if [ -s "$FE_TMP/mech.raw" ]; then
    while IFS= read -r raw; do
      line=$(fn_norm "$raw")
      case "$line" in *"|"*) : ;; *) continue ;; esac
      printf '%s\n' "$line" | fn_write "$FE_TMP/mech.one"
      fn_mech_merge "$FE_TMP/mech.one" "$r"
    done < "$FE_TMP/mech.raw"
  fi
  # replay bookkeeping: a CLOSED major with a passing replay gets stamped
  if [ -s "$FE_TMP/replay.raw" ]; then
    while IFS='|' read -r vid vst _rest; do
      vid=$(fn_norm "$vid")
      case "$vid" in FE-CE-[0-9][0-9][0-9]) : ;; *) continue ;; esac
      vid=$(fn_ce_resolve "$vid")
      [ "$vst" = pass ] && fn_ce_set_replayed "$vid" "$(fn_rid "$r")"
    done < "$FE_TMP/replay.raw"
  fi
  fn_round_counters "$r"
  return 0
}

fn_mech_merge(){ # <one-row-file> <round>
  local f="$1" r="$2" work name disp failsc ref line nxt
  work="$FE_TMP/mech.work.$$"
  [ -f "$FE_MECH" ] && cp "$FE_MECH" "$work" || printf 'mechanism|disposition|failure_scenario|experiment_ref|round\n' > "$work"
  while IFS= read -r line; do
    IFS='|' read -r name disp failsc ref <<< "$line"
    [ -n "$name" ] || continue
    nxt="$FE_TMP/mech.row.$$"
    if grep -q "^$(printf '%s' "$name" | sed 's/[][\.*^$/]/\\&/g')|" "$work"; then
      awk -F'|' -v OFS='|' -v nm="$name" -v d="$disp" -v f="$failsc" -v e="$ref" -v r="$r" '
        NR==1 || $1!=nm {print; next}
        { $2=d; $3=f; $4=e; $5=r; print }' "$work" > "$nxt" && mv "$nxt" "$work"
    else
      printf '%s|%s|%s|%s|%s\n' "$(fn_scrub "$name")" "$(fn_scrub "$disp")" "$(fn_scrub "$failsc")" "$(fn_scrub "$ref")" "$r" >> "$work"
    fi
  done < "$f"
  fn_atomic "$FE_MECH" "$work"
  return 0
}

# ------------------------------------------------------------------ review ----
# The only rulings that count toward convergence are these, and they are bound
# to the digest of the artifact that was actually read. A later edit to the
# candidate invalidates every ruling made against the previous bytes.
fn_commit_review(){
  local r="$1" d dig line id st ev miss kind n=0 tmpw
  d=$(fn_round_dir "$r")
  [ -s "$d/review.sec1.md" ] || return 1
  fn_atomic "$d/review.md" "$d/review.sec1.md"
  dig=$(fn_best_digest)
  fn_rulings_ensure
  # idempotent per (round, digest): re-committing the same review must replace
  # its own rows, not stack a second copy of them
  if [ -f "$FE_RULINGS" ]; then
    tmpw="$FE_TMP/rulings.$$"
    awk -F'|' -v OFS='|' -v rid="$(fn_rid "$r")" -v d="$dig" '
      NR==1 || !($1==rid && $2==d) {print}' "$FE_RULINGS" > "$tmpw"
    fn_atomic "$FE_RULINGS" "$tmpw"
  fi
  for src in "$FE_TMP/verdict.sc" "$FE_TMP/verdict.ce" "$FE_TMP/replay.raw"; do
    [ -s "$src" ] || continue
    while IFS= read -r line; do
      line=$(fn_norm "$line"); [ -n "$line" ] || continue
      IFS='|' read -r id st ev miss <<< "$line"
      case "$id" in FE-CE-*) kind=ce ;; S[0-9][0-9]) kind=sc ;; *) continue ;; esac
      # a replay verdict may not be recorded for a counterexample that belongs to
      # a discarded alternative: passing it "against A's bytes" would read as
      # though A had repaired B's defect
      if [ "$kind" = ce ] && [ "$(fn_ce_subject "$id")" = "B-alternative" ]; then
        printf 'R%s|%s|ce|%s|not_applicable|belongs to a discarded alternative, not replayable against these bytes\n' \
          "$((10#${r#R}))" "$dig" "$id" >> "$FE_RULINGS"
        continue
      fi
      printf '%s|%s|%s|%s|%s|%s\n' "$(fn_rid "$r")" "$dig" "$kind" "$id" \
        "$(fn_scrub "$st")" "$(fn_scrub "${ev:-}")" >> "$FE_RUN/review-rulings.tsv"
      n=$((n+1))
    done < "$src"
  done
  [ "$n" -gt 0 ] || { fn_note "$d/review: no rulings extracted"; return 1; }
  fn_state_set "REVIEWED_DIGEST=$dig"
  printf '%s\n' "$dig" | fn_write "$d/review-rulings-digest.txt"
  fn_round_settle "$r"
  return 0
}

# per-round counters, derived from this round's verify + attack text
fn_round_counters(){
  local r="$1" d v a hm nm cm clean f
  d=$(fn_round_dir "$r")
  v="$d/verify.md"; a="$d/attack.md"
  hm=0; nm=0; cm=0
  if [ -s "$v" ]; then
    hm=$(awk -F'|' 'BEGIN{n=0} { if ($0 ~ /holds/ && $0 !~ /does_not_hold/ && $0 !~ /insufficient/) { line=$0; sub(/^[^F]*FE-CE-/,"FE-CE-",line); split(line,p,"|"); if (p[2] ~ /^holds/) n++ } } END{print n+0}' "$v")
  fi
  if [ -s "$FE_RUN/counterexamples.tsv" ]; then
    nm=$(awk -F'|' -v rr="$(fn_rid "$r")" 'NR>1 && $2==rr && $3=="major" && ($4=="OPEN"||$4=="DISPUTED"){n++} END{print n+0}' "$FE_RUN/counterexamples.tsv")
    cm=$(awk -F'|' -v rr="$(fn_rid "$r")" 'NR>1 && $9==rr && $3=="major" && $4=="CLOSED"{n++} END{print n+0}' "$FE_RUN/counterexamples.tsv")
  fi
  clean=1
  [ "${hm:-0}" -gt 0 ] && clean=0
  [ "${cm:-0}" -gt 0 ] && clean=0
  fn_round_record "$r" "${hm:-0}" "${nm:-0}" "${cm:-0}" "$clean" \
    "dim=$(fn_round_dimension "$r") attack=$( [ -s "$a" ] && fn_wordcount "$a" || echo 0 )w verify=$( [ -s "$v" ] && fn_wordcount "$v" || echo 0 )w"
}

# ---- status ------------------------------------------------------------------
fn_status_summary(){
  printf 'state=%s round=%s phase=%s best=%s\n' \
    "$(fn_state_get STATE)" "$(fn_state_get CURRENT_ROUND)" "$(fn_state_get CURRENT_PHASE)" \
    "$(fn_best_candidate)"
  printf 'sol=%s\n' "$(fn_sol_status_line)"
  printf 'counterexamples: open_major=%s open_any=%s closed_awaiting_independent_replay=%s deferred_to_discarded_alternative=%s\n' \
    "$(fn_ce_open_major)" "$(fn_ce_any_open)" "$(fn_ce_pending_replay)" "$(fn_ce_deferred_major)"
  printf 'scenarios: claimed=%s independently_ruled_covered=%s broken=%s required=%s\n' \
    "$(awk -F'|' 'NR>1 && ($2=="covered"||$2=="claimed"){n++} END{print n+0}' "$FE_SC" 2>/dev/null)" \
    "$(fn_sc_covered)" "$(fn_ruling_count sc trajectory_broken)" "$FE_SCENARIO_MIN_COVER"
  printf 'candidate under ruling: %s  clean streak: %s/%s  dimension last used: %s\n' \
    "$(fn_best_digest | cut -c1-12)" "$(fn_clean_streak)" "$FE_CLEAN_ROUNDS_REQUIRED" \
    "$(fn_state_get LAST_DIMENSION)"
  printf 'convergence: %s\n' "$(fn_convergence_check)"
}

# ---- the single audit that closes the loop on the budget ---------------------
# Every Sol reply artifact must have a budget row, and every row must have an
# artifact. Anything unmatched is a bypass or a lost call, and it is reported
# rather than smoothed over.
fn_sol_audit(){
  local bad=0 f base cid out
  [ -f "$FE_SOL_BUDGET_LOG" ] || { printf 'audit: no budget record at all\n'; return 1; }
  if ! fn_sol_validate >/dev/null 2>&1; then
    printf 'audit: budget record untrustworthy: %s\n' "$(fn_sol_validate)"; return 1
  fi
  for f in "$FE_RUN"/sol/*.reply.md; do
    [ -f "$f" ] || continue
    base=$(basename "$f" .reply.md)
    awk -F'|' -v c="$base" 'NR>1 && $8==c{f=1} END{exit !f}' "$FE_SOL_BUDGET_LOG" \
      || { printf 'audit: Sol reply %s has NO budget row (possible bypass)\n' "$base"; bad=$((bad+1)); }
  done
  while IFS='|' read -r _seq _at kind _reason _key out _done cid; do
    [ -f "$FE_RUN/sol/$cid.reply.md" ] || { printf 'audit: row %s (%s) has no reply artifact — outcome %s\n' "$cid" "$kind" "$out"; }
  done < <(awk 'NR>1' "$FE_SOL_BUDGET_LOG")
  pend=$(fn_sol_open_pending)
  [ -n "$pend" ] && { printf 'audit: PENDING rows never completed:\n%s\n' "$pend"; bad=$((bad+1)); }
  [ "$bad" -eq 0 ] && printf 'audit: budget record, reply artifacts and pending rows all reconcile\n'
  return "$bad"
}

fn_bootstrap_quiet(){
  mkdir -p "$FE_RUN" "$FE_LOGS" "$FE_TMP" "$FE_RUN/rounds" "$FE_RUN/candidates" "$FE_RUN/sol" 2>/dev/null
  fn_ledger_ensure 2>/dev/null; fn_conv_ensure 2>/dev/null; fn_rulings_ensure 2>/dev/null
  return 0
}

# fn_accept <role> <RNNN> <output-file> — the gate, then the commit, then the meta
fn_accept(){
  local role="$1" rid="$2" content="$3"
  local d ph cf n rc
  case "$role" in
    planner) ph=plan ;; designer) ph=design ;; attacker) ph=attack ;;
    verifier) ph=verify ;; integrator) ph=integrate ;;
    candidate-reviewer) ph=review ;;
    *) printf 'unknown role: %s\n' "$role" >&2; return 2 ;;
  esac
  cf="$FE_ROLES/$role.md"; d="$FE_RUN/rounds/$rid"
  mkdir -p "$d"
  [ -r "$content" ] || { printf 'no output file: %s\n' "$content" >&2; return 2; }
  cp "$content" "$d/$ph.content.txt"

  if ! fn_validate_phase "$ph" "$cf" "$d/$ph.content.txt"; then
    printf 'phase=%s\nrole=%s\noutcome=bad\nreason=contract_violation\nat=%s\n' \
      "$ph" "$role" "$(date -u +%FT%TZ)" | fn_write "$d/$ph.meta"
    printf 'REFUSED: %s output does not satisfy its contract; nothing was committed\n' "$role" >&2
    sed -n "s/^  invalid: /  - /p" "$FE_TMP/validate.err" >&2
    return 1
  fi

  n=$(fn_section_count "$d/$ph.content.txt")
  local i=1
  while [ "$i" -le "$n" ]; do
    fn_section "$d/$ph.content.txt" "$i" "$FE_TMP/sec.$i" && fn_atomic "$d/$ph.sec$i.md" "$FE_TMP/sec.$i"
    i=$((i+1))
  done
  local rnum=$((10#${rid#R}))
  if ! fn_commit_phase "$ph" "$rnum" "$n" 2>"$FE_TMP/commit.err"; then
    printf 'REFUSED at commit: %s\n' "$ph" >&2; cat "$FE_TMP/commit.err" >&2
    printf 'phase=%s\nrole=%s\noutcome=bad\nreason=commit_rejected\nat=%s\n' \
      "$ph" "$role" "$(date -u +%FT%TZ)" | fn_write "$d/$ph.meta"
    return 3
  fi
  fn_cp_snapshot "$rnum" "$ph"
  printf 'phase=%s\nrole=%s\noutcome=ok\nsections=%s\nwords=%s\ndigest=%s\nat=%s\n' \
    "$ph" "$role" "$n" "$(fn_wordcount "$d/$ph.content.txt")" "$(fn_sha "$d/$ph.content.txt")" \
    "$(date -u +%FT%TZ)" | fn_write "$d/$ph.meta"
  printf 'ACCEPTED %s (%s sections, %s words) -> %s\n' "$role" "$n" \
    "$(fn_wordcount "$d/$ph.content.txt")" "$d/$ph.md"
  return 0
}

# ---- the one-page summary, refreshed from the record -------------------------
# Written by the controller rather than by hand, so a summary can never drift
# from the ledgers it claims to describe.
fn_summary_write(){
  local r="${1:-}" rid dig
  case "$r" in ''|*[!0-9]*) r=$(fn_latest_round) ;; esac
  rid=$(fn_rid "$r")
  dig=$(fn_best_digest) || dig=no-candidate
  {
    printf '# FE-DESIGN-001 — latest summary\n\n'
    printf '刷新：%s　轮次：%s　候选摘要：`%s`\n\n' "$(date -u +%FT%TZ)" "$rid" "$(printf %s "$dig" | cut -c1-12)"
    printf '## 一句话状态\n\n%s\n\n' "$(fn_convergence_check)"
    printf '## 当前最佳候选\n\n'
    printf 'id=%s　文件=`candidates/best.md`　sha256=`%s`\n\n' "$(fn_best_candidate)" "$(printf %s "$dig" | cut -c1-16)"
    printf '## 反例账（未决项全文见 counterexamples.tsv）\n\n'
    printf 'open_major=%s  open_any=%s  closed 待独立回放=%s  归属已淘汰方案 B 的未决 major=%s（仍挂在 B 账上，不是已修）\n\n' \
      "$(fn_ce_open_major)" "$(fn_ce_any_open)" "$(fn_ce_pending_replay)" "$(fn_ce_deferred_major)"
    printf '```\n'; fn_regression_list 2>/dev/null | cut -c1-160; printf '```\n\n'
    printf '## 场景 S01–S12\n\n'
    printf '集成者声称覆盖=%s　独立核验通过=%s　核验判破=%s　要求=%s\n\n' \
      "$(awk -F'|' 'NR>1 && ($2=="covered"||$2=="claimed"){n++} END{print n+0}' "$FE_SC" 2>/dev/null)" \
      "$(fn_sc_covered)" "$(fn_sc_broken)" "$FE_SCENARIO_MIN_COVER"
    printf '独立核验判定分布（绑定当前摘要）：\n\n```\n'
    awk -F'|' -v d="$dig" 'NR>1 && $2==d{k=$3"|"$5; c[k]++} END{x for (i in c) print i, c[x=i]}' "$FE_RULINGS" 2>/dev/null | sort
    printf '```\n\n'
    printf '## 机制归属与删减实验\n\n```\n'; cut -d'|' -f1,2,3,4 "$FE_MECH" 2>/dev/null; printf '```\n\n'
    printf '## Sol 审阅\n\n'
    printf '`%s`\n\n' "$(fn_sol_status_line)"
    printf '本阶段未把同模型新上下文核验冒充 Sol 核验：上面 `sc_*` 判定来自\n'
    printf 'Qoder 角色的独立上下文，**不是** gpt-5.6-sol 的核验结论。\n\n'
    printf '## 每轮\n\n```\n'; cat "$FE_ROUNDS" 2>/dev/null; printf '```\n\n'
    printf '## 边界\n\n'
    printf '产品代码只读；未启停服务；未读凭据；无提交/合并/推送；无旧调度队列；\n'
    printf '未派发实现任务。收敛仅指设计候选，不指用户批准或实施。\n'
  } | fn_write "$FE_RUN/latest-summary.md"
}
