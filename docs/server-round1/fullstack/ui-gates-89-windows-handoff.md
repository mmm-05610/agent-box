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

> **抄进 `.ps1` 的行一律纯 ASCII ＋ CRLF**（QA 第 2 条环境事实）：中文注释存成 UTF-8 无 BOM 时，
> PowerShell 5.1 按 ANSI 解码会把变量读成 `$null`（现场：`$SourceRoot` 空 ⇒ `Join-Path : 参数是空值`）。
> 本包里以 `#` 开头且带中文的行是**给人读的注释**，落到脚本前请换成 ASCII（§3b 那段已经全是 ASCII）。

> **⚠️ 先读 `R-0056` 的资源护栏，别照抄 `trial-serve.ps1` 的默认值**（本轮补读裁决时发现的问题，见 §6）：
> `089` 的 Windows 侧 Server **必须用独立端口段 + 独立数据根**，**不得**与验收线 A 的 WSL 试用环境
> （`18790` / `~/.agentbox-trial-chat`）抢同一份资源。而 `trial-serve.ps1` 写的是
> `$DataRoot = %LOCALAPPDATA%\AgentBox\desktop`——**那是用户真实的桌面数据根**，
> 拿它当验收根跑，等于在用户的真 Profile 上试错。**要改这两行再跑**：
>
> ```powershell
> $DataRoot = Join-Path $env:LOCALAPPDATA "AgentBox\89-gate"   # own root; archive+delete after
> $Port     = 18820                                            # 18790/18810 already taken
> ```
>
> 端口先自己验一次空闲：`powershell.exe -NoProfile -Command "Get-NetTCPConnection -LocalPort 18820 -ErrorAction SilentlyContinue"`
> 无输出 ＝ 可用。`trial-app.ps1` 那两条环境变量要跟着改（`-ServerRoot` / `-ServerPort` 都收参数）。

```powershell
# Terminal A (Windows): apply the $DataRoot / $Port edits above, then run
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
# Terminal B (Windows)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\agentbox-w48-trial\trial-app.ps1
# Equivalent to: $env:ORDESSA_SERVER_ROOT="$env:LOCALAPPDATA\AgentBox\desktop"; $env:ORDESSA_SERVER_PORT="18770";
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
  ⇒ **本节上面那条 `curl` 在 Windows 端口上不可用**（QA 第 3 条环境事实：WSL → `127.0.0.1:<win-port>` 的
  `POST` 会被代理层变成 `http=400 "Invalid HTTP request received."`，`GET /live` 才正常）。
  **读法改在 Windows 侧做**（`Invoke-RestMethod`），或者直接用下面 §3b 的脚本（它两边都能跑，且默认按 locator 处理凭据）。

## 3b 独立根里"一条 profile 都没有"⇒ 先 seed（QA 第 144 轮交回的 `items=0`，A 侧的活）

QA 一手跑到 §3 时撞上：`R-0056` 要求独立数据根 ⇒ 全新根里 `profiles.list` 回 **`items=0`** ⇒ G1/G2 无从下手。
**根因不在产品**（本树源码一手核过，见下面两条），在**这份跑本没写怎么造 profile**——补上：

> **这段里的 `#` 注释一律纯 ASCII**：QA 第 2 条环境事实—–从 WSL 写给 PowerShell 的脚本
> 若带中文注释且存成 UTF-8 无 BOM，PowerShell 5.1 按 ANSI 解码会把变量读成 `$null`
> （实测现场：`$SourceRoot` 变空 ⇒ `Join-Path : 参数是空值`）。**要么纯 ASCII＋CRLF，要么写 BOM。**

