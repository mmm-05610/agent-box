# lib/experiment.sh — a verifier may ask for ONE small executable model
# experiment. This is the only place model-produced text ever reaches an
# interpreter, so the limits are spelled out:
#   * at most one experiment per round, python3 only, hard timeout
#   * isolated interpreter, cwd confined to the run directory, ulimits on cpu/
#     filesize/core dump, output capped, transcript recorded in full
#   * it is NOT sandboxed against the filesystem: the controller has no
#     privilege to sandbox with. It only ever writes inside $FE_RUN, and the
#     record must never be described as product verification.

fn_extract_experiment(){ # <content-file> <out-file> ; 1 = none present
  local cf="$1" o="$2"
  awk '/^EXPERIMENT:[[:space:]]*$/{f=1; next}
       f==1 && /^```/{ if (inb==0) {inb=1; next} else {exit} }
       inb==1 {print}' "$cf" > "$o"
  [ -s "$o" ]
}

fn_run_experiment(){ # <round> <content-file>
  local r="$1" cf="$2" d code rc
  [ "$FE_EXPERIMENTS" = 1 ] || return 0
  d="$FE_RUN/experiments/$(fn_rid "$r")"
  mkdir -p "$d"
  code="$d/experiment.py"
  fn_extract_experiment "$cf" "$code" || { fn_note "R$((r)): no experiment requested"; return 0; }
  if [ "$(wc -c < "$code")" -gt "$FE_EXPERIMENT_MAX_BYTES" ]; then
    fn_note "R$((r)): experiment too large, refused"
    return 0
  fi
  fn_note "R$((r)): running verifier experiment (timeout ${FE_EXPERIMENT_TIMEOUT}s)"
  ( cd "$d" && ulimit -f 20000 -t "$FE_EXPERIMENT_TIMEOUT" -c 0 2>/dev/null
    timeout --signal=KILL "$FE_EXPERIMENT_TIMEOUT" python3 -I -B "$code" ) \
    > "$d/transcript.txt" 2>&1
  rc=$?
  {
    printf '# experiment record — round %s\n\n' "$(fn_rid "$r")"
    printf 'run at: %s\nexit code: %s\ntimeout: %ss interpreter: python3 -I -B\n' \
      "$(date -u +%FT%TZ)" "$rc" "$FE_EXPERIMENT_TIMEOUT"
    printf 'cwd: %s (confined to the run directory; ulimits on cpu/filesize/core)\n\n' "$d"
    printf '## status\n\n'
    if [ "$rc" = 0 ]; then printf 'ran to completion\n\n'; else printf 'did NOT complete normally (exit %s)\n\n' "$rc"; fi
    printf '## source\n\n```python\n'; cat "$code"; printf '```\n\n## transcript\n\n```\n'; head -c 20000 "$d/transcript.txt"; printf '\n```\n\n'
    printf '**Limits of this evidence:** it exercises only the model encoded above.\n'
    printf 'It is not, and may not be cited as, verification of the real product,\n'
    printf 'the real protocol, the real UI or the real service.\n'
  } | fn_write "$d/record.md"
  fn_note "R$((r)): experiment finished rc=$rc, record at $d/record.md"
  return 0
}
