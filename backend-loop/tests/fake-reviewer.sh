#!/usr/bin/env bash
# fake-reviewer.sh — STAND-IN for the Sol reviewer inside C's controlled entry.
# NO model call, NO Sol. The real entry swaps in `codex review -m gpt-5.6-sol` only
# under I's approved launch. Central (cmd_sol) validates the output EXACTLY against
# the request: candidate_sha must equal the requested candidate's digest, and
# milestone/task/contract_version must echo the request.
#
# Candidate file carries markers:  MILESTONE: x | TASK: y | VERSION: z | MODE: ACCEPT|REJECT|INVALID|NONZERO
set -uo pipefail
cand="${1:?usage: fake-reviewer.sh <candidate-file>}"; [ -f "$cand" ] || { echo '{"error":"no-candidate"}'; exit 0; }
sha="$(sha256sum "$cand" | cut -d' ' -f1)"
mk="$(sed -n 's/^MILESTONE: //p' "$cand" | head -1)"
tk="$(sed -n 's/^TASK: //p' "$cand" | head -1)"
ver="$(sed -n 's/^VERSION: //p' "$cand" | head -1)"
mode="$(sed -n 's/^MODE: //p' "$cand" | head -1)"

case "$mode" in
  NONZERO) echo "reviewer crashed"; exit 9;;                       # exercises nonzero-exit -> not approved
  INVALID) echo 'not a json verdict'; exit 0;;                    # malformed -> central rejects
  REJECT)  printf '{"verdict":"reject","candidate_sha":"%s","task":"%s","milestone":"%s","contract_version":"%s","evidence_path":"%s","reason":"unresolved boundary counterexample"}\n' \
             "$sha" "$tk" "$mk" "$ver" "$cand"; exit 0;;
  MISMILE) # deliberately reports the WRONG milestone (wrong-milestone must not promote)
           printf '{"verdict":"accept","candidate_sha":"%s","task":"%s","milestone":"WRONG-%s","contract_version":"%s","evidence_path":"%s","reason":"x"}\n' \
             "$sha" "$tk" "$mk" "$ver" "$cand"; exit 0;;
  MISVER)  printf '{"verdict":"accept","candidate_sha":"%s","task":"%s","milestone":"%s","contract_version":"WRONG","evidence_path":"%s","reason":"x"}\n' \
             "$sha" "$tk" "$mk" "$cand"; exit 0;;
  MISHA)   printf '{"verdict":"accept","candidate_sha":"deadbeef","task":"%s","milestone":"%s","contract_version":"%s","evidence_path":"%s","reason":"x"}\n' \
             "$tk" "$mk" "$ver" "$cand"; exit 0;;                 # wrong digest -> candidate-swap guard
  ACCEPT|'') printf '{"verdict":"accept","candidate_sha":"%s","task":"%s","milestone":"%s","contract_version":"%s","evidence_path":"%s","reason":"in-scope, no unresolved major counterexample"}\n' \
             "$sha" "$tk" "$mk" "$ver" "$cand"; exit 0;;
  *) echo '{"verdict":"maybe"}'; exit 0;;
esac
