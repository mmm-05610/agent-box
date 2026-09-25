fn_rulings_ensure
printf 'S01|claimed|core|mech|ev\n' > "$FE_TMP/sc.txt"; fn_sc_merge "$FE_TMP/sc.txt" R001
printf '# candidate one\n' > "$FE_RUN/candidates/best.md"
d=$(fn_best_digest)
printf 'R001|%s|sc|S01|trajectory_ok|section 4|\n' "$d" >> "$FE_RULINGS"
echo "ruled=$(fn_sc_covered)"
printf '# candidate one, edited after the ruling\n' > "$FE_RUN/candidates/best.md"
echo "after_edit=$(fn_sc_covered)"
echo "streak_after_edit=$(fn_clean_streak)"
