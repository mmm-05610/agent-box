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
