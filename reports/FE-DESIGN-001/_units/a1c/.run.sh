set -u
. '/home/maoqh/projects/ordessa/control/design-loop/env.conf'
FE_RUN='/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/a1c'
for l in common validate ledger sol material converge handoff; do . '/home/maoqh/projects/ordessa/control/design-loop/lib/'$l.sh; done
mkdir -p "$FE_TMP" "$FE_LOGS" "/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/a1c/sol" "/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/a1c/candidates"
fn_sol_init >/dev/null
fn_sol_reserve key "spent" "k1" >/dev/null
rm -f "$FE_SOL_BUDGET_LOG"
fn_sol_init >/dev/null 2>&1; rc=$?
echo "init=$rc"
