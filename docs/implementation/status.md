# Backend Server — status

更新：2026-09-15 10:53 +08:00（执行者：后端 goal 会话，分支 feature/server-harness-extension-v1）。
37 的独立验收仍为 PARTIAL；历史证据保留。
当前授权39→40→41→42。执行进度：39 完成；40 A/B/C/D 完成（四家组件门通过，
无真实模型）；41 的 28 方法与队列终态已按前端 `3aba5c5c` 新摘要严格 29/29 重锁，Windows r4 平台门
已于本阶段通过，当前为 **BACKEND_WINDOWS_R4_READY**：真实 Windows Server→wsl.exe→release Worker
ABW1 interactive→bwrap 链路上，两个显式 no-model fixture（广覆盖 + 有状态）走通，Server 以
`stop_mode=tree_terminate`（`taskkill /T /F` 有界进程树强制终止，**不是**正常/graceful 关闭）停止后
以同一 DataRoot 重启，以同一 native id 经 ACP `session/resume` 恢复、终止前 delta 先于 completed、
checkpoint 由 Windows ObjectStore 校验、退出后按 marker 清理并独立 `-PostCheck` 复核。整体
`BACKEND_IMPLEMENTATION_READY` **未登记**（正常 Desktop/Server 生命周期退出与最终清理留作后续全栈
最终验收项）。r4 检查点分三层见下表。
42 的独立模型任务可并行继续；前端实现交接已收口（2026-09-15 02:51 只读复测：HEAD `8e7c138c`、worktree/index clean、`writer_lease=RELEASED`，见 frontend_handoff 字段），但双门未齐，仍未进入跨仓联调、未取得前端写权。
42-D 已完成 provider-neutral 的不可变运行时工件投影底座（**RUNTIME_ARTIFACT_PROJECTION_READY**），
并在其上完成 **Pi、Hermes、OpenCode 三家生产封装（PI/HERMES/OPENCODE_PRODUCTION_CHAIN_PREPARED）**：
真实 adapter/agent（Pi 依赖闭包、Hermes 隔离 Python 闭包、OpenCode 摘要固定单文件二进制）经 c4
Worker+bwrap 连接本机 loopback 假 DeepSeek 端点，两轮同一 Server Session、上下文与重放/重开证据齐备。
**三家因此只是封装就绪，仍是 MODEL_NOT_VERIFIED**（假端点与固定 nonce，不是付费模型验收）。
**Codex 生产封装也已完成**（见下行），**四家封装全部就绪、全部仍 MODEL_NOT_VERIFIED**；
最终门始终是 **Codex/Pi/Hermes/OpenCode 四家真实模型门**——与封装就绪不是同一件事，
不得混写。**state capture 类型化错误边界返修已完成并经 Reviewer 复审修复**（现行检查点 c8：
fd 锚定 no-follow 读取、确定性拒绝立即失败并保留准确码、`VIEW_CHANGED` 仅表示
"fd 读取中身份改变"、`VIEW_MISSING`/首次越界为确定性码并由 capture 层按上下文转换；
证据见
[state-error-boundary.md](../server-round1/fullstack/state-error-boundary.md)）。
**已修复两条通用缺陷**：Worker 默认 5 秒租约会取消"客户端静默"的运行中 attempt
（**WORKER_LEASE_KEEPALIVE_FIXED**，含 Windows 真机 8 秒静默证据，见
[原生 driver 接缝](../server-round1/fullstack/native-driver-seam.md) §5）；Hermes 会把产品模型
`deepseek-flash` 静态折叠成 `deepseek-chat`（已按其官方自定义 provider 路径修复，两轮线上值精确为
产品 id）。另有 **HARNESS_CAPABILITY_CONTRACT_READY**：四家向上能力合同收敛为单一版本化词汇（见
[能力矩阵](../server-round1/fullstack/harness-capability-matrix.md)）。
**四家原生 HOME 双重收敛隔离已实施**（`PROFILE_NATIVE_HOME_ISOLATION_IMPLEMENTED` /
`DONE_FOR_FOUR_FAMILIES`，guest `HOME=/runtime/home`，见
[profile-home-isolation.md](../server-round1/fullstack/profile-home-isolation.md) §8b），
**Codex 生产封装已完成**（`CODEX_PRODUCTION_CHAIN_PREPARED`，工件/官方配置/隔离 `CODEX_HOME`/全链门齐备，
见 [codex-production-packaging.md](../server-round1/fullstack/codex-production-packaging.md)），
四家（Codex/Pi/Hermes/OpenCode）现在都有生产封装且**都仍 MODEL_NOT_VERIFIED**。
DeepSeek 官方 API 授权见42 §D；累计发生 1 次 API 可达性调用（12 tokens，费用 <¥0.01），
Codex 旧 chat 配置尝试在模型请求前失败；新 Responses 配置已通过无模型读取门，二者都不能记作模型调用
或 Harness 验收。

| 单号 | 状态 | 证据 | 下一步 |
| --- | --- | --- | --- |
| [39](work-orders/39-server-boundaries.md) | **READY_FOR_HARNESS** | [阶段证据](../server-round1/server-boundary/stage-a-b-c.md)：幂等并发双派发缺陷先复现后修复、能力声明改为注册派生、双中立provider测试、legacy codex 退出生产装配 | wire反馈通道 [wire-review.md](../server-round1/wire-review.md) 已建立并写入首轮 |
| [40](work-orders/40-four-harness-integration.md) | **FOUR_HARNESS_COMPONENTS_READY** | [40-A 底座](../server-round1/harness-integration/stage-a.md) / [40-B 通道](../server-round1/harness-integration/stage-b.md) / [40-C 矩阵](../server-round1/harness-integration/stage-c.md) / [40-D 汇总](../server-round1/harness-integration/stage-d.md) + [握手证据JSON](../server-round1/harness-integration/handshake-40c.json)：四家组件门 25/25；全量 227 passed/4 skipped/0 failed；Rust 4 passed；真实二进制零凭据握手 pi/hermes INITIALIZED、opencode HEALTH_OK、codex 诚实要求凭据 | 本单终态；Server 侧编排与 wire 锁定进入 41；真实模型门留待 42 §D |
| [41](work-orders/41-core-service-acceptance.md) | **BACKEND_WINDOWS_R4_READY** | [后端验收](../server-round1/backend-acceptance.md)：28 方法+队列终态严格 schema 回归 29/29；Windows r4 exit 0（保守旧门 + `tree_terminate` 强制树终止后的有状态崩溃式重启/同 native id `session/resume`/终止前 delta/ObjectStore checkpoint/marker 清理/独立 `-PostCheck`）；反例含 5 种不可用 checkpoint 与 4 种拒绝清理；全量 348 passed/4 skipped，Node 25/25+4/4，Rust 4/4 | 42 双门未满足，整体 READY 仍受约束 |
| [42](work-orders/42-fullstack-delivery.md) | **PRE_GATE_WORK_IN_PROGRESS**（后端门=四家真实模型门未执行；前端实现门自述已满足但未接管，未联调） | [进度与费用账](../server-round1/fullstack/progress.md) + [运行时工件投影底座](../server-round1/fullstack/runtime-artifact-projection.md) + [Pi 生产封装](../server-round1/fullstack/pi-production-packaging.md) + [Hermes 生产封装](../server-round1/fullstack/hermes-production-packaging.md) + [OpenCode 生产封装](../server-round1/fullstack/opencode-production-packaging.md) + [通用 driver 接缝](../server-round1/fullstack/native-driver-seam.md)：工件投影 **RUNTIME_ARTIFACT_PROJECTION_READY**；Pi/Hermes/OpenCode 三家 **\*_PRODUCTION_CHAIN_PREPARED**（真实 adapter/agent + c4 Worker + bwrap + 本机假端点，两轮同一 native id / 两轮上下文 / 真实重开方法，两条门本会话串行复跑 exit 0，均 `MODEL_NOT_VERIFIED`）；**Worker 5s 租约取消静默 attempt** 已第一手复现并**已修复**（`WORKER_LEASE_KEEPALIVE_FIXED`，含 Windows 真机 8 秒静默证据）；能力合同已统一为 canonical 词汇（`HARNESS_CAPABILITY_CONTRACT_READY`）；**四家原生 HOME 隔离已实施**（`PROFILE_NATIVE_HOME_ISOLATION_IMPLEMENTED`）、**Codex 生产封装已完成**（`CODEX_PRODUCTION_CHAIN_PREPARED`），四家都有生产封装且都仍 MODEL_NOT_VERIFIED；**state 错误边界返修完成，现行 bundle c8（2026-09-15）**：runtime-artifact/Pi/Hermes/OpenCode + Windows r4/PostCheck 用 c8 exit 0，Codex 门【历史：曾为未解决的红绿间歇；用户已裁决 A，`.tmp` 与 `shell_snapshots` 已遮蔽、最终全绿】见 [state-error-boundary.md](../server-round1/fullstack/state-error-boundary.md) §4.2–4.4）；前端复测（2026-09-15 02:51 +08:00）：`DESKTOP_IMPLEMENTATION_READY` 自述成立、HEAD `8e7c138c`、worktree/index clean、`writer_lease=RELEASED`、r3 28 PASS/0 FAIL、wire 两摘要一致；28 方法 wire 摘要未变；DeepSeek 官方 API 可达（12 tokens） | **四家（Codex/Pi/Hermes/OpenCode）真实模型门**；双门后联调 |
| [37](work-orders/37-http-codex.md) | **SERVER_HTTP_CODEX_R1_PARTIAL** | [原完成审计](../server-round1/completion-audit.md) / [C/D证据](../server-round1/stage-c-d.md)保留；检查点5a45303/5b71393/cd5efbe/67c6b40。独立定向23 passed；同键并发双accept已由39复现并修复；能力不诚实已由39结构性修复 | abandon 断言经探针定性为**测试侧竞态**（终止状态持久化后约50ms才 abandon；负载高时10/10失败），已改为有界等待、断言强度不变，修后10/10通过；原生语义迁移由40执行 |
| [38](work-orders/38-harness-extension-selection.md) | **HARNESS_EXTENSION_SELECTION_READY_FOR_DECISION** | 两轮 A/B/C 完成：[最终建议与边界](../server-round1/harness-selection/boundary.md)。保留有条件首选 `harness-remote v3.0.2`；零模型/凭据 | 首选已由40消费进入有门禁接入；不再等待决定 |

