#!/usr/bin/env bash
# HD004-B real-Pi desktop acceptance — Server launcher (production CLI, real sockets).
#
# Everything lives under a stable project-internal path: the bridge is the
# rebuilt pinned artifact in $REPO/runtime/tools/acp-adapter, never /tmp.
# No model call happens at launch; the first user prompt does.
#
# Usage:  start-pi-server.sh [port]
# Env:    ACCEPT_ROOT (default $HOME/ordessa-acceptance/hd004b)
set -euo pipefail

REPO=/home/maoqh/projects/ordessa/worktrees/harness-desktop-002/bc-native
PORT=${1:-57411}
ACCEPT_ROOT=${ACCEPT_ROOT:-$HOME/ordessa-acceptance/hd004b}

BRIDGE=$REPO/runtime/tools/acp-adapter/acp-adapter
BRIDGE_SHA=7a727bdb5a8d6f569ad3adf22e7b43fbd70bbfa82bc86ee0eb75e0cd1a9fac68
PI=${PI:-/home/maoqh/.pi/agent/install/releases/0.86.1/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js}
PI_SHA=e79626f2dd6f94aa45d30f3fa63cd84319a6eefcd150b353cfaf274366926774

# --- preflight (refuses rather than degrades) -------------------------------
[ -x "$BRIDGE" ] || { echo "REFUSE: bridge missing/not executable: $BRIDGE"; exit 1; }
[ "$(sha256sum "$BRIDGE" | cut -d' ' -f1)" = "$BRIDGE_SHA" ] || { echo "REFUSE: bridge digest mismatch (rebuilt? re-record it)"; exit 1; }
[ "$(sha256sum "$PI" | cut -d' ' -f1)" = "$PI_SHA" ] || { echo "REFUSE: pi bundle digest mismatch: $PI"; exit 1; }
[ "$(cat /home/maoqh/.pi/agent/install/current-version 2>/dev/null | tr -d '[:space:]')" = "0.86.1" ] || { echo "REFUSE: pi current-version is not 0.86.1"; exit 1; }
for k in PI_ARGS PI_PROVIDER PI_MODEL PI_BIN PI_SESSION_DIR PI_DISABLE_GATE PI_CODING_AGENT_DIR PI_MANAGED_INSTALL_ROOT; do
  [ -z "${!k:-}" ] || { echo "REFUSE: Pi overlay $k is set — unset it for a clean acceptance run"; exit 1; }
done
if command -v ss >/dev/null && ss -ltn "sport = :$PORT" | grep -q LISTEN; then
  echo "REFUSE: port $PORT is already in use"
  exit 1
fi

umask 077
mkdir -p "$ACCEPT_ROOT"/{project,pi-sessions,state-logs}

# --- launch -----------------------------------------------------------------
# --trace-json writes the raw ACP frames of the real bridge to a file; it is the
# cheapest way to prove the first draft send delivered exactly one prompt.
exec setsid "$REPO/.venv/bin/python" -m agent_box.server \
  --data-root "$ACCEPT_ROOT/data" \
  --port "$PORT" \
  --execution-mode native \
  --plugin-root "$REPO/plugins/agent-box-harness" \
  --native-harness pi \
  --native-adapter-command "$BRIDGE" \
  --native-adapter-arg=--adapter=pi \
  --native-adapter-arg=--pi-bin="$PI" \
  --native-adapter-arg=--pi-session-dir="$ACCEPT_ROOT/pi-sessions" \
  --native-adapter-arg=--trace-json \
  --native-adapter-arg=--trace-json-file="$ACCEPT_ROOT/state-logs/pi-acp-frames.jsonl" \
  --native-continuation \
  2>>"$ACCEPT_ROOT/state-logs/server.stderr"
