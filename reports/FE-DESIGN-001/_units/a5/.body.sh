fn_sol_init >/dev/null
i=1; while [ $i -le 8 ]; do fn_sol_reserve key "k" "kk-$i" >/dev/null 2>&1; i=$((i+1)); done
fn_sol_reserve key "past floor" "kk-x" >/dev/null 2>&1; echo "key_after_floor=$?"
fn_sol_reserve final "f1" "fin-1" >/dev/null 2>&1; echo "final1=$?"
fn_sol_reserve final "f2" "fin-2" >/dev/null 2>&1; echo "final2=$?"
fn_sol_reserve final "f3" "fin-3" >/dev/null 2>&1; echo "final3=$?"
fn_sol_reserve key "again" "kk-1" >/dev/null 2>&1; echo "dup=$?"
echo "reserved=$(fn_sol_raw SOL_RESERVED)"
