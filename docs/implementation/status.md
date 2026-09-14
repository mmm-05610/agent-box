# Backend Server — status

更新：2026-09-14（执行者：后端 goal 会话，分支 feature/server-harness-extension-v1）。
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
42 的独立模型任务可并行继续，前端仍由其 writer 施工，尚未进入跨仓联调。
42-D 已完成 provider-neutral 的不可变运行时工件投影底座（**RUNTIME_ARTIFACT_PROJECTION_READY**），
并在其上完成 **Pi、Hermes、OpenCode 三家生产封装（PI/HERMES/OPENCODE_PRODUCTION_CHAIN_PREPARED）**：
真实 adapter/agent（Pi 依赖闭包、Hermes 隔离 Python 闭包、OpenCode 摘要固定单文件二进制）经 c4
Worker+bwrap 连接本机 loopback 假 DeepSeek 端点，两轮同一 Server Session、上下文与重放/重开证据齐备。
**三家因此只是封装就绪，仍是 MODEL_NOT_VERIFIED**（假端点与固定 nonce，不是付费模型验收）。
剩余的是 **Codex 封装**，而最终门始终是 **Codex/Pi/Hermes/OpenCode 四家真实模型门**——两者不是同一件事，
不得混写。**本阶段发现一条阻塞真实模型门的通用缺陷**：Worker 默认 5 秒租约会在客户端静默时取消运行中
的 attempt（代码级机制 + 第一手复现见
[原生 driver 接缝](../server-round1/fullstack/native-driver-seam.md) §5），故真实模型门在修复前不启动。
DeepSeek 官方 API 授权见42 §D；累计发生 1 次 API 可达性调用（12 tokens，费用 <¥0.01），
Codex 旧 chat 配置尝试在模型请求前失败；新 Responses 配置已通过无模型读取门，二者都不能记作模型调用
或 Harness 验收。

| 单号 | 状态 | 证据 | 下一步 |
| --- | --- | --- | --- |
| [39](work-orders/39-server-boundaries.md) | **READY_FOR_HARNESS** | [阶段证据](../server-round1/server-boundary/stage-a-b-c.md)：幂等并发双派发缺陷先复现后修复、能力声明改为注册派生、双中立provider测试、legacy codex 退出生产装配 | wire反馈通道 [wire-review.md](../server-round1/wire-review.md) 已建立并写入首轮 |
| [40](work-orders/40-four-harness-integration.md) | **FOUR_HARNESS_COMPONENTS_READY** | [40-A 底座](../server-round1/harness-integration/stage-a.md) / [40-B 通道](../server-round1/harness-integration/stage-b.md) / [40-C 矩阵](../server-round1/harness-integration/stage-c.md) / [40-D 汇总](../server-round1/harness-integration/stage-d.md) + [握手证据JSON](../server-round1/harness-integration/handshake-40c.json)：四家组件门 25/25；全量 227 passed/4 skipped/0 failed；Rust 4 passed；真实二进制零凭据握手 pi/hermes INITIALIZED、opencode HEALTH_OK、codex 诚实要求凭据 | 本单终态；Server 侧编排与 wire 锁定进入 41；真实模型门留待 42 §D |
| [41](work-orders/41-core-service-acceptance.md) | **BACKEND_WINDOWS_R4_READY** | [后端验收](../server-round1/backend-acceptance.md)：28 方法+队列终态严格 schema 回归 29/29；Windows r4 exit 0（保守旧门 + `tree_terminate` 强制树终止后的有状态崩溃式重启/同 native id `session/resume`/终止前 delta/ObjectStore checkpoint/marker 清理/独立 `-PostCheck`）；反例含 5 种不可用 checkpoint 与 4 种拒绝清理；全量 348 passed/4 skipped，Node 25/25+4/4，Rust 4/4 | 42 双门未满足，整体 READY 仍受约束 |
| [42](work-orders/42-fullstack-delivery.md) | **PRE_GATE_WORK_IN_PROGRESS**（两端门当前均未满足，未联调） | [进度与费用账](../server-round1/fullstack/progress.md) + [运行时工件投影底座](../server-round1/fullstack/runtime-artifact-projection.md) + [Pi 生产封装](../server-round1/fullstack/pi-production-packaging.md) + [Hermes 生产封装](../server-round1/fullstack/hermes-production-packaging.md) + [OpenCode 生产封装](../server-round1/fullstack/opencode-production-packaging.md) + [通用 driver 接缝](../server-round1/fullstack/native-driver-seam.md)：工件投影 **RUNTIME_ARTIFACT_PROJECTION_READY**；Pi/Hermes/OpenCode 三家 **\*_PRODUCTION_CHAIN_PREPARED**（真实 adapter/agent + c4 Worker + bwrap + 本机假端点，两轮同一 native id / 两轮上下文 / 真实重开方法，两条门本会话串行复跑 exit 0，均 `MODEL_NOT_VERIFIED`）；**Worker 5s 租约取消静默 attempt** 已第一手复现（阻塞四家真实模型门，未修复）；前端仍 PARTIAL、writer_lease ACTIVE；28 方法 wire 摘要未变；DeepSeek 官方 API 可达（12 tokens） | Codex 同级封装（含其模型目录/凭据接缝）→ 先修租约缺陷 → **四家（Codex/Pi/Hermes/OpenCode）真实模型门**；双门后联调 |
| [37](work-orders/37-http-codex.md) | **SERVER_HTTP_CODEX_R1_PARTIAL** | [原完成审计](../server-round1/completion-audit.md) / [C/D证据](../server-round1/stage-c-d.md)保留；检查点5a45303/5b71393/cd5efbe/67c6b40。独立定向23 passed；同键并发双accept已由39复现并修复；能力不诚实已由39结构性修复 | abandon 断言经探针定性为**测试侧竞态**（终止状态持久化后约50ms才 abandon；负载高时10/10失败），已改为有界等待、断言强度不变，修后10/10通过；原生语义迁移由40执行 |
| [38](work-orders/38-harness-extension-selection.md) | **HARNESS_EXTENSION_SELECTION_READY_FOR_DECISION** | 两轮 A/B/C 完成：[最终建议与边界](../server-round1/harness-selection/boundary.md)。保留有条件首选 `harness-remote v3.0.2`；零模型/凭据 | 首选已由40消费进入有门禁接入；不再等待决定 |

