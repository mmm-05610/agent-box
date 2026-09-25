#!/bin/bash
REPO=/home/maoqh/projects/ordessa/worktrees/harness-desktop-002/bc-native
FE=/home/maoqh/projects/ordessa/worktrees/harness-desktop-002/fc-functional
ROOT=/tmp/hd004-int-1790246856
PORT=46503
DEBUG=38197
mkdir -p $ROOT/euser2
cd $FE/apps/desktop
exec env -i PATH=/usr/local/bin:/usr/bin:/bin DISPLAY=$DISPLAY XAUTHORITY=$XAUTHORITY HOME=$ROOT/euser2 XDG_CONFIG_HOME=$ROOT/euser2 XDG_CACHE_HOME=$ROOT/euser2 MODULAR_USER_DATA=$ROOT/euser2 ORDESSA_EXTENSION_HOME=$ROOT/euser2 ORDESSA_SERVER_ORIGIN=http://127.0.0.1:$PORT ORDESSA_SERVER_TOKEN_FILE=$ROOT/data2/secrets/http-token $FE/node_modules/electron/dist/electron --no-sandbox --disable-gpu --ozone-platform=x11 --remote-debugging-port=$DEBUG . >>$ROOT/desk2.out 2>&1
