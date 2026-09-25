set -u
. '/home/maoqh/projects/ordessa/control/design-loop/env.conf'
FE_RUN='/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/a4'
for l in common validate ledger sol material converge handoff; do . '/home/maoqh/projects/ordessa/control/design-loop/lib/'$l.sh; done
mkdir -p "$FE_TMP" "$FE_LOGS" "/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/a4/sol" "/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/a4/candidates"
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
