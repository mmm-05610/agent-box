set -u
. '/home/maoqh/projects/ordessa/control/design-loop/env.conf'
FE_RUN='/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/a6b'
for l in common validate ledger sol material converge handoff; do . '/home/maoqh/projects/ordessa/control/design-loop/lib/'$l.sh; done
mkdir -p "$FE_TMP" "$FE_LOGS" "/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/a6b/sol" "/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/a6b/candidates"
fn_sol_init >/dev/null; fn_sol_reserve key "r" "k1" >/dev/null
sed -i 's/^SOL_CAP=.*/SOL_CAP=ten/' "$FE_SOL_BUDGET_ENV"
fn_sol_reserve key "r" "k2" >/dev/null 2>&1; echo "nonnumeric=$?"
sed -i 's/^SOL_CAP=.*/SOL_CAP=10/' "$FE_SOL_BUDGET_ENV"
fn_sol_reserve key "r" "k2" >/dev/null 2>&1; echo "repaired=$?"
printf 'garbage-row\n' >> "$FE_SOL_BUDGET_LOG"
fn_sol_reserve key "r" "k3" >/dev/null 2>&1; echo "malformed_log=$?"
fn_sol_init >/dev/null 2>&1; echo "init_over_malformed=$?"
