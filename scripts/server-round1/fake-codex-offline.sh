#!/bin/sh
# Deterministic transport fixture. It never contacts a model or network service.
set -eu

test -r "$CODEX_HOME/auth.json"
prompt=$(cat)
thread="offline-native-thread-123"
session="$CODEX_HOME/sessions/2026/09/13/rollout-$thread.jsonl"

if [ "${2:-}" = "resume" ]; then
  test "${3:-}" = "$thread"
  test -f "$session"
  value=$(cat "$session")
else
  value=${prompt##* }
  mkdir -p "$(dirname "$session")"
  printf '%s' "$value" > "$session"
fi

printf '{"type":"thread.started","thread_id":"%s"}\n' "$thread"
printf '{"type":"item.completed","item":{"type":"agent_message","text":"%s"}}\n' "$value"
printf '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}\n'
