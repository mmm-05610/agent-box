#!/usr/bin/env bash
# Round H real-Pi desktop acceptance — Server launcher.
#
# Same preflight shape as start-pi-server.sh, pinned to the CURRENT bridge:
# the Round H artifact reproducible from ~/ordessa-builds/acp-adapter
# branch work/round-h (see runtime/tools/acp-adapter/BUILD-RECORD.md and
# that repo's docs/BUILD-RECORD-ROUND-H.md). Binaries stay untracked;
# the digest below is verified at every launch.
#
# Usage:  start-pi-server-round-h.sh [port]
# Env:    ACCEPT_ROOT (default $HOME/ordessa-acceptance/round-h-cp)
set -euo pipefail

REPO=/home/maoqh/projects/ordessa/worktrees/harness-desktop-002/bc-native
PORT=${1:-57415}
ACCEPT_ROOT=${ACCEPT_ROOT:-$HOME/ordessa-acceptance/round-h-cp}

BRIDGE=$REPO/runtime/tools/acp-adapter/acp-adapter-round-h
BRIDGE_SHA=5fd6a37b127274eef5c2f27fe731a720e32e9bd64efd6df23e61fe739bbc61ea
PI=${PI:-/home/maoqh/.pi/agent/install/releases/0.86.1/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js}
PI_SHA=e79626f2dd6f94aa45d30f3fa63cd84319a6eefcd150b353cfaf274366926774

# --- preflight (refuses rather than degrades) -------------------------------
[ -x "$BRIDGE" ] || { echo "REFUSE: bridge missing/not executable: $BRIDGE"; exit 1; }
[ "$(sha256sum "$BRIDGE" | cut -d' ' -f1)" = "$BRIDGE_SHA" ] || { echo "REFUSE: bridge digest mismatch (rebuild via the acp-adapter repo scripts/build-round-h.sh and re-copy)"; exit 1; }
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
