set -u
. '/home/maoqh/projects/ordessa/control/design-loop/env.conf'
FE_RUN='/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/c11pos'
for l in common validate ledger sol material converge handoff; do . '/home/maoqh/projects/ordessa/control/design-loop/lib/'$l.sh; done
mkdir -p "$FE_TMP" "$FE_LOGS" "/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/c11pos/sol" "/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/c11pos/candidates"
rm -f "$FE_SOL_BUDGET_ENV" "$FE_SOL_BUDGET_LOG"
fn_convergence_check