## 当前长期goal状态字段（执行者每阶段维护）

- backend_implementation: **POST_RESUME_GATES_PENDING**（39/40组件门完成；41的28方法+队列终态已按
  锁定摘要29/29；Windows r4 平台门通过，**BACKEND_WINDOWS_R4_READY**。42-D 已补
  **RUNTIME_ARTIFACT_PROJECTION_READY**（工件投影底座）与 **四家生产封装全部完成**
  （Pi/Hermes/OpenCode/Codex \*_PRODUCTION_CHAIN_PREPARED，真实 adapter/agent + c5/c6/c7 Worker +
  bwrap + 本机假端点两轮，同一 native id、上下文与真实重开方法；**四家仍 MODEL_NOT_VERIFIED**）。
  2026-09-15 完成 **state capture 类型化错误边界返修（c7 起步，经 Reviewer 复审修复后现行 c8）**：
  runtime-artifact/Pi/Hermes/OpenCode 四门 + Windows r4/PostCheck 用 c8 串行 exit 0；Codex 门：用户已裁决 A、`.tmp` 与 `shell_snapshots` 已遮蔽、最终 4 轮全绿
  （10 绿→5 红→最近 3 绿，见 codex_native_state_findings）；详见
  [state-error-boundary.md](../server-round1/fullstack/state-error-boundary.md)。
  剩余唯一后端门为**四家真实模型门**（Worker 5s 租约缺陷已修：`WORKER_LEASE_KEEPALIVE_FIXED`），
  任一封装就绪都不折算为已通过）。
- frontend_handoff: **DESKTOP_HANDOFF_CONSISTENT（按其自述成立；后端仍未接管）**——只读复测
  2026-09-15 02:51 +08:00：HEAD `8e7c138c96337fc20ed61d3c21100e6449c8ec95`
  （00:51:21 release 提交），`git status --porcelain` **0 行**（含 untracked），
  `writer_lease=RELEASED`、`DESKTOP_IMPLEMENTATION_READY`、`REAL_FLOW_VERIFIED=否`、
  r3 证据 `executed 28 → allOk=true，counts={"PASS":28,"FAIL":0,"SKIP":0,"PENDING":0}`，
  `evidence/DESKTOP_IMPLEMENTATION_HANDOFF.md` 在场且与 status 终态一致；
  wire 两摘要就地重算仍与锁定值一致（`11e3b3e7…` / `5d4fa3bf…`）。
  上一轮 00:50 观察到的 `DESKTOP_HANDOFF_INCONSISTENT`（lease 释放被自己暂停、工作树 6 改 + 1 未跟踪）
  已被该 release 提交收口，属历史观察。工作树内仅 2 个长闲置进程（zcode-cli/bash，均始于 09-14），
  无 electron/node 写入者、release 后无文件更新；按纪律**未终止任何进程**、**未取得写权**、
  未记录 `FULLSTACK_INTEGRATION_OWNER`、未写前端任何文件。接管仍以双门成立为前提。
- frontend_observed_state: **DESKTOP_IMPLEMENTATION_READY（前端自述；本轮复测与其 status/handoff
  一致）**（只读观察，2026-09-15 02:51 +08:00）。
- frontend_worktree: /home/maoqh/projects/agent-box-desktop-next-wsl-round1 @ feature/agentbox-desktop-product。
- frontend_checked_at: 2026-09-15 02:51 +08:00；observed_head:
  `8e7c138c96337fc20ed61d3c21100e6449c8ec95`；`git status --porcelain` 本次 **0 行**。
- 42 双门判定（2026-09-15 02:51 +08:00）：BACKEND_IMPLEMENTATION_READY=**否（暂时：唯一剩余后端门
  是四家真实模型门；四家生产封装、HOME 隔离与 state 错误边界（现行 c8）均已完成）**；
  DESKTOP_IMPLEMENTATION_READY=**前端自述是，本轮复测一致（clean、lease released、r3 28 PASS、
  同 wire）**。**仍未进入全栈联调**、未写前端文件。
- wire_version / schema_digest: 当前28方法提交 `3aba5c5c` 为 **WIRE_LOCKED_FOR_IMPLEMENTATION**，TS
  `11e3b3e70d332585d31900c09ba063d95aa6b72b1904921c665fb72f81c10035`、生成工件
  `5d4fa3bfeec6c3273c6073b37794e4ab2aca6e07e48184bc3a2b878c1fe5e4ed`。15:48 在前端工作树**就地
  重算**二者摘要仍与上值一致，故锁未变：未重锁、未改合同。
- code_checkpoint_pair: 后端 r4 相关检查点分三层、不可互相替代——native-state 实现基础=`3e4282b`、
  r4 验收脚本/测试代码=`713b2e3`、已提交脚本上的 r4 复跑证据=`87b17a3`（`3e4282b` 不是 r4 检查点）；
  42-D 工件投影检查点=`dba9c0f`+`f846f09`；Pi 生产封装检查点=`0f499b7`+`9f3dd9c`（封装实现 + 证据），
  Pi gate 清理返修=`828bc5b`+`f6f7411`；
  **能力合同轮检查点**（全部在当前 HEAD 的祖先链上）：canonical 合同=`6453d58`、四家视图派生=`9e9da63`、
  跨传输收窄测试=`b2f73dc`（含 `accept-e.ps1` 的 canonical 声明与有状态 harness 的 `native_continuation`）、
  矩阵/状态收口=`1f09647`；**能力诚实性返修检查点见本轮提交**（真值表修正 + 命名空间边界 + 账目修订）；
  Hermes 封装检查点=`19f945a`、OpenCode 封装检查点=`d3a543a`、通用原生 driver 接缝检查点=`fc62037`、
  两家证据/status 收口检查点=`625cc2b`；提交态假绿返修 + driver status 合同检查点=`407c379`
  （其后的 docs 提交只记录本轮复跑证据，不另立检查点）；
  前端合同检查点=`3aba5c5c`；（历史）前端观察 HEAD=`bd1b28b4`（09-14），已于 09-15 02:51 复测取代：前端最终交接观察 HEAD=`8e7c138c96337fc20ed61d3c21100e6449c8ec95`（release 提交、clean、`writer_lease=RELEASED`）；本阶段检查点=`63e3bf0`（错误边界修复）+`eefe652`（docs/c7 证据），其后为本轮返修提交。
