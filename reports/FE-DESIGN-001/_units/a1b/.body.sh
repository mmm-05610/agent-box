fn_sol_init >/dev/null
fn_sol_reserve key "spent" "k1" >/dev/null
fn_sol_init >/dev/null 2>&1
echo "reserved=$(fn_sol_raw SOL_RESERVED)"
