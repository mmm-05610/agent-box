set -u
. '/home/maoqh/projects/ordessa/control/design-loop/env.conf'
FE_RUN='/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/a1'
for l in common validate ledger sol material converge handoff; do . '/home/maoqh/projects/ordessa/control/design-loop/lib/'$l.sh; done
mkdir -p "$FE_TMP" "$FE_LOGS" "/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/a1/sol" "/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/a1/candidates"
fn_sol_init >/dev/null
fn_sol_init >/dev/null
echo "v=$(fn_sol_raw SOL_RESERVED)/$(fn_sol_raw SOL_CAP)/$(fn_sol_raw SOL_FINAL_RESERVE)"