- pi_production_chain: **PI_PRODUCTION_CHAIN_PREPARED**（真实 `@automatalabs/pi-acp@0.5.0` + 真实 Pi
  依赖闭包 → c4 release Worker + bwrap → 本机 loopback 假 DeepSeek 端点；Pi 运行时工件 317 包 /
  15458 条目 / 64.9 MiB / tree digest `sha256:afe238d3…`，双构建一致、只读、非仓库内输出；
  两轮同一 Server Session 与同一 native id，provider 请求恰 2 次、`model="deepseek-flash"`、
  `max_tokens=64`、thinking 禁用、第二轮上下文含第一轮 user+assistant、重开为重放语义的
  `session/load`（**不是** `session/resume`）；未知模型在发 HTTP 前拒绝；缺凭据 Server 以
  `CREDENTIAL_REQUIRED` 拒绝。**Pi 仍 MODEL_NOT_VERIFIED**，`workbench_model_verified_count=0`）。
- pi_gate_cleanup_fixed: Pi 全链 gate 首次提交存在**清理假绿**——`shutil.rmtree(..., ignore_errors=True)`
  删不掉临时根内由 Pi 构建器发布的 0555/0444 工件，命令仍 exit 0 并留下 `/tmp/agentbox-pi-gate-*/`，
  证据文档却写成 `run.removed=true`（取自更早一次使用外部 `--artifact` 的运行）。已返修：禁用
  `ignore_errors`、显式处理只读工件、只在身份校验通过后删除、任何残留非零退出、`--keep`／外部
  `--artifact` 语义保持；补 12 项定向测试（含注入删除失败、主失败与清理失败并存）。修复后默认与
  外部 `--artifact` 运行均 exit 0 + `run.removed=true` 且无残留。
- pi_production_defect_fixed: 真实 Pi 暴露既有公共缺陷——ACP 以空对象播发 session 能力
  （`sessionCapabilities.resume = {}`），Server 侧 `bool({})` 判为不可续接，导致第二轮以
  `SIDECAR_CHECKPOINT_INVALID` 失败；已改为"存在且非 False 即视为已播发"（中立、无品牌分支），
  参数化 7 例回归 + 端到端复核。
- hermes_production_chain: **HERMES_PRODUCTION_CHAIN_PREPARED**（真实 `hermes acp`
  （hermes-agent 0.19.0）+ **隔离 Python 运行闭包** → c4 release Worker + bwrap → 本机 loopback 假
  DeepSeek 端点；闭包 60 包 / 4765 条目 / 108 441 979 字节 / tree digest `sha256:b3fb1e4b…`，
  只读、非仓库内输出、双构建一致、`python3 -S` 自足性导入通过，**未挂用户 site-packages**；
  两轮同一 Server Session 与同一 native id，每轮恰 1 次 provider 请求（合计 2、超预算 0、未授权 0）、
  第二轮含第一轮 user+assistant、重开为直接观测到的 ACP `new_session → resume_session`；
  注入 5xx 实测不重试（声明上界 2）；未知模型与产品模型都在发包前被拒；缺凭据
  `CREDENTIAL_REQUIRED`；state 10 文件零 token 命中。**产品模型即线上值**：Hermes 会静态折叠非
  一等公民 id，故按用户裁决改用其官方支持的**用户自定义 provider 声明**（块键与 `model.provider` 都用
  Hermes 实际持久化的裸 `custom`——`custom:<key>` 在 resume 轮解析不到块会退化为默认端点+占位密钥，
  第一版实现正是这样丢过凭据，现由 `HERMES_GATE_CREDENTIAL_NOT_DELIVERED` 硬断言守住）；两轮请求体
  `model` 精确为 `deepseek-flash`，`observedModels` 三相位均为 `deepseek-flash`，历史
  `EFFECTIVE_MODEL_ID="deepseek-chat"` 接受逻辑已删除。代价：native 选择 `custom:deepseek-flash`、
  provider 身份 `custom`、上下文元数据回退 128K（内建表 1M）。仍 MODEL_NOT_VERIFIED）。
- opencode_production_chain: **OPENCODE_PRODUCTION_CHAIN_PREPARED**（真实 OpenCode 1.18.21
  **单文件二进制** 184 498 304 字节 / digest `sha256:c9485f62…`，经既有 `executableMounts`
  摘要固定只读挂进 bwrap 到 `/runtime/bin/opencode`（guest 内复核 `--version=1.18.21`、写 `/runtime/bin`
  得 EROFS）；**不伪装 ACP**：新增中立 driver 接缝 + 上游 `ManagedOpenCodeHost` 托管 `opencode serve`；
  两轮 delta 4,5,6<9 与 13,14,15<18、第二轮含第一轮上下文、checkpoint 4 文件（SQLite）`resumable=true`、
  重开相位 `createsInsideReopenPhase=[]` 且 `hostStarts≥2`；provider 恰 2 次、`requestsBeyondBudget=0`；
  受控重试实测上界 **6**（取代 42d 无证据的 12）；未知模型/缺凭据/坏 checkpoint/漂移二进制全部拒绝；
  token 在事件/状态/报告/Git 零命中；清理 `removed=true`。仍 MODEL_NOT_VERIFIED）。
- opencode_gate_token_false_green_fixed: **提交态假绿已复现并返修**——OpenCode 全链门把固定假 token
  （`opencode-gate-fake-token-…`）写进自身 tracked 源码，同时 cleanup 断言"tracked Git 零命中"，
  于是源码未提交时能绿、提交后必然命中自己：在最终提交态复现为
  `tests/server/test_opencode_gate_cleanup.py` 4 项失败（均被 `OPENCODE_GATE_TOKEN_IN_GIT` 顶替）。
  返修：token 改为**每次运行现生成**（`agentbox-opencode-gate-fake-token-` 前缀 + `secrets.token_hex(16)`），
  生命周期收在 `main()` 的一次运行窗口内（进入时创建、清理核验后清空；窗口外取用即
  `OPENCODE_GATE_NO_ACTIVE_RUN`）；扫描改为检查**本次实际注入的完整值**（`token_appears_in_tracked_content`），
  不打印、不进 argv、不读真实 locator。补 5 项提交态回归：动态值不在 tracked 内容、两次运行 token 不同、
  扫描入口在测试独占仓库上的真/假两性、index 写入守卫，以及**阳性反证在 `tmp_path` 内的测试独占 Git
  仓库执行**（真 `git add`/`git commit` 后由生产扫描入口命中，门以 `OPENCODE_GATE_TOKEN_IN_GIT` 非零
  失败）；**AgentBox 主仓 index 与工作树从未被写入**，该文件每个测试前后比对 porcelain 与 cached diff
  必须逐字节相同（早先"主仓 `git add -N` 后再 `git reset`"的写法已按此返修，历史说明保留在 progress）。
  隔离返修后复跑：五文件定向 **80 passed**、OpenCode gate cleanup + native driver 定向 **39 passed**、
  `build-opencode-authorization.test.mjs` 9/9、OpenCode 与 Hermes 两条全链门 **exit 0**
  （`cleanup.tokenInTrackedGitContent=false`）、`git diff --check` 干净、tracked 内容与门输出都没有
  生成值、主仓 porcelain/cached diff 在测试前后逐字节相同。
- native_driver_contract_tightened: driver 必需方法集合加入 **`status`**（envelope 暴露的操作；
  缺它时注册即以 `DRIVER_METHOD_MISSING` 拒绝，不再等到轮次中途失败）；测试**从接缝模块读取
  方法表**并对测试 fixture 与真实 OpenCode driver 各构造一次实例核对齐备。
- native_driver_seam: 新增**中立原生 driver 接缝**（`runtime/native-driver.mjs` + `worker-entry.mjs`
  op 路由 + `adapter.driver` 打包 + `message_delta`/`driver_exit` 映射；只从同一 bundle 的
  `deployment/` 加载、凭据只经 `spawnProcess` 进子进程、事件深红删），Server/Core/Worker/bwrap
  仍然只见通用 deployment 字段、无任何 Harness 品牌分支；通用测试 17 项，ACP 路径回归 91 passed、
  Node 25/25。证据见 [native-driver-seam.md](../server-round1/fullstack/native-driver-seam.md)。
  driver 路径已用一次性探针在真实 Worker+bwrap 上验证（模块投递、凭据到孙进程、state 回投）。