```powershell
# Run on the Windows side (the control plane, R-0014). Key file: 0600, outside the data root.
# STEP 0 - read-only preflight: 4 calls, writes nothing, and answers "can this leg run here?"
& "$env:LOCALAPPDATA\AgentBox\r4c9-env\Scripts\python.exe" `
  "\\wsl.localhost\Ubuntu\home\maoqh\projects\agent-box-env-provider\scripts\server-round1\ui_gates_89_seed_profile.py" `
  --base-url http://127.0.0.1:18820 `
  --token-file "$env:LOCALAPPDATA\AgentBox\89-gate-qa-data\secrets\http-token" `
  --key-file  C:\secrets\deepseek-key.txt --preflight
# verdict CLEAR + wouldSeed.needed=true  ==> the root is empty (QA's items=0) and seeding is the next step.
# BLOCKED prints the blocker names: SERVER_UNREACHABLE / TOKEN_REJECTED / KEY_FILE_MISSING /
# PROFILES_READ_REFUSED:<code>. Exit 3 on any blocker, so it is safe to gate on.
# STEP 1 - seed:
& "$env:LOCALAPPDATA\AgentBox\r4c9-env\Scripts\python.exe" `
  "\\wsl.localhost\Ubuntu\home\maoqh\projects\agent-box-env-provider\scripts\server-round1\ui_gates_89_seed_profile.py" `
  --base-url http://127.0.0.1:18820 `
  --token-file "$env:LOCALAPPDATA\AgentBox\89-gate-qa-data\secrets\http-token" `
  --key-file  C:\secrets\deepseek-key.txt `
  --endpoint  https://api.deepseek.com --model-id deepseek-chat `
  --harness pi --harness codex --require-ready `
  --state-file "$env:LOCALAPPDATA\AgentBox\89-gate-qa\seed-state.json"
# Exit codes: 0 = both ready; 3 = blocked/unknown (the report's checks name which fact);
#             4 = the R-0056 port guard fired (default forbids 18790/18810) with zero requests sent.
# After the run, whatever happened, archive what you seeded:
#   ... ui_gates_89_seed_profile.py --base-url ... --token-file ... --teardown `
#       --state-file "$env:LOCALAPPDATA\AgentBox\89-gate-qa\seed-state.json"
```

> **key 文件的权限位**：脚本在**能表达 Unix 模式的文件系统**上要求 `0600`（否则在任何调用之前拒掉），
> 在**表达不了的**地方（NTFS、WSL 的 `/mnt/c`：一个普通文件就报 `0o666`/`0o777`）**自动跳过并写进报告**
> （`seeded.keyFile.modeGuard: "skipped:fstype:9p@/mnt/c"`）。这不是放宽——那一侧真正的边界是 **NTFS ACL**，
> 位检查在那里既不可能也无意义。想知道脚本怎么判你那个路径：
> `python3 … ui_gates_89_seed_profile.py --base-url http://x --token-file /dev/null --explain-modes <key 路径>`。

三条一手事实（本树今天量出来的，别当传闻）：

1. **凭据只能按路径导入，而且只有 Windows 侧的 Server 有可写的凭据面**：
   `POST /api/v1/credentials` 的 body 是 `{kind, source_path, confirm_source_path}`（`transport/http/app.py:249-273`，
   **值不进请求体**），而它要求组合里有 secret store——`bootstrap/runtime.py:317-320` 只在 **`os.name == "nt"`** 时自动装
   `WindowsDpapiSecretStore`。⇒ **在 WSL 侧 `python -m agent_box.server` 起的服务会回
   `CREDENTIAL_STORE_UNAVAILABLE`（retryable）**，seed 必须在控制面那台做。这条就是 `T6-1`（"没有一条发得出去的 profile"）的机制根因。
2. **`providerModels.create` 的 `harness` 是执行家族、不是厂商名**：填 `"deepseek"` ⇒ `CAPABILITY_UNSUPPORTED / HARNESS_UNAVAILABLE`。
   ⇒ 一家一条 Provider 记录（脚本就是这么写的：每个 `--harness` 各建一条）。
3. **读面不收 `requestId`**：`profiles.list` 的形状门只允许 `{includeArchived}`（`handlers.py:47`）⇒
   带上 `requestId` 会被判 `INVALID_REQUEST: unexpected requestId`。写面（`profiles.create/updateConfig/archive`）反过来必须带。
4. **`--model-id` 必须是那家 harness 自己认的模型**（一手：假座位 `fake_acp_peer.mjs:24-33` 只声明 `fixture-model` 一个值，
   给它别的 ⇒ 执行段回 `SIDECAR_OP_FAILED: Harness model is not available: <id>`）。真机上先用
   `providerModels.probeModels` 问上游有哪些模型，再拿那个 id 去 seed——别拿"我以为的名字"。
   **并且**：这条拒绝今天**到不了用户面**（见下条），所以一旦 seed 里 model id 写错，现象是"发出去了、转圈、失败，只有一句 EXECUTION_FAILED"。
