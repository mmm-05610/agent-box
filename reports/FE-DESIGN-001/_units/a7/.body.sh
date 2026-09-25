fn_sol_init >/dev/null
fn_sol_auto_allowed && echo "auto=on" || echo "auto=off"
c=$(fn_sol_reserve key "r" "k1")
echo "pending_row=$(fn_sol_open_pending | wc -l | tr -d ' ')"
echo "status=$(fn_sol_status_line)"