- worker_view_contract_hardened: **Worker view 列表合同收紧**——普通目录递归、普通文件列出，**符号链接不跟随
  不读取不捕获**（允许跳过 Codex 运行期的 argv0 别名），但**每一个访问到的条目（目录/文件/符号链接/特殊
  文件）都计入统一 traversal 上限**（`MAX_VIEW_TRAVERSAL_ENTRIES = 4096`，超过即类型化失败）；FIFO/socket/
  设备等**特殊文件类型化拒绝整个 listing**（原先被静默跳过，等于报告一个并不存在的目录）；`view.get`
  继续拒绝 symlink 与一切非普通文件；被跳过的符号链接不被删除，cleanup 仍然可用。Rust 测试 15 passed。
- state_capture_content_stable: **state 捕获改为内容稳定性门**——不再只比较 `(path, size)`（同长度改写会
  被误判稳定），改为完整 snapshot `relative path + size + digest`、连续两次身份相同才算稳定，且**返回的
  字节就是与稳定 snapshot 相符的那一份**；任一文件在分块读取中 digest 改变则继续等待（有界）；deadline
  到期抛 **`SIDECAR_STATE_NOT_SETTLED`**，**绝不静默生成 checkpoint**；空 state 连续两次空 snapshot 即
  稳定；256 文件/8 MiB/受保护路径/凭据扫描规则全部保持。定向测试 7 项。
- worker_bundle_c6: 因 Worker 合同收紧重建 **`.acceptance-bundle-c6`**
  （`sha256:96256b2ea76218448183fc0b1063aba92c15fca3fb22fa8a00f7e0f7efc2466e`）；**c4/c5 未覆盖**、仍为
  历史有效证据。版本口径：ABW1 frame 与 manifest **`wireVersion = 1`**，Worker control
  **`PROTOCOL_VERSION = 3`**（本轮未改响应形状，故 control protocol 不升版）。
- windows_r4_c6: Windows r4 用 **c6** 通过（exit 0、`worker_digest=sha256:96256b2e…`、
  `state_projection=/runtime/home/sessions`、`session/new→session/resume`、delta 10 < completed 12、
  8 秒静默在默认 5 秒租约下 `elapsed_ms=8857` 完成）+ 独立 `-PostCheck …CLEAN`。
- state_capture_error_boundary: **确定性 view 失败不再被 settle 循环吞掉**（2026-09-15）。Worker 把
  特殊文件/`VIEW_SPECIAL_FILE`、traversal 上限/`VIEW_TRAVERSAL_LIMIT`、文件数上限/`VIEW_FILE_LIMIT`
  改为各自的准确码并立即失败；Worker 侧唯一重试码 **`VIEW_CHANGED`** 只表示"fd 打开后
  读取中身份（dev/ino/size）改变"；不存在的路径=确定性 `VIEW_MISSING`、首次越界
  offset=`VIEW_INVALID`，二者由 capture 层在"刚列出过/已持有分块"的上下文转换为
  `SIDECAR_STATE_IDENTITY_CONFLICT` 重试（Reviewer 复审后语义，取代本条初版描述）；sidecar `_STATE_TRANSIENT_CODES` 收窄为
  `{SIDECAR_STATE_IDENTITY_CONFLICT, VIEW_CHANGED}`——`VIEW_INVALID`/`VIEW_IO`/`VIEW_INCOMPLETE`
  不再被无条件当作瞬态，拒绝类失败**不再被改写成 `SIDECAR_STATE_NOT_SETTLED`**；分类只读 code
  不读英文 message；4096/1024/256/8 MiB 上限、symlink 与特殊文件语义、凭据/受保护路径规则全部保持。
  先失败后修：Rust 8 failed→pass、Python 13 failed→pass（跨层测试从 Worker 源的被审计位置提取真实码
  驱动真实循环；另有两个测试驱动**真实 Worker 进程**端到端验证）。响应形状未变、
  ABW1 `wireVersion=1` 与 control `PROTOCOL_VERSION=3` 均不升版（envelope 逐帧测试锁定）。
  如实记录：Codex 门曾出现 2 次"capture 时 view 超 1024 文件"的间歇失败（c6/c7 两个 Worker 都出现，
  非本修复引入；修复只让失败从 10s 后的 NOT_SETTLED 变为立即准确码），随后 10 轮复跑未再现、
  view 峰值稳定 114 文件；gate 现常驻采样并报告 `stateProjectionObservation`。
  详见 [state-error-boundary.md](../server-round1/fullstack/state-error-boundary.md)。
- worker_bundle_c7: 【历史检查点，现行 bundle 由 worker_bundle_c8 取代】因错误码边界重建 **`.acceptance-bundle-c7`**
  （`sha256:6408fbc7da63e9b85c52ab1902ab12e3faa5160021187328b03b5fa9dc9848d4`）；**c4/c5/c6 未覆盖**、
  均为历史有效证据（复跑前后摘要逐一核对未变）。版本口径不变：ABW1 frame 与 manifest
  **`wireVersion = 1`**，Worker control **`PROTOCOL_VERSION = 3`**（只新增错误码值，响应形状未变）。
- windows_r4_c7: 【历史检查点，现行由 windows_r4_c8 记录取代（见 worker_bundle_c8 条）】Windows r4 用 **c7** 通过（exit 0、`worker_digest=sha256:6408fbc7…`、
  `stop_mode=tree_terminate`、`state_projection=/runtime/home/sessions`、
  `session/new→session/resume`、delta 10 < completed 12、8 秒静默在默认 5 秒租约下
  `elapsed_ms=8840` 完成）+ 独立 `-PostCheck …CLEAN`。
- worker_bundle_c8: Reviewer 复审修复（fd 锚定 no-follow + `VIEW_MISSING` 合同 + gate 诊断因果化）后重建
  **`.acceptance-bundle-c8`**（`sha256:514f48a9c24c8a13edefa4eb3aa5473b0f3a25d88a94aea1a19bb16ea2707975`；
  Worker 源在 c8 构建后未再变——`git diff <fix-commit> -- workers/ 为空`，故 c8 摘要仍为现行 bundle；
  **c4–c7 未覆盖**，摘要逐一核对未变）。c8 上串行复跑：runtime-artifact/Pi/Hermes/OpenCode exit 0、
  Windows r4 exit 0 + 独立 `-PostCheck…CLEAN`（实例核对）；Python 全量 **820 passed/4 skipped**
  （822 为诊断测试并例前的中间计数，已被取代）；Rust **27 passed**。Codex 门：**未解决的
  红绿间歇**——此前 10 轮绿 + 连续 5 轮红 + 最近 3 轮绿（诊断非因果化后实测），全部如实记录。
- codex_native_state_findings: 两个第一手发现【历史条目：用户已裁决方案 A，`.tmp` 与
  `shell_snapshots` 均已按 attempt-ephemeral 遮蔽；现行结论见 codex_decision_a_implemented】（证据见
  [state-error-boundary.md](../server-round1/fullstack/state-error-boundary.md) §4.3）：
  ①Codex 0.147.0 运行时把内置 plugin/skill 语料解包进 `$CODEX_HOME/.tmp/plugins/`（实测峰值
  **5529 文件**，瞬态；绿跑峰值 114），与列表上限 1024 相撞即确定性 `VIEW_FILE_LIMIT`；
  ②约 1/15 轮 sidecar 凭据扫描在原生 state 命中假 token（`SIDECAR_STATE_CONTAINS_SECRET`，
  扫描正确拒绝；该路径后由门内观察器第一手捕获为 `shell_snapshots/*.sh`，已遮蔽）。①在 2026-09-15 晚间连续 5 轮与捕获重叠（每轮峰值恰 5529，均以 `VIEW_FILE_LIMIT` 失败）
  【历史快照，现行结论见本文件顶部的红绿间歇】，未掩盖。二者直接影响 Codex 付费真实模型门的前置条件；Reviewer 复审亦以 HARNESS_QUESTION
  给出方案 A（部署层 attempt-ephemeral 投影 `.tmp` + fail-closed 扫描；不提高通用上限、
  无品牌分支）/B（官方配置关闭解包与凭据持久化）/C（Codex 暂 MODEL_NOT_VERIFIED），
  推荐 A——**用户已裁决 A 并已实施**。
