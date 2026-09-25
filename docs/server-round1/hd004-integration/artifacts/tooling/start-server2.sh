#!/bin/bash
umask 077
REPO=/home/maoqh/projects/ordessa/worktrees/harness-desktop-002/bc-native
ROOT=/tmp/hd004-int-1790246856
PORT=46503
export HD003_LOG=$ROOT/peers2/peer HD003_PEER_ID=hd004-fake PYTHONPATH=$REPO/src HD004_FAKE_FIRST_CLOSE=unconfirmed
exec setsid $REPO/.venv/bin/python -m agent_box.server --data-root $ROOT/data2 --port $PORT --execution-mode native --plugin-root $ROOT/harness-fake --native-harness pi --native-adapter-command $(which node) --native-adapter-arg $REPO/tests/acp_orchestration/fixtures/bidirectional_acp_peer.mjs --native-continuation >>$ROOT/srv2.stderr 2>&1
