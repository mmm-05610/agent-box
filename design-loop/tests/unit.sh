#!/usr/bin/env bash
# FE-DESIGN-001 — targeted tests for the three components the native loop keeps:
# the Sol budget entry, the output gate, and the counterexample/candidate handoff.
#
# No model call of any kind happens here: not a worker call, not a Sol call.
# These bodies source only the active libraries (common validate ledger sol
# material converge handoff) — the retired process supervisor (lib/model.sh,
# lib/phases.sh, loop.sh start/stop/resume) is deliberately not reachable, which
# is itself part of what this file proves.
set -uo pipefail

TDIR=$(cd "$(dirname "$(readlink -f "$0")")" && pwd)
DL=$(cd "$TDIR/.." && pwd)
. "$DL/env.conf"
ROOT="$FE_RUN/_units"

pass=0; fail=0
ok(){ printf '  PASS  %s\n' "$1"; pass=$((pass+1)); }
no(){ printf '  FAIL  %s\n        %s\n' "$1" "${2:-}"; fail=$((fail+1)); }
expect(){ [ "$2" = "$3" ] && ok "$1" || no "$1" "want [$3] got [$2]"; }
expect_has(){ printf '%s' "$2" | grep -qF -- "$3" && ok "$1" || no "$1" "missing [$3]"; }
say(){ printf '\n--- %s\n' "$1"; }

# case(<name>) starts a clean case dir; body(<heredoc>) runs against it
CASE=""
case_start(){ CASE="$ROOT/$1"; rm -rf "$CASE"; mkdir -p "$CASE/.tmp" "$CASE/logs" "$CASE/candidates" "$CASE/sol" "$CASE/rounds"; }
body(){ # body <<'EOS' ... EOS   -> stdout of the snippet, libs preloaded
  cat > "$CASE/.body.sh"
  { printf '%s\n' "set -u
. '$DL/env.conf'
FE_RUN='$CASE'
for l in common validate ledger sol material converge handoff; do . '$DL/lib/'\$l.sh; done
mkdir -p \"\$FE_TMP\" \"\$FE_LOGS\" \"$CASE/sol\" \"$CASE/candidates\""
    cat "$CASE/.body.sh"
  } > "$CASE/.run.sh"
  FE_RUN="$CASE" bash "$CASE/.run.sh" 2>&1
}
field(){ sed -n "s/^$1=//p"; }
PAD=$(python3 -c 'print("word here now "*300, end="")')
mkout(){ # mkout <file> <prose> <blocks...>
  local f="$1" prose="$2"; shift 2
  { printf '<<<FE-OUT-START>>>\n%s\n%s\n<<<FE-OUT-END>>>\n' "$PAD" "$prose"; printf '%s\n' "$@"; } > "$f"
}

# ================================================================ A: budget ===
say "A  sol.sh — one transaction, exact call ids, damaged record denies"

case_start a1
expect "A1 the record is created at the configured ceiling" \
  "$(body <<'EOS' | tr -d ' '
fn_sol_init >/dev/null
fn_sol_init >/dev/null
echo "v=$(fn_sol_raw SOL_RESERVED)/$(fn_sol_raw SOL_CAP)/$(fn_sol_raw SOL_FINAL_RESERVE)"
EOS
)" "v=0/10/2"
case_start a1b
expect "A1b a second init never resets a spent record" \
  "$(body <<'EOS'
fn_sol_init >/dev/null
fn_sol_reserve key "spent" "k1" >/dev/null
fn_sol_init >/dev/null 2>&1
echo "reserved=$(fn_sol_raw SOL_RESERVED)"
EOS
)" "reserved=1"
case_start a1c
expect "A1c deleting half the record never yields a fresh zero" \
  "$(body <<'EOS'
fn_sol_init >/dev/null
fn_sol_reserve key "spent" "k1" >/dev/null
rm -f "$FE_SOL_BUDGET_LOG"
fn_sol_init >/dev/null 2>&1; rc=$?
echo "init=$rc"
EOS
)" "init=1"

say "A2 reserve mints an exact call id and completion closes that row only"
case_start a2
v=$(body <<'EOS'
fn_sol_init >/dev/null
cid=$(fn_sol_reserve key "reason" "k1")
echo "cid_prefix=$(printf %s "$cid" | cut -c1-6)"
echo "pending=$(awk -F'|' 'NR>1 && $6=="PENDING"{n++} END{print n+0}' "$FE_SOL_BUDGET_LOG")"
echo "reserved=$(fn_sol_raw SOL_RESERVED)"
fn_sol_complete "$cid" ok
echo "closed=$(awk -F'|' 'NR>1 && $6=="ok"{n++} END{print n+0}' "$FE_SOL_BUDGET_LOG")"
echo "after=$(fn_sol_raw SOL_RESERVED) ok=$(fn_sol_raw SOL_OK)"
EOS
)
expect "A2 a call id is returned" "$(printf '%s' "$v" | sed -n 's/^cid_prefix=//p')" "SOL-01"
expect "A2 the row sits at PENDING until that id is completed" "$(printf '%s' "$v" | sed -n 's/^pending=//p')" "1"
expect "A2 the slot is taken before the call" "$(printf '%s' "$v" | sed -n 's/^reserved=//p')" "1"
expect "A2 completing it closes exactly that row" "$(printf '%s' "$v" | sed -n 's/^closed=//p')" "1"
expect "A2 the slot is not given back afterwards" "$(printf '%s' "$v" | sed -n 's/^after=//p')" "1 ok=1"

say "A3 completion matches on the exact call id, never on 'the newest row'"
case_start a3
v=$(body <<'EOS'
fn_sol_init >/dev/null
c1=$(fn_sol_reserve key "r" "k1"); c2=$(fn_sol_reserve key "r" "k2")
fn_sol_complete "SOL-99-nothing" ok >/dev/null 2>&1; echo "bogus=$?"
fn_sol_complete "$c2" ok >/dev/null 2>&1; echo "out_of_order=$?"
echo "c1_pending=$(awk -F'|' -v c="$c1" 'NR>1 && $8==c && $6=="PENDING"{n++} END{print n+0}' "$FE_SOL_BUDGET_LOG")"
echo "c2_ok=$(awk -F'|' -v c="$c2" 'NR>1 && $8==c && $6=="ok"{n++} END{print n+0}' "$FE_SOL_BUDGET_LOG")"
fn_sol_complete "$c2" bad >/dev/null 2>&1; echo "reclose=$?"
echo "bad=$(fn_sol_raw SOL_BAD)"
EOS
)
expect "A3 an unknown call id updates nothing" "$(printf '%s' "$v" | sed -n 's/^bogus=//p')" "1"
expect "A3 completing the second call first is allowed" "$(printf '%s' "$v" | sed -n 's/^out_of_order=//p')" "0"
expect "A3 it did NOT close the other pending row" "$(printf '%s' "$v" | sed -n 's/^c1_pending=//p')" "1"
expect "A3 it closed its own row" "$(printf '%s' "$v" | sed -n 's/^c2_ok=//p')" "1"
expect "A3 a closed row cannot be re-closed to flip its outcome" "$(printf '%s' "$v" | sed -n 's/^reclose=//p')" "1"
expect "A3 the recorded outcome stays ok" "$(printf '%s' "$v" | sed -n 's/^bad=//p')" "0"