- codex_decision_a_implemented: **用户已裁决 A（2026-09-15）并已实施、已验证**——`stateProjection`
  新增可选 `ephemeralPaths`（部署声明、沙箱语法验证），bwrap 在全部 bind 之后对该子路径
  追加 `--tmpfs`：Harness 可写，但**不进 view/state/checkpoint，尝试结束即消失**；
  1024 列表上限与 fail-closed 凭据扫描不变。Codex 生产模板声明 `ephemeralPaths: [".tmp"]`。
  反例与证明：真实 bwrap 遮蔽测试（burst 文件不落宿主 state、普通兄弟文件正常落盘）、
  argv 顺序断言（tmpfs 在 state bind 之后）、越界/RO 冲突拒绝、deployment 解析缺省兼容。
  **泄漏路径第一手捕获**：`native-state/shell_snapshots/*.sh`（Codex 环境快照含注入的
  凭据环境变量原文）→ 方案 A 扩展为 `ephemeralPaths: [".tmp", "shell_snapshots"]`。
  **c8 最终复跑（4 轮，含快照遮蔽）**：全部 exit 0、view 峰值 **112**、`tokenInState=false`、
  credentialPathHits=0、state 78 文件。Python 全量 **833 passed/6 skipped**（诊断测试 10 例）；Rust 27 passed；**Codex 已按官方 feature flags 从源头修复，并有配对差分证明因果（2026-09-15）**：`features.plugins=false` 与 `features.shell_snapshot=false` 已入受审配置，无遮蔽对照轮实测 `.tmp/` 与 `shell_snapshots/` 目录均不存在、零凭据命中、门 exit 0（Python 全量 **843 passed/6 skipped/0 failed**）。**差分（同 0.147.0、同 HEAD、无 tmpfs 遮蔽）**：控制腿（去掉官方 `[features]`）第一轮即在 `native-state/shell_snapshots/*.sh` 命中注入假 token（门 exit 1），处理腿（部门原样配置）2 轮全绿零命中 → `CODEX_FEATURE_FLAG_DIFFERENTIAL_OK`；即 `features.shell_snapshot` 默认开启就是凭据写入原生 state 的成因，已由配对差分证明。settled 判据现为**两阶段（turn 链 + reopen）合并**、Harness 退出后由独立扫描器同步完成。此前的“口径”说明如下（历史）：**Codex 门口径已按用户裁决 A 收口（判据=“全树走完且与上一轮字节身份完全一致”的稳定轮次至少被观测一次；活动写入竞态只入报告），真机 3 轮 2 绿 1 红，红的 1 轮是另一条既存间歇（capture 报 VIEW_INCOMPLETE，与凭据扫描无关，待定位）。原“当前红（口径待裁决）”说明如下（历史）：凭据观察器按 Reviewer 要求把“读取中变化的 state 文件”记为持久事实，而活动 Codex 的 `state_*.sqlite-wal` 运行期持续写入，故判 `CODEX_GATE_STATE_SCAN_INCOMPLETE`（files 83、cycles>200、零凭据命中、零 hit）；capture 期 sidecar 扫描仍是权威且 fail-closed；
  Worker 源未变（c8 摘要不变）；四门 + Windows r4/PostCheck 已在最终 HEAD 复跑全绿。
- codex_decision_pending: **已由用户裁决 A（历史条目）**——
  Codex `.tmp/plugins` 突发（VIEW_FILE_LIMIT）与凭据瞬时入 state（SIDECAR_STATE_CONTAINS_SECRET）
  的处置方案 A（部署层 attempt-ephemeral 投影 `.tmp`，Reviewer 推荐）/B（官方配置关闭，未找到
  已验证开关）/C（Codex 暂 MODEL_NOT_VERIFIED）；**用户已裁决 A**，原挂起项关闭。ex 付费门与 preflight、
  `REVIEWER_AUTOMATION_READY` 登记、真实 locator 读取全部挂起；其他三家不受影响。
  Reviewer 第十轮结论：本阶段除该 P0 外无任何 FINDING/矛盾（REVIEWED_HEAD=47d6b64）。
  裁决 A 已实施并经多轮复审修复（壳快照泄漏路径已捕获并遮蔽）。四家均仍 MODEL_NOT_VERIFIED。
- reviewer_automation: §4.1 通道门**已通过**（2026-09-15）：固定 session 机械比对一致、真实
  `codex exec resume`（read-only sandbox、flock、无 bypass）exit 0、verdict `VERDICT: ACCEPT`
  含 `REVIEWER_CHANNEL_OK`、`REVIEWED_HEAD` 与调用前 HEAD 一致、调用前后 `git status --porcelain`
  零变化。§4.2 的当前阶段真实审查闭环在阶段提交后执行；两者都通过才登记
  `REVIEWER_AUTOMATION_READY`。
- codex_config_boundary: Codex 生产配置边界**只读复核**（未改产品值）：`model=deepseek-flash`、
  `base_url=https://api.deepseek.com/`、`wire_api=responses`、`CODEX_HOME=/runtime/home/.codex`、
  `env_key=CODEX_API_KEY`、`cli_auth_credentials_store=ephemeral`。`CODEX_API_KEY` 只是 deployment 声明的
  **临时环境变量名**；用工件内 0.147.0 二进制**只读**探测确认 `ephemeral` 是受支持值（非法值报
  `expected one of file, keyring, auto, ephemeral`），且 Codex 运行后的 checkpoint 里**没有 `auth.json`**
  （未落盘认证），token 不入 deployment/事件/argv/workspace/Git——**state 例外须更正：2026-09-15 门内实测约 1/15 轮凭据扫描在原生 state 命中假 token（正确拦截，见 state-error-boundary.md §4.3），『token 绝不入 state』的旧绝对结论已被该观测取代，付费门前必须先解决**；**未执行**签入的官方 setup 脚本、
  **未读**用户 `~/.codex`。
- native_home_isolation: **PROFILE_NATIVE_HOME_ISOLATION_IMPLEMENTED** /
  `DONE_FOR_FOUR_FAMILIES`（guest `HOME=/runtime/home`；Codex `/runtime/home/.codex` + `CODEX_HOME`、
  Pi `.pi/agent` + `PI_CODING_AGENT_DIR`、Hermes `.hermes` + `HERMES_HOME`、OpenCode `.config/opencode` +
  `.local/share/opencode` + `OPENCODE_CONFIG`；双重收敛、配置 RO、state 有界 RW、受保护只读配置**不进
  checkpoint** 且恢复时类型化拒绝）。通用合同在 `home_projection.py`（target 语法、深度升序 bind 顺序、
  protected 关系），有 argv 下标与真实写入反证（旧顺序会静默丢配置）。三家 gate 在新布局重跑 exit 0；
  Windows 复验用新 bundle c5 并按 `/runtime/home/sessions` 通过 + 独立 `-PostCheck` clean。
- codex_production_chain: **CODEX_PRODUCTION_CHAIN_PREPARED**（真实 `codex-acp` 1.1.14 + Codex app-server
  0.147.0 经工件进入 c5 Worker+bwrap → 本机 loopback **Responses** 假端点）。官方脚本 1.3.0
  （SHA `0a3a3370…`，只读不执行）与完整 models.json（76107B，与既有资产逐字节相同）；工件 20 包/529 条目/
  320.8MB/tree digest `sha256:9051b844…`（双构建一致）；门默认与外部工件两种模式都 **exit 0**（两轮
  completed、delta 4<7 与 10,12<15、`/responses`、model 精确 `deepseek-flash`、**实测重开 `session/load`**、
  host-home sentinel 不可见、RO 写入 EROFS、state 100 文件可续接、未知模型发包前拒绝、清理无残留）。
  `HAS_PRODUCTION_DEPLOYMENT=True` 仅在门通过后翻转；能力观测只含真实发生的五项，`attach`/`permissions`
  保持未观测。**Codex 仍 MODEL_NOT_VERIFIED**。
- worker_view_listing_fixed: 通用缺陷修复——Worker `list_view_files` 原本"遇符号链接即整份失败"，而
  Codex 运行期必写 `$CODEX_HOME/tmp/arg0/*` 别名符号链接，state 捕获因此必然 `VIEW_INVALID`。现改为
  **跳过非普通条目**（`view.get` 仍拒绝任何非普通文件；被跳过的条目不进 manifest，目标不可解析），并在
  `capture_execution` 增加**有界 settle 窗口**（两次相同 listing 即稳定，至多 5s）等待原生进程写完。
  bundle 因此 **c4→c5**（`sha256:92eac03a…`，协议仍 1）；c4 未覆盖、仍为历史有效证据。另修四个 gate 的
  假端点"从未 start 时 stop() 永久阻塞"（实测 40 分钟挂起）与 Codex gate 对外部工件缺失的
  **类型化快速失败**（不静默重建）。
