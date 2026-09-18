# 原生目录作为唯一事实来源 —— 工单 45 执行证据（部分完成）

2026-09-17。执行者：环境 provider 会话（worktree `/home/maoqh/projects/agent-box-env-provider`，
分支 `feature/env-provider-v1`）。45 基线 = 44 收工提交 `85404f7919914690ccf621654139698f1a3a973d`。
真实模型调用 **0** 次，费用 **¥0**。工单与设计文档取自父工作树只读参考
（父工作树当时 HEAD `c28d4f6a189edcbcc65683951cd55e3ec6ad21f0`）。

## 0. 结论

**NATIVE_HOME_STORAGE_DONE**（终态；2026-09-19 由工单 082 收口。本报告正文写于 G3 仍被阻断时，
其时的 **PARTIAL** 判定与文末 67/082 的实测记录冲突，**以实测为准**——冲突逐处就地标注，不删原文。
阶段 A/B/C 的实现与定向测试全部落地、全量套件与四家
假端点门不退化；端到端门的 **G1、G2、G6、G8、G4(净轮) 全部第一手通过**——
含同 Session 续接真召回、取消后召回不断（F4）、审计窗口漂移可见；
**G3 曾在产品层 Profile 执行锁上被阻断**（`TURN_CONCURRENCY_CONFLICT`，其时放行属产品语义裁决）；
〔082：**G3 已转 pass**——裁决落地为工单 67（唯一性单位=会话）；`460781c` 基线上两次复跑
与本单在基线 `4c32992` 上的复跑均为 `turnStates: ["completed","completed"]`，
见文末「082 收口注记」〕；
G7（人手 UI 路径）记部分覆盖，Windows r4(c9) 复跑已于 §8 补齐。

## 1. 阶段 A —— Worker home 操作族 + 协议 4（完成，已提交）

- `workers/agent-box-worker/src/{main.rs,protocol.rs}`：
  - 新操作族 `home.prepare` / `home.list` / `home.get` / `home.delete`；
  - `--home-root`（缺省 `$HOME/.agent-box/profiles`），**必须位于临时 `--root` 之外**
    （嵌套即启动拒绝——root 退出时会删除，home 不得同亡）；
  - `home.prepare`：locator 校验（首段角色名 + 注册表 native home 段，`^[A-Za-z0-9._-]{1,64}$`，
    `.`/`..` 显式拒绝）、建目录、写/校验角色标记 `.agentbox-profile.json`
    （身份不一致 → 类型化 `HOME_MARKER_CONFLICT`，由 Server 转写为 `PROFILE_HOME_CONFLICT`）、
    `mkdir -p` 声明的审计窗口（角色相对，可落在 native home 之外——OpenCode 的数据窗口
    `.local/share/opencode` 在其 native home `.config/opencode` 之外）；回路径只给通道用；
  - `home.list`/`home.get`：与 `view.*` 同一套已审计实现（pinned fd + `O_NOFOLLOW` 逐段下降、
    符号链接跳过计数、特殊文件拒绝、digest 固定分块读）；越界为**截断事实**
    （`truncated:{entries,bytes,oversize}` + `skipped`），不抛、不静默；
  - `home.delete`：仅删除一个普通文件（凭据规则"命中即删该文件"的唯一执行点；
    目录/链接/缺失均类型化拒绝）。这是对工单 §2b 操作族清单的**最小增补**，
    原因记录如上（§3 硬性规则要求删除能力，而 wsl.exe 直改文件被明令禁止）；
  - **控制协议 3→4 双向拒绝**；capabilities 增 `home@4`。
- `protocols/worker/v1.schema.json`（op 枚举 + const 4）、`README.md`（home 语义、
  定位符规则、HOME_MARKER_CONFLICT 选型）、`golden/home-*.json` 4 个接受/拒绝例。
- Python 客户端 `PROTOCOL_VERSION = 4` 同步（双向拒绝互证由
  `test_interactive_channel.py` 的固定断言迁移）。
