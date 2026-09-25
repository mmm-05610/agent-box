set -u
. '/home/maoqh/projects/ordessa/control/design-loop/env.conf'
FE_RUN='/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/a1b'
for l in common validate ledger sol material converge handoff; do . '/home/maoqh/projects/ordessa/control/design-loop/lib/'$l.sh; done
mkdir -p "$FE_TMP" "$FE_LOGS" "/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/a1b/sol" "/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/a1b/candidates"
fn_sol_init >/dev/null
fn_sol_reserve key "spent" "k1" >/dev/null
fn_sol_init >/dev/null 2>&1
echo "reserved=$(fn_sol_raw SOL_RESERVED)"