- harness_capability_contract: **HARNESS_CAPABILITY_CONTRACT_READY**（统一后的 canonical 能力词汇 8 项：
  `start/observe/finish/attach/steer/stream/permissions/native_continuation`，版本化在
  `src/agent_box/resource_contracts/harness_capabilities.py`，scope 与"实现级/语义级"分类一并固定）。
  五处声明收敛为受校验的单一来源：`harnesses.toml` == `runtime/capability_declarations.json`（JS 只读投影）
  == 四家 production 模板的 `capabilityClaims`（逐项等值测试），且 JS 原生映射 ⊆ 该上限（Node 断言）。
  `deployment.capabilityClaims` 由自由字典改为严格校验（canonical id + 真 bool；未知键/漂移别名
  `streaming|approvals|attachments|sessions|resume|prompt|abort`/字符串真值/null/数组全部类型化拒绝）。
  有效能力 = 静态声明 ∩ 运行时观测（`declared/observed/supported/reason/nativeEvidence`，`observed` 三态），
  合并规则 6 行逐条参数化；`supported ⇒ declared`，runtime 不得抬高产品能力。checkpoint `resumable`、
  附件门与审批行为一律改读有效能力：`attach` 未生效时在派发前 `ATTACHMENT_UNSUPPORTED` 类型化拒绝且不留
  孤儿会话；未声明 `permissions` 时原生 permission 请求不变成虚假支持。向上投影三个边界分离：
  `hello.capabilities`（仅 wire 方法，未改）、Profile 视图（canonical 静态声明，不读 DB 快照）、
  Session/execution 有效能力。**Wire 未改**：仍 `wire/1`、28 方法，TS/生成工件摘要与锁定值一致。
  四家矩阵与逐项证据见
  [harness-capability-matrix.md](../server-round1/fullstack/harness-capability-matrix.md)：
  （历史快照，当时 Codex 无生产封装；该点已被 c5 轮取代：Codex 生产封装完成后，其能力矩阵以[harness-capability-matrix.md](../server-round1/fullstack/harness-capability-matrix.md) 与 Codex 门实际观测为准）Pi/Hermes/OpenCode 的 start/observe/finish/stream/native_continuation
  已观测（Pi 的 `attach` 只有一半证据 → 有效 false）；`steer` 无人声明。**四家仍 MODEL_NOT_VERIFIED**。
- capability_honesty_repair: **能力诚实性返修**——首版合并规则把"声明了但**未观测**"的实现级能力
  （start/observe/finish/stream）直接算成 `supported=true`，造成三类假阳性：Codex 无生产封装、零观测时
  `capability_view("codex")` 报这些能力为支持；sidecar 执行中首条 delta 之前 `stream.supported` 可能已为
  true；任何 `declared=true, observed=null` 组合都给出虚假支持结论。已按**唯一规则
  `supported == (declared is true and observed is true)`** 修正（实现级/语义级仅用于规定观测来源与证据
  强度），补真值表与六项 surface 回归（`tests/server/test_capability_truth_table.py`，含"不得预填观测"），
  并把 Work Core operation 命名空间与 Harness canonical 命名空间的边界写成代码注释 + 测试
  （`tests/server/test_capability_namespace_boundary.py`；`require_capability` 是该 SPI 的真实消费方，
  此前"无消费方"的说法**已更正**）。`HARNESS_CAPABILITY_CONTRACT_READY` 现在基于返修后的复跑结论。
  同轮修掉一个真实崩溃：`SidecarExecutionBackend` 的持久化完成线程（`_complete`）在 prompt worker
  结束后仍在通过**共享的** Work Core 连接写账，而 `stop()` 只等 prompt worker 就返回——后续
  shutdown/test 重置该连接时会在 SQLite 里段错误（本会话两次实测 core dump，栈为
  `work_core/repository.py:143 get_work ← update_work ← services.py:70 complete_work ←
  sidecar_backend._complete`）。已让 `stop()` 追踪并**有界等待**所有存活完成线程（独立于会被回收的
  `_active` 表），等待超时则**如实返回 False**（不静默成功），并补 3 项定向测试（等待语义、诚实
  False、停止后无线程残留；去掉 join 即失败，已双向验证）。
- capability_contract_side_repairs: 顺带修掉的真实缺陷——(a) `SidecarHarnessPort.profile` 的品牌默认值
  `"codex"` 改为中立空值（16/16 调用点显式传值）；(b) `_ProcessChannels.write_line` 在通道已关闭时抛裸
  `ValueError`，会在 Server 停机取消时逃逸并连带出一次 flaky 段错误，现改为类型化
  `SIDECAR_CLOSED`（`cancel` 按契约返回 False）；(c) 三家 gate 与 Windows 验收部署的漂移别名迁到
  canonical 拼写，有状态 harness 补声明 `native_continuation`（否则其 checkpoint 会诚实地变成不可续接，
  R4 恢复链断裂）；(d) capability JSON 投影进入 sidecar bundle，供 JS 侧校验静态上限。
- worker_lease_keepalive_fixed: **WORKER_LEASE_KEEPALIVE_FIXED**——Worker 默认 5 秒租约会取消
  "客户端静默"的运行中 attempt（只有客户端帧刷新 `lease_deadline`，而一轮 prompt 期间 Server 阻塞在
  prompt 响应、channel 线程阻塞在队列上，唯一发送方 `wait_terminal` 从不进入）。已修：`WorkerClient`
  新增**保活 owner**（间隔 = `max(lease_ms/3000, 0.05)`，attempt spawn 前启动，terminal/cleanup/
  disconnect/异常时停止并 join），`request()` 全程串行化（帧号、写入、响应路由同锁，heartbeat 不与
  cancel/stdin 交错），失败类型化 `WORKER_LEASE_HEARTBEAT_FAILED` 并由 `_WorkerChannels.iter_chunks()`
  有界轮询上浮（code 经 `SidecarEnvelope` 交给等待方，prompt 不再无限等待）。**默认租约仍 5000、
  Worker 过期取消未关**（停止保活后孤儿 attempt 仍在租约边界内被回收）。证据：客户端层 13 条 +
  sidecar 层 5 条反例（8s 静默完成且实测 5 次 heartbeat、terminal 后冻结、stop/close 无线程残留、
  disconnect 读写两侧类型化、静默中 cancel <3s、heartbeat 出错类型化、停止保活后 2.1s 内 Worker 仍写
  `cancelled=true`、并发不串 requestId/sequence、`wait_terminal` 不退化）；**Windows 真机**（c4 release
  Worker `sha256:31e92959…`，未重建）：`lease_ms=5000`、`lease_override=false`、`elapsed_ms=8839`、
  `turn_state=completed`、整轮 exit 0、`-PostCheck` = `…_POSTCHECK_CLEAN`。残余：保活 fail-closed
  （单请求长时间独占串行化锁会把该轮判失败），留待真实模型门观察。
- runtime_artifact_projection: **RUNTIME_ARTIFACT_PROJECTION_READY**（`runtimeArtifactMounts`
  Server仅形状校验透传 / Worker WSL 内权威验树摘要 / bwrap 只读 `/runtime/artifacts/<name>`；
  跨 Python-Rust tree digest v1 + golden fixture；上限 32768 条目 / 1 GiB / 4096 字节路径；
  Worker control protocol **2→3** 双向拒绝（含真实 c3 旧二进制）；c4 bundle
  `sha256:31e92959b06b3ee9f30ebfb9ce6b2bee74af847e4a147bba906bff7ecf681fa6`（c2/c3 未覆盖）。
  **（历史阶段 r4-era 记录）当时 c4 尚未在 Windows 复跑**：c3 的 r4 是那一阶段的历史有效证据。
  此后 Windows r4 已分别用 bundle c5 与 **c6** 通过（见本文件 worker_view_contract_hardened /
  state_capture_content_stable 两条）；c4/c5 保留为历史证据，未被覆盖）。
- runtime_artifact_projection_gate: 真实 release Worker(c4)+bwrap 本地 fixture，无网络无模型，
  `scripts/server-round1/runtime-artifact-gate.py` exit 0（fixture 从 `/runtime/artifacts/fixture-dep`
  加载依赖并返回固定值、guest 写入被拒、宿主树未变、摘要不符时 turn 失败且无伪造 session、无残留
  view/secret）。该门**只登记工件投影**，不等于任何 Harness/model 通过。
