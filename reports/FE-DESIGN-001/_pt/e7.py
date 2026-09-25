p='tests/unit.sh'
L=open(p).read().split('\n')
i=[n for n,l in enumerate(L) if l.startswith("printf '\\n=== unit tests:")][0]
block = r'''.case_start e7
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
'''[1:].split('\n')
open(p,'w').write('\n'.join(L[:i] + block + [''] + L[i:]))
print('E7 inserted')
