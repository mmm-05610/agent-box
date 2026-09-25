# everything looks perfect except nobody ever broke it
printf '# c\n' > "$FE_RUN/candidates/best.md"
d=$(fn_best_digest)
{ printf 'round|digest|kind|id|verdict|evidence\n'
  for i in $(seq 1 12); do printf 'R001|%s|sc|S%02d|trajectory_ok|section|\n' "$d" "$i"; done
} > "$FE_RULINGS"
printf '' > "$FE_SC"
for i in $(seq 1 12); do printf 'S%02d|claimed|core|mech|integration %d\n' "$i" "$i" >> "$FE_SC"; done
printf 'round|holds|new|closed|clean|note|digest\n' > "$FE_RUN/rounds.tsv"
for i in 1 2 3; do printf 'R00%d|0|0|0|1|dim D0%d|%s\n' "$i" "$i" "$d" >> "$FE_RUN/rounds.tsv"; done
fn_convergence_check