- wire_status: **WIRE_LOCKED_FOR_IMPLEMENTATION**（28方法+队列终态严格schema 29/29通过）。
- backend_implementation_ready: **否（暂时）**（Windows r4 平台门通过：真实 Windows Server→wsl.exe→
  release Worker ABW1 interactive→bwrap 上保留旧门并新增有状态 fixture，`stop_mode=tree_terminate`
  有界强制树终止后的崩溃式重启/同 native id `session/resume`/终止前 delta/ObjectStore checkpoint/
  marker 清理与独立 `-PostCheck`；该停止路径不是正常/graceful 退出，正常 Desktop/Server 生命周期退出
  与最终清理仍留作全栈最终验收项；
  正式 WS 事件流、附件、审批、取消/断连、队列续派/暂停、Profile/Provider-Model 维护均有证据；
  Codex 模型选择与凭据生产投影已接线并经**无模型全链门**验证（`CODEX_PRODUCTION_CHAIN_PREPARED`，
  见本文件 codex_config_boundary / codex_production_chain 两条）；**四家生产封装全部完成**
  （见本文件 hermes_production_chain / opencode_production_chain / pi_production_chain /
  codex_production_chain 与 windows_r4_c7 各条）；（历史括注已过时的表述保留于下，仅作当时快照：
  ~~Codex 封装仍未完成；c4 亦未取得 Windows 平台证据~~——Codex 封装已在 c5 轮完成，
  Windows 平台证据已先后用 c4/c5/c6/c7 取得）。唯一剩余后端门是**四家真实模型门**）。
- integration_owner: NONE；workbench_model_verified_count: **0**（指本轮；组件门与工件投影门通过
  不等于真实模型可用）。
- model_authorization: DEEPSEEK_OFFICIAL_AUTHORIZED_MAX_CNY_10；凭据locator见42 §D，不写内容。
- 本轮调用数1（DeepSeek官方API可达性检查，12 tokens，<¥0.01；上限¥10），
  预留0；Codex真实模型尝试在 session/new 阶段即失败、未发起模型请求。
  后续执行者统一记账，所有Harness/重试累计计算。r4 阶段模型调用 0、费用增量 ¥0；
  42-D 工件投影阶段模型调用 0、费用增量 ¥0（只读本地 fixture，无凭据、无网络请求）；
  Pi 生产封装阶段模型调用 0、费用增量 ¥0（本机 loopback 假端点、临时假 token、用后即删，
  未读任何真实凭据）；文档修订模型调用 0、费用增量 ¥0；
  Hermes/OpenCode 生产封装阶段（含两条全链门与 Pi/工件投影门回归）模型调用 0、费用增量 ¥0
  （三家门的假 token 各自自建 0600、用后删除；未访问任何非 loopback 目的地；未读任何真实凭据）。
  workbench_model_verified_count 仍为 0。
- 41 既有门实绩：python 266 passed/4 skipped/0 failed；node 25/25；cargo 4/4；
  Windows r3 真机 WSL 全链路 exit 0。r4 增量后：python 348 passed/4 skipped/0 failed、
  Node 25/25 与 42d 4/4、Rust 4/4、Windows r4 exit 0 与独立 `-PostCheck` exit 0。
  42-D 工件投影增量后（同一条 41 记录命令）：python **424 passed/4 skipped/0 failed**（收集 352→428，
  +76 项）、Node 25/25 与 42d 4/4、Rust 10/10（基线 4）。
  Pi 生产封装增量后（同一命令）：python **444 passed/4 skipped/0 failed**（本轮 +20：Pi 模板 12、
  ACP 能力回归 7、缺凭据拒绝 1；4 项既有平台/环境条件 skip 未扩大）；Pi 构建器 `node --test` 11/11；
  Server sidecar 单套 91 passed；既有 runtime-artifact gate 仍 exit 0（底座未退化）；
  Pi 全链 gate exit 0。Windows r4 **本阶段未重跑**。
  Hermes/OpenCode 生产封装增量后（主会话串行复跑同一命令）：python **529 passed/4 skipped/0 failed**
  （该轮 +85：Hermes 36、OpenCode 25、driver 接缝 17、Pi 别名/翻译断言加强等；4 项既有 skip 未扩大）；
  state 捕获/Worker 合同收紧轮（本阶段）复跑：python **793 passed/4 skipped/0 failed**（较上一条 +7：
  content-stable settle 7；Rust **15 passed**）；四家 gate + runtime-artifact gate 用 **c6** 串行 exit 0
  （Codex 默认与外部工件两种模式都 exit 0）；**Windows r4 用 c6 通过 + `-PostCheck…CLEAN`**。
  state 错误边界/Reviewer 复审修复（c7→c8）轮（2026-09-15）复跑：python **820 passed/4 skipped/0 failed**
  （相对 793 的增量含边界新测、真实 Worker 端到端、gate 诊断（现为 3 例）等；4 项既有 skip 未扩大）；
  Rust fmt 干净 + `cargo test --locked --release` **27 passed**；
  runtime-artifact/Pi/Hermes/OpenCode 四门 + Windows r4/PostCheck 用 **c8** 串行 exit 0；
  **Windows r4 用 c8 通过 + 独立 `-PostCheck…CLEAN`**（8 秒静默 `elapsed_ms=8821`，实例核对）；`git diff --check` 通过。
  （此前轮次计数 812/22 与中间 820/27、822 均已被本条取代。）
  【历史快照：该行写于用户裁决之前；现行结论见 codex_decision_a_implemented】
  当时状态为 USER_DECISION_REQUIRED／未解决的红绿间歇（10 绿→5 红→最近 3 绿），
  根因 `.tmp/plugins` 技能物化突发（见 codex_native_state_findings）；决前不掩盖、不假绿。
  错误边界 c7 轮（2026-09-15）复跑：python **812 passed/4 skipped/0 failed**（较上一条 +19：
  错误边界 19 项，其中含 2 项真实 Worker 进程端到端；4 项既有 skip 未扩大）；
  Rust fmt 干净 + `cargo test --locked --release` **22 passed**；
  runtime-artifact/Codex（默认 10 轮 + 外部工件 1 轮）/Pi/Hermes/OpenCode 五门用 **c7** 串行 exit 0；
  **Windows r4 用 c7 通过 + 独立 `-PostCheck…CLEAN`**（8 秒静默 `elapsed_ms=8840`）；`git diff --check` 通过。
  HOME 隔离 + Codex 封装轮（上一轮）复跑：python **786 passed/4 skipped/0 failed**（较上一条 +103）：
  四家 gate（Pi/Hermes/OpenCode/Codex）串行 exit 0、Codex 外部工件模式 exit 0、runtime-artifact gate(c5)
  exit 0；node 25/25、13/13、42d 4/4、构建器 11/20/9/9；Rust fmt 干净 + 11 passed；
  **Windows r4 用 c5 bundle 通过**（`sha256:92eac03a…`、`state_projection=/runtime/home/sessions`、
  `session/new→session/resume`、delta 9 < completed 12、8 秒静默默认租约完成）+ `-PostCheck…CLEAN`。
  能力诚实性返修轮（上一轮）复跑：python **683 passed/4 skipped/0 failed**（较上一条 +19：能力真值表 11、
  命名空间边界 5、完成线程生命周期 3；受影响子集连续 3 次 237 passed，无段错误）；node 25/25 与 13/13；
  `git diff --check` 干净。**未重跑 Windows/gate/工件构建**（本轮未改 Windows 脚本、Worker、协议与生产部署，
  按工单要求不重复）。能力合同轮（上一轮）复跑：python **664 passed/4 skipped/0 failed**（较上一条 +108：能力合同 63、
  插件能力声明 37、跨层集成/投影 8 等；4 项既有 skip 未扩大）；插件套件 112 passed/3 skipped；
  node：harness_remote 25/25、能力声明 13/13、42d 4/4、三家构建器 11/20/9；Rust fmt 干净 + 10 passed；
  Pi/Hermes/OpenCode 三条全链门与 runtime-artifact gate 串行复跑全部 exit 0；
  Windows c4 r4（`sha256:31e92959…` 未重建）exit 0 + `-PostCheck…CLEAN`（8 秒静默在默认 5 秒租约下
  `elapsed_ms=8831` 完成；有状态 harness 声明 `native_continuation` 后仍 `session/new→session/resume`、
  delta 9 < completed 12）。**诚实留痕**：本阶段一次全量侧载运行中
  `test_server_core_real_worker_persists_stream_before_terminal` 出现过一次失败（真实 Worker + bwrap 的
  10 秒有界等待在负载下超时），随后 3 次单跑 + 2 次同子集复跑均通过（178 passed），未复现、未改动断言。
  租约 + Hermes 精确模型轮（上一轮）复跑：python **556 passed/4 skipped/0 failed**（较上一条 +22：
  租约保活客户端 13 + sidecar 5 + Hermes 链路 2 等；4 项既有 skip 未扩大）；node：harness_remote 25/25、
  42d 4/4、三家构建器 11/20/9；Rust `cargo fmt --check` 干净、`cargo test --locked --release` 10 passed；
  Hermes/Pi/OpenCode 三条全链门与 runtime-artifact gate 本会话串行复跑全部 exit 0；
  **最终提交态返修（HEAD `407c379`）复跑**：同一条全量命令 python **534 passed/4 skipped/0 failed**
  （较上一条 +5：OpenCode 提交态 token 回归 3、driver status 合同 2；4 项既有 skip 未扩大）；
  五文件定向 **78 passed**；`build-opencode-authorization.test.mjs` 9/9；OpenCode 全链门 exit 0
  （`cleanup.tokenInTrackedGitContent=false`）、Hermes 全链门 exit 0；`git diff --check` 干净；
  node：harness_remote 25/25、42d 4/4、Pi 构建器 11/11、Hermes 构建器 20/20、OpenCode 授权工具 9/9；
  Server sidecar 单套 91 passed；Hermes 全链 gate exit 0、OpenCode 全链 gate exit 0、
  Pi 全链 gate exit 0（底座未退化）、runtime-artifact gate exit 0。Windows r4 本阶段未重跑。
