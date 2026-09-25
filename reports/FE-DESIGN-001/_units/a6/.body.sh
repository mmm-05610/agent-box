fn_sol_init >/dev/null
fn_sol_reserve key "r" "k1" >/dev/null
rm -f "$FE_SOL_BUDGET_ENV"
fn_sol_reserve key "r" "ky" >/dev/null 2>&1; echo "missing=$?"
grep -q "budget-file-missing" "$FE_RUN/sol-denied" && echo reason_recorded
rm -f "$FE_RUN/sol-denied"; fn_sol_init >/dev/null 2>&1; echo "reinit_over_missing=$?"
echo "after_init=$(fn_sol_raw SOL_RESERVED)"
