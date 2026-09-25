#!/usr/bin/env bash
# Native-loop probe. This is the small non-product task used to prove that
# /loop actually repeats, stops, and resumes — running a command or reading a
# task id is not evidence of any of those, so the counter lives in a file and
# every tick has to read it back from disk.
#
#   probe.sh tick   read the counter, advance it, print the line
#   probe.sh show   print the log tail and the totals
#   probe.sh reset  start a fresh probe run (the log is kept)
set -uo pipefail
. "$(dirname "$(readlink -f "$0")")/env.conf"

P="$FE_RUN/_loop-probe"
LOG="$P/ticks.log"
mkdir -p "$P"

case "${1:-show}" in
  tick)
    n=$( [ -f "$LOG" ] && awk -F= '/^tick=/{v=$2} END{print v+0}' "$LOG" || echo 0 )
    n=$((n+1))
    printf 'tick=%s at=%s pid=%s host=%s\n' "$n" "$(date -u +%FT%TZ)" "$$" "$HOSTNAME" >> "$LOG"
    printf 'PROBE tick=%s total_lines=%s last=%s\n' "$n" "$(wc -l < "$LOG" | tr -d ' ')" "$(tail -1 "$LOG")"
    ;;
  reset)
    printf 'probe-reset at=%s previous_lines=%s\n' "$(date -u +%FT%TZ)" \
      "$( [ -f "$LOG" ] && wc -l < "$LOG" | tr -d ' ' || echo 0 )" >> "$LOG"
    printf 'PROBE reset; log preserved at %s\n' "$LOG"
    ;;
  show)
    printf 'log: %s\nlines: %s\n' "$LOG" "$( [ -f "$LOG" ] && wc -l < "$LOG" | tr -d ' ' || echo 0 )"
    tail -5 "$LOG" 2>/dev/null
    ;;
  *) printf 'usage: probe.sh {tick|show|reset}\n' >&2; exit 2 ;;
esac
