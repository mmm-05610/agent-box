#!/usr/bin/env bash
# FE-DESIGN-001 controller self-test.
#
# Every case below uses fake model responses. No real worker call and no Sol
# call is ever made by this script — it exists so that stop, resume, attempt
# accounting, budget arithmetic, invalid-output refusal and convergence
# judgement are proven before a single real call is spent.
set -uo pipefail

TDIR=$(cd "$(dirname "$(readlink -f "$0")")" && pwd)
DL=$(cd "$TDIR/.." && pwd)
LOOP="$DL/loop.sh"
LIBS="$DL/lib"
FAKE="$TDIR/fake_worker.py"
SOLFAKE="$TDIR/fake_sol.sh"
FIX="$TDIR/fixtures"
PY=$(command -v python3)

. "$DL/env.conf"
ROOT="$FE_RUN/_selftest"
export FAKE_FIXTURES="$FIX"

pass=0; fail=0
ok(){ printf '  PASS  %s\n' "$1"; pass=$((pass+1)); }
no(){ printf '  FAIL  %s\n        %s\n' "$1" "${2:-}"; fail=$((fail+1)); }
expect(){ if [ "$2" = "$3" ]; then ok "$1"; else no "$1" "want [$3] got [$2]"; fi; }
expect_has(){ if printf '%s' "$2" | grep -qF -- "$3"; then ok "$1"; else no "$1" "missing [$3]"; fi; }
say(){ printf '\n=== %s\n' "$1"; }
fresh(){ RUN="$ROOT/$1"; rm -rf "$RUN"; mkdir -p "$RUN"; }

# run <loop args> against the current case dir, with fakes on both ends
run(){ FE_RUN="$RUN" QODERCLI="$FAKE" CODEX="$SOLFAKE" \
  FE_WORKER_TIMEOUT="${TMO:-40}" FE_SOL_TIMEOUT=40 FE_ROUND_CAP="${CAP:-4}" \
    "$LOOP" "$@"; }

# evaluate shell in a fresh process with the controller's library loaded
with_libs(){
  FE_RUN="$RUN" bash -c "
    . '$DL/env.conf'
    FE_RUN='$RUN'
    for l in common model validate ledger sol converge experiment material phases solrun; do
      . '$LIBS/'\$l.sh
    done
    $1
  "
}
fake_workers_alive(){ local n; n=$(pgrep -cf 'fake_worker[.]py' 2>/dev/null || true); printf '%s' "${n:-0}"; }

chmod +x "$LOOP" "$FAKE" "$SOLFAKE" 2>/dev/null
mkdir -p "$FIX" && "$PY" "$FAKE" gen "$FIX" >/dev/null

# ------------------------------------------------------------- S1 happy path
say "S1 one clean round: design -> attack -> verify -> integrate"
fresh s1
out=$(run step 1 2>&1); rc=$?
expect "S1 round exits 0" "$rc" "0" "$(printf '%s' "$out" | tail -3)"
for f in plan.md dimension.txt cand-A.md cand-B.md attack.md verify.md integrate.md best-candidate.md; do
  if [ -s "$RUN/rounds/R001/$f" ]; then ok "S1 artifact $f"; else no "S1 artifact $f missing" ""; fi
done
for p in plan design attack verify integrate; do
  expect "S1 $p.meta outcome=ok" "$(sed -n 's/^outcome=//p' "$RUN/rounds/R001/$p.meta" 2>/dev/null)" "ok"
done
expect "S1 candidate files follow the plan" "$(ls "$RUN/rounds/R001" | grep -c '^cand-')" "2"
expect "S1 attack dimension recorded" "$(cat "$RUN/rounds/R001/dimension.txt")" "DIMENSION: D01-order-dedup"
expect "S1 counterexample 001 closed by integrate" \
  "$(awk -F'|' '$1=="FE-CE-001"{print $4}' "$RUN/counterexamples.tsv")" "CLOSED"
expect "S1 closed 001 stamped as replayed" \
  "$(awk -F'|' '$1=="FE-CE-001"{print $9}' "$RUN/counterexamples.tsv")" "R001"
expect "S1 rejected 002 kept, not deleted" \
  "$(awk -F'|' '$1=="FE-CE-002"{print $4}' "$RUN/counterexamples.tsv")" "REJECTED"
