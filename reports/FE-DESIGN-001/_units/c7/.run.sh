set -u
. '/home/maoqh/projects/ordessa/control/design-loop/env.conf'
FE_RUN='/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/c7'
for l in common validate ledger sol material converge handoff; do . '/home/maoqh/projects/ordessa/control/design-loop/lib/'$l.sh; done
mkdir -p "$FE_TMP" "$FE_LOGS" "/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/c7/sol" "/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/c7/candidates"
printf 'S01|covered|core|projection|integration 1\n' > "$FE_TMP/sc.txt"
fn_sc_merge "$FE_TMP/sc.txt" R001
echo "status1=$(awk -F'|' 'NR==2{print $2}' "$FE_SC")"
