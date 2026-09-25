fn_sol_init >/dev/null
c1=$(fn_sol_reserve key "r" "k1"); c2=$(fn_sol_reserve key "r" "k2")
fn_sol_complete "SOL-99-nothing" ok >/dev/null 2>&1; echo "bogus=$?"
fn_sol_complete "$c2" ok >/dev/null 2>&1; echo "out_of_order=$?"
echo "c1_pending=$(awk -F'|' -v c="$c1" 'NR>1 && $8==c && $6=="PENDING"{n++} END{print n+0}' "$FE_SOL_BUDGET_LOG")"
echo "c2_ok=$(awk -F'|' -v c="$c2" 'NR>1 && $8==c && $6=="ok"{n++} END{print n+0}' "$FE_SOL_BUDGET_LOG")"
fn_sol_complete "$c2" bad >/dev/null 2>&1; echo "reclose=$?"
echo "bad=$(fn_sol_raw SOL_BAD)"