## 当前长期goal状态字段（执行者每阶段维护）

- backend_implementation: **POST_RESUME_GATES_PENDING**（39/40组件门完成；41的28方法+队列终态已按
  锁定摘要29/29；Windows r4 平台门通过，**BACKEND_WINDOWS_R4_READY**。42-D 已补
  **RUNTIME_ARTIFACT_PROJECTION_READY**（工件投影底座）与 Pi/Hermes/OpenCode 三家
  **\*_PRODUCTION_CHAIN_PREPARED**（真实 adapter/agent + c4 Worker + bwrap + 本机假端点两轮，
  同一 native id、上下文与真实重开方法；三家仍 MODEL_NOT_VERIFIED）。须继续 Codex 同级封装、
  先修 **Worker 5s 租约取消静默 attempt** 的通用缺陷，最终门为**四家真实模型门**
  （Codex/Pi/Hermes/OpenCode），任一封装就绪都不折算为已通过）。
- frontend_observed_state: IN_PROGRESS（只读观察，2026-09-14 18:21 +08:00；前端 HEAD 已推进到
  `docs(desktop): record the session authority fallback repair`，工作树 **dirty（15 行，正在施工）**；
  其 status.md 自述 `frontend_implementation=PARTIAL`、`writer_lease=ACTIVE — Zcode frontend goal`）。
- frontend_worktree: /home/maoqh/projects/agent-box-desktop-next-wsl-round1 @ feature/agentbox-desktop-product。
- frontend_checked_at: 2026-09-14 18:21:46 +08:00；observed_head:
  `bd1b28b44a7565f6864d26b90bb30a991b0654e1`（`docs(desktop): record the session authority fallback repair`，
  提交于 18:11:39 +08:00）；`git status --porcelain` 本次 15 行（施工中）；
  其 status.md 自述 updated_at=2026-09-14 18:10 (+08:00)；wire 两个摘要就地重算仍与锁定值一致
  （未重锁）。按只读观察如实记录、仅报告，不修改前端。
- 42 双门判定（2026-09-14 18:21 +08:00）：BACKEND_IMPLEMENTATION_READY=**否（暂时：三家封装就绪与
  工件投影底座都不替代逐家封装与真实门；Codex 封装未做，且 Worker 租约缺陷未修）**；
  DESKTOP_IMPLEMENTATION_READY=**否**（PARTIAL、工作树 dirty 且写权未释放）。
  **未进入全栈联调**，未写前端任何文件；前端施工中不是阻断。
