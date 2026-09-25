#!/usr/bin/env bash
# HD004 — real Desktop launcher: Electron + built product, paired to Server #1 env-only.
set -euo pipefail
FE=/home/maoqh/projects/ordessa/worktrees/harness-desktop-002/fc-functional
ROOT=$(cat /tmp/hd004-root.txt)
PORT=$(cat $ROOT/port1.txt)
DEBUG=$1
umask 077
mkdir -p "$ROOT/euser"
cd "$FE/apps/desktop"
exec env -i \
  PATH=/usr/local/bin:/usr/bin:/bin \
  DISPLAY="$DISPLAY" XAUTHORITY="${XAUTHORITY:-}" \
  HOME="$ROOT/euser" XDG_CONFIG_HOME="$ROOT/euser" XDG_CACHE_HOME="$ROOT/euser" \
  MODULAR_USER_DATA="$ROOT/euser" ORDESSA_EXTENSION_HOME="$ROOT/euser" \
  ORDESSA_SERVER_ORIGIN="http://127.0.0.1:$PORT" \
  ORDESSA_SERVER_TOKEN_FILE="$ROOT/data/secrets/http-token" \
  "$FE/node_modules/electron/dist/electron" \
  --no-sandbox --disable-gpu --ozone-platform=x11 \
  --remote-debugging-port="$DEBUG" . \
  >>"$ROOT/desk1.out" 2>&1