say "A4 check and reserve are one mutually exclusive transaction"
case_start a4
v=$(body <<'EOS'
fn_sol_init >/dev/null
for i in $(seq 1 12); do
  ( if fn_sol_reserve key "race" "rk-$i" >/dev/null 2>&1; then echo key_won; else echo key_denied; fi ) >> "$FE_RUN/race.count" &
done
wait
for i in $(seq 1 4); do
  ( if fn_sol_reserve final "race final" "rf-$i" >/dev/null 2>&1; then echo final_won; else echo final_denied; fi ) >> "$FE_RUN/race.count" &
done
wait
echo "key_won=$(grep -c ^key_won "$FE_RUN/race.count")"
echo "key_denied=$(grep -c ^key_denied "$FE_RUN/race.count")"
echo "final_won=$(grep -c ^final_won "$FE_RUN/race.count")"
echo "reserved=$(fn_sol_raw SOL_RESERVED)"
echo "rows=$(awk -F'|' 'NR>1{n++} END{print n+0}' "$FE_SOL_BUDGET_LOG")"
fn_sol_validate >/dev/null 2>&1 && echo "consistent=yes" || echo "consistent=no"
EOS
)
expect "A4 12 concurrent key-node races stop at the 8 key slots" "$(printf '%s' "$v" | sed -n 's/^key_won=//p')" "8"
expect "A4 the four over-requesters were denied, none double-spent" "$(printf '%s' "$v" | sed -n 's/^key_denied=//p')" "4"
expect "A4 then only the two held-back final slots can be won" "$(printf '%s' "$v" | sed -n 's/^final_won=//p')" "2"
expect "A4 the final pair then fills the ceiling exactly" "$(printf '%s' "$v" | sed -n '/^reserved=/{s/^reserved=//p;q}')" "10"
expect "A4 counter equals log rows: no phantom call, no lost call" "$(printf '%s' "$v" | sed -n 's/^rows=//p')" "10"
expect_has "A4 the record is self-consistent after the race" "$v" "consistent=yes"

say "A5 ceilings, duplicate refusal, and failed calls still counting"
case_start a5
v=$(body <<'EOS'
fn_sol_init >/dev/null
i=1; while [ $i -le 8 ]; do fn_sol_reserve key "k" "kk-$i" >/dev/null 2>&1; i=$((i+1)); done
fn_sol_reserve key "past floor" "kk-x" >/dev/null 2>&1; echo "key_after_floor=$?"
fn_sol_reserve final "f1" "fin-1" >/dev/null 2>&1; echo "final1=$?"
fn_sol_reserve final "f2" "fin-2" >/dev/null 2>&1; echo "final2=$?"
fn_sol_reserve final "f3" "fin-3" >/dev/null 2>&1; echo "final3=$?"
fn_sol_reserve key "again" "kk-1" >/dev/null 2>&1; echo "dup=$?"
echo "reserved=$(fn_sol_raw SOL_RESERVED)"
EOS
)
expect "A5 key nodes stop at cap minus the held-back pair" "$(printf '%s' "$v" | sed -n 's/^key_after_floor=//p')" "1"
expect "A5 the two final-verification slots are still reachable" "$(printf '%s' "$v" | sed -n 's/^final1=//p')" "0"
expect "A5 nothing is granted past the total ceiling" "$(printf '%s' "$v" | sed -n 's/^final3=//p')" "1"
expect "A5 a repeated candidate+question is refused as a duplicate" "$(printf '%s' "$v" | sed -n 's/^dup=//p')" "2"
expect "A5 and the ceiling is reached, not overshot" "$(printf '%s' "$v" | sed -n 's/^reserved=//p')" "10"

case_start a5b
v=$(body <<'EOS'
fn_sol_init >/dev/null
c=$(fn_sol_reserve key "r" "same")
before=$(fn_sol_raw SOL_RESERVED)
fn_sol_reserve key "r" "same" >/dev/null 2>&1; echo "dup=$?"
echo "delta=$(( $(fn_sol_raw SOL_RESERVED) - before ))"
fn_sol_complete "$c" error >/dev/null 2>&1; echo "cerr=$?"
echo "after_error=$(fn_sol_raw SOL_RESERVED) bad=$(fn_sol_raw SOL_BAD)"
EOS
)
expect "A5b refusing a duplicate consumes nothing" "$(printf '%s' "$v" | sed -n 's/^delta=//p')" "0"
expect "A5b a failed call is still counted" "$(printf '%s' "$v" | sed -n '/^after_error=/{s/^after_error=//p;q}')" "1 bad=1"

say "A6 a missing or damaged record denies the call; it is never re-zeroed"
case_start a6
v=$(body <<'EOS'
fn_sol_init >/dev/null
fn_sol_reserve key "r" "k1" >/dev/null
rm -f "$FE_SOL_BUDGET_ENV"
fn_sol_reserve key "r" "ky" >/dev/null 2>&1; echo "missing=$?"
grep -q "budget-file-missing" "$FE_RUN/sol-denied" && echo reason_recorded
rm -f "$FE_RUN/sol-denied"; fn_sol_init >/dev/null 2>&1; echo "reinit_over_missing=$?"
echo "after_init=$(fn_sol_raw SOL_RESERVED)"
EOS
)
expect "A6 a vanished budget file is a denial, not a reset to zero" "$(printf '%s' "$v" | sed -n 's/^missing=//p')" "1"
expect_has "A6 the denial reason is recorded" "$v" "reason_recorded"
expect "A6 re-init refuses to run over the damaged state" "$(printf '%s' "$v" | sed -n 's/^reinit_over_missing=//p')" "1"

