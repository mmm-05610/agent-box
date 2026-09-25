p='tests/unit.sh'
s=open(p).read()
D = r'''
# ================================================ D: retired path isolation ===
say "D  the retired supervisor cannot be reached from the active path"

# nothing the active entry loads may name the retired process supervisor
refs=$(grep -n 'lib/model.sh\|lib/phases.sh' "$DL/loopctl" "$DL/lib/"*.sh 2>/dev/null \
       | grep -v '^lib/model.sh\|^lib/phases.sh' | grep -vc '^\S*: *#' || true)
active_refs=$(FE_RUN="$CASE" bash -c "grep -l 'fn_run_phase\|fn_pure_call\|cmd_start' \
  '$DL/lib/common.sh' '$DL/lib/validate.sh' '$DL/lib/ledger.sh' '$DL/lib/sol.sh' \
  '$DL/lib/material.sh' '$DL/lib/converge.sh' '$DL/lib/handoff.sh' '$DL/loopctl' 2>/dev/null | wc -l" | tail -1)
expect "D1 no active library or entry point calls the retired runner" "$active_refs" "0"

# the retired verbs must refuse rather than half-run and spend calls
for v in start resume step; do
  out=$(FE_RUN="$RUN" "$DL/loop.sh" "$v" 2>&1 | head -1)
  rc=$(FE_RUN="$RUN" "$DL/loop.sh" "$v" >/dev/null 2>&1; echo $?)
  expect "D2 loop.sh $v refuses instead of supervising" "$rc" "64"
done

# and the active environment genuinely lacks the retired machinery
v=$(body <<'EOS'
echo "runner=$(type -t fn_run_phase || echo absent)"
echo "worker=$(type -t fn_pure_call || echo absent)"
echo "supervisor=$(type -t cmd_start || echo absent)"
echo "budget=$(type -t fn_sol_reserve || echo present)"
echo "gate=$(type -t fn_validate_phase || echo present)"
echo "handoff=$(type -t fn_build_handoff_prompt || echo present)"
EOS
)
expect "D3 the retired runner is absent in the active environment" "$(printf '%s' "$v" | sed -n 's/^runner=//p')" "absent"
expect "D3b the retired worker invoker is absent" "$(printf '%s' "$v" | sed -n 's/^worker=//p')" "absent"
expect "D3c the retired supervisor entry is absent" "$(printf '%s' "$v" | sed -n 's/^supervisor=//p')" "absent"
expect "D4 the three retained components are present" \
  "$(printf '%s' "$v" | grep -cE '=(present)$')" "3"
'''
marker = "\nprintf '\\n=== unit tests:"
assert marker in s, 'tally marker not found'
s = s.replace(marker, D + marker, 1)
open(p,'w').write(s)
print('inserted D section')
