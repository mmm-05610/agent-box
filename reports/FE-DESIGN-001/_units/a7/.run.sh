set -u
. '/home/maoqh/projects/ordessa/control/design-loop/env.conf'
FE_RUN='/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/a7'
for l in common validate ledger sol material converge handoff; do . '/home/maoqh/projects/ordessa/control/design-loop/lib/'$l.sh; done
mkdir -p "$FE_TMP" "$FE_LOGS" "/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/a7/sol" "/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/a7/candidates"
fn_sol_init >/dev/null
fn_sol_auto_allowed && echo "auto=on" || echo "auto=off"
c=$(fn_sol_reserve key "r" "k1")
echo "pending_row=$(fn_sol_open_pending | wc -l | tr -d ' ')"
echo "status=$(fn_sol_status_line)"
