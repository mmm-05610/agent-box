#!/usr/bin/env bash
# history.jsonl redirection test — pure env-var, NO bind-mount.
# Run: bash history_test.sh
# In the claude REPL: type a message, Enter, wait for reply, type /exit, Enter.
# (If claude asks "Do you trust the files in this folder?" — press y, Enter, then your message.)
set -u

# 1. Pull real auth from ~/.claude/settings.json (not printed)
eval "$(python3 - <<'PY'
import json,os
d=json.load(open(os.path.expanduser("~/.claude/settings.json")))
for k in ("ANTHROPIC_AUTH_TOKEN","ANTHROPIC_BASE_URL","ANTHROPIC_MODEL"):
    v=d.get("env",{}).get(k)
    if v: print(f"export {k}={v!r}")
PY
)"
[ -n "${ANTHROPIC_AUTH_TOKEN:-}" ] || { echo "no auth token found in settings.json"; exit 1; }

# 2. Fresh empty config dir — pure redirect, nothing seeded
T=$(mktemp -d /tmp/cc-hist.XXXXXX)
echo "temp config dir: $T"

# 3. Snapshot real ~/.claude
REAL=~/.claude
RH="$REAL/history.jsonl"
before=$(wc -c < "$RH" 2>/dev/null || echo 0)
( cd "$REAL" && find . -type f -printf '%p %s %T@\n' | sort ) > "$T/../hist_real_before.txt"
echo "real history.jsonl BEFORE: $before bytes"

# 4. Launch claude interactively under CLAUDE_CONFIG_DIR (NO bwrap, NO bind)
echo "============================================================"
echo "claude starting. Type any message + Enter, wait for reply,"
echo "then /exit + Enter. (auth = your GLM proxy token)"
echo "============================================================"
cd /tmp
CLAUDE_CONFIG_DIR="$T" claude
echo "============================================================"
echo "claude exited. Analyzing..."
echo "============================================================"

# 5. What landed in TEMP?
echo "=== TEMP config dir contents (pure env-var redirect) ==="
( cd "$T" && find . -type f -printf '%p %s\n' | sort )

# 6. Did real ~/.claude change?
echo
echo "=== REAL ~/.claude holdout check ==="
( cd "$REAL" && find . -type f -printf '%p %s %T@\n' | sort ) > "$T/../hist_real_after.txt"
if diff -q "$T/../hist_real_before.txt" "$T/../hist_real_after.txt" >/dev/null; then
  echo "(real ~/.claude UNCHANGED)"
else
  echo "REAL ~/.claude CHANGED — holdout writes detected:"
  diff "$T/../hist_real_before.txt" "$T/../hist_real_after.txt" | head -20
fi
after=$(wc -c < "$RH" 2>/dev/null || echo 0)
echo "real history.jsonl AFTER: $after bytes (was $before)"

# 7. Verdict
echo
echo "=== VERDICT ==="
if [ -f "$T/history.jsonl" ]; then
  echo "history.jsonl IS in temp config dir  -> REDIRECTS via CLAUDE_CONFIG_DIR"
elif [ "$after" != "$before" ]; then
  echo "history.jsonl NOT in temp, real one GREW -> HOLDOUT (writes to real ~/.claude)"
else
  echo "history.jsonl nowhere -> prompt may not have been submitted; re-run and be sure to send a message"
fi

# 8. Cleanup
rm -rf "$T" "$T/../hist_real_before.txt" "$T/../hist_real_after.txt"
echo "cleaned up"
