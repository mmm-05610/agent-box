# 089 Windows 侧真机腿 —— 交给调度者安排 QA/相关人执行的**可照抄**包（用户 2026-09-19 22:0x 裁定：不走本会话，改由调度者派 QA/人直接用 `powershell.exe` 跑 Windows 侧校验）

来源：`docs/acceptance/gate-log.md` P-1/P-2/P-5 的三条前置 + 用户对 089 的处置指示。
本树**不**碰 Windows 交互会话、**不**起停验收线守着的 18790、**不**读任何凭据内容（`R-0011`）。
下面每一条本树都**一手核过在不在**（14:0x–14:11 UTC 实测），照抄即可跑。

## 0 前置状态（实测，别照旧账跑）

| 项 | 实测 | 怎么量的 |
| --- | --- | --- |
| Windows venv 的 python（`%LOCALAPPDATA%\AgentBox\r4c9-env\Scripts\python.exe`） | **在** | `powershell.exe -NoProfile -Command "Test-Path 'C:\Users\maoqh\AppData\Local\AgentBox\r4c9-env\Scripts\python.exe'"` ⇒ `True` |
| Windows 数据根 `%LOCALAPPDATA%\AgentBox\desktop` ＋ 其 `secrets\http-token` | **在 / 在** | 同上两条 `Test-Path` ⇒ `True`、`True` |
| 桌面应用源码 `C:\Users\maoqh\agentbox-wsl-round1\apps\desktop` | **在** | `Test-Path` ⇒ `True` |
| 46 门部署 `C:\agentbox-uigate46\deployment.json` | **在** | `Test-Path` ⇒ `True` |
| **Worker 工件**（本树侧！`workers/agent-box-worker/.acceptance-bundle-c11` 与 `target/{debug,release}/agent-box-worker`） | **在**（c9–c12 全在） | `ls`。**`QA-007` 口径：报数必须附这一行**——缺工件的树跑 Windows 侧派发会在 `AGENT_BOX_WSL_WORKER_MANIFEST` 上直接死，不是代码回归 |
| 18790（验收线守的 WSL 侧试用实例） | **在 LISTEN**，本包**不动它** | `ss -ltnp`；`/proc/4355/cmdline` |
| 18770（`trial-serve.ps1` 的 Windows 侧端口） | 无监听 | `ss -ltnp` 无命中 |

**一次误读要留案**：我第一次用 `"$env:LOCALAPPDATA\..."` 的嵌套引号量这三条，PowerShell 侧拿到的是被 bash 吞过的串，
得到 `False/False` ——**差点写成"Windows 前置没就绪"**。改用字面路径 + 单引号后全是 `True`。
教训：**跨 shell 传路径必须用字面量，别信嵌套引号**（这也是 62/64 那批 Windows 解码坑的同族形状）。

## 1 起 Windows 侧 Server（修订 v2 要的正是这条路径）

```powershell
# 终端 A（Windows）
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\agentbox-w48-trial\trial-serve.ps1
```

它做的事（读脚本原文，`C:\agentbox-w48-trial\trial-serve.ps1`）：
`$SourceRoot = \\wsl.localhost\Ubuntu\home\maoqh\projects\agent-box-env-provider` —— **就是本工作树**，
所以它跑的是**含 `115`（错误族闭合）与 `117`（`profiles.list` 投影 sendability）的当前源码**；
数据根 `%LOCALAPPDATA%\AgentBox\desktop`、端口 **18770**、`--sidecar-deployment C:\agentbox-uigate46\deployment.json`、
八家 Linux 工件 `--mount`，Worker 走 `.acceptance-bundle-c11`（`AGENT_BOX_WSL_WORKER_MANIFEST` / `..._LINUX_PATH`）。

> **要跑最新提交就先 `git -C /home/maoqh/projects/agent-box-env-provider log --oneline -1` 对一下 HEAD**
> （本包写作时 HEAD＝`4230b2a`，含 `checkpoint/b2-087`/`b2-115`/`b2-117` 三个标签）。

## 2 起真 Electron（这一步就是 089 的 G1"真"）

```powershell
# 终端 B（Windows）
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\agentbox-w48-trial\trial-app.ps1
# 等价于：$env:ORDESSA_SERVER_ROOT="$env:LOCALAPPDATA\AgentBox\desktop"; $env:ORDESSA_SERVER_PORT="18770";
#         cd C:\Users\maoqh\agentbox-wsl-round1\apps\desktop; npm run dev:renderer ; npm run dev:electron -- --remote-debugging-port=9222
```

日志落在 `C:\agentbox-w48-trial\app-renderer.log` / `app-electron.log`（**记下行末时间戳当证据**）。

## 3 挑一条"发得出去"的 profile —— 这一步现在**不必再靠试**（117 的用场）

历史账（`gate-log` P-1 (a)、T6-1）是"21 个现存 profile 全部发不出去，只能一个个试"。
本树源码含 117 之后，读一次就有答案：

