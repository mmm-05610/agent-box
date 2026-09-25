#!/usr/bin/env bash
# HD004 controlled integration — Server #1 launcher (production CLI, real sockets).
# Usage: start-server1.sh <port> ; ROOT comes from /tmp/hd004-root.txt
set -euo pipefail
REPO=/home/maoqh/projects/ordessa/worktrees/harness-desktop-002/bc-native
ROOT=$(cat /tmp/hd004-root.txt)
PORT=$1
umask 077
export HD003_LOG="$ROOT/peers/peer"
export HD003_PEER_ID=hd004-main
export PYTHONPATH="$REPO/src"
exec setsid "$REPO/.venv/bin/python" -m agent_box.server \
  --data-root "$ROOT/data" \
  --port "$PORT" \
  --execution-mode native \
  --plugin-root "$REPO/plugins/agent-box-harness" \
  --native-harness pi \
  --native-adapter-command "$(which node)" \
  --native-adapter-arg "$REPO/tests/acp_orchestration/fixtures/bidirectional_acp_peer.mjs" \
  --native-continuation \
  >>"$ROOT/srv1.stderr" 2>&1
