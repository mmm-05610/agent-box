# lib/model.sh — model execution only. The controller keeps every permission;
# workers run with all tools disabled, no session persistence, no plugins and no
# settings sources, so a role can neither read nor write anything by itself.
# Material is curated by the controller and handed over as a prompt file.

fn_children_file(){ printf '%s/children.pids\n' "$FE_LOGS"; }
fn_track_child(){ printf '%s %s %s\n' "$1" "$2" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$(fn_children_file)"; }
fn_untrack_child(){
  local f; f=$(fn_children_file)
  [ -f "$f" ] || return 0
  grep -v "^$1 " "$f" > "$f.k" 2>/dev/null || : > "$f.k"
  mv -f "$f.k" "$f"
}

fn_kill_child(){ # fn_kill_child <pid> — group kill; only pids we recorded
  local p="$1" i=0
  fn_pid_alive "$p" || return 0
  kill -TERM -"$p" 2>/dev/null || kill -TERM "$p" 2>/dev/null || true
  while [ $i -lt 100 ] && fn_pid_alive "$p"; do sleep 0.1; i=$((i+1)); done
  if fn_pid_alive "$p"; then
    kill -KILL -"$p" 2>/dev/null || kill -KILL "$p" 2>/dev/null || true
  fi
  return 0
}

# fn_pure_call <tag> <model> <timeout_s> <stdout_file> <stdin_file>
# Flag order mirrors the verified smoke call: -p --model X --tools "" ...
fn_pure_call(){
  local tag="$1" model="$2" tmo="$3" outf="$4" inf="$5"
  local errf="$FE_LOGS/${tag}.stderr.txt" rc p
  mkdir -p "$FE_LOGS" "$(dirname "$outf")"
  fn_reserve_path "$outf"
  : > "$outf"; : > "$errf"

  set -m
  timeout --signal=TERM --kill-after=10 "$tmo" \
    "$QODERCLI" -p --model "$model" --tools "" \
      --no-session-persistence --output-format text \
      --max-output-tokens "$FE_WORKER_MAX_OUTPUT_TOKENS" \
      < "$inf" > "$outf" 2> "$errf" &
  p=$!
  fn_track_child "$p" "$tag"
  wait "$p" 2>/dev/null; rc=$?
  set +m
  fn_untrack_child "$p"

  if [ "$rc" -ne 0 ]; then
    fn_note "$tag: exit=$rc (124=timeout) stderr_tail=$(tail -c 240 "$errf" | tr '\n' ' ')"
    return 1
  fi
  if [ ! -s "$outf" ]; then
    fn_note "$tag: exit=0 but empty stdout"
    return 1
  fi
  return 0
}

# Sol review: the user-specified Codex model only. Reached solely through
# sol-review.sh, which owns the budget decrement.
fn_sol_call(){ # fn_sol_call <timeout_s> <stdout_file> <stdin_file>
  local tmo="$1" outf="$2" inf="$3"
  local errf="$FE_LOGS/sol.stderr.txt" rc p
  mkdir -p "$FE_LOGS"
  fn_reserve_path "$outf"
  : > "$outf"; : > "$errf"

  set -m
  timeout --signal=TERM --kill-after=10 "$tmo" \
    "$CODEX" exec -m "$FE_SOL_MODEL" -s read-only --ephemeral \
      --skip-git-repo-check --color never \
      -C "$FE_RUN" \
      -o "$outf" - < "$inf" > "$FE_LOGS/sol.stream.txt" 2> "$errf" &
  p=$!
  fn_track_child "$p" "sol"
  wait "$p" 2>/dev/null; rc=$?
  set +m
  fn_untrack_child "$p"

  if [ "$rc" -ne 0 ]; then
    fn_note "sol: exit=$rc stderr_tail=$(tail -c 240 "$errf" | tr '\n' ' ')"
    return 1
  fi
  [ -s "$outf" ] || { fn_note "sol: exit=0 but no last message"; return 1; }
  return 0
}
