#!/usr/bin/env bash
set -euo pipefail

# Read-only checkpoint preflight. Git staging remains an explicit human action.
test -d src/agent_box/work_core
test -d plugins/agent-box-web/frontend
test -d plugins/agent-box-web/src/agent_box_web/_static
echo 'checkpoint preflight passed; no files were staged'