- wire_version / schema_digest: 当前28方法提交 `3aba5c5c` 为 **WIRE_LOCKED_FOR_IMPLEMENTATION**，TS
  `11e3b3e70d332585d31900c09ba063d95aa6b72b1904921c665fb72f81c10035`、生成工件
  `5d4fa3bfeec6c3273c6073b37794e4ab2aca6e07e48184bc3a2b878c1fe5e4ed`。15:48 在前端工作树**就地
  重算**二者摘要仍与上值一致，故锁未变：未重锁、未改合同。
- code_checkpoint_pair: 后端 r4 相关检查点分三层、不可互相替代——native-state 实现基础=`3e4282b`、
  r4 验收脚本/测试代码=`713b2e3`、已提交脚本上的 r4 复跑证据=`87b17a3`（`3e4282b` 不是 r4 检查点）；
  42-D 工件投影检查点=`dba9c0f`+`f846f09`；Pi 生产封装检查点=`0f499b7`+`9f3dd9c`（封装实现 + 证据），
  Pi gate 清理返修=`828bc5b`+`f6f7411`；
  Hermes 封装检查点=`19f945a`、OpenCode 封装检查点=`d3a543a`、通用原生 driver 接缝检查点=`fc62037`、
  两家证据/status 收口检查点=`625cc2b`；提交态假绿返修 + driver status 合同检查点=`407c379`
  （其后的 docs 提交只记录本轮复跑证据，不另立检查点）；
  前端合同检查点=`3aba5c5c`、前端观察 HEAD=`bd1b28b4`；前端尚无最终交接检查点。
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
  `CREDENTIAL_REQUIRED`；state 10 文件零 token 命中。**本家残余：产品模型 `deepseek-flash` 在
  其 native 面不可寻址，有效模型被 Hermes 静态折叠为 `deepseek-chat`（已硬断言记录，真实模型门
  前必须先解决）**；仍 MODEL_NOT_VERIFIED）。
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
  不打印、不进 argv、不读真实 locator。补 3 项提交态回归：动态值不在 tracked 内容、两次运行 token 不同、
  把本次 token 写进临时登记的 tracked fixture 必须让门以 `OPENCODE_GATE_TOKEN_IN_GIT` 失败并在测试内
  完整撤销（index 条目与文件都不留）。返修后五文件定向 78 passed、全链门 exit 0 且
  `cleanup.tokenInTrackedGitContent=false`。
- native_driver_contract_tightened: driver 必需方法集合加入 **`status`**（envelope 暴露的操作；
  缺它时注册即以 `DRIVER_METHOD_MISSING` 拒绝，不再等到轮次中途失败）；测试**从接缝模块读取
  方法表**并对测试 fixture 与真实 OpenCode driver 各构造一次实例核对齐备。
- native_driver_seam: 新增**中立原生 driver 接缝**（`runtime/native-driver.mjs` + `worker-entry.mjs`
  op 路由 + `adapter.driver` 打包 + `message_delta`/`driver_exit` 映射；只从同一 bundle 的
  `deployment/` 加载、凭据只经 `spawnProcess` 进子进程、事件深红删），Server/Core/Worker/bwrap
  仍然只见通用 deployment 字段、无任何 Harness 品牌分支；通用测试 17 项，ACP 路径回归 91 passed、
  Node 25/25。证据见 [native-driver-seam.md](../server-round1/fullstack/native-driver-seam.md)。
  driver 路径已用一次性探针在真实 Worker+bwrap 上验证（模块投递、凭据到孙进程、state 回投）。
- worker_lease_defect_found: **Worker 默认 5 秒租约会取消"客户端静默"的运行中 attempt**——
  代码级：只有客户端帧刷新 `lease_deadline`，而一轮 prompt 飞行中 Server 不发帧（心跳只在
  `WorkerClient.wait_terminal` 里发）。第一手复现：同一 fixture 驱动静默 8 秒，`lease_ms=5000`
  下轮次被取消（收尾以 `WorkerError: attempt does not accept stdin writes`），仅改为 `120000`
  后两轮 `completed`。既有假端点门因毫秒级应答从未暴露；**任何首 token 超过 5 秒的真实模型轮次
  都会被掐断**，因此**修好之前不启动四家真实模型门**。本阶段如实登记、未扩范围修复；
  **提交态假绿返修轮同样未修租约（本轮只修验收与合同缺口）**，该阻断项保持未解决。
