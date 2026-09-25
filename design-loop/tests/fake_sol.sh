#!/usr/bin/env bash
# Stand-in for the Sol CLI so budget mechanics can be tested without a call.
# FAKE_SOL_MODE: ok | nodecision | crash
set -u
out=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    *) shift ;;
  esac
done
[ -n "$out" ] || { echo "fake_sol: no -o target" >&2; exit 2; }
cat > /dev/null
mode="${FAKE_SOL_MODE:-ok}"
case "$mode" in
  crash) echo "fake_sol: simulated transport failure" >&2; exit 1 ;;
  nodecision) printf 'I have some general thoughts about this design.\n' > "$out"; exit 0 ;;
  *) printf 'DECISION: converged\nVERDICT: this host core is the minimum that covers S01-S12\nCOUNTEREXAMPLE: none\nDISQUALIFIER: none\nUNCOVERED: none\nMAJOR: none\nMINOR: none\n' > "$out" ;;
esac