- Rust 定向测试 **38 passed**（含每个新规则的反例：遍历逃逸、身份冲突、符号链接越根、
  截断记账、分块读、未准备 home 的读拒绝、删除语义）。
- bundle **c9**：`sha256:c7fcab3af1fe6f7f4a650ee6013b4ed1a7d82d2c6341366edb046af46858e8c8`
  （本工作树构建；与父工作树历史摘要不同是 Rust 嵌入构建路径所致，源码零差异）。

## 2. 阶段 B/C —— 房间、通道、审计、记录（实现完成，已提交）

- **房间**：`compose_sidecar_room(state_bundle_prefix → state_home_source / state_target,
  state_window_source / state_window_target)`——native home 与其外的声明窗口分别 RW 绑定；
  深度升序绑定顺序、RO 配置、tmpfs 遮蔽（Codex `.tmp`/`shell_snapshots`）一条不变。
- **通道（Worker）**：`WorkerSidecarLauncher`（44 已中性化）不再恢复、不再上传 state；
  先 `home.prepare` 取宿主目录交房间；审计读 `home.list`/`home.get`；凭据命中经
  `home.delete` 删命中文件。
- **通道（本机）**：`LocalSidecarLauncher`/`LocalHome`——`<data_root>/profiles/<角色>/<native home>`
  的 mkdir + 标记写/校验 + 窗口 mkdir（与 Worker 同规则、Python 直做）+ 本地审计
  （有界、无跟随、digest）。`data_root/profiles` 由组合层绑定，不进部署文档。
- **审计**：`state_capture.audit_snapshot()`——共享保护路径/临时前缀/凭据精确匹配规则；
  越界与逐文件读取竞态**记账为截断事实**（`truncated`），凭据命中仍是 fail-closed 类型化失败
  （`SIDECAR_STATE_CONTAINS_SECRET`，携带命中相对路径）。`.agentbox-state` 标记与
  `merge_state_into_bundle` 删除。
- **后端**：`_complete` 改发布**审计 manifest（schema_version 3）**：
  `nativeSessionId/harnessType/nativePlatform/homeLocator/sourceExecutionId/resumable/
  audited/truncated/files[]`——记录对象，不含任何宿主绝对路径、不含原生字节。
  `complete_turn` 增 `native_platform`/`home_locator`；`finish_cancelled` 同样可带
  审计引用（**G8/F4**：取消不再丢输入——取消轮先审计 home 留引用，下一轮同 native id 重开）。
- **记录**：`server_sessions` 增列 `native_platform`、`home_locator`（schema 5→6，
  ALTER TABLE 惯例，旧行保持 NULL）；`checkpoint_object_digest` 含义更新为审计 manifest，
  列名不变；`get_session` 的 checkpoint 字典键不变（wire 零改动）。
- **恢复路径删除**：`_restore_sidecar_state` 删除；带 locator 的会话第二轮不再有任何恢复步骤。
  旧模型会话（无 locator）首次运行开新原生会话，以 native id 变化如实呈现（设计 §11）。

## 3. 端到端证据（G 门，本机放置）

`scripts/server-round1/native-home-gate.py`（--report `docs/server-round1/fullstack/native-home-gate.json`），
产品路径驱动（wire workspaces.open → sessions.createAndSend → 捕获/清理），stateful 受控
peer 为 harness，**无模型调用**：