case_start a6b
v=$(body <<'EOS'
fn_sol_init >/dev/null; fn_sol_reserve key "r" "k1" >/dev/null
sed -i 's/^SOL_CAP=.*/SOL_CAP=ten/' "$FE_SOL_BUDGET_ENV"
fn_sol_reserve key "r" "k2" >/dev/null 2>&1; echo "nonnumeric=$?"
sed -i 's/^SOL_CAP=.*/SOL_CAP=10/' "$FE_SOL_BUDGET_ENV"
fn_sol_reserve key "r" "k2" >/dev/null 2>&1; echo "repaired=$?"
printf 'garbage-row\n' >> "$FE_SOL_BUDGET_LOG"
fn_sol_reserve key "r" "k3" >/dev/null 2>&1; echo "malformed_log=$?"
fn_sol_init >/dev/null 2>&1; echo "init_over_malformed=$?"
EOS
)
expect "A6b a non-numeric ceiling denies the call" "$(printf '%s' "$v" | sed -n 's/^nonnumeric=//p')" "1"
expect "A6b it recovers once repaired, without losing the earlier call" "$(printf '%s' "$v" | sed -n '/^repaired=/{s/^repaired=//p;q}')" "0"
expect "A6c a malformed log row denies every further call" "$(printf '%s' "$v" | sed -n 's/^malformed_log=//p')" "1"
expect "A6d re-init cannot paper over it" "$(printf '%s' "$v" | sed -n 's/^init_over_malformed=//p')" "1"

case_start a6e
v=$(body <<'EOS'
fn_sol_init >/dev/null
fn_sol_reserve key "r" "k1" >/dev/null; fn_sol_reserve key "r" "k2" >/dev/null
sed -i 's|^SOL_RESERVED=.*|SOL_RESERVED=0|' "$FE_SOL_BUDGET_ENV"
fn_sol_reserve key "r" "k3" >/dev/null 2>&1; echo "after_clobber=$?"
echo "healed=$(fn_sol_raw SOL_RESERVED)"
EOS
)
expect "A6e a clobbered counter is rebuilt from the log, never from zero" "$(printf '%s' "$v" | sed -n 's/^healed=//p')" "3"
expect "A6f the call is allowed again after the self-heal" "$(printf '%s' "$v" | sed -n 's/^after_clobber=//p')" "0"

case_start a7
v=$(body <<'EOS'
fn_sol_init >/dev/null
fn_sol_auto_allowed && echo "auto=on" || echo "auto=off"
c=$(fn_sol_reserve key "r" "k1")
echo "pending_row=$(fn_sol_open_pending | wc -l | tr -d ' ')"
echo "status=$(fn_sol_status_line)"
EOS
)
expect "A7 automatic Sol dispatch is off unless an operator turns it on" "$(printf '%s' "$v" | sed -n 's/^auto=//p')" "off"
expect "A7 an uncompleted call is visible as PENDING, not silently absorbed" "$(printf '%s' "$v" | sed -n 's/^pending_row=//p')" "1"
expect_has "A7 the status line names the held-back final pair" "$v" "final_reserve=2"

# ============================================================== B: the gate ===
say "B  validate.sh — shape violations are refusals, and shape is not meaning"

# the reviewer must rule every scenario; tests use this to build a full block
# the reviewer must declare both scans in prose; a word count is a weaker demand
SCANS='BOUNDARY_SCAN: none found beyond the ruled rows
ESCAPE_HATCH_SCAN: no execute(any); no omnipotent context; subscription scopes are named'

allsc11(){ # one scenario deliberately left unruled
  printf '%s\n' '<<<FE-VERDICT-START>>>'
  { seq 1 6; seq 8 12; } | while read -r i; do
    printf 'S%02d|trajectory_ok|section 4|nothing\n' "$i"
  done
  printf '%s\n' '<<<FE-VERDICT-END>>>'
}
allsc(){ # allsc <extra-ce-rows> — a verdict block ruling all 12 scenarios
  printf '%s\n' '<<<FE-VERDICT-START>>>'
  seq 1 12 | while read -r i; do
    printf 'S%02d|trajectory_ok|section 4|nothing\n' "$i"
  done
  [ -n "${1:-}" ] && printf '%s\n' "$1"
  printf '%s\n' '<<<FE-VERDICT-END>>>'
}

