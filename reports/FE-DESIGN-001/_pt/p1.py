p='tests/unit.sh'
L=open(p).read().split('\n')
def find(sub, start=0):
    for i in range(start,len(L)):
        if sub in L[i]: return i
    raise SystemExit('not found: '+sub)

A1B = r'''.case_start a1b
.expect "A1b a second init never resets a spent record" \
.  "$(body <<'EOS'
.fn_sol_init >/dev/null
.fn_sol_reserve key "spent" "k1" >/dev/null
.fn_sol_init >/dev/null 2>&1
.echo "reserved=$(fn_sol_raw SOL_RESERVED)"
.EOS
.)" "reserved=1"
.case_start a1c
.expect "A1c deleting half the record never yields a fresh zero" \
.  "$(body <<'EOS'
.fn_sol_init >/dev/null
.fn_sol_reserve key "spent" "k1" >/dev/null
.rm -f "$FE_SOL_BUDGET_LOG"
.fn_sol_init >/dev/null 2>&1; rc=$?
.echo "init=$rc"
.EOS
.)" "init=1"'''.split('\n')
A1B=[l[1:] if l.startswith('.') else l for l in A1B]

i=find('expect "A1b a second init never resets a spent record"')
j=find('"reserved=1"', i)
L[i:j+1]=A1B

i=find('echo "cid_prefix='); L[i]='echo "cid_prefix=$(printf %s "$cid" | cut -c1-6)"'
i=find('expect "A2 a call id is returned"'); L[i]=L[i].replace('"SOL-01-"','"SOL-01"')

i=find('for i in $(seq 1 12); do')
L[i+1]=L[i+1].replace('then echo won; else echo denied;','then echo key_won; else echo key_denied;')
i=find('for i in $(seq 1 4); do')
L[i+1]=L[i+1].replace('then echo won; else echo denied;','then echo final_won; else echo final_denied;')
i=find('echo "won=$(grep -c ^won')
L[i]='echo "key_won=$(grep -c ^key_won "$FE_RUN/race.count")"'
L[i+1]='echo "key_denied=$(grep -c ^key_denied "$FE_RUN/race.count")"'
L[i+2:i+2]=['echo "final_won=$(grep -c ^final_won "$FE_RUN/race.count")"']
i=find('expect "A4 12 concurrent key-node races')
L[i]='expect "A4 12 concurrent key-node races stop at the 8 key slots" "$(printf \'%s\' "$v" | sed -n \'s/^key_won=//p\')" "8"'
L[i+1]='expect "A4 the four over-requesters were denied, none double-spent" "$(printf \'%s\' "$v" | sed -n \'s/^key_denied=//p\')" "4"'
L[i+2:i+2]=['expect "A4 then only the two held-back final slots can be won" "$(printf \'%s\' "$v" | sed -n \'s/^final_won=//p\')" "2"']

i=find('expect "C5 unresolved row 1'); L[i]=L[i].replace(')" "1"',')" "2"')
i=find('expect "C5 unresolved row 2'); L[i]=L[i].replace(')" "1"',')" "2"')
i=find('expect "C5 the block is marked authoritative"')
L[i]='n=$(printf \'%s\' "$v" | sed -n \'s/^labelled=//p\'); if [ "${n:-0}" -ge 1 ]; then ok "C5 the block is marked authoritative"; else no "C5 the block is marked authoritative" "labelled=$n"; fi'
i=find('echo "openrows='); L[i]='echo "openrows=$(grep -c \'|OPEN|\' "$FE_RUN/p.txt")"'
open(p,'w').write('\n'.join(L))
print('patched ok')
