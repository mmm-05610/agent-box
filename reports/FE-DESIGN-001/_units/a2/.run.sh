set -u
. '/home/maoqh/projects/ordessa/control/design-loop/env.conf'
FE_RUN='/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/a2'
for l in common validate ledger sol material converge handoff; do . '/home/maoqh/projects/ordessa/control/design-loop/lib/'$l.sh; done
mkdir -p "$FE_TMP" "$FE_LOGS" "/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/a2/sol" "/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/a2/candidates"
fn_sol_init >/dev/null
cid=$(fn_sol_reserve key "reason" "k1")
echo "cid_prefix=$(printf %s "$cid" | cut -c1-6)"
echo "pending=$(awk -F'|' 'NR>1 && $6=="PENDING"{n++} END{print n+0}' "$FE_SOL_BUDGET_LOG")"
echo "reserved=$(fn_sol_raw SOL_RESERVED)"
fn_sol_complete "$cid" ok
echo "closed=$(awk -F'|' 'NR>1 && $6=="ok"{n++} END{print n+0}' "$FE_SOL_BUDGET_LOG")"
echo "after=$(fn_sol_raw SOL_RESERVED) ok=$(fn_sol_raw SOL_OK)"
