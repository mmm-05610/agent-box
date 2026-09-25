#!/usr/bin/env bash
# HD004-B real-Pi desktop acceptance — Desktop launcher (real Electron product).
#
# Run start-pi-server.sh first. The token file is created by that Server under
# <ACCEPT_ROOT>/data/secrets/http-token (mode 0600).
#
# Usage:  start-pi-desktop.sh [port]
# Env:    ACCEPT_ROOT (default $HOME/ordessa-acceptance/hd004b)
#         APP_HOME    app profile HOME; default is a fresh isolated dir.
#                     Set APP_HOME=$HOME to reuse your real desktop profile.
#                     (Pi login state is read by the Server-side process, so a
#                     fresh app profile does not break Pi authentication.)
set -euo pipefail

FE=/home/maoqh/projects/ordessa/worktrees/harness-desktop-002/fc-functional
PORT=${1:-57411}
ACCEPT_ROOT=${ACCEPT_ROOT:-$HOME/ordessa-acceptance/hd004b}
APP_HOME=${APP_HOME:-$ACCEPT_ROOT/app-profile}
TOKEN_FILE="$ACCEPT_ROOT/data/secrets/http-token"

[ -f "$TOKEN_FILE" ] || { echo "REFUSE: no token file yet — start-pi-server.sh first: $TOKEN_FILE"; exit 1; }
[ -x "$FE/node_modules/electron/dist/electron" ] || { echo "REFUSE: electron missing in $FE"; exit 1; }
[ -n "${DISPLAY:-}" ] || echo "note: DISPLAY is unset; the window needs an X/Wayland session"

umask 077
mkdir -p "$APP_HOME" "$ACCEPT_ROOT/state-logs"
cd "$FE/apps/desktop"
exec env -i \
  PATH=/usr/local/bin:/usr/bin:/bin \
  DISPLAY="${DISPLAY:-}" XAUTHORITY="${XAUTHORITY:-}" \
  HOME="$APP_HOME" XDG_CONFIG_HOME="$APP_HOME" XDG_CACHE_HOME="$APP_HOME" \
  MODULAR_USER_DATA="$APP_HOME" ORDESSA_EXTENSION_HOME="$APP_HOME" \
  ORDESSA_SERVER_ORIGIN="http://127.0.0.1:$PORT" \
  ORDESSA_SERVER_TOKEN_FILE="$TOKEN_FILE" \
  "$FE/node_modules/electron/dist/electron" \
  --no-sandbox --ozone-platform=x11 . \
  2>>"$ACCEPT_ROOT/state-logs/desktop.stderr"
