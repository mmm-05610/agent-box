set -u
. '/home/maoqh/projects/ordessa/control/design-loop/env.conf'
FE_RUN='/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/a6'
for l in common validate ledger sol material converge handoff; do . '/home/maoqh/projects/ordessa/control/design-loop/lib/'$l.sh; done
mkdir -p "$FE_TMP" "$FE_LOGS" "/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/a6/sol" "/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/a6/candidates"
fn_sol_init >/dev/null
fn_sol_reserve key "r" "k1" >/dev/null
rm -f "$FE_SOL_BUDGET_ENV"
fn_sol_reserve key "r" "ky" >/dev/null 2>&1; echo "missing=$?"
grep -q "budget-file-missing" "$FE_RUN/sol-denied" && echo reason_recorded
rm -f "$FE_RUN/sol-denied"; fn_sol_init >/dev/null 2>&1; echo "reinit_over_missing=$?"
echo "after_init=$(fn_sol_raw SOL_RESERVED)"