- runtime_artifact_projection: **RUNTIME_ARTIFACT_PROJECTION_READY**（`runtimeArtifactMounts`
  Server仅形状校验透传 / Worker WSL 内权威验树摘要 / bwrap 只读 `/runtime/artifacts/<name>`；
  跨 Python-Rust tree digest v1 + golden fixture；上限 32768 条目 / 1 GiB / 4096 字节路径；
  Worker control protocol **2→3** 双向拒绝（含真实 c3 旧二进制）；c4 bundle
  `sha256:31e92959b06b3ee9f30ebfb9ce6b2bee74af847e4a147bba906bff7ecf681fa6`（c2/c3 未覆盖）。
  **c4 尚未在 Windows 复跑**：c3 的 r4 仍是历史有效证据；本阶段不运行 Windows r4）。
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
  Codex模型选择与凭据生产投影代码已接线但尚未以真实受管 Harness 执行；42-D 已完成中立运行时工件
  投影底座（`runtimeArtifactMounts` + Worker 协议 3 + c4 bundle + 真实 Worker+bwrap 无模型门），
  并在其上完成 **Pi 生产封装**（PI_PRODUCTION_CHAIN_PREPARED，仍 MODEL_NOT_VERIFIED；该句是 r4 当时
  的进展描述，Hermes/OpenCode 两家封装随后完成，见本文件 hermes_production_chain /
  opencode_production_chain 两条）；**Codex 封装仍未完成**；c4 亦未取得 Windows 平台证据）。
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
    且真实模型门在 Worker 租约缺陷修复前不启动。
- 已知待办/风险：内嵌 codex 二进制安装后**必须校验**（本轮发现过一次截断安装，
  已更正40-A证据）；Hermes 启动有 lazy 依赖安装与 PYTHONPATH 要求，42-D 已提供其所需的
  **中立只读运行时工件投影**（隔离 Python 包闭包可声明为 artifact 树，不挂用户 site-packages），
  且 Pi/Hermes/OpenCode 已完成同级生产封装（真实 adapter/agent + 本机假端点两轮）；
  **Codex 的正式插件封装仍未完成**；真实凭据只可经授权
  SecretStore→限时 Worker 投影；该路径已有实现和反例测试，尚待真实受管 Harness。
  native会话目录的有界回读/回投及凭据原文扫描已在 `3e4282b` 收口。工件投影的残余风险：
  摘要在 bootstrap 校验一次（bootstrap→spawn 之间的 TOCTOU 窗口与既有 executable 授权模型一致，
  未新增每 attempt 重验）；bwrap 网络姿态未改（未加 `--unshare-net`）。
- 调度维护：39即参与wire反馈，通道docs/server-round1/wire-review.md（首轮已写入）。
- 42 双门 —— **历史快照（2026-09-14 14:54 只读复核），已被本文件顶部的 18:21 判定取代，不作当前结论**：
  当时后端 READY=否（运行时工件投影底座已完成并通过真实 Worker+bwrap 无模型门；Pi 已完成生产封装，
  Hermes/OpenCode 的封装与四家真实模型门均未执行；Windows r4 平台门已通过、当阶段未重跑）、
  前端 READY=否（PARTIAL、`writer_lease` ACTIVE；当时工作树 clean）→ 未记录集成人、未写前端、未联调。
- 每阶段与goal结束前检查状态已更新；41READY后进入42等待，不提前报整体完成，不宣称goal完成。

以下是37/38历史说明，不覆盖39–42新授权。
终态：`SERVER_HTTP_CODEX_R1_GREEN` / `SERVER_HTTP_CODEX_R1_PARTIAL`。
阶段态：`SERVER_HTTP_R1_A_READY`、`SERVER_WSL_R1_B_READY`、`SERVER_CODEX_R1_C_READY`。
37 不按完整 GREEN 接受。38 的 READY_FOR_DECISION 仅指研究可交付，不替代37验收或生产授权。

已知边界：Codex CLI 此路径没有硬输出 token cap，验收以短回答提示、4 KiB 输入与 120 秒超时约束；首轮仅白名单 `deepseek-flash`。后续 Desktop 接线/Pi/记忆并发合并/安装器未派。

38终态：`HARNESS_EXTENSION_SELECTION_READY_FOR_DECISION` / `HARNESS_EXTENSION_SELECTION_NO_FIT` / `HARNESS_EXTENSION_SELECTION_PARTIAL`；阶段态 `HARNESS_EXTENSION_SELECTION_RESEARCHING`。没有合格候选不得转手写。
