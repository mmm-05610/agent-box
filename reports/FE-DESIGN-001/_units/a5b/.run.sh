set -u
. '/home/maoqh/projects/ordessa/control/design-loop/env.conf'
FE_RUN='/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/a5b'
for l in common validate ledger sol material converge handoff; do . '/home/maoqh/projects/ordessa/control/design-loop/lib/'$l.sh; done
mkdir -p "$FE_TMP" "$FE_LOGS" "/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/a5b/sol" "/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/a5b/candidates"
fn_sol_init >/dev/null
c=$(fn_sol_reserve key "r" "same")
before=$(fn_sol_raw SOL_RESERVED)
fn_sol_reserve key "r" "same" >/dev/null 2>&1; echo "dup=$?"
echo "delta=$(( $(fn_sol_raw SOL_RESERVED) - before ))"
fn_sol_complete "$c" error >/dev/null 2>&1; echo "cerr=$?"
echo "after_error=$(fn_sol_raw SOL_RESERVED) bad=$(fn_sol_raw SOL_BAD)"
