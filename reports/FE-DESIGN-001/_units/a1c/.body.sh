fn_sol_init >/dev/null
fn_sol_reserve key "spent" "k1" >/dev/null
rm -f "$FE_SOL_BUDGET_LOG"
fn_sol_init >/dev/null 2>&1; rc=$?
echo "init=$rc"