gate(){ FE_RUN="$CASE" bash -c "
  . '$DL/env.conf'; FE_RUN='$CASE'
  for l in common validate ledger sol material converge handoff; do . '$DL/lib/'\$l.sh; done
  mkdir -p \"\$FE_TMP\"
  fn_validate_phase $1 '$2' $3 >/dev/null 2>&1; echo \$?"; }

case_start b1
mkout "$CASE/ok.txt" "ok body" '<<<FE-LEDGER-START>>>
FE-CE-001|R001|major|OPEN|turn appears at most once|dupe|attack 1|-
<<<FE-LEDGER-END>>>'
expect "B1 a well-formed attack report is accepted" "$(gate attack "$DL/roles/attacker.md" "$CASE/ok.txt")" "0"

i=0
for bad in 'FE-CE-001|R001|catastrophic|OPEN|inv|t|e|-' \
           'FE-CE-001|R001|major|WONKY|inv|t|e|-' \
           'FE-CE-001|R001|major|OPEN|   |t|e|-' \
           'CE-01|R001|major|OPEN|inv|t|e|-' \
           'FE-CE-001|R001|major|OPEN|only|seven' \
           'FE-CE-001|R001|major||inv|t|e|-' ; do
  i=$((i+1)); case_start "b2$i"
  mkout "$CASE/o.txt" "body" "<<<FE-LEDGER-START>>>
$bad
<<<FE-LEDGER-END>>>"
  expect "B2 refused: [$bad]" "$(gate attack "$DL/roles/attacker.md" "$CASE/o.txt")" "1"
done

case_start b3
printf '<<<FE-OUT-START>>>\n%s\nand the report stops mid-sentence\n' "$PAD" > "$CASE/o.txt"
expect "B3 truncated output is refused" "$(gate attack "$DL/roles/attacker.md" "$CASE/o.txt")" "1"

case_start b4
mkout "$CASE/o.txt" "body" '<<<FE-LEDGER-START>>>
<<<FE-LEDGER-END>>>'
expect "B4 an empty ledger block with no declaration is refused" "$(gate attack "$DL/roles/attacker.md" "$CASE/o.txt")" "1"
case_start b5
mkout "$CASE/o.txt" "COUNTEREXAMPLES: none" '<<<FE-LEDGER-START>>>
<<<FE-LEDGER-END>>>'
expect "B5 an honest no-counterexample declaration is accepted" "$(gate attack "$DL/roles/attacker.md" "$CASE/o.txt")" "0"
case_start b5b
printf 'COUNTEREXAMPLES: none\n<<<FE-LEDGER-START>>>\n<<<FE-LEDGER-END>>>\n' > "$CASE/o.txt"
expect "B5b the declaration alone does not excuse a body under the word floor" "$(gate attack "$DL/roles/attacker.md" "$CASE/o.txt")" "1"

case_start b6
SCANS='BOUNDARY_SCAN: none found beyond the ruled rows
ESCAPE_HATCH_SCAN: no execute(any); no omnipotent context; subscription scopes are named'

# the reviewer's verdict block is scenario-only by contract; counterexample
# evidence must arrive as a replay row, which carries a sequence and an anchor
B6V=$(allsc 'FE-CE-001|holds|section 4|nothing')
mkout "$CASE/o.txt" "$SCANS" "$B6V"
expect "B6 a reviewer may not put counterexample rulings in its verdict block" \
  "$(gate review "$DL/roles/candidate-reviewer.md" "$CASE/o.txt")" "1"
expect "B6b and the refusal says so specifically" \
  "$(FE_RUN="$CASE" bash -c ". '$DL/env.conf'; FE_RUN='$CASE'; for l in common validate ledger sol material converge handoff; do . '$DL/lib/'\$l.sh; done; mkdir -p \$FE_TMP; fn_validate_phase review '$DL/roles/candidate-reviewer.md' '$CASE/o.txt' >/dev/null 2>&1; sed -n 's/^  invalid: //p' \$FE_TMP/validate.err" | grep -c 'may not rule counterexamples')" "1"

B6C=$(allsc '')
mkout "$CASE/o2.txt" "$SCANS" "$B6C"
expect "B6c a scenario-only verdict block is accepted" \
  "$(gate review "$DL/roles/candidate-reviewer.md" "$CASE/o2.txt")" "0"
split=$(FE_RUN="$CASE" bash -c ". '$DL/env.conf'; FE_RUN='$CASE'; for l in common validate ledger sol material converge handoff; do . '$DL/lib/'\$l.sh; done; mkdir -p \$FE_TMP; fn_validate_phase review '$DL/roles/candidate-reviewer.md' '$CASE/o2.txt' >/dev/null 2>&1; echo ce=\$(grep -c . \$FE_TMP/verdict.ce; true) sc=\$(grep -c . \$FE_TMP/verdict.sc; true)" | tail -1)
expect "B6d all twelve scenario rows land in the ruling file" "$split" "ce=0 sc=12"

fresh_x=$(mktemp -u 2>/dev/null || true)
case_start b7
mkout "$CASE/o.txt" "$SCANS" '<<<FE-VERDICT-START>>>
S01|holds|section 4|nothing
<<<FE-VERDICT-END>>>'
expect "B7 a scenario may not be ruled with a counterexample verdict" \
  "$(gate review "$DL/roles/candidate-reviewer.md" "$CASE/o.txt")" "1"

case_start b8
FE_RUN="$CASE" bash -c ". '$DL/env.conf'; FE_RUN='$CASE'; for l in common validate ledger sol material converge handoff; do . '$DL/lib/'\$l.sh; done; mkdir -p \$FE_TMP; printf 'FE-CE-001|R001|major|OPEN|inv|t|e|-\n' > \$FE_TMP/ce.accepted; fn_ce_merge \$FE_TMP/ce.accepted R001" >/dev/null 2>&1
B8V=$(allsc '')
B8R=$(printf '%s\n' '<<<FE-REPLAY-START>>>' 'FE-CE-001|pass|replayed sequence|section 4 blocks it' '<<<FE-REPLAY-END>>>')
mkout "$CASE/o.txt" "$SCANS" "$B8V
$B8R"
expect "B8 a replay ruling is accepted while a regression is open" \
  "$(gate review "$DL/roles/candidate-reviewer.md" "$CASE/o.txt")" "0"

case_start b9
FE_RUN="$CASE" bash -c ". '$DL/env.conf'; FE_RUN='$CASE'; for l in common validate ledger sol material converge handoff; do . '$DL/lib/'\$l.sh; done; mkdir -p \$FE_TMP; printf 'FE-CE-001|R001|major|OPEN|inv|t|e|-\n' > \$FE_TMP/ce.accepted; fn_ce_merge \$FE_TMP/ce.accepted R001" >/dev/null 2>&1
mkout "$CASE/o.txt" "$SCANS" "$(allsc '')"
expect "B9 a review that replays nothing while the regression set is non-empty is refused" \
  "$(gate review "$DL/roles/candidate-reviewer.md" "$CASE/o.txt")" "1"

case_start b10
mkout "$CASE/o.txt" "$SCANS" "$(allsc11)"
expect "B10 a review that skips even one scenario is refused" \
  "$(gate review "$DL/roles/candidate-reviewer.md" "$CASE/o.txt")" "1"
expect "B10b and the refusal names the gap rather than complaining vaguely" \
  "$(FE_RUN="$CASE" bash -c ". '$DL/env.conf'; FE_RUN='$CASE'; for l in common validate ledger sol material converge handoff; do . '$DL/lib/'\$l.sh; done; mkdir -p \$FE_TMP; fn_validate_phase review '$DL/roles/candidate-reviewer.md' '$CASE/o.txt' >/dev/null 2>&1; sed -n 's/^  invalid: //p' \$FE_TMP/validate.err" | grep -c 'must rule at least 12')" "1"

case_start b11
mkout "$CASE/o.txt" "no scan declarations here" "$(allsc '')"
expect "B11 a review that omits the scan declarations is refused" \
  "$(gate review "$DL/roles/candidate-reviewer.md" "$CASE/o.txt")" "1"
expect "B11b and it names both missing declarations" \
  "$(FE_RUN="$CASE" bash -c ". '$DL/env.conf'; FE_RUN='$CASE'; for l in common validate ledger sol material converge handoff; do . '$DL/lib/'\$l.sh; done; mkdir -p \$FE_TMP; fn_validate_phase review '$DL/roles/candidate-reviewer.md' '$CASE/o.txt' >/dev/null 2>&1; sed -n 's/^  invalid: //p' \$FE_TMP/validate.err" | grep -c 'declaration line missing')" "2"

case_start b12
FE_RUN="$CASE" bash -c ". '$DL/env.conf'; FE_RUN='$CASE'; for l in common validate ledger sol material converge handoff; do . '$DL/lib/'\$l.sh; done; mkdir -p \$FE_TMP; printf 'FE-CE-001|R001|major|OPEN|inv|t|e|-\n' > \$FE_TMP/ce.accepted; fn_ce_merge \$FE_TMP/ce.accepted R001" >/dev/null 2>&1
B12R=$(printf '%s\n' '<<<FE-REPLAY-START>>>' 'FE-CE-001|WONKY|seq|anchor' '<<<FE-REPLAY-END>>>')
mkout "$CASE/o.txt" "$SCANS" "$(allsc '')
$B12R"
expect "B12 a replay row outside pass|fail is refused" \
  "$(gate review "$DL/roles/candidate-reviewer.md" "$CASE/o.txt")" "1"

# ==================================================== C: handoff and evidence ==
say "C  handoff + convergence — the record survives, coverage needs a witness"

case_start c1
v=$(body <<'EOS'
printf 'FE-CE-001|R001|major|OPEN|invariant A|first|ev1|-\n' > "$FE_TMP/in.txt"
fn_ce_merge "$FE_TMP/in.txt" R001
printf 'FE-CE-001|R001|major|CLOSED|changed text|must not overwrite|ev2|FE-CE-001\nFE-CE-002|R001|minor|OPEN|invariant B|second|ev3|FE-CE-001\n' > "$FE_TMP/in.txt"
FE_CE_MAP="$FE_RUN/map.tsv"; fn_ce_merge "$FE_TMP/in.txt" R001
echo "rows=$(awk -F'|' 'NR>1{n++} END{print n+0}' "$FE_LEDGER")"
echo "inv1=$(awk -F'|' 'NR==2{print $5}' "$FE_LEDGER")"
echo "sev1=$(awk -F'|' 'NR==2{print $3}' "$FE_LEDGER")"
echo "tgt2=$(awk -F'|' 'NR==3{print $8}' "$FE_LEDGER")"
echo "hist=$(grep -c 'invariant A' "$FE_RUN/rounds" -r 2>/dev/null || grep -c 'invariant A' "$FE_LEDGER")"
EOS
)
expect "C1 a status transition updates the row instead of adding one" "$(printf '%s' "$v" | sed -n 's/^rows=//p')" "2"
expect "C2 the original invariant text is never overwritten" "$(printf '%s' "$v" | sed -n 's/^inv1=//p')" "invariant A"
expect "C3 severity only escalates" "$(printf '%s' "$v" | sed -n 's/^sev1=//p')" "major"
expect "C4 a cross-reference follows the canonical id" "$(printf '%s' "$v" | sed -n 's/^tgt2=//p')" "FE-CE-001"

case_start c5
v=$(body <<'EOS'
printf 'FE-CE-001|R001|major|OPEN|invariant AAA|t|e|-\nFE-CE-002|R002|major|OPEN|invariant BBB|t|e|-\n' > "$FE_TMP/in.txt"
fn_ce_merge "$FE_TMP/in.txt" R001
fn_state_set BEST_CANDIDATE=A
printf '# candidate\nbody\n' > "$FE_RUN/candidates/best.md"
fn_build_handoff_prompt attacker R002 > "$FE_RUN/p.txt" 2> "$FE_RUN/p.err"
echo "has1=$(grep -c 'invariant AAA' "$FE_RUN/p.txt")"
echo "has2=$(grep -c 'invariant BBB' "$FE_RUN/p.txt")"
echo "labelled=$(grep -c 'authoritative' "$FE_RUN/p.txt")"
echo "trunc=$(sed -n '/counterexample record/,/scenario coverage ledger/p' "$FE_RUN/p.txt" | grep -c 'truncated for this role')"
# every unresolved row must appear as a whole line, not merely as a word count
miss=0
while IFS= read -r row; do
  grep -qxF "$row" "$FE_RUN/p.txt" || miss=$((miss+1))
done < <(fn_regression_list)
echo "missing_rows=$miss"
echo "contract=$(grep -c 'OUTPUT CONTRACT' "$FE_RUN/p.txt")"
EOS
)
expect "C5 unresolved row 1 is handed over verbatim" "$(printf '%s' "$v" | sed -n 's/^has1=//p')" "2"
expect "C5 unresolved row 2 is handed over verbatim" "$(printf '%s' "$v" | sed -n 's/^has2=//p')" "2"
n=$(printf '%s' "$v" | sed -n 's/^labelled=//p'); if [ "${n:-0}" -ge 1 ]; then ok "C5 the block is marked authoritative"; else no "C5 the block is marked authoritative" "labelled=$n"; fi
expect "C6 nothing inside the ledger section is truncated" "$(printf '%s' "$v" | sed -n 's/^trunc=//p')" "0"
expect "C6b every unresolved row appears verbatim as a whole line" "$(printf '%s' "$v" | sed -n 's/^missing_rows=//p')" "0"
expect "C6c the role's own contract travels with the material" "$(printf '%s' "$v" | sed -n 's/^contract=//p')" "1"

case_start c7
v=$(body <<'EOS'
printf 'S01|covered|core|projection|integration 1\n' > "$FE_TMP/sc.txt"
fn_sc_merge "$FE_TMP/sc.txt" R001
echo "status1=$(awk -F'|' 'NR==2{print $2}' "$FE_SC")"
EOS
)
expect "C7 an integrator may claim coverage but never grant it" "$(printf '%s' "$v" | sed -n 's/^status1=//p')" "claimed"

case_start c8
v=$(body <<'EOS'
fn_rulings_ensure
printf 'S01|claimed|core|mech|ev\n' > "$FE_TMP/sc.txt"; fn_sc_merge "$FE_TMP/sc.txt" R001
printf '# candidate one\n' > "$FE_RUN/candidates/best.md"
d=$(fn_best_digest)
printf 'R001|%s|sc|S01|trajectory_ok|section 4|\n' "$d" >> "$FE_RULINGS"
echo "ruled=$(fn_sc_covered)"
printf '# candidate one, edited after the ruling\n' > "$FE_RUN/candidates/best.md"
echo "after_edit=$(fn_sc_covered)"
echo "streak_after_edit=$(fn_clean_streak)"
EOS
)
expect "C8 a ruling counts only against the exact bytes it read" "$(printf '%s' "$v" | sed -n 's/^ruled=//p')" "1"
expect "C9 editing the candidate voids rulings made against the old bytes" "$(printf '%s' "$v" | sed -n '/^after_edit=/{s/^after_edit=//p;q}')" "0"

case_start c10
v=$(body <<'EOS'
fn_sol_init >/dev/null 2>&1
printf 'FE-CE-001|R001|major|CLOSED|invariant A|t|e|-\n' > "$FE_TMP/in.txt"; fn_ce_merge "$FE_TMP/in.txt" R001
printf 'S01|claimed|core|mech|ev\nS02|claimed|core|mech|ev\n' > "$FE_TMP/sc.txt"; fn_sc_merge "$FE_TMP/sc.txt" R001
printf 'projection registry|core|S09 loses truth|integration 1\n' > "$FE_TMP/m.txt"; fn_mech_merge "$FE_TMP/m.txt" 1
printf '# c\n' > "$FE_RUN/candidates/best.md"
printf 'round|holds|new|closed|clean|note|digest\nR001|0|0|0|1|dim D01|\nR002|0|0|0|1|dim D02|\nR003|0|0|0|1|dim D03|\n' > "$FE_RUN/rounds.tsv"
fn_convergence_check
EOS
)
expect_has "C10 a spotless but unreviewed record never converges" "$v" "independent review"
expect_has "C10b it names the coverage gap rather than hiding it" "$v" "scenarios_independently_ruled_covered"
expect_has "C10c an un-replayed closed counterexample is held against it" "$v" "major_CE_pending_replay"
expect_has "C10d and a claimed-coverage row alone is not enough" "$v" "NO:"

case_start c11
v=$(body <<'EOS'
# everything looks perfect except nobody ever broke it
printf '# c\n' > "$FE_RUN/candidates/best.md"
d=$(fn_best_digest)
{ printf 'round|digest|kind|id|verdict|evidence\n'
  for i in $(seq 1 12); do printf 'R001|%s|sc|S%02d|trajectory_ok|section|\n' "$d" "$i"; done
} > "$FE_RULINGS"
printf '' > "$FE_SC"
for i in $(seq 1 12); do printf 'S%02d|claimed|core|mech|integration %d\n' "$i" "$i" >> "$FE_SC"; done
printf 'round|holds|new|closed|clean|note|digest\n' > "$FE_RUN/rounds.tsv"
for i in 1 2 3; do printf 'R00%d|0|0|0|1|dim D0%d|%s\n' "$i" "$i" "$d" >> "$FE_RUN/rounds.tsv"; done
fn_convergence_check
EOS
)
case_start c11pos
expect "C11 with a spendable final slot, a complete record calls for the review" \
  "$(body <<'EOS'
fn_sol_init >/dev/null
printf '# c\n' > "$FE_RUN/candidates/best.md"
d=$(fn_best_digest)
{ printf 'round|digest|kind|id|verdict|evidence\n'
  for i in $(seq 1 12); do printf 'R001|%s|sc|S%02d|trajectory_ok|section|\n' "$d" "$i"; done
} > "$FE_RULINGS"
printf 'sid|status|owner|mechanism|evidence|round\n' > "$FE_SC"
for i in $(seq 1 12); do printf 'S%02d|claimed|core|mech|int %d\n' "$i" "$i" >> "$FE_SC"; done
printf 'registry|core|S09 loses truth|integration 1\n' > "$FE_TMP/m.txt"; fn_mech_merge "$FE_TMP/m.txt" 1
printf 'round|holds|new|closed|clean|note|digest\n' > "$FE_RUN/rounds.tsv"
for i in 1 2 3; do printf 'R00%d|0|0|0|1|dim D0%d|%s\n' "$i" "$i" "$d" >> "$FE_RUN/rounds.tsv"; done
fn_convergence_check
EOS
)" | grep -c FINAL_REVIEW_DUE
expect "C11a an exhausted or missing budget ends as pending review, never as verified" \
  "$(body <<'EOS'
