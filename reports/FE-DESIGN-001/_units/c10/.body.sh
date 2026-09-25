fn_sol_init >/dev/null 2>&1
printf 'FE-CE-001|R001|major|CLOSED|invariant A|t|e|-\n' > "$FE_TMP/in.txt"; fn_ce_merge "$FE_TMP/in.txt" R001
printf 'S01|claimed|core|mech|ev\nS02|claimed|core|mech|ev\n' > "$FE_TMP/sc.txt"; fn_sc_merge "$FE_TMP/sc.txt" R001
printf 'projection registry|core|S09 loses truth|integration 1\n' > "$FE_TMP/m.txt"; fn_mech_merge "$FE_TMP/m.txt" 1
printf '# c\n' > "$FE_RUN/candidates/best.md"
printf 'round|holds|new|closed|clean|note|digest\nR001|0|0|0|1|dim D01|\nR002|0|0|0|1|dim D02|\nR003|0|0|0|1|dim D03|\n' > "$FE_RUN/rounds.tsv"
fn_convergence_check
