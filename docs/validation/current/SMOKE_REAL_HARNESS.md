# Agent-Box Studio — 人工真实凭据 Smoke Test 指南

> 状态：IMPLEMENTED / AUTOMATED SYNTHETIC VERIFIED / REAL-CREDENTIAL SMOKE PENDING
>
> 本文档供**人工**在已授权、已登录真实 Harness 凭据的环境中执行。自动化测试
> 全部使用 synthetic executable / fake transport / 离线 fixture，不读取任何
> credential、不发出任何真实模型请求。**执行本流程前请确认你接受以下事实：**
> 真实 Turn 会调用真实模型、消耗配额、并**直接修改你注册的项目目录**（live
> workspace 语义）。

## 0. 前置条件

```bash
# 1) 安装（clean venv + 全部 wheel，或 editable 安装）
python3 -m venv .venv
.venv/bin/pip install -e . -e plugins/agent-box-web -e plugins/agent-box-harnesses \
  -e plugins/agent-box-acp -e plugins/agent-box-skills -e plugins/agent-box-git \
  -e plugins/agent-box-artifacts -e plugins/agent-box-runtime-local \
  -e plugins/agent-box-sandbox-bwrap -e plugins/agent-box-terminal-session \
  -e plugins/agent-box-session -e plugins/agent-box-workspace-local \
  -e plugins/agent-box-studio

# 2) 各家 CLI 已安装并已用你自己的账号完成原生登录：
#    codex / claude / opencode / hermes / pi
#    （agent-box 不读取、不移动、不打印任何 credential；codex 走
#    locator-only secret mount，其余各家在 guest 内读取其原生 home。）

# 3) 能力自检：五家 provider 都应出现在 capabilities 里，
#    start 能力如实反映本机可执行文件状态
.venv/bin/agent-box doctor --json
```

## 1. 启动 Studio

```bash
export AGENT_BOX_HOME=$PWD/.smoke-home
mkdir -p "$AGENT_BOX_HOME"
.venv/bin/agent-box-studio serve --port 3081
# stderr 会打印一次性 token（形如 "agent-box-studio auth token: ..."）
export STUDIO_TOKEN="<粘贴 stderr 上的 token>"
export BASE=http://127.0.0.1:3081
```

## 2. 创建临时测试项目 + Session（每家独立执行一次）

```bash
mkdir -p /tmp/studio-smoke-project && cd /tmp/studio-smoke-project && git init -q . && cd -
curl -s -H "Authorization: Bearer $STUDIO_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"idempotency_key":"smoke-KEY", "title":"smoke", "project_path":"/tmp/studio-smoke-project"}' \
  $BASE/api/v1/sessions | tee /tmp/smoke-session.json
export SID=$(.venv/bin/python -c "import json;print(json.load(open('/tmp/smoke-session.json'))['session']['session_id'])")
```

## 3. 发起真实 Turn（按家替换 `<provider>`）

```bash
turn() {  # $1 = provider id, $2 = key, $3 = prompt
  curl -s -H "Authorization: Bearer $STUDIO_TOKEN" -H "Content-Type: application/json" \
    -d "{\"idempotency_key\":\"$2\", \"harness_type\":\"$1\", \"input\":\"$3\"}" \
    $BASE/api/v1/sessions/$SID/turns | tee /tmp/smoke-turn.json
}
turn codex  smoke-codex-1  "Create a file named codex-smoke.txt containing the word ok"
turn claude-code smoke-claude-1 "Create a file named claude-smoke.txt containing the word ok"
turn opencode    smoke-opencode-1 "Create a file named opencode-smoke.txt containing the word ok"
turn hermes      smoke-hermes-1 "Create a file named hermes-smoke.txt containing the word ok"
turn pi          smoke-pi-1 "Create a file named pi-smoke.txt containing the word ok"

export TID=$(.venv/bin/python -c "import json;print(json.load(open('/tmp/smoke-turn.json'))['turn_id'])")
```

> 注意：`codex` 需要 `[harness.credential]` 登录态（`codex-login/default`，
> locator-only mount）；hermes/pi 无流式输出，中间事件较少属正常（usage 报告 /
> message_end 才产生事件）。

## 4. 观察 WS 事件（另一终端，可选但推荐）

```bash
TICKET=$(curl -s -H "Authorization: Bearer $STUDIO_TOKEN" $BASE/api/v1/ws-ticket | .venv/bin/python -c "import json,sys;print(json.load(sys.stdin)['ticket'])")
# python 一行式 WS 消费（断线可用 after=<seq> 重放）：
.venv/bin/python - "$SID" "$TICKET" <<'EOF'
import sys, json
from websockets.sync.client import connect
sid, ticket = sys.argv[1], sys.argv[2]
with connect(f"ws://127.0.0.1:3081/api/v1/sessions/{sid}/events?ticket={ticket}&after=0") as ws:
    while True:
        msg = json.loads(ws.recv())
        print(msg.get("type"), [e["event_type"] for e in msg.get("events", [])])
        if any(e["event_type"] in ("TURN_COMMITTED", "TURN_TERMINAL") for e in msg.get("events", [])):
            break
EOF
```

## 5. 查询最终状态 / 检查 workspace diff

```bash
curl -s -H "Authorization: Bearer $STUDIO_TOKEN" $BASE/api/v1/sessions/$SID/turns/$TID
ls -la /tmp/studio-smoke-project/     # 应出现 <harness>-smoke.txt
cd /tmp/studio-smoke-project && git status --short && cd -
curl -s -H "Authorization: Bearer $STUDIO_TOKEN" "$BASE/api/v1/sessions/$SID/transcript" | .venv/bin/python -m json.tool | head -80
```

## 6. Cancel 测试（长任务）

```bash
turn <provider> smoke-cancel-1 "Count slowly from 1 to 100000, printing each number"
# 立刻（在完成前）执行：
curl -s -H "Authorization: Bearer $STUDIO_TOKEN" -X POST $BASE/api/v1/sessions/$SID/turns/$TID/cancel
# 结果只能是 CANCELLED / FAILED / RECOVERY_REQUIRED 之一；已 terminal 的 turn 幂等返回。
```

## 7. 检查清单（每家）

- [ ] Turn 返回 202，`binding.harness_type` 正确；
- [ ] transcript 出现 `execution.session`（含 session_locator）、`assistant.message`、
      `TURN_TERMINAL`、`TURN_COMMITTED`、`WORKSPACE_AFTER`；
- [ ] 项目目录出现该家的 smoke 文件（live workspace 真实修改）；
- [ ] `WORKSPACE_AFTER` 的 `source == shared_live_workspace`；
- [ ] cancel 结果非伪造（无法证明终止时为 RECOVERY_REQUIRED）；
- [ ] 任何响应/日志/事件中不出现：credential 值、token、宿主绝对路径。