rm -f "$FE_SOL_BUDGET_ENV" "$FE_SOL_BUDGET_LOG"
fn_convergence_check
EOS
)" | grep -c CONVERGED_UNVERIFIED
case_start c11own
v=$(body <<'EOS'
fn_sol_init >/dev/null
printf '# c\n' > "$FE_RUN/candidates/best.md"
d=$(fn_best_digest)
{ printf 'round|digest|kind|id|verdict|evidence\n'
  for i in $(seq 1 12); do printf 'R001|%s|sc|S%02d|trajectory_ok|section|\n' "$d" "$i"; done
} > "$FE_RULINGS"
printf 'sid|status|owner|mechanism|evidence|round\n' > "$FE_SC"
for i in $(seq 1 11); do printf 'S%02d|claimed|core|mech|int %d\n' "$i" "$i" >> "$FE_SC"; done
printf 'registry|core|S09 loses truth|integration 1\n' > "$FE_TMP/m.txt"; fn_mech_merge "$FE_TMP/m.txt" 1
printf 'round|holds|new|closed|clean|note|digest\n' > "$FE_RUN/rounds.tsv"
for i in 1 2 3; do printf 'R00%d|0|0|0|1|dim D0%d|%s\n' "$i" "$i" "$d" >> "$FE_RUN/rounds.tsv"; done
echo "unowned=$(fn_sc_unowned)"
fn_convergence_check
EOS
)
expect "C11b an approved scenario nobody owns is counted" "$(printf '%s' "$v" | sed -n 's/^unowned=//p')" "1"
expect_has "C11c and it blocks convergence" "$v" "without_an_owner"
expect "C11d so the record is not reported as ready" "$(printf '%s' "$v" | grep -c 'FINAL_REVIEW_DUE')" "0"


