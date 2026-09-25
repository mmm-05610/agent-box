set -u
. '/home/maoqh/projects/ordessa/control/design-loop/env.conf'
FE_RUN='/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/c11own'
for l in common validate ledger sol material converge handoff; do . '/home/maoqh/projects/ordessa/control/design-loop/lib/'$l.sh; done
mkdir -p "$FE_TMP" "$FE_LOGS" "/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/c11own/sol" "/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/c11own/candidates"
echo "runner=$(type -t fn_run_phase || echo absent)"
echo "worker=$(type -t fn_pure_call || echo absent)"
echo "supervisor=$(type -t cmd_start || echo absent)"
echo "budget=$(type -t fn_sol_reserve || echo present)"
echo "gate=$(type -t fn_validate_phase || echo present)"
echo "handoff=$(type -t fn_build_handoff_prompt || echo present)"
