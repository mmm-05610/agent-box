fn_sol_init >/dev/null
fn_sol_reserve key "r" "k1" >/dev/null; fn_sol_reserve key "r" "k2" >/dev/null
sed -i 's|^SOL_RESERVED=.*|SOL_RESERVED=0|' "$FE_SOL_BUDGET_ENV"
fn_sol_reserve key "r" "k3" >/dev/null 2>&1; echo "after_clobber=$?"
echo "healed=$(fn_sol_raw SOL_RESERVED)"