# ================================================ D: retired path isolation ===
say "D  the retired supervisor cannot be reached from the active path"

# nothing the active entry loads may name the retired process supervisor
refs=$(grep -n 'lib/model.sh\|lib/phases.sh' "$DL/loopctl" "$DL/lib/"*.sh 2>/dev/null \
       | grep -v '^lib/model.sh\|^lib/phases.sh' | grep -vc '^\S*: *#' || true)
active_refs=$(FE_RUN="$CASE" bash -c "grep -l 'fn_run_phase\|fn_pure_call\|cmd_start' \
  '$DL/lib/common.sh' '$DL/lib/validate.sh' '$DL/lib/ledger.sh' '$DL/lib/sol.sh' \
  '$DL/lib/material.sh' '$DL/lib/converge.sh' '$DL/lib/handoff.sh' '$DL/loopctl' 2>/dev/null | wc -l" | tail -1)
expect "D1 no active library or entry point calls the retired runner" "$active_refs" "0"

# the retired verbs must refuse rather than half-run and spend calls
for v in start resume step; do
  rc=$(FE_RUN="$CASE" "$DL/loop.sh" "$v" >/dev/null 2>&1; echo $?)
  msg=$(FE_RUN="$CASE" "$DL/loop.sh" "$v" 2>&1 | sed -n '2p')
  expect "D2 loop.sh $v refuses with 64 instead of half-running" "$rc" "64"
  expect_has "D2b loop.sh $v points at the native loop" "$msg" "native /loop"
