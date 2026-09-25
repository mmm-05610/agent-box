p='tests/unit.sh'
s=open(p).read()
start = s.index('B6V=$(allsc ')
end   = s.index('# ==================================================== C: handoff and evidence ==')
new = r'''SCANS='BOUNDARY_SCAN: none found beyond the ruled rows
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
split=$(FE_RUN="$CASE" bash -c ". '$DL/env.conf'; FE_RUN='$CASE'; for l in common validate ledger sol material converge handoff; do . '$DL/lib/'\$l.sh; done; mkdir -p \$FE_TMP; fn_validate_phase review '$DL/roles/candidate-reviewer.md' '$CASE/o2.txt' >/dev/null 2>&1; echo ce=\$(grep -c . \$FE_TMP/verdict.ce 2>/dev/null || echo 0) sc=\$(grep -c . \$FE_TMP/verdict.sc)" | tail -1)
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

'''
s = s[:start] + new + s[end:]
open(p,'w').write(s)
print('B-region rewritten')
