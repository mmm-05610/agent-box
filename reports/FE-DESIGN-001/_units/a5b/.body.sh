fn_sol_init >/dev/null
c=$(fn_sol_reserve key "r" "same")
before=$(fn_sol_raw SOL_RESERVED)
fn_sol_reserve key "r" "same" >/dev/null 2>&1; echo "dup=$?"
echo "delta=$(( $(fn_sol_raw SOL_RESERVED) - before ))"
fn_sol_complete "$c" error >/dev/null 2>&1; echo "cerr=$?"
echo "after_error=$(fn_sol_raw SOL_RESERVED) bad=$(fn_sol_raw SOL_BAD)"