done

# and the active environment genuinely lacks the retired machinery
v=$(body <<'EOS'
echo "runner=$(type -t fn_run_phase || echo absent)"
echo "worker=$(type -t fn_pure_call || echo absent)"
echo "supervisor=$(type -t cmd_start || echo absent)"
echo "budget=$(type -t fn_sol_reserve || echo present)"
echo "gate=$(type -t fn_validate_phase || echo present)"
echo "handoff=$(type -t fn_build_handoff_prompt || echo present)"
EOS
)
expect "D3 the retired runner is absent in the active environment" "$(printf '%s' "$v" | sed -n 's/^runner=//p')" "absent"
expect "D3b the retired worker invoker is absent" "$(printf '%s' "$v" | sed -n 's/^worker=//p')" "absent"
expect "D3c the retired supervisor entry is absent" "$(printf '%s' "$v" | sed -n 's/^supervisor=//p')" "absent"
expect "D4 the three retained components are the only loaded machinery" \
  "$(printf '%s' "$v" | grep -cE '=(function)$')" "3"

# --- E2E anchor: an accepted integration MUST move the saved candidate bytes ---
say "E  commit_integrate moves the saved candidate anchor"
case_start e1
v=$(body <<'EOS'
fn_sol_init >/dev/null
mkdir -p "$FE_RUN/rounds/R007"
printf 'CANDIDATES: A\nDIMENSION: D01-order-dedup\n' > "$FE_RUN/rounds/R007/plan.md"
printf 'DIMENSION: D01-order-dedup\n' > "$FE_RUN/rounds/R007/dimension.txt"
printf '# candidate round one\nfirst saved bytes\n' > "$FE_RUN/candidates/best.md"
d1=$(fn_best_digest)
pad=$(python3 -c 'print("word here now "*700, end="")')
f1="$FE_RUN/e1a.txt"
{ printf '<<<FE-OUT-START>>>\n%s\nCHANGES_VS_PREVIOUS: added the anchor test\ninterface Resource { id: ResourceId }\nfunc subscribe(id: ResourceId, from: Cursor) -> Stream\nfunc invoke(id: ResourceId, action: ActionName, params: Value) -> Result\ntype Cursor = { ns: NamespaceId, seq: SeqNo }\ninterface ViewResolver { resolve(kind: Kind) -> ViewKind }\nfunc cursorResolve(id: ResourceId) -> Cursor\n```python\nprint("cursor semantics")\n```\n```python\nprint("gap marker survives")\n```\n```python\nprint("simpler scope passes S08")\n```\n<<<FE-OUT-END>>>\n' "$pad"
  printf '<<<FE-OUT-START>>>\n%s\n# candidate round two, deliberately different bytes\n<<<FE-OUT-END>>>\n' "$pad"
  printf '<<<FE-LEDGER-START>>>\nFE-CE-001|R007|major|OPEN|inv|t|e|-\n<<<FE-LEDGER-END>>>\n'
  printf '<<<FE-SCENARIO-START>>>\n'
  for i in $(seq 1 12); do printf 'S%02d|covered|core|mech|int %d\n' "$i" "$i"; done
  printf '<<<FE-SCENARIO-END>>>\n'
  printf '<<<FE-MECH-START>>>\nm1|core|S09 breaks|integration 1\n<<<FE-MECH-END>>>\n'
  printf '<<<FE-REPLAY-START>>>\nFE-CE-001|pass|seq|anchor\n<<<FE-REPLAY-END>>>\n'; } > "$f1"
fn_accept integrator R007 "$f1" >/dev/null 2>&1; echo "accept=$?"
d2=$(fn_best_digest)
echo "moved=$([ "$d1" != "$d2" ] && echo yes || echo no)"
echo "identical=$(cmp -s "$FE_RUN/rounds/R007/best-candidate.md" "$FE_RUN/candidates/best.md" && echo yes || echo no)"
echo "archived=$(ls "$FE_RUN"/candidates/cand-A.R007.md >/dev/null 2>&1 && echo yes || echo no)"
EOS
)
expect "E1 an accepted integration is recorded as accepted" "$(printf '%s' "$v" | sed -n 's/^accept=//p')" "0"
expect "E2 the saved candidate bytes actually moved" "$(printf '%s' "$v" | sed -n 's/^moved=//p')" "yes"
expect "E3 and match this round's artifact byte for byte" "$(printf '%s' "$v" | sed -n 's/^identical=//p')" "yes"
expect "E4 with the versioned copy kept for history" "$(printf '%s' "$v" | sed -n 's/^archived=//p')" "yes"

# the reviewer rules scenarios in one block and replays counterexamples in
# another; a defect once made the second pass erase the first
say "E5 both ruling kinds are recorded, once each, for the bytes reviewed"
case_start e5
v=$(body <<'EOS'
# the replay block is only demanded when the regression set is non-empty, so
# seed two open counterexamples first
printf 'FE-CE-001|R998|major|OPEN|inv|t|e|-\nFE-CE-002|R998|major|OPEN|inv2|t|e|-\n' > "$FE_TMP/seed"
fn_ce_merge "$FE_TMP/seed" R998
d=$(fn_best_digest)
f="$FE_RUN/e5.txt"
pad=$(python3 -c 'print("word here now "*250, end="")')
{ printf '<<<FE-OUT-START>>>\n%s\nBOUNDARY_SCAN: none\nESCAPE_HATCH_SCAN: none\n<<<FE-OUT-END>>>\n' "$pad"
  printf '<<<FE-VERDICT-START>>>\n'
  for i in $(seq 1 12); do printf 'S%02d|trajectory_ok|section 4|nothing\n' "$i"; done
  printf '<<<FE-VERDICT-END>>>\n'
  printf '<<<FE-REPLAY-START>>>\nFE-CE-001|pass|replayed sequence|section 4 blocks it\nFE-CE-002|pass|replayed|blocks\n<<<FE-REPLAY-END>>>\n'
  printf '<<<FE-LEDGER-START>>>\nFE-CE-001|R999|major|OPEN|inv|t|e|-\nFE-CE-002|R999|major|OPEN|inv2|t|e|-\n<<<FE-LEDGER-END>>>\n'; } > "$f"
fn_validate_phase review "$FE_ROLES/candidate-reviewer.md" "$f" >/dev/null 2>&1; echo "gate=$?"
: > "$FE_RUN/rr.tmp"
fn_rulings_ensure
for src in "$FE_TMP/verdict.sc" "$FE_TMP/verdict.ce" "$FE_TMP/replay.ce"; do
  [ -s "$src" ] || continue
  while IFS='|' read -r id st ev miss; do
    case "$id" in FE-CE-*) k=ce ;; S[0-9][0-9]) k=sc ;; *) continue ;; esac
    printf 'R999|%s|%s|%s|%s|e\n' "$d" "$k" "$id" "$st"
  done < "$src"