expect "S1 scenarios covered" "$(grep -c '|covered|' "$RUN/scenarios.tsv")" "12"
expect "S1 mechanisms recorded" "$(awk 'NR>1' "$RUN/mechanisms.tsv" | wc -l | tr -d ' ')" "3"
expect_has "S1 summary page written" "$(cat "$RUN/latest-summary.md")" "Current best candidate"
expect_has "S1 the model actually used is recorded" "$(grep -h '^model=' "$RUN"/rounds/R001/*.meta | head -1)" "$FE_WORKER_MODEL"
expect "S1 first complete candidate consumed exactly one Sol slot" \
  "$(sed -n 's/^SOL_RESERVED=//p' "$RUN/sol-budget.env")" "1"
expect "S1 that slot recorded as ok" "$(sed -n 's/^SOL_OK=//p' "$RUN/sol-budget.env")" "1"
expect_has "S1 Sol verdict bound to the reviewed artifact" "$(cat "$RUN/sol-verdicts.tsv")" "FirstCompleteCandidate"

# ------------------------------------------- S2 invalid output must not pass
say "S2 output that violates its contract is a failure, not a pass"
fresh s2
export FAKE_POLICY='attacker=garbage' FE_PHASE_ATTEMPTS=2
out=$(run step 1 2>&1); rc=$?
expect "S2 round aborts on garbage attack output" "$rc" "3" "$(printf '%s' "$out" | tail -3)"
expect "S2 attack recorded bad" "$(sed -n 's/^reason=//p' "$RUN/rounds/R001/attack.meta")" "contract_violation"
if [ ! -f "$RUN/rounds/R001/attack.md" ]; then ok "S2 nothing committed from invalid output"; else no "S2 attack.md committed anyway" ""; fi
expect "S2 both attempts consumed" "$(sed -n 's/.*ATT_R001_attack=//p' "$RUN/state.env")" "2"
expect "S2 earlier phases still passed" \
  "$(grep -l 'outcome=ok' "$RUN"/rounds/R001/plan.meta "$RUN"/rounds/R001/design.meta 2>/dev/null | wc -l | tr -d ' ')" "2"
unset FAKE_POLICY
before=$(cat "$RUN/rounds/R001/plan.meta" "$RUN/rounds/R001/design.meta")
out=$(run step 1 2>&1); rc=$?
expect "S2 resumed round completes" "$rc" "0" "$(printf '%s' "$out" | tail -3)"
expect "S2 completed phases skipped, not redone" \
  "$(cat "$RUN/rounds/R001/plan.meta" "$RUN/rounds/R001/design.meta")" "$before"
expect "S2 attempt budget not reset by resume" \
  "$(sed -n 's/.*ATT_R001_attack=//p' "$RUN/state.env")" "3"
expect "S2 attack now passed" "$(sed -n 's/^outcome=//p' "$RUN/rounds/R001/attack.meta")" "ok"