```bash
TOK=$(cat /mnt/c/Users/maoqh/AppData/Local/AgentBox/desktop/secrets/http-token)
curl -sS -X POST http://127.0.0.1:18770/wire/v1/profiles.list \
  -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":"89-preflight","method":"profiles.list","params":{"includeArchived":false}}' \
| python3 -c "import json,sys;[print(i['displayName'],i['harness'],i['sendability']['state'],i['sendability']['reason'] or '',i['sendability']['actions']) for i in json.load(sys.stdin)['result']['items']]"
```

- `state: ready` ⇒ 就选它跑两家门（pi / codex 各一轮）。
- 全是 `blocked`/`unknown` ⇒ **把这行输出原样贴回来**（`reason` 就是机器码：`CREDENTIAL_NOT_FOUND` /
  `PROVIDER_MODEL_NOT_FOUND` / `PROFILE_RECOVERY_REQUIRED`…）。**不要**为了跑通去动凭据 id——
  红线照旧：**不把真 DeepSeek key 种到 `credential_e08793…`**（8 条 `maomaokingdom` 用户自有网关记录引用它）。
- 需要临时造一条可发的：`profiles.create` + `profiles.updateConfig` 绑 `{providerId, modelId}`
  （验收线在 P-2 就是这么走通第一手的），跑完**归档**并留清理证据。

## 4 每家的验收判据与记账格式（089 §Requirements + G1/G2/G3）

每家一轮，按这个形状记进 `docs/server-round1/fullstack/ui-gates-89/<家>.json`：

```json
{ "harness": "pi", "path": "real Electron -> Windows Server 18770 -> wsl.exe -> bundle-c11 Worker -> bwrap -> pi -> real DeepSeek",
  "prompt": "<最小提示词>", "replyVerbatimPrefix": "…",
  "turnStates": ["queued","running","completed"], "thoughtEvents": 0, "toolEvents": 0, "approvals": 0,
  "notProduced": ["thought"],              // 该家没产生就写在这里，不假
  "usage": {"requests": 1, "inputTokens": 0, "outputTokens": 0, "source": "deepseek", "estimatedCny": 0.0},
  "failureFace": {"how": "把凭据指向坏端点", "typedReason": "<code>"},   // 至少一条失败路径要类型化
  "cleanup": {"profilesArchived": true, "ownInstancesStopped": true, "tempRootsRemoved": true},
  "realModelRequests": 1 }
```

三条门（089 原文）：**G1** 证据含真 Electron + 真 Worker + 真答复（假端点冒充即失败）；
**G2** 请求数/tokens/费用逐家逐轮（无记账即失败）；**G3** 零泄漏——用本树那道会自检的门，**别用 grep**：

```bash
PYTHONPATH=src python3 scripts/server-round1/ui_gates_89_leak_check.py docs/server-round1/fullstack/ui-gates-89/
# 自检（改检查器本身时必跑）：--self-test ⇒ 5 必须红 + 8 必须绿 + 全仓 docs/ 461 文件零误报（本树 14:0x 实测全过）
```

## 4b 门机械已经预演过（假端点，真实模型调用 0）

```bash
PYTHONPATH=src:<六个插件 src> AGENT_BOX_SANDBOX_MODULE=agent_box_sandbox_bwrap \
  python3 scripts/server-round1/ui_gates_89_fake_rehearsal.py
# → REHEARSAL_OK，7 条全绿；报告 docs/server-round1/fullstack/ui-gates-89-rehearsal.json
#   它明写 notAcceptanceEvidence：这份**不是** 089 的真门证据（089 §Requirements 反例条不许拿假端点冒充）
```

预演钉住的四件事，跑真机时是同一批断言：
① 两家座位（`pi`/`codex`）各发一句都走到 `completed` 且有 assistant 增量；
② **没有座位的一家在建档时就被类型化拒**（`503 HARNESS_UNAVAILABLE`）且 **`server_turns` 一条没多**
   ⇒ 缺环境不会先收下、再在执行段崩（`T6-1`/`T6-2` 的形状就是"先收下"）；
③ 三种坏输入（未知方法、类型错的参数、缺参数）出站全是 JSON-RPC 错误对象，**没有一条裸 500**（`115` 的实效）；
④ `profiles.list` 在真装配上确实带 `sendability`+`recoveryPending`（`117` 的实效）。
预演自己也红过一次：断言把 REST 的 `{"error":{"code":…}}` 当字符串比 ⇒ 门咬到我；修完才是上面这四条。

## 5 交回的三条（跑的人一定会撞到，先写在这）

1. **`native-home-gate.py` 的 turn 下标差一位**（089 若复用 45 门的读法会带同一个假红）——
   修在 `scripts/**`，需要一张开写面的单；提案见 [087 证据 §6](cancel-recall-flake-087.md)。
2. **`108`/`120`/`122` 都还没收口**（截断可见、执行失败带类型化原因，runtime 线）⇒
   即使两家跑绿，**验收窗口仍开不出来**（`gate-log` P-5 的四条前置与此独立）。089 绿 ≠ 可以开窗。
3. Windows 侧 Server 跑的是**本工作树源码**：跑之前对 HEAD，跑之后如发现缺陷**不要就地改**（089 §Scope"只跑不改"），
   带着 `4230b2a` 这个 sha 交回，由调度者派单。