| 门 | 结果 |
| --- | --- |
| **G1** 一轮写目录 | ✅ home 出现 harness 持久会话事实（桥快照 `.pi/pi/<b64 session id>.json`）；对象库**无**状态字节对象（逐 digest 对照）；审计 manifest（schema 3）记录文件与摘要；`nativePlatform=local`、`homeLocator` 落记录 |
| **G2** 二轮靠 home 续接 | ✅ 同 Session 第二轮 `session/load` 重开（reopen-method.txt 记录 `session/new`→`session/load`）、真召回首轮 nonce、native id 稳定 |
| **G3** 并行不丢 | 〔082：**pass**——本单于基线 `4c32992` 复跑，两轮均 `completed`；`460781c` 基线两次复跑形态一致，见文末注记〕⚠️→✅ 其时阻塞（产品层）：同 Profile 第二个并行 Session 被产品执行锁拒绝（`TURN_CONCURRENCY_CONFLICT`）——并行放行是产品语义变更（Profile run_state/native_generation 锁），按 §6 记账交裁决；裁决已落地（工单 67：唯一性单位=会话） |
| **G4** 凭据与遮蔽 | ✅ 干净轮 audit fail-closed 扫描零命中（manifest `truncated` 全 0）；tmpfs/RO 规则由沙箱测试钉住；正向注入断言覆盖于 audit 单元反例 |
| **G8** 取消后仍连续 | ✅ 同 Session 中途取消（stop_requested）后，召回轮同 native id 重开并回出存储 nonce；取消轮输入已写入 home journal（cancel-journal.txt）|

四家假端点全链门（G5 组成部分，全部 exit 0，c9 上复跑）：
`PI_PRODUCTION_CHAIN_GATE_OK`、`HERMES_PRODUCTION_CHAIN_GATE_OK`、
`CODEX_PRODUCTION_CHAIN_GATE_OK`、`OPENCODE_PRODUCTION_CHAIN_PREPARED`。
全量套件（tests + harnesses + sandbox-bwrap + runtime-wsl，基线同口径）：
**890 passed / 5 skipped / 0 failed**（基线 886/6/0，无退化）。

## 4. 阻塞账（§6 格式）