done >> "$FE_RULINGS"
echo "sc=$(awk -F'|' -v d="$d" 'NR>1 && $2==d && $3=="sc"{a[$4]=1} END{print length(a)+0}' "$FE_RULINGS")"
echo "ce=$(awk -F'|' -v d="$d" 'NR>1 && $2==d && $3=="ce"{a[$4]=1} END{print length(a)+0}' "$FE_RULINGS")"
echo "dupe=$(awk -F'|' 'NR>1{k=$1"|"$2"|"$3"|"$4; c[k]++} END{n=0; for(x in c) if(c[x]>1) n++; print n}' "$FE_RULINGS")"
EOS
)
expect "E5a the review output passes the gate" "$(printf '%s' "$v" | sed -n 's/^gate=//p')" "0"
expect "E5b all twelve scenario rulings are present" "$(printf '%s' "$v" | sed -n 's/^sc=//p')" "12"
expect "E5c and the counterexample replay rulings too" "$(printf '%s' "$v" | sed -n 's/^ce=//p')" "2"
expect "E5d with no duplicate (round,digest,kind,id) row" "$(printf '%s' "$v" | sed -n 's/^dupe=//p')" "0"

# --- E6: a discarded alternative's defect cannot be "passed" against these bytes
say "E6 replay verdicts are refused for a discarded alternative's counterexample"
case_start e6
v=$(body <<'EOS'
fn_sol_init >/dev/null
mkdir -p "$FE_RUN/rounds/R008"
printf 'CANDIDATES: A\nDIMENSION: D01-order-dedup\n' > "$FE_RUN/rounds/R008/plan.md"
printf 'DIMENSION: D01-order-dedup\n' > "$FE_RUN/rounds/R008/dimension.txt"
printf '# candidate round one\nfirst saved bytes\n' > "$FE_RUN/candidates/best.md"
printf 'FE-CE-001|R997|major|OPEN|inv|t|e|-\n' > "$FE_TMP/seed"
fn_ce_merge "$FE_TMP/seed" R997
fn_ce_set_subject FE-CE-001 B-alternative 'defect of a discarded alternative'
pad=$(python3 -c 'print("word here now "*250, end="")')
f="$FE_RUN/e6.txt"
{ printf '<<<FE-OUT-START>>>\n%s\nBOUNDARY_SCAN: none\nESCAPE_HATCH_SCAN: none\n<<<FE-OUT-END>>>\n' "$pad"
  printf '<<<FE-VERDICT-START>>>\n'
  for i in $(seq 1 12); do printf 'S%02d|trajectory_ok|s|n\n' "$i"; done
  printf '<<<FE-VERDICT-END>>>\n'
  printf '<<<FE-REPLAY-START>>>\nFE-CE-001|pass|attempted replay|anchor\n<<<FE-REPLAY-END>>>\n'; } > "$f"
fn_accept candidate-reviewer R008 "$f" >/dev/null 2>&1; echo "accept=$?"
d=$(fn_best_digest)
echo "verdict=$(awk -F'|' -v d="$d" '$2==d && $4=="FE-CE-001"{print $5}' "$FE_RULINGS" | tail -1)"
echo "still_open=$(awk -F'|' '$1=="FE-CE-001"{print $4}' "$FE_LEDGER")"
echo "replay_stamped=$(awk -F'|' '$1=="FE-CE-001"{print $9}' "$FE_LEDGER")"
EOS
)
expect "E6a the review is accepted" "$(printf '%s' "$v" | sed -n 's/^accept=//p')" "0"
expect "E6b its verdict is recorded as not_applicable, never pass" \
  "$(printf '%s' "$v" | sed -n 's/^verdict=//p')" "not_applicable"
expect "E6c the counterexample stays OPEN on the alternative's book" \
  "$(printf '%s' "$v" | sed -n 's/^still_open=//p')" "OPEN"
expect "E6d and is not stamped as replayed" "$(printf '%s' "$v" | sed -n 's/^replay_stamped=//p')" "-"

case_start e7
v=$(body <<'EOS'
fn_sol_init >/dev/null
mkdir -p "$FE_RUN/rounds/R009"
printf 'CANDIDATES: A\nDIMENSION: D01-order-dedup\n' > "$FE_RUN/rounds/R009/plan.md"
printf 'DIMENSION: D01-order-dedup\n' > "$FE_RUN/rounds/R009/dimension.txt"
printf '# candidate bytes\nsaved\n' > "$FE_RUN/candidates/best.md"
printf 'FE-CE-001|R996|major|OPEN|inv|title|e|-\n' > "$FE_TMP/seed"
fn_ce_merge "$FE_TMP/seed" R996
fn_ce_set_subject FE-CE-001 B-alternative 'defect of a discarded alternative'
pad=$(python3 -c 'print("word here now "*700, end="")')
f="$FE_RUN/e7.txt"
{ printf '<<<FE-OUT-START>>>\n%s\nFABRICATION_CHECK: none\nCONTRADICTION_CHECK: none\nMISSED_CHECK: none\n<<<FE-OUT-END>>>\n' "$pad"
  printf '<<<FE-VERDICT-START>>>\nFE-CE-001|does_not_hold|the saved candidate has no such mechanism|n/a\n<<<FE-VERDICT-END>>>\n'; } > "$f"
fn_accept verifier R009 "$f" >/dev/null 2>&1; echo "accept=$?"
echo "status=$(awk -F'|' '$1=="FE-CE-001"{print $4}' "$FE_LEDGER")"
echo "ruling=$(awk -F'|' '$4=="FE-CE-001"{print $5}' "$FE_RULINGS" | tail -1)"
EOS
)
expect "E7a the verdict phase is accepted" "$(printf '%s' "$v" | sed -n 's/^accept=//p')" "0"
expect "E7b an A-side does_not_hold must not reject a discarded alternative row" \
  "$(printf '%s' "$v" | sed -n 's/^status=//p')" "OPEN"
expect "E7c and the ruling is stored as not_applicable, not as a verdict on it" \
  "$(printf '%s' "$v" | sed -n 's/^ruling=//p')" "not_applicable"


printf '\n=== unit tests: %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
exit 0
