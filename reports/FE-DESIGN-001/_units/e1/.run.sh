set -u
. '/home/maoqh/projects/ordessa/control/design-loop/env.conf'
FE_RUN='/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/e1'
for l in common validate ledger sol material converge handoff; do . '/home/maoqh/projects/ordessa/control/design-loop/lib/'$l.sh; done
mkdir -p "$FE_TMP" "$FE_LOGS" "/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/e1/sol" "/home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_units/e1/candidates"
fn_sol_init >/dev/null
mkdir -p "$FE_RUN/rounds/R007"
printf 'CANDIDATES: A\nDIMENSION: D01-order-dedup\n' > "$FE_RUN/rounds/R007/plan.md"
printf 'DIMENSION: D01-order-dedup\n' > "$FE_RUN/rounds/R007/dimension.txt"
printf '# candidate round one\nfirst saved bytes\n' > "$FE_RUN/candidates/best.md"
d1=$(fn_best_digest)
pad=$(python3 -c 'print("word here now "*700, end="")')
f1="$FE_RUN/e1a.txt"
{ printf '<<<FE-OUT-START>>>\n%s\nCHANGES_VS_PREVIOUS: added the anchor test\ninterface Resource { id: ResourceId }\nfunc subscribe(id: ResourceId, from: Cursor) -> Stream\nfunc invoke(id: ResourceId, action: ActionName, params: Value) -> Result\ntype Cursor = { ns: NamespaceId, seq: SeqNo }\ninterface ViewResolver { resolve(kind: Kind) -> ViewKind }\nfunc cursorResolve(id: ResourceId) -> Cursor\n```python\nprint("cursor semantics")\n```\n```python\nprint("gap marker survives")\n```\n```python\nprint("simpler scope passes S08")\n```\n<<<FE-OUT-END>>>\n' "$pad"
  printf '<<<FE-OUT-START>>>\n%s\n# candidate round two, deliberately different bytes\n<<<FE-OUT-END>>>\n' "$pad"
  printf '<<<FE-LEDGER-START>>>\nFE-CE-001|R007|major|OPEN|inv|t|e|-\n<<<FE-LEDGER-END>>>\n'
  printf '<<<FE-SCENARIO-START>>>\n'
  for i in $(seq 1 12); do printf 'S%02d|covered|core|mech|int %d\n' "$i" "$i"; done
  printf '<<<FE-SCENARIO-END>>>\n'
  printf '<<<FE-MECH-START>>>\nm1|core|S09 breaks|integration 1\n<<<FE-MECH-END>>>\n'
  printf '<<<FE-REPLAY-START>>>\nFE-CE-001|pass|seq|anchor\n<<<FE-REPLAY-END>>>\n'; } > "$f1"
fn_accept integrator R007 "$f1" >/dev/null 2>&1; echo "accept=$?"
d2=$(fn_best_digest)
echo "moved=$([ "$d1" != "$d2" ] && echo yes || echo no)"
echo "identical=$(cmp -s "$FE_RUN/rounds/R007/best-candidate.md" "$FE_RUN/candidates/best.md" && echo yes || echo no)"
echo "archived=$(ls "$FE_RUN"/candidates/cand-A.R007.md >/dev/null 2>&1 && echo yes || echo no)"