# ------------------------------------------------ S3 failed call is a failure
say "S3 a failed, empty or malformed call never counts as passed"
fresh s3
export FAKE_POLICY='attacker=fail' FE_PHASE_ATTEMPTS=2
out=$(run step 1 2>&1); rc=$?
expect "S3 round aborts on call error" "$rc" "1" "$(printf '%s' "$out" | tail -3)"
expect "S3 reason recorded" "$(sed -n 's/^reason=//p' "$RUN/rounds/R001/attack.meta")" "call_error"
expect_has "S3 infrastructure counter advanced" "$(cat "$RUN/state.env")" "CONSEC_PHASE_FAIL=2"
trunc=$(with_libs '
  f="$FE_RUN/trunc.txt"
  { printf "<<<FE-OUT-START>>>\nonly half of a report, then the process died\n"
    for i in $(seq 1 250); do echo "padding padding padding"; done
    printf "\n<<<FE-LEDGER-START>>>\nFE-CE-001|R001|major|OPEN|some invariant|x|y|-\n<<<FE-LEDGER-END>>>\n"; } > "$f"
  fn_validate_phase attack "$FE_ROLES/attacker.md" "$f" >/dev/null 2>&1; echo $?')
expect "S3 output with no closing marker is refused" "$trunc" "1"
badsev=$(with_libs '
  f="$FE_RUN/badsev.txt"
  { printf "<<<FE-OUT-START>>>\n"
    for i in $(seq 1 250); do echo "word here"; done
    printf "<<<FE-OUT-END>>>\n<<<FE-LEDGER-START>>>\n"
    printf "FE-CE-001|R001|catastrophic|OPEN|some invariant|x|y|-\n<<<FE-LEDGER-END>>>\n"; } > "$f"
  fn_validate_phase attack "$FE_ROLES/attacker.md" "$f" >/dev/null 2>&1; echo $?')
expect "S3 a ledger row with an illegal severity is refused" "$badsev" "1"
badevi=$(with_libs '
  f="$FE_RUN/badevi.txt"
  { printf "<<<FE-OUT-START>>>\n"
    for i in $(seq 1 250); do echo "word here"; done
    printf "<<<FE-OUT-END>>>\n<<<FE-LEDGER-START>>>\n"
    printf "FE-CE-001|R001|major|OPEN| |title|evidence|-\n<<<FE-LEDGER-END>>>\n"; } > "$f"
  fn_validate_phase attack "$FE_ROLES/attacker.md" "$f" >/dev/null 2>&1; echo $?')
expect "S3 a row with an empty invariant is refused" "$badevi" "1"
unset FAKE_POLICY

# ------------------------------------------------------ S4 Sol budget rules
say "S4 Sol budget: reserved before the call, failures count, key nodes capped"
fresh s4
s4=$(with_libs '
  fn_sol_ensure
  i=1; while [ $i -le 8 ]; do fn_sol_reserve key "t" "k-$i" || true; i=$((i+1)); done
  fn_sol_reserve key "overflow" "k-9" || dkey=1
  fn_sol_reserve final "f1" "f-1" && :
  fn_sol_reserve final "f2" "f-2" && :
  fn_sol_reserve final "f3" "f-3" || dfin=1
  fn_sol_reserve key "same again" "k-1" || dup=$?
  echo "reserved=$(fn_sol_get SOL_RESERVED) remaining=$(fn_sol_remaining) dkey=${dkey:-0} dfin=${dfin:-0} dup=${dup:-0}"')
expect_has "S4 the 9th key-node call is denied" "$s4" "dkey=1"
expect_has "S4 only the two reserved final slots remain" "$s4" "dfin=1"
expect_has "S4 same candidate+question refused as duplicate" "$s4" "dup=2"
expect_has "S4 accounting reports nothing left" "$s4" "remaining=0"
expect "S4 budget survives a fresh process (no reset on restart)" \
  "$(with_libs 'fn_sol_get SOL_RESERVED')" "10"

# ---------------------------------------------- S5 convergence and rotation
say "S5 convergence arithmetic, the independent-verification gate, stall rotation"
fresh s5
export FAKE_POLICY='attacker=converged,verifier=converged,integrator=converged'
i=1; while [ $i -le 3 ]; do run step "$i" >/dev/null 2>&1; i=$((i+1)); done
expect "S5 three rounds recorded" "$(awk 'NR>1' "$RUN/rounds.tsv" | wc -l | tr -d ' ')" "3"
expect "S5 clean streak is three" "$(with_libs 'fn_clean_streak')" "3"
expect_has "S5 criteria met but no independent pass yet -> review is due" \
  "$(with_libs 'fn_convergence_check')" "FINAL_REVIEW_DUE"
conv2=$(with_libs '
  mkdir -p "$(dirname "$FE_SOL_VERDICTS")"
  printf "key|slot|kind|trigger|candidate|decision|at\nx|%s|final|ConvergenceDeclaration|A|pass|-|x\n" "$(fn_best_key)" > "$FE_SOL_VERDICTS"
  fn_convergence_check')
expect_has "S5 an independent pass turns it into CONVERGED" "$conv2" "CONVERGED:"
fresh s5c
export FAKE_POLICY='attacker=converged,verifier=converged,integrator=converged'
i=1; while [ $i -le 3 ]; do run step "$i" >/dev/null 2>&1; i=$((i+1)); done
cu=$(with_libs 'sed -i "s/^SOL_RESERVED=.*/SOL_RESERVED=10/" "$FE_RUN/sol-budget.env"; fn_convergence_check')
expect_has "S5c an exhausted budget cannot claim verified convergence" "$cu" "CONVERGED_UNVERIFIED"
fresh s5b
export FAKE_POLICY='attacker=converged,verifier=converged,integrator=converged'
i=1; while [ $i -le 3 ]; do run step "$i" >/dev/null 2>&1 || true; i=$((i+1)); done
run step 4 >/dev/null 2>&1; rc=$?
expect "S5b a stalled round exits for rotation instead of polishing" "$rc" "91"
unset FAKE_POLICY

# ------------------------------------------------------ S6 stop and resume
say "S6 stop kills only this task's children; resume continues mid-round"
fresh s6
sleep 300 & decoy=$!
export FAKE_POLICY='attacker=slow25,verifier=ok,integrator=ok' FE_PHASE_ATTEMPTS=1 TMO=90
run start >/dev/null 2>&1
sleep 5
expect "S6 status sees the running controller" "$(run status | head -1 | grep -c RUNNING)" "1"
expect "S6 the worker child was tracked" \
  "$(awk 'NF' "$RUN/logs/children.pids" 2>/dev/null | wc -l | tr -d ' ')" "1"
run stop >/dev/null 2>&1
sleep 1
expect "S6 the loop is no longer running" "$(with_libs 'fn_lock_alive >/dev/null && echo up || echo down')" "down"
expect "S6 no fake worker survived the stop" "$(fake_workers_alive)" "0"
if kill -0 "$decoy" 2>/dev/null; then ok "S6 an unrelated process was left alone"; else no "S6 stop killed something it does not own" ""; fi
kill "$decoy" 2>/dev/null
unset FAKE_POLICY TMO
export FE_PHASE_ATTEMPTS=2
plan_sha=$(sha256sum "$RUN/rounds/R001/plan.md" 2>/dev/null | cut -c1-16)
if [ -n "$plan_sha" ]; then ok "S6 the pre-stop phase had committed"; else no "S6 plan never committed" ""; fi
out=$(run resume 2>&1); rc=$?
expect "S6 resume finishes the interrupted round" "$rc" "0" "$(printf '%s' "$out" | tail -4)"
expect "S6 the committed plan was not regenerated" \
  "$(sha256sum "$RUN/rounds/R001/plan.md" | cut -c1-16)" "$plan_sha"
expect "S6 the interrupted phase completed after resume" \
  "$(sed -n 's/^outcome=//p' "$RUN/rounds/R001/attack.meta" | tail -1)" "ok"
expect "S6 the Sol budget was unchanged across stop and resume" \
  "$(sed -n 's/^SOL_RESERVED=//p' "$RUN/sol-budget.env")" "1"

# --------------------------------------- S7 id remap and cross-reference fix
say "S7 proposed counterexample ids are canonical, refs follow"
fresh s7
export FAKE_POLICY='planner=ok,designer=ok,attacker=remap,verifier=clean,integrator=remap'
run step 1 >/dev/null 2>&1; run step 2 >/dev/null 2>&1
expect "S7 a proposed id is allocated canonically, never trusted" \
  "$(grep -c '^FE-CE-900|' "$RUN/counterexamples.tsv")" "0"
expect "S7 the attack phase's map shows the renumbering" \
  "$(cat "$RUN/rounds/R001/ce-id-map.tsv" 2>/dev/null | head -1)" "FE-CE-900|FE-CE-001"
expect "S7 the integrator's close hit the canonical row, not a new one" \
  "$(awk -F'|' '$1=="FE-CE-001"{print $4"|"$9}' "$RUN/counterexamples.tsv")" "CLOSED|R001"
expect "S7 exactly one row for that finding" \
  "$(awk 'NR>1' "$RUN/counterexamples.tsv" | wc -l | tr -d ' ')" "1"
unset FAKE_POLICY

# ------------------------------------------- S8 full ledger handoff, no loss
say "S8 unresolved counterexamples are re-handed in full"
fresh s8
export FAKE_POLICY='planner=ok,designer=ok,attacker=ok,verifier=clean,integrator=ok'
run step 1 >/dev/null 2>&1
row=$(awk -F'|' '$1=="FE-CE-001"' "$RUN/counterexamples.tsv")
export FAKE_POLICY='planner=ok,designer=ok,attacker=clean,verifier=clean,integrator=ok'
run step 2 >/dev/null 2>&1
p2=$(cat "$RUN/rounds/R002/attack.prompt.txt" 2>/dev/null)
expect_has "S8 R001 open row appears verbatim in R002 prompt" "$p2" "$row"
expect_has "S8 the block is marked authoritative" "$p2" "counterexample ledger (authoritative; full)"
expect "S8 no truncation notice inside the ledger section" \
  "$(printf '%s' "$p2" | sed -n '/counterexample ledger/,/scenario coverage/p' | grep -c 'truncated for this role')" "0"
expect_has "S8 scenario ledger handed over too" "$p2" "scenario coverage ledger"
unset FAKE_POLICY

# -------------------------------------------------- S9 model experiments
say "S9 verifier experiments run confined and are recorded with their limits"
fresh s9
cat > "$FIX/verifier_experiment.txt" <<'EOF'
<<<FE-OUT-START>>>
the dispute is whether an owner-qualified ordinal stops a replay from
re-applying a turn. The candidate text does not settle it, so the only honest
move is a model of exactly the mechanism in question.
EXPERIMENT:
```python
events = [("a", 1), ("b", 2), ("a", 1), ("c", 0)]
seen, applied = set(), []
for owner, seq in events:
    k = (owner, seq)
    if k in seen:
        continue
    seen.add(k); applied.append(k)
print("applied", applied)
print("MODEL SAYS: duplicates dropped, arrival order kept")
```
The point of the model is narrow: it shows only that an owner qualified key
drops the replayed pair while keeping the rest in arrival order. It says nothing
about the real transport, the real service or the real renderer, and it must not
be written up as verification of any of them. What remains open after it is the
question of who assigns the owner part when two producers share one ordinal
space, which the candidate does not answer and which is recorded separately.
EOF
export FAKE_POLICY='attacker=remap,verifier=experiment'
run step 1 >/dev/null 2>&1
rec="$RUN/experiments/R001/record.md"
if [ -s "$rec" ]; then ok "S9 experiment record written inside the run directory"; else no "S9 no experiment record" "$(ls "$RUN/experiments" 2>&1)"; fi
expect_has "S9 transcript captured" "$(cat "$rec" 2>/dev/null)" "MODEL SAYS: duplicates dropped"
expect_has "S9 limits stated, not oversold" "$(cat "$rec" 2>/dev/null)" "not, and may not be cited as, verification of the real product"
expect "S9 the product tree is still untouched" "$(with_libs 'ls "$FE_ROOT/repos/desktop" >/dev/null 2>&1; echo $?')" "0"
unset FAKE_POLICY

# ------------------------------------------------- S10 authority boundaries
say "S10 the controller refuses writes outside its run directory"
fresh s10
g=$(with_libs '
  (fn_reserve_path "$FE_ROOT/repos/desktop/pwn.sh") >/dev/null 2>&1; echo "refused=$?"
  (fn_reserve_path "$RUN/ok.txt") >/dev/null 2>&1; echo "allowed=$?"')
expect_has "S10 a product-tree path is refused" "$g" "refused=1"
expect_has "S10 a run-directory path is allowed" "$g" "allowed=0"
if [ ! -e "$FE_ROOT/repos/desktop/pwn.sh" ]; then ok "S10 nothing was created in the product tree"; else no "S10 something appeared in the product tree" ""; fi

# ------------------------------------------------- S11 no secret in prompts
say "S11 no credential-shaped text appears in any prompt or artifact"
fresh s11
export FAKE_POLICY='attacker=converged,verifier=converged,integrator=converged'
run step 1 >/dev/null 2>&1
unset FAKE_POLICY
leak=$(grep -rlIE '(api[_-]?key|secret[_-]?key|password|BEGIN [A-Z ]*PRIVATE KEY)' "$RUN/rounds" 2>/dev/null | wc -l | tr -d ' ')
expect "S11 zero prompt or artifact files match" "$leak" "0"

printf '\n=== selftest: %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
exit 0