- r4 工件更正：工作令指定的 `.acceptance-bundle-c2`（`sha256:08e4e057…`）早于 interactive channel
  协议升级，与当前客户端 bootstrap 不兼容；r4 使用从当前源码重建并校验的 `.acceptance-bundle-c3`
  （`sha256:bb90e346…`，与 r3 证据一致）。广覆盖 fixture 现声明其唯一接受的 model，否则 sidecar
  模型门会拒绝配置的模型。`accept-e.ps1` 同时修正了 `test -e --` 恒真断言与清理期覆盖主失败的缺陷。
  42-D 重建 `.acceptance-bundle-c4`（`sha256:31e92959b06b3ee9f30ebfb9ce6b2bee74af847e4a147bba906bff7ecf681fa6`，
  Worker control protocol 3）；c2/c3 **未覆盖、未删除**，c3 的 r4 仍是历史有效证据。
- four_harness_matrix（组件级）：
  - codex：COMPONENT_VERIFIED（快照+fake peer 全门通过；真实二进制握手 TYPED_FAILURE，
    适配器要求 API key，app-server 路径已由工件证据确认，未退回 exec JSONL）；
  - pi：COMPONENT_VERIFIED（真实二进制零凭据 INITIALIZED）；
  - hermes：COMPONENT_VERIFIED（上游无 profile，由 AgentBox 窄注册胶水接入 `hermes acp`；
    真实二进制零凭据 INITIALIZED）；
  - opencode：COMPONENT_VERIFIED（同快照 ManagedOpenCodeHost；真实二进制 HEALTH_OK，
    不伪装为 ACP profile）。
  - 四家均 **MODEL_NOT_VERIFIED**。Codex 0.147.0 先前只证明 `wire_api="chat"` 配置被客户端拒绝；
    DeepSeek 官方 `codex-deepseek-setup.sh` 1.3.0 明确给出 Responses 配置，故已撤回“不兼容/证伪”
    结论并保留原始失败为错误配置证据。`399d78d` 已纳入官方1.3.0完整两模型目录（运行仅允许
    `deepseek-flash`）、Responses非敏感配置、adapter source、摘要固定native binary和`CODEX_API_KEY`
    首选认证接缝；`3e4282b` 固化隔离 TOML 并完成通用 native state 双轮 resume，实际 wheel 同时包含
    完整目录与TOML；真实 codex-acp→app-server 配置读取通过，但尚未发送真实模型请求。
    pi/hermes/opencode 的无模型 Provider 配置准备已在 `bc7d95b` 完成；**四家真实模型门
    （Codex/Pi/Hermes/OpenCode）均仍未执行**，Pi/Hermes/OpenCode 三家的生产封装已完成但不因此计入已通过。
    三家的原生运行时工件进沙箱能力已由 42-D 的 `runtimeArtifactMounts` 底座补齐（中立、摘要固定、
    只读、可审计；真实 Worker+bwrap 无模型门通过）；**Pi 已完成生产封装**（真实 pi-acp 0.5.0 +
    真实依赖闭包 + c4 Worker + bwrap + 本机假端点两轮，`PI_PRODUCTION_CHAIN_PREPARED`，
    仍 MODEL_NOT_VERIFIED），Hermes 与 OpenCode 的封装随后在同一底座上完成
    （本文件 hermes_production_chain / opencode_production_chain 两条）；四家真实模型门均未执行，
    四家真实模型门仍未执行（租约缺陷已修，不再构成前置阻断）。
- 已知待办/风险：内嵌 codex 二进制安装后**必须校验**（本轮发现过一次截断安装，
  已更正40-A证据）；Hermes 启动有 lazy 依赖安装与 PYTHONPATH 要求，42-D 已提供其所需的
  **中立只读运行时工件投影**（隔离 Python 包闭包可声明为 artifact 树，不挂用户 site-packages），
  且 Pi/Hermes/OpenCode 已完成同级生产封装（真实 adapter/agent + 本机假端点两轮）；
  **（历史快照："Codex 的正式插件封装仍未完成"——已被 c5 轮 `codex_production_chain`
  检查点取代，Codex 生产封装已完成并过全链门）**；真实凭据只可经授权
  SecretStore→限时 Worker 投影；该路径已有实现和反例测试，尚待真实受管 Harness。
  native会话目录的有界回读/回投及凭据原文扫描已在 `3e4282b` 收口。工件投影的残余风险：
  摘要在 bootstrap 校验一次（bootstrap→spawn 之间的 TOCTOU 窗口与既有 executable 授权模型一致，
  未新增每 attempt 重验）；bwrap 网络姿态未改（未加 `--unshare-net`）。
- 调度维护：39即参与wire反馈，通道docs/server-round1/wire-review.md（首轮已写入）。
- 42 双门 —— **历史快照（2026-09-14 14:54 只读复核），已被本文件顶部的 18:21 判定取代，不作当前结论**：
  当时后端 READY=否（运行时工件投影底座已完成并通过真实 Worker+bwrap 无模型门；Pi 已完成生产封装，
  当时 Hermes/OpenCode 的封装尚未开始、四家真实模型门未执行；Windows r4 平台门已通过、当阶段未重跑）、
  前端 READY=否（PARTIAL、`writer_lease` ACTIVE；当时工作树 clean）→ 未记录集成人、未写前端、未联调。
- 每阶段与goal结束前检查状态已更新；41READY后进入42等待，不提前报整体完成，不宣称goal完成。

以下是37/38历史说明，不覆盖39–42新授权。
终态：`SERVER_HTTP_CODEX_R1_GREEN` / `SERVER_HTTP_CODEX_R1_PARTIAL`。
阶段态：`SERVER_HTTP_R1_A_READY`、`SERVER_WSL_R1_B_READY`、`SERVER_CODEX_R1_C_READY`。
37 不按完整 GREEN 接受。38 的 READY_FOR_DECISION 仅指研究可交付，不替代37验收或生产授权。

已知边界：Codex CLI 此路径没有硬输出 token cap，验收以短回答提示、4 KiB 输入与 120 秒超时约束；首轮仅白名单 `deepseek-flash`。后续 Desktop 接线/Pi/记忆并发合并/安装器未派。

38终态：`HARNESS_EXTENSION_SELECTION_READY_FOR_DECISION` / `HARNESS_EXTENSION_SELECTION_NO_FIT` / `HARNESS_EXTENSION_SELECTION_PARTIAL`；阶段态 `HARNESS_EXTENSION_SELECTION_RESEARCHING`。没有合格候选不得转手写。
