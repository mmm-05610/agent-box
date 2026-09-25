set -u
. '/home/maoqh/projects/ordessa/control/design-loop/env.conf'
FE_RUN='/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/e6'
for l in common validate ledger sol material converge handoff; do . '/home/maoqh/projects/ordessa/control/design-loop/lib/'$l.sh; done
mkdir -p "$FE_TMP" "$FE_LOGS" "/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/e6/sol" "/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/e6/candidates"
fn_sol_init >/dev/null
mkdir -p "$FE_RUN/rounds/R008"
printf 'CANDIDATES: A\nDIMENSION: D01-order-dedup\n' > "$FE_RUN/rounds/R008/plan.md"
printf 'DIMENSION: D01-order-dedup\n' > "$FE_RUN/rounds/R008/dimension.txt"
printf '# candidate round one\nfirst saved bytes\n' > "$FE_RUN/candidates/best.md"
printf 'FE-CE-001|R997|major|OPEN|inv|t|e|-\n' > "$FE_TMP/seed"
fn_ce_merge "$FE_TMP/seed" R997
fn_ce_set_subject FE-CE-001 B-alternative 'defect of a discarded alternative'
pad=$(python3 -c 'print("word here now "*250, end="")')
f="$FE_RUN/e6.txt"
{ printf '<<<FE-OUT-START>>>\n%s\nBOUNDARY_SCAN: none\nESCAPE_HATCH_SCAN: none\n<<<FE-OUT-END>>>\n' "$pad"
  printf '<<<FE-VERDICT-START>>>\n'
  for i in $(seq 1 12); do printf 'S%02d|trajectory_ok|s|n\n' "$i"; done
  printf '<<<FE-VERDICT-END>>>\n'
  printf '<<<FE-REPLAY-START>>>\nFE-CE-001|pass|attempted replay|anchor\n<<<FE-REPLAY-END>>>\n'; } > "$f"
fn_accept candidate-reviewer R008 "$f" >/dev/null 2>&1; echo "accept=$?"
d=$(fn_best_digest)
echo "verdict=$(awk -F'|' -v d="$d" '$2==d && $4=="FE-CE-001"{print $5}' "$FE_RULINGS" | tail -1)"
echo "still_open=$(awk -F'|' '$1=="FE-CE-001"{print $4}' "$FE_LEDGER")"
echo "replay_stamped=$(awk -F'|' '$1=="FE-CE-001"{print $9}' "$FE_LEDGER")"