```text
阻塞项：G2（二轮靠 home 续接的召回断言）及随其依赖续接语义的 G8
【已解决，留档】：该缺口的根因是本门此前把桥的 stateDirectory 与审计窗口错误配对
（窗口在 native home 之外时，轮 2 的桥在错误目录找快照）——窗口配对修正后
（register 的 stateDirectory = 声明窗口），轮 2 续接、召回、native id 稳定全部第一手通过。
G8 现以 cancel-journal + 召回断言通过（见 §3）。以下为当时的原始记账，留作过程证据。
第一手观察：native-home-gate 第二轮（同 Session sessions.send）失败，
turn.capture 事件 error_code=EXECUTION_FAILED；
port 层第一手异常为 SidecarError: SIDECAR_OP_FAILED: Harness session not found，
抛自 harness_remote 桥 acp-service.js #requireSession
（claimSession → #refreshSessions → #restoreSnapshot 后 #sessions 仍无该 native id）。
桥的快照确已持久化在 home（.pi/pi/<b64 session id>.json，第一手在档），
桥的恢复目录按第三方桥内部规则解析（stateDirectory + profile.id）。
为什么阻塞：续接召回需要桥在重启后"收养"自己持久化的会话快照；
在原生目录模型下该收养路径对本机放置未生效。需要桥层（第三方快照代码）的
一次设计裁决与修改——按工单 §8"复杂问题记录并停"，执行者不自行改第三方桥语义。
已尝试：核对桥快照文件存在性与命名（base64url(sessionId).json，第一手在档
`.pi/pi/c3RhdGVmdWwtMTM.json`，即 stateful-13 的桥快照，且确在 home 内持久）；
核对 register 的 stateDirectory 传递与桥实际持久化/读取位置的一致性；
确认 Worker 端 home.prepare/审计窗口/绑定次序全部按 §2b/§2d 落地。
精化根因（最终）：home 内两个持久事实第一手在档——
`.pi/pi/<b64 session id>.json`（桥快照）与 `sessions/native-state.json` + `sessions/reopen-method.txt`
（受控 peer 的自有状态），全部随 home 持久。轮 2 的 `claimSession` 失败点在第三方桥
`#requireSession`：`#restoreSnapshot` 恢复了消息但不把该 id 注册进 `#sessions`，而
`#sessions` 只由 ACP 侧 `session/list` 喂入；轮 2 桥因此回退为 `session/new`，
被受控 peer 以"must resume persisted session"拒绝（第一手错误文本在档）。
修复需要桥层收养语义的一次裁决（快照收养 vs 列表收养、或 Server 侧显式 adopt op），
属第三方桥语义变更，按 §6 记账停在该部分，不自行放宽或绕过。
影响：G2 的"真召回 + native id 稳定"断言、G8 的"取消后同 native id 重开可见输入"
断言无法成立；G1/G4/G6 的断言不受影响。
不掩盖声明：本项不记通过。
```

```text
阻塞项：G5 的 Windows r4 + -PostCheck 复跑、G7 人手 UI 路径
第一手观察：本会话执行环境为 Linux/WSL 单机，无 Windows 宿主、无前端 UI。
为什么阻塞：外部条件（需 Windows 实机与前端 UI 会话）。
已尝试：不适用（无该资源）。
影响：Windows r4 需以 c9 复跑的结论、G7 的 UI 路径结论缺席；
四家门与全量套件已在 c9 上复跑通过（见 §3），不因此受阻。
不掩盖声明：两项不记通过。
```

## 5. 回归计数（逐条）

| 项 | 结果 |
| --- | --- |
| 全量套件（tests + harnesses + sandbox-bwrap + runtime-wsl） | **890 passed / 5 skipped / 0 failed** |
| Rust（workers/agent-box-worker `cargo test --locked`） | **38 passed / 0 failed**；`cargo fmt --check` 干净 |
| Pi 全链门（c9） | exit 0，`PI_PRODUCTION_CHAIN_GATE_OK` |
| Hermes 全链门（c9） | exit 0，`HERMES_PRODUCTION_CHAIN_GATE_OK` |
| Codex 全链门（c9） | exit 0，`CODEX_PRODUCTION_CHAIN_GATE_OK` |
| OpenCode 全链门（c9） | exit 0，`OPENCODE_PRODUCTION_CHAIN_PREPARED`（现行通过标记） |
| wire | 28 方法、`wire/1`、事件 kind 与载荷零改动（本单未触碰 wire 层） |

## 6. 费用与清理

- 真实模型调用 **0**；预算消耗 **¥0**（所有门与测试使用 loopback 假端点/受控 peer）。
- 清理：门自清理（runtime.stop、TestClient 关闭、临时目录 `--keep` 才保留）；
  注入值仅存在于每次运行的一次性文件与内存，运行结束随临时根删除；
  `git diff --check` 干净；本工作树之外零写入（父工作树/前端仓只读遵守）。

## 7. 未做项（逐条，含原因）

1. ~~**G3 并行双轮**~~ 〔082：**已闭合**，不再计为未做项〕——其时被产品层 Profile 执行锁阻断
   （TURN_CONCURRENCY_CONFLICT）；放行属产品语义变更，需设计裁决。裁决已由工单 67 落地
   （唯一性单位=会话）；`460781c` 基线与其后本单基线 `4c32992` 的复跑，两轮均 completed。
2. **G5 的 Windows r4/-PostCheck（c9）复跑**——无 Windows 实机（§4 第二条）。〔已由 §8 于 2026-09-17 补齐〕
3. **G7 人手 UI 路径**——无前端 UI 会话（§4 第二条）。〔记**部分覆盖**，不记全过；见 §8 后追记〕
4. ~~**G3 并行双轮**、G4 正向注入、G6 漂移的端到端断言~~ 〔082：G3 项已由 67 改为真并发断言并 pass；
   其时脚本骨架已就位（native-home-gate.py），被 G2 的续接语义问题阻塞在同一脚本内；
   定向层（audit_snapshot 反例、LocalHome 审计）已有单元级覆盖。G4/G6 该项维持原状〕
5. **资产层抽离、Windows 原生放置、配额策略**——设计文档明示不在本单。

## 8. 追记（2026-09-17）：Windows 腿补跑完成——G5 的 r4(c9) 项闭合

判断修正：本单此前把"无 Windows 实机"记为外部资源缺席。实为 WSL2 互操作
（`powershell.exe`/`py.exe`/`wsl.exe` 均可从本会话直接驱动）——46 单 G3 的真实 UI 门
正是用这条路径跑通的，r4 复跑同路径补齐。

**不退化复跑结果（新 bundle c9，digest `d93300e4…`，逐阶段 exit 0）**：

| 阶段 | 结果 |
| --- | --- |
| A Server + 本地持久化 | `SERVER_HTTP_R1_A_WINDOWS_OK`（[证据](windows-r4c9/r4a.json)） |
| B HTTP → 真实 WSL Worker | `SERVER_WSL_R1_B_WINDOWS_HTTP_OK`，worker digest 逐字节校验，Unicode+空格路径经真实 Worker 浏览（[证据](windows-r4c9/r4b.json)） |
| C 两轮真实 Codex（HTTP/SSE） | `SERVER_CODEX_R1_C_WINDOWS_OK`，2 次真实请求，次轮真召回 nonce，native id 在档（[证据](windows-r4c9/r4c.json)） |
| D 正常停止 + 原生冷续接 | `SERVER_CODEX_R1_D_WINDOWS_OK`，重启后同 native id 续接、再召回，累计 3 次真实请求（[证据](windows-r4c9/r4d.json)、[收据](windows-r4c9/r4cd-receipt.json)） |
| E wire 面 + 崩溃重启续接 + 租约静默 | `BACKEND_41_E_WINDOWS_WSL_WIRE_OK`：`tree_terminate` 强杀后 `session/resume` 同 native id；8 秒静默 > 5 秒租约的 attempt 如实完成；审计 manifest schema 3 逐文件对着 durable home 校验 digest；7 项清理守卫全部按设计拒绝（[证据](windows-r4c9/r4e.json)） |
| PostCheck（独立进程） | `BACKEND_41_E_WINDOWS_POSTCHECK_CLEAN`：data root/workspace/端口/进程/worker 视图零残留（[证据](windows-r4c9/r4-postcheck.json)） |

**随之修正的验收栈缺口（均为本仓文件）**：

1. `accept-a.ps1` 仍假设"无部署也内置 Harness 注册表"——44/46 之后注册表只由部署文档
   组合；已改为携带 `--sidecar-deployment/--plugin-root/--mount`。
2. 各 accept 脚本的 JSON 请求体按 PowerShell 5.1 默认 ANSI 编码发出，非 ASCII 路径
   到 Server 已成 `?`；统一改 `charset=utf-8`（B 阶段的 Unicode 断言因此才真正生效）。
3. `accept-c.ps1` 的 readiness 断言与 Provider/Model 合同过期；已对齐现行面
   （`capabilities.harnesses.<f>.available` + providerModels.create 引用形配置）。
4. delta 断言用换行 join 把 codex 的碎片 delta 逐行拆开，nonce 永不连续命中；
   改为直接拼接（delta 本就是同一文本的碎片）。
5. `accept-e.ps1`：fixture 家族 "omp" 无注册表 native home（45 规则下按设计拒绝），
   改用已注册的 kilo 家族承载同一租约静默 fixture；checkpoint 断言从 schema 2 升到
   schema 3 并新增 nativePlatform/homeLocator 断言；文件校验从"读 ObjectStore 拷贝"
   改为"对 durable home 现物 sha256"（45 的审计本就是记录非拷贝）。
6. `_protect_token` 在 `PYTHONUTF8=1` 的 zh-CN Windows 上按 UTF-8 解码 `whoami.exe`
   的 GBK 输出直接崩（读线程异常）；SID 是纯 ASCII，解码改为容错，并给无类型码的
   执行失败补了 stderr 日志（此前只剩一个无信息的 EXECUTION_FAILED）。

**G7（人手 UI 路径）部分第一手**：真实 Electron 应用里的第二轮上下文（先问后召回）
已由 46-G3 的 8 家 8/8 真实模型门覆盖（[ui-gates-46](ui-gates-46/)）；应用驱动的
停止/重启续接未单独立跑，但同一能力已有 r4 C/D（REST/SSE 层）与 E（wire 层）
两层第一手证据。按 §8 如实记账：G7 记"部分覆盖"，不记全过。

**曾未决、现由 082 记为已决**：G3 并行双轮（其时产品语义未裁决；当时的行为是类型化拒绝
TURN_CONCURRENCY_CONFLICT，满足"绝不静默换地方"的底线，但"两轮都完成"的完整断言当时未达成）。
裁决已落地（工单 67：唯一性单位=会话）且"两轮都完成"在当前基线复跑达成——详见文末「082 收口注记」，
**上一句描述的是裁决前的状态，不是现状**。

## 9. 追记（2026-09-17）：§1b / 落地设计 §14 —— session 库独立于 profile home

按父侧修订（45 §1b，用户 2026-09-16 采纳）实现并逐家定性：

- **机制**（提交 717a643）：Worker 新增 session-store 模式
  （`home.prepare {locator, harness, kind:"session-store"}` → `<home-root>/_sessions/<harness>`，
  无 profile marker；保留段 `_sessions` 对 profile locator 类型化拒绝；Rust 测试 +2）；
  房间把库绑到部署声明的会话子树 guest 路径（深度序在 profile home 之上生效）；
  审计改走库根（whole-locator listing）；ephemeral 锚钉在 native home（codex 的
  `.tmp`/`shell_snapshots` 遮蔽不因收窄而失效）；部署文档新增可选
  `sessionStore.kind`（缺省 profile-home = §14 前逐字节不变）。
- **逐家定性**（[stage A 证据](session-store-14-stage-a.md)，只列目录名/表名）：
  codex（`.codex/sessions` 是 rollout journal，`.codex/sqlite` 只是 goals 功能）与
  pi（`.pi/agent/sessions` 纯 journal）**声明 split 且门在 c10 全绿**；
  hermes 复查更正为**共享 DB 式**（权威会话在 `$HERMES_HOME/state.db`，
  `.hermes/sessions` 只是调试转储）→ 库留 profile home（§14.2(a)）；
  opencode/kilo 共享 DB（两库含 credential/account 表，排除整库共享）→ (a)；
  claude-code/dsh/qwen **声明撤回**：各自的门自 45 起未在 Linux 复跑，本轮修复三层接口漂移
  （token 前签名、host-path artifact_source、45 前 reopen 参数）后仍卡
  `HOME_MARKER_CONFLICT`（根因未定位，见下）——门证明前不声明。
- **门证据**（c10 = `sha256:d92c6716…`，45 后首次 Worker 重建）：
  pi `PI_PRODUCTION_CHAIN_GATE_OK`、codex `CODEX_PRODUCTION_CHAIN_GATE_OK`、
  hermes `HERMES_PRODUCTION_CHAIN_GATE_OK`、opencode `OPENCODE_PRODUCTION_CHAIN_PREPARED`
  （后两家按 profile-home 语义，回归无退化）。另修两处真实缺陷：
  `_capability_value` 对 dict 能力表的 `.values` 方法误读（旧 `None` 通过分支掩盖）、
  terminal provider 从不声明 `terminal.run@1`。
- **回归**：全量 **1085 passed / 3 skipped**（含真 bwrap integration）；插件套件 331。
- **已知阻塞（交由维护）**：claude/dsh/kilo/qwen 的 Linux 假端点门在 turn chain 内
  报 `HOME_MARKER_CONFLICT`（同一门内多相位间 profile 身份冲突，根因未定位）；
  这些门自 44/45 起从未在 Linux 复跑，属 43 代门的维护债。产品路径不受影响
  （port_factory 的 home 准备/审计由全量套件覆盖）。
- 费用：真实模型调用 0 次（全部假端点）。

## 补记（2026-09-18，工单 67 落地后）：G3 由阻塞转为通过

产品裁决（用户 2026-09-18）：唯一性单位是**会话**；"同一 profile 不能跑两个会话"被改正。
本单落地后（schema 10：删 per-profile 部分唯一索引，保留 per-session），45 报告里的
G3 阻塞项按原口径复跑：

- `native-home-gate.py` 的 G3 占位已改为真并发断言（同 profile 两会话各一轮，echo 座
  `delay-success` 提供 500ms 确定性窗）：**两轮都 completed**、native id 各自独立、
  每会话 delta 按自身 turn_id 归属；同会话第二条消息=入队（非第二执行）、运行中
  switchProfile=rejected/execution_running。
- 整门终态 `NATIVE_HOME_GATE_OK`（`native-home-gate.json`：g3.result=pass）。
- 逐家 home 并发结论表与 claude/dsh/qwen 的收窄锁见
  [per-session-admission-67.md](per-session-admission-67.md) §4。
- 〔082 指路〕本补记所引 `native-home-gate.json` 与 `per-session-admission-67-native-home-gate.json`
  都是 **67 当时基线**的记录；45 转 DONE 的**收口记录**（含本单基线 `4c32992` 的实跑、复跑命令与
  证据摘要）见文末「082 收口注记」，两处结论一致。

## 补节（56 §4 一致性）：订阅登录态是受管凭据资产，不是原生状态

45 的结论"原生 home 是该平台原生状态的唯一来源"**不变**；本补节写明一类**例外及其边界**：

- **订阅/官方登录态属于"受管凭据资产"**：由控制面托管（`<data_root>/accounts/<id>/` 的
  引用 + 平台 SecretStore 加密的整包），**按轮物化**成 harness 期望的文件形态、**轮末回收**
  （56 的新机制：有界、只收声明文件、每账号一把锁、乐观摘要、冲突类型化）。
- **home 里的那份只是本轮工作副本**：不是事实来源；轮次结束即回收到资产（可能被 harness
  原地刷新过——这是 45 的"可写 state"语义在凭据面上的延伸，不与之冲突）。
- **边界**：45 的三条规则（只读配置投影 / tmpfs 遮蔽 / 受保护路径）与凭据扫描三条
  （注入值精确匹配、命中类型化、命中处置按树定分）都不因此放宽；56 的回收是**唯一**的
  写回路径，且只写回**账号资产**，绝不写回配置或 profile home 的其它面。
- 逐家形态与可用性裁断见 [subscription-credentials-56.md](subscription-credentials-56.md) §阶段 A。

## 082 收口注记（2026-09-19，工单 082）：45 转 DONE

**只写账与本注记，零代码改动。** 45 的账行终态由 `NATIVE_HOME_STORAGE_PARTIAL` 转为
**`NATIVE_HOME_STORAGE_DONE`**。转换的唯一依据是下表的第一手复跑记录——正文各节写于 G3 仍被
阻断之时，凡与之冲突处已就地标注「〔082：…〕」，不删原文（事实分级：正文=当时实测，本注记=当前基线实测）。

- **待收口的门**：收口之时，G3「并行不丢」是 45 唯一未过的门（其余 G1/G2/G4/G5/G6/G8 已第一手通过，
  G7 记部分覆盖，见下）。
- **转 pass 的记录**：提交 **`460781c`**（`460781cc1a424e917518d66c927b030b08fc6c28`，
  2026-09-18 15:33 +0800）——"67 re-verified at the current baseline: native-home gate OK on
  re-run (G3/45-G3 pass in both runs …), 38 targeted + 879 root-suite green; ledger row DONE"。
  该提交把 67 的账行记为 `PER_SESSION_ADMISSION_DONE（45-G3 转 pass）`。
- **基线（如实修正本单的书写前提）**：`460781c` 的复跑是在**它自己的**基线上（068 轮之后），
  而本单书写时的当前基线已推进到 `4c32992`。两者之间有**两次代码改动**——`cd03ada`（070：
  真端点探测，修 3 个缺陷）与 `30012ad`（080：整库首次运行锁，**改在
  `SidecarExecutionBackend`**，正是 G3 走的路径）。因此 082 不沿用旧记录，而在 `4c32992` 上
  **本人重跑**（下条）。工单 082 的"45-G3 在当前基线通过"这一前提按其字面表述并不成立，
  此处以重跑结果为准。
- **复跑命令**（本机门；`AGENT_BOX_SANDBOX_MODULE` 是 PYTHONPATH 运行下的沙箱端口解析入口，
  缺它门会以 `LOCAL_SANDBOX_UNAVAILABLE` 拒开工作区，与 67/45 无关）：

  ```bash
  AGENT_BOX_SANDBOX_MODULE=agent_box_sandbox_bwrap \
  PYTHONPATH=src:plugins/agent-box-harnesses/src:plugins/agent-box-runtime-wsl/src:plugins/agent-box-runtime-local/src:plugins/agent-box-sandbox-bwrap/src:plugins/agent-box-skills/src:plugins/agent-box-terminal-session/src \
  python3 scripts/server-round1/native-home-gate.py --report <path>
  ```

- **本单复跑结论（082 本人于基线 `4c32992` 实跑，一次通过）**：
  终态 **`NATIVE_HOME_GATE_OK`**，证据
  [native-home-45-082-rerun.json](native-home-45-082-rerun.json)（sha256 `0501467351fe…`），
  退出码 0；**G1/G2/G3/G4/G6/G8 全 pass**。**45-G3 判定**：
  `turnStates: ["completed","completed"]`、`nativeIdsDiffer: true`、`deltasPerSession: [1,1]`、
  `sameSessionOutcome: queued`（同会话第二条消息入队而非第二执行，`queue_2275de33…`）、
  `switchWhileRunning: rejected / execution_running`——与 `460781c` 两次的形态**逐项一致**。
  该次 stderr 里仍出现 `SIDECAR_CLOSED: sidecar exited before answering`（G8 的已知竞态形态），
  但 G8 本轮仍判 pass（`recallDeltas: ["STATEFUL-NONCE-7A21"]`），竞态本体归 **087**。
- **历史复跑（引用，非本单实跑）**：[per-session-admission-67.md](per-session-admission-67.md) §9 记录
  `460781c` 基线上两次复跑——第 1 次 `NATIVE_HOME_GATE_FAILED` 仅停在 **G8**（G1–G6 含 G3 全 pass），
  第 2 次 `NATIVE_HOME_GATE_OK`；证据
  [per-session-admission-67-native-home-gate.json](per-session-admission-67-native-home-gate.json)。
- **回归计数**：**引自 `460781c`**——定向 38 passed（test_server_boundaries / test_stage_a_server /
  test_usage_aggregate / test_execution_inventory / test_delegation）、根套件 879 passed / 0 failed。
  本单**零代码改动**，故不重跑套件（本单实跑的是上条那座门）；差值如实标注：套件计数属 `460781c`
  基线、门计数属 `4c32992` 基线。
- **G7 维持「部分覆盖」**（本次不改动）：真实应用二轮上下文由 46-G3 八家 8/8 覆盖，
  续接能力由 r4 C/D+E 双层覆盖；应用驱动的停止/重启续接未单独立跑。**不记全过。**
- **仍开放的两项（不属 45 的门，随本单如实移交）**：
  ① G8 取消/召回间歇（2 次复跑 1 败，形态=召回轮 completed 但 `recallDeltas: []`）→ 工单 **087**；
  ② claude/dsh/qwen 的 43 代门 marker 冲突根因 → 67 §4 记账，kilo 项已由 `e394f09` 关闭。
- **费用**：真实模型调用 **0 次**、**¥0**（本单实跑的那座门全程假端点；
  证据 JSON `cost: {authorizedRealModelCalls: 0, estimatedCny: 0}`）。
- **清理**：该次运行的临时根 `/tmp/agentbox-native-home-gate-nzx_gyhk` 由门自身删除
  （`temporaryRootRemoved: true`）、home 在尝试之外保留；`/tmp` 下其余
  `agentbox-native-home-gate-*` 目录**先于本单存在**，非本单所造，未触碰。
