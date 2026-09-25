set -u
. '/home/maoqh/projects/ordessa/control/design-loop/env.conf'
FE_RUN='/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/c1'
for l in common validate ledger sol material converge handoff; do . '/home/maoqh/projects/ordessa/control/design-loop/lib/'$l.sh; done
mkdir -p "$FE_TMP" "$FE_LOGS" "/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/c1/sol" "/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/c1/candidates"
printf 'FE-CE-001|R001|major|OPEN|invariant A|first|ev1|-\n' > "$FE_TMP/in.txt"
fn_ce_merge "$FE_TMP/in.txt" R001
printf 'FE-CE-001|R001|major|CLOSED|changed text|must not overwrite|ev2|FE-CE-001\nFE-CE-002|R001|minor|OPEN|invariant B|second|ev3|FE-CE-001\n' > "$FE_TMP/in.txt"
FE_CE_MAP="$FE_RUN/map.tsv"; fn_ce_merge "$FE_TMP/in.txt" R001
echo "rows=$(awk -F'|' 'NR>1{n++} END{print n+0}' "$FE_LEDGER")"
echo "inv1=$(awk -F'|' 'NR==2{print $5}' "$FE_LEDGER")"
echo "sev1=$(awk -F'|' 'NR==2{print $3}' "$FE_LEDGER")"
echo "tgt2=$(awk -F'|' 'NR==3{print $8}' "$FE_LEDGER")"
echo "hist=$(grep -c 'invariant A' "$FE_RUN/rounds" -r 2>/dev/null || grep -c 'invariant A' "$FE_LEDGER")"