5. **座位层面的模型拒绝只剩一个裸码**（一手，本树预演第 5 段复算）：把 seed 出来的 profile 改绑到一个
   "Provider 记录里发布了、但座位不声明"的模型 ⇒ `sessions.createAndSend` **照收**（turn 建了），
   随后 `state:"failed"` ＋ `error_code:"EXECUTION_FAILED"`，而 turn 上**没有任何原因字段**
   （`reasonFieldsOnTheTurn: ["error_code"]`、`work_id/execution_id/dispatch_id` 全空），
   真原因 `SIDECAR_OP_FAILED: Harness model is not available: <id>` 只在服务端日志里
   （`sidecar_backend.py:854-856` 有意只还原 `ExecutionStartRejected` 的码）。
   ⇒ 跑真机时若撞到"失败了但不知道为什么"，**先把服务端日志那行抄回来**，别按 EXECUTION_FAILED 猜。
   该不该把它翻到界面上是裁决（已进本树 §待开单），不是跑的人自己改。

**已验到哪一步（诚实口径）**：`scripts/server-round1/ui_gates_89_seed_shape_check.py` 把上面这条流程**逐面**过了一遍真实的
Server 处理栈（in-process `TestClient`，假 key、假端点，**真实模型调用 0**）⇒ **`SHAPE_CHECK OK 10/10`**，
其中正例是"seed 走完 ⇒ `profiles.list` 读回 `sendability.state:"ready"`"，反例是"key 文件读不了 / 同 label 改参数重放"两种都必须非零退出。
`ui_gates_89_seed_profile.py --self-test` **15/15**（端口护栏零请求、0600 之外的 key 文件直接拒、报告是白名单投影、
凭据/令牌形状会被就地涂掉）。**没验的仍是真机那一腿**：Windows 侧 DPAPI store ＋ 真 key ＋ 真端点 ⇒ 那要跑的人按上面命令做一次。

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

## 4c 环境冻结与凭据映射的归属（本轮补读 `R-0056`/`R-0063`/公告 127–128 轮得到，不是推测）

- **冻结已解除**：`R-0063` 把 `ACC-R4n` 记成 `superseded` ⇒ 按 `R-0054 ⑦` 环境**随之解冻**；
  但 18790 仍是验收线 A 守的那台（同一个 `pid 4355`），**本包不动它、不在它上面跑 089**。
- **`T6-1`（"没有一条发得出去的 profile"）已归 A 的装配面**（公告 127 轮：A 计划在窗口收口后、下一次钉环境时
  在试用根里保留一条"能发的试用 profile"，`pi` ＋ 内存里那条 DeepSeek 凭据 ＋ model 控件绑 `provider_52cb9435/deep…`）。
  ⇒ **跑 089 的人不要自己去补这条映射**（那是 A 的活，且红线照旧：真 key 不种到 `credential_e08793…`）。
  用 §3 的读法先看有没有 `ready`；一条都没有就把读数交回 A/调度者，**不要**为了跑通去改装配。
- **`091` 的"③ Windows↔WSL 真机部署+一次增量"由本单现场验并记账**（`R-0056` 明写：那是 `089` 的产出，不再是它的前置）
  ⇒ 跑的人要把"部署成功/失败 + 第一次增量"这两件**记进 089 的证据里**，不要当成环境问题略过。

## 5 交回的三条（跑的人一定会撞到，先写在这）

1. **`native-home-gate.py` 的 turn 下标差一位**（089 若复用 45 门的读法会带同一个假红）——
   修在 `scripts/**`，需要一张开写面的单；提案见 [087 证据 §6](cancel-recall-flake-087.md)。
2. **`108`/`120`/`122` 都还没收口**（截断可见、执行失败带类型化原因，runtime 线）⇒
   即使两家跑绿，**验收窗口仍开不出来**（`gate-log` P-5 的四条前置与此独立）。089 绿 ≠ 可以开窗。
3. Windows 侧 Server 跑的是**本工作树源码**：跑之前对 HEAD，跑之后如发现缺陷**不要就地改**（089 §Scope"只跑不改"），
   带着 `4230b2a` 这个 sha 交回，由调度者派单。
