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
