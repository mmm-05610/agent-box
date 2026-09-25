p='tests/unit.sh'
L=open(p).read().split('\n')
def find(s,st=0):
    for i in range(st,len(L)):
        if s in L[i]: return i
    raise SystemExit('nf: '+s)

BLOCK = r'''.case_start c11pos
expect "C11 with a spendable final slot, a complete record calls for the review" \
.  "$(body <<'EOS'
.fn_sol_init >/dev/null
.printf '# c\n' > "$FE_RUN/candidates/best.md"
.d=$(fn_best_digest)
.{ printf 'round|digest|kind|id|verdict|evidence\n'
.  for i in $(seq 1 12); do printf 'R001|%s|sc|S%02d|trajectory_ok|section|\n' "$d" "$i"; done
.} > "$FE_RULINGS"
.printf 'sid|status|owner|mechanism|evidence|round\n' > "$FE_SC"
.for i in $(seq 1 12); do printf 'S%02d|claimed|core|mech|int %d\n' "$i" "$i" >> "$FE_SC"; done
.printf 'registry|core|S09 loses truth|integration 1\n' > "$FE_TMP/m.txt"; fn_mech_merge "$FE_TMP/m.txt" 1
.printf 'round|holds|new|closed|clean|note|digest\n' > "$FE_RUN/rounds.tsv"
.for i in 1 2 3; do printf 'R00%d|0|0|0|1|dim D0%d|%s\n' "$i" "$i" "$d" >> "$FE_RUN/rounds.tsv"; done
.fn_convergence_check
.EOS
.)" | grep -c FINAL_REVIEW_DUE
expect "C11a an exhausted or missing budget ends as pending review, never as verified" \
  "$(body <<'EOS'
.rm -f "$FE_SOL_BUDGET_ENV" "$FE_SOL_BUDGET_LOG"
.fn_convergence_check
.EOS
)" | grep -c CONVERGED_UNVERIFIED'''.split('\n')
BLOCK=[l[1:] if l.startswith('.') else l for l in BLOCK]

i=find('expect_has "C11 a fully ruled')
j=find('expect_has "C11b')
L[i:j]=BLOCK

# C11b: rewrite the owner-gate case in the same shape
OWN = r'''.case_start c11own
v=$(body <<'EOS'
.fn_sol_init >/dev/null
.printf '# c\n' > "$FE_RUN/candidates/best.md"
.d=$(fn_best_digest)
.{ printf 'round|digest|kind|id|verdict|evidence\n'
.  for i in $(seq 1 12); do printf 'R001|%s|sc|S%02d|trajectory_ok|section|\n' "$d" "$i"; done
.} > "$FE_RULINGS"
.printf 'sid|status|owner|mechanism|evidence|round\n' > "$FE_SC"
.for i in $(seq 1 11); do printf 'S%02d|claimed|core|mech|int %d\n' "$i" "$i" >> "$FE_SC"; done
.printf 'registry|core|S09 loses truth|integration 1\n' > "$FE_TMP/m.txt"; fn_mech_merge "$FE_TMP/m.txt" 1
.printf 'round|holds|new|closed|clean|note|digest\n' > "$FE_RUN/rounds.tsv"
.for i in 1 2 3; do printf 'R00%d|0|0|0|1|dim D0%d|%s\n' "$i" "$i" "$d" >> "$FE_RUN/rounds.tsv"; done
.echo "unowned=$(fn_sc_unowned)"
.fn_convergence_check
.EOS
)
expect "C11b an approved scenario nobody owns is counted" "$(printf '%s' "$v" | sed -n 's/^unowned=//p')" "1"
expect_has "C11c and it blocks convergence" "$v" "without_an_owner"
expect "C11d so the record is not reported as ready" "$(printf '%s' "$v" | grep -c 'FINAL_REVIEW_DUE')" "0"'''.split('\n')
OWN=[l[1:] if l.startswith('.') else l for l in OWN]
i=find('expect_has "C11b an approved scenario')
j=find('expect', i+1)
while j < len(L) and 'without_an_owner' not in L[j]:
    j += 1
L[i:j+1]=OWN
open(p,'w').write('\n'.join(L))
print('patched')
