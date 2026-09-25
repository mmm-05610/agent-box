fn_sol_init >/dev/null; fn_sol_reserve key "r" "k1" >/dev/null
sed -i 's/^SOL_CAP=.*/SOL_CAP=ten/' "$FE_SOL_BUDGET_ENV"
fn_sol_reserve key "r" "k2" >/dev/null 2>&1; echo "nonnumeric=$?"
sed -i 's/^SOL_CAP=.*/SOL_CAP=10/' "$FE_SOL_BUDGET_ENV"
fn_sol_reserve key "r" "k2" >/dev/null 2>&1; echo "repaired=$?"
printf 'garbage-row\n' >> "$FE_SOL_BUDGET_LOG"
fn_sol_reserve key "r" "k3" >/dev/null 2>&1; echo "malformed_log=$?"
fn_sol_init >/dev/null 2>&1; echo "init_over_malformed=$?"
