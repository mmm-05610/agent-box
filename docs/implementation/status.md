# Backend Server — status

## 计数口径（工单 49 G3；2026-09-17）

**最近一次有记录的全量计数（068 轮刷新；源头=e39959f 提交信息，068 按单内约束未复跑）**：

- 范围 `tests/`（根套件）：`PYTHONPATH=src:plugins/agent-box-harnesses/src:plugins/agent-box-runtime-wsl/src:plugins/agent-box-runtime-local/src:plugins/agent-box-sandbox-bwrap/src:plugins/agent-box-skills/src:plugins/agent-box-terminal-session/src python3 -m pytest tests/ -q` → **879 passed**（e39959f：orders 60–65 后全量，八家全链门 exit 0）。
- 范围 `plugins/agent-box-harnesses/tests/`（插件套件）：`python3 -m pytest plugins/agent-box-harnesses/tests/ -q` → 最近有记录值 **331 passed / 3 skipped / 0 failed**（50 轮）；此后未再逐轮记录，待下次全量回归刷新。
- 范围 `workers/agent-box-worker`（Rust）：`cargo test --locked --release` → 最近有记录值 **42 passed**（56 轮 Worker 侧）；待下次全量回归刷新。

**本文件各单行的套件数字以该行标注的提交为准；除此之外的其余计数一律视为历史（已被取代）**——包括 601 / 577 / 605 / 608 /
820 / 843 / 886 / 890 / 915 / 1107 等根套件数字与各阶段增量；历史条目的原文保留不改写，
仅以本节声明统一其效力。命令口径变更记录：46 之前的"全量"数字不含
`plugins/agent-box-runtime-local`、`plugins/agent-box-skills`、`plugins/agent-box-terminal-session`
三个 PYTHONPATH 条目，46 起补齐（补齐后收集面更宽，计数不可与旧口径直接比较）。

更新：2026-09-17（执行者：env-provider 工单会话）。42 及以前的记录未被本会话改动。
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
**三家因此只是封装就绪，仍是 MODEL_NOT_VERIFIED（假端点与固定 nonce，不是付费模型验收）。**
**Codex 生产封装也已完成**（见下行），**四家封装全部就绪**；
最终门始终是 **Codex/Pi/Hermes/OpenCode 四家真实模型门**——与封装就绪不是同一件事，
不得混写。**该最终门已于 2026-09-15 全部取得证据**：四家 `--live`（官方 base URL、授权 locator
只读注入、不覆盖配置、不装载 loopback guard）——Pi `PI_PRODUCTION_CHAIN_GATE_OK`、
Hermes `HERMES_PRODUCTION_CHAIN_GATE_OK`、OpenCode `OPENCODE_PRODUCTION_CHAIN_PREPARED`、
Codex `CODEX_PRODUCTION_CHAIN_GATE_OK`，均 exit 0：两轮真实 DeepSeek 答复、同 native id 续接、
凭据零泄漏、清理干净、授权 locator 未被删，累计费用 **< ¥0.05**（上限 ¥10），
见 [live-model-preflight.md](../server-round1/fullstack/live-model-preflight.md) §6；
**机制（假端点/守卫）证据与真实模型证据分别记账、不得互相替代**。
`BACKEND_IMPLEMENTATION_READY` **仍未登记**——差固定 Reviewer 的 §4.2 阶段闭环。**state capture 类型化错误边界返修已完成并经 Reviewer 复审修复**（现行检查点 c8：
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
四家（Codex/Pi/Hermes/OpenCode）现在都有生产封装（封装轮的 `MODEL_NOT_VERIFIED` 已于 2026-09-15 被四家 `--live` 真实模型门取代，见上段）。
DeepSeek 官方 API 授权见42 §D；累计发生 1 次 API 可达性调用（12 tokens，费用 <¥0.01），
Codex 旧 chat 配置尝试在模型请求前失败；新 Responses 配置已通过无模型读取门，二者都不能记作模型调用
或 Harness 验收。

| 单号 | 状态 | 证据 | 下一步 |
| --- | --- | --- | --- |
| [39](work-orders/39-server-boundaries.md) | **READY_FOR_HARNESS** | [阶段证据](../server-round1/server-boundary/stage-a-b-c.md)：幂等并发双派发缺陷先复现后修复、能力声明改为注册派生、双中立provider测试、legacy codex 退出生产装配 | wire反馈通道 [wire-review.md](../server-round1/wire-review.md) 已建立并写入首轮 |
| [40](work-orders/40-four-harness-integration.md) | **FOUR_HARNESS_COMPONENTS_READY** | [40-A 底座](../server-round1/harness-integration/stage-a.md) / [40-B 通道](../server-round1/harness-integration/stage-b.md) / [40-C 矩阵](../server-round1/harness-integration/stage-c.md) / [40-D 汇总](../server-round1/harness-integration/stage-d.md) + [握手证据JSON](../server-round1/harness-integration/handshake-40c.json)：四家组件门 25/25；全量 227 passed/4 skipped/0 failed；Rust 4 passed；真实二进制零凭据握手 pi/hermes INITIALIZED、opencode HEALTH_OK、codex 诚实要求凭据 | 本单终态；Server 侧编排与 wire 锁定进入 41；真实模型门留待 42 §D |
| [41](work-orders/41-core-service-acceptance.md) | **BACKEND_WINDOWS_R4_READY** | [后端验收](../server-round1/backend-acceptance.md)：28 方法+队列终态严格 schema 回归 29/29；Windows r4 exit 0（保守旧门 + `tree_terminate` 强制树终止后的有状态崩溃式重启/同 native id `session/resume`/终止前 delta/ObjectStore checkpoint/marker 清理/独立 `-PostCheck`）；反例含 5 种不可用 checkpoint 与 4 种拒绝清理；全量 348 passed/4 skipped，Node 25/25+4/4，Rust 4/4 | 42 双门未满足，整体 READY 仍受约束 |
| [42](work-orders/42-fullstack-delivery.md) | **PRE_GATE_CLOSURE_PENDING**（后端门=四家真实模型门已执行；前端实现门自述已满足但未接管，未联调） | [进度与费用账](../server-round1/fullstack/progress.md) + [运行时工件投影底座](../server-round1/fullstack/runtime-artifact-projection.md) + [Pi 生产封装](../server-round1/fullstack/pi-production-packaging.md) + [Hermes 生产封装](../server-round1/fullstack/hermes-production-packaging.md) + [OpenCode 生产封装](../server-round1/fullstack/opencode-production-packaging.md) + [通用 driver 接缝](../server-round1/fullstack/native-driver-seam.md)：工件投影 **RUNTIME_ARTIFACT_PROJECTION_READY**；Pi/Hermes/OpenCode 三家 **\*_PRODUCTION_CHAIN_PREPARED**（真实 adapter/agent + c4 Worker + bwrap + 本机假端点，两轮同一 native id / 两轮上下文 / 真实重开方法，两条门本会话串行复跑 exit 0；无模型证据标明 `MODEL_NOT_VERIFIED`，2026-09-15 已由四家 `--live` 真实模型门补上）；**Worker 5s 租约取消静默 attempt** 已第一手复现并**已修复**（`WORKER_LEASE_KEEPALIVE_FIXED`，含 Windows 真机 8 秒静默证据）；能力合同已统一为 canonical 词汇（`HARNESS_CAPABILITY_CONTRACT_READY`）；**四家原生 HOME 隔离已实施**（`PROFILE_NATIVE_HOME_ISOLATION_IMPLEMENTED`）、**Codex 生产封装已完成**（`CODEX_PRODUCTION_CHAIN_PREPARED`），四家都有生产封装；**四家真实模型门已全部取得证据（2026-09-15 `--live`，四门 exit 0，累计 <¥0.05）——机制证据与真实模型证据分账、不得互替**；**state 错误边界返修完成，现行 bundle c8（2026-09-15）**：runtime-artifact/Pi/Hermes/OpenCode + Windows r4/PostCheck 用 c8 exit 0，Codex 门【历史：曾为未解决的红绿间歇；用户已裁决 A，`.tmp` 与 `shell_snapshots` 已遮蔽、最终全绿】见 [state-error-boundary.md](../server-round1/fullstack/state-error-boundary.md) §4.2–4.4）；前端复测（2026-09-15 02:51 +08:00）：`DESKTOP_IMPLEMENTATION_READY` 自述成立、HEAD `8e7c138c`、worktree/index clean、`writer_lease=RELEASED`、r3 28 PASS/0 FAIL、wire 两摘要一致；28 方法 wire 摘要未变；DeepSeek 官方 API 可达（12 tokens） | 固定 Reviewer 的 §4.2 阶段闭环（**额度限制，2026-09-20 12:11 后可重试**）→ 登记 `BACKEND_IMPLEMENTATION_READY` → 双门接管与全栈联调 |
| [45](work-orders/45-native-home-storage.md) | **NATIVE_HOME_STORAGE_DONE**（082 收口：唯一未过的 G3 已由 67 裁决落地并于基线 `4c32992` 复跑 pass） | [原生目录证据](../server-round1/fullstack/native-home-storage.md) + [G门报告](../server-round1/fullstack/native-home-gate.json)：阶段A/B/C/D(部分)完成——Worker home操作族 + 协议3→4双向拒绝 + bundle c9（sha256:c7fcab3a…，Rust 38 passed）；native-home直挂/审计manifest schema 3/`server_sessions`+2列（schema 6）；wire零改动。**G1/G2/G6/G8第一手通过**（含续接真召回、取消后召回不断、审计漂移可见）；四家假端点门c9上全部exit 0；全量**890 passed/5 skipped/0 failed**。**G5的Windows r4(c9)全套+PostCheck已于2026-09-17补齐**（A/B/C/D/E+PostCheck全exit 0，3次真实Codex请求，崩溃重启后同native id续接；顺带修正验收栈6处过期假设——accept脚本部署合同/UTF-8请求体/delta拼接/schema 3断言/PYTHONUTF8解码崩溃；证据[windows-r4c9/](../server-round1/fullstack/windows-r4c9/)）；G7记部分覆盖（真实应用二轮上下文由46-G3八家8/8覆盖，续接能力由r4 C/D+E双层覆盖）。**捕获三根因修复已收口（提交 67085b4，2026-09-17）**：真实迁移场景六轮capture失败（5×审计响应超64KiB帧→EXECUTION_FAILED、1×VIEW_IO元数据竞态）→ 审计帧上限1MiB（协议版本仍4、旧二进制超限帧类型化拒绝）+ 审计RPC 120s窗口 + 元数据NotFound记截断；修复经 Rust 38/根套件 601/wire 37/pi门c8 exit0/Windows accept-b exit0 验证，**迁移最终验证 MIGRATION_FINAL_OK**（codex-main与hermes-main各一真实轮 completed/captured/cleaned，checkpoint落库 native_platform=wsl、home_locator=codex-main/.codex 与 hermes-main/.hermes、原生会话id齐备；用户直接委托的1.x迁移任务，2次真实调用另账，六轮失败轮模型均已真实答复）。未过项已清零：**G3 并行双轮**其时为产品语义裁决项（类型化拒绝满足「不静默换地」底线，但「两轮都完成」未达成），67 把唯一性单位改为会话后，082 在基线 `4c32992` 复跑整座门得 `NATIVE_HOME_GATE_OK`——两轮均 completed、native id 各自独立、同会话第二条入队、运行中切换 rejected/execution_running，证据 [native-home-45-082-rerun.json](../server-round1/fullstack/native-home-45-082-rerun.json)，真实模型 0 次；**§1b/落地设计§14（session库独立于profile home）已实现并逐家定性**（提交 717a643/20d66d6，证据 [stage A](../server-round1/fullstack/session-store-14-stage-a.md) + [45报告§9](../server-round1/fullstack/native-home-storage.md)：机制=Worker session-store 模式+房间库绑定+审计走库根；**codex/pi 声明 split 且门在 c10（sha256:d92c6716…）全绿**，hermes 更正为共享DB式、opencode/kilo 同；claude/dsh/qwen 声明撤回（其43代门自45起未在Linux复跑，本轮修复三层接口漂移后仍卡 HOME_MARKER_CONFLICT，根因未定位，记录为维护债） | 下一步：~~G3产品裁决~~（已由 67 裁决、082 复跑闭合）；43代门 marker 冲突根因（claude/dsh/qwen）；G8 取消/召回间歇 → 087；其余收口 |
| [46](work-orders/46-all-harnesses-fullstack.md) | **ALL_HARNESSES_FULLSTACK_DONE**（证据边界见报告 §0b，2026-09-17 收口复核补记：G4反例为两家fixture双向+launcher正控制、非8×8矩阵；UI门第二轮nonce断言语义见F46-4；请求精确计数19次、排障重跑未逐笔粗估另<10次） | [46证据（§8终版）](../server-round1/fullstack/all-harnesses-install-set.md) + [并存JSON](../server-round1/fullstack/all-harnesses-coexistence.json) + [隔离JSON](../server-round1/fullstack/all-harnesses-isolation.json) + [8家UI门](../server-round1/fullstack/ui-gates-46/)：扩展分支合并（c1a7ea9，3冲突按接缝解决，195/3）；8家安装集（幂等，digest逐家固定，deployment sha `5dce588b…`）；并存8/8；**D隔离完成**（ISOLATION_GATE_OK——home互不覆盖、B家零字节、launcher边界正控制；覆盖面边界见 §0b）；**C逐家真实DeepSeek UI门完成（2026-09-17）**：真实Electron+真实Windows Server+真实WSL Worker，8家各8/8步骤PASS exit 0，凭据经界面录入，精确计数19次<¥0.05逐家记账（排障重跑未逐笔、见§0b）——F46-1的「外部资源缺席」判断被用户纠正（WSL互操作可直驱Windows），同路径顺带补齐45的G5 Windows腿（r4全套+PostCheck全绿）。不退化：44两门、45 G门、r4全套、插件195/3、全量608/1全exit 0；wire零改动。§6缺口F46-2三方案记录待裁决（非DoD项）。清理：沙箱/数据根/home/进程全清，`git diff --check`净 | 下一步：§6缺口方案交用户裁决（F46-2）；45-G3产品裁决 |
| [37](work-orders/37-http-codex.md) |
| [37](work-orders/37-http-codex.md) |
| [49](work-orders/49-evidence-hygiene.md) | **EVIDENCE_HYGIENE_DONE** | [49报告](../server-round1/fullstack/evidence-hygiene-49.md)：G1 九门缺参类型化失败（GATE_WORKER_REQUIRED，反例测试 2 passed）；G2 pi门+Windows accept-b 显式c8 exit 0（c8现行摘要 ce7fdeb2…，工单所写 514f48a9 为历史值——c8已在45/46期间重建，如实记账）；G3 status计数口径节（现行唯一+历史声明）；G5 prune两残留清零、未删任何bundle（c2/c3/c5/c6/c7 在49开工前即缺失，不入git不可追溯，记账）；legacy_codex.py连两个测试删除（47 §2.E 收口项提前完成并在47文档登记）；G4 根套件 601/0、插件 195/3、Rust 38，零真实模型调用 | 无未做项（Windows r4 C/D真实模型段按49零调用约束不复跑，记账） |
| [50](work-orders/50-absorb-capability-layer.md) | **CAPABILITY_LAYER_ABSORBED** | [50报告](../server-round1/fullstack/capability-layer-absorbed-50.md)：按内容吸收 `feature/capability-entry-v1 @ 1c74d15`（不合并历史/调度）——capability 库七模块 + `declarations.py` + 八组测试 + gate 测试移植；Server 三文件（runtime/sidecar/sidecar_backend）逐段重放到当前签名；唯一强制门在 `open_execution` 前（fail-closed，零 spawn），反例：未批准 provider / 伪造声明 / 空授权集（≠不限制）全部类型化拒绝；`network.none@1` 收敛为逐执行声明 unavailable（argv 缺失锚点，第一手观测），`_CAPS` 写明跨模板并集；新增 `slots.py` 登记槽位↔具体能力关系 + 守卫测试（拼造 id 无槽位、`_CAPS`==isolation 组）。修正源分支一处缺陷（helper 插错位置解除 skip 守卫）。回归：根套件 **748/0**、插件套件 **331/3**、四家全链门（pi/hermes/opencode/codex）显式 c8 全部 exit 0。零真实模型调用 | 无未做项；terminal 短名词汇版本化与 47 的房间网络参数按工单边界留后续 |
| [47](work-orders/47-sandbox-plan-seam.md) | **SANDBOX_PLAN_SEAM_DONE**（Windows r4 本轮未复跑，记账） | [47报告](../server-round1/fullstack/sandbox-plan-seam-47.md)：中性沙箱端口（`extensions/runtime_composition/sandbox_port.py`，三级名字解析、不猜、fail-closed）——通道（sidecar/local_channel）与装配（runtime.py）都按名字拿 provider，**生产代码 grep agent_box_sandbox_bwrap 零命中（G2）**；文法上移 （home_projection/runtime_artifacts → `resource_contracts/`，部署文档格式零改动）；bwrap 真的声明 `isolation.wrap@1`，协调器 preflight 未声明即 `CAPABILITY_UNDECLARED` 拒绝（G3）；新一致性门 [sandbox-conformance.json](../server-round1/fullstack/sandbox-conformance.json) **OK/exit 0**（home 真目录、宿主 /home 不可见、RO EROFS、ephemeral 无痕、凭据不进 argv、树杀含正控制、清理有界、none 姿态诚实拒绝），反例 fake-redirect-home **FAILED/exit 1**（G4/G5）；`host-substitution` 门 **OK**（roomDiffersOnlyInBindings=true）+ 四家全链门显式 c8 全 exit 0（G1）；全量 **754 passed/0 failed**（G6）。零真实模型调用 | 未做项：Windows r4 复跑（48 时一并）；runtime-*/tests 3 处 bwrap fixture 引用保留（测试语义） |
| [48](work-orders/48-windows-placement.md) | **WINDOWS_PLACEMENT_DONE_IN_D5_DEGRADED_SHAPE**（spike 授权的降级形态；读写隔离声明 false；**AppContainer 已结案，072**） | [48报告](../server-round1/fullstack/windows-placement-48.md)（§七 结案 + §八 声明核对）+ [spike](../server-round1/fullstack/windows-spike.md) + [提权轮证据](../server-round1/fullstack/windows-spike-elevated-raw.json)：**新插件 agent-box-sandbox-windows**（47 接缝：Job 生命+物化+环境块凭据；隔离半边声明 unavailable）；宿主栈（local_channel Windows Job 分支、runtime-local windows realm、tmux 全表面 Windows unsupported、装配按平台选默认 provider id）；**一致性门平台声明驱动**：Linux bwrap OK（回归）+ **Windows 真机 OK exit 0**（[报告](../server-round1/fullstack/sandbox-conformance-windows.json)）+ **Windows 反例 FAILED exit 1**（[反例](../server-round1/fullstack/sandbox-conformance-windows-counterexample.json)，两文件已入本树）；逐家声明不可用（八家均无 Windows 工件）；全量 **1103 passed/3 skipped**。零模型调用 | 未做项：逐家真 harness 轮（等 Windows 工件）、45 G8 Windows 重跑；**AppContainer 容器承载已结案不再追测**（判据见 §七：失败与提权无关 + 写隔离降 IL 需管理员） |
| [51](work-orders/51-usage-context-fact.md) | **USAGE_FACT_PARTIAL（pi 与 codex 端到端含 wire；六家解析器齐；hermes/claude 的门级观测轮已由 084 在当前基线一手复现，opencode/kilo blob 解析核实为 `eb0c307` 即已落地）** | [51 阶段 A 观察](../server-round1/fullstack/usage-context-observation-51.md)：逐家用量/上下文来源的第一手清单（codex rollout 的 total_token_usage、hermes state.db 的完整细分、claude projects 的 token 键、opencode/kilo 无专用列、pi/dsh/qwen 待验证；ACP 协议无 usage/contextWindow——neutral fact 必须走 native 回读）；B/C 已落地（a2143c3）：schema 7（turns 的 usage_* 列 + sessions.latest_usage）、usageProbe 部署声明（format 注册表，未知即部署拒绝）、解析器 （usage.py；ACP 的 usage 在 row.message.usage——阶段 A 文档已按工单 §1 更正 ACP 结论）、完成边界在 channel 存活期读取（迟到即如实 unknown）。端到端：pi 门 c10 exit 0 且 turns 记 11/7/18 source=pi-acp-journal、session latest_usage 落库、failed 轮 NULL。零模型调用 | D 已落地（eefa148/8e41e73：usage.updated 事件 + latestUsage 投影 + FRAME_COVERAGE + 严格校验 37 passed 带工件；两仓摘要见 wire-review.md；E 交接文档已入前端仓 evidence 35258dac） | codex 观测轮已绿（c10，turns 记 11/7/18→22/14/36 累计 source=codex-rollout，解析器经真实 rollout 行验证 payload.info 嵌套；hermes 解析器经真实 state.db 验证）；**观测轮补齐与 blob 解析两项由 084 结案**（[084 证据](../server-round1/fullstack/usage-parsers-remaining-084.md)：hermes 门 `--keep` 后账本记 `(11,7)`→`(22,14)` `source=hermes-state-db`、claude 门记 `(11,7)` `source=claude-projects-line` 且其**失败轮**整行 NULL＝本行"失败轮 NULL"的真实行实例；opencode/kilo 的 blob/列解析核实自 `eb0c307` 起已在树内，本轮只补反例）。51 的**精确剩余**只有一条：`kilo`/`opencode`/`dsh`/`qwen` 的**部署模板仍未声明 `usageProbe`**（模板在 `plugins/**`，不在 084 的 `write_paths`）⇒ 需要一张有插件写权的单。 |
| [52](work-orders/52-session-process-facts.md) | **B/D+E 完成（thought/plan/mode 三新 wire kind + 四类映射入账本；严格校验 37 passed 带工件）；真 harness 观测轮已跑并记否定结果** | [52 阶段 A 观察](../server-round1/fullstack/session-process-facts-observation-52.md)：ACP sessionUpdate 词汇覆盖全部四类事实（thoughts/tool/plan/mode）——缺口在桥与 Server 的 `_forward()` 只转发 agent_message_chunk；native 层佐证（hermes messages 表的 reasoning/tool 列、codex rollout 的 response_item/event_msg、claude 的 assistant/output_style 行）。B/D 已落地（b0c124f）：_forward() 映射四类 ACP 通知、_native_event 落账本、wire 加 thought.delta/plan.updated/mode.updated（前端合同 b1f44a23、工件 0cdc459c，13 kind）、严格校验 37 passed 带工件。**观测轮（3e945b3，真 pi + 假端点一圈）：四类过程事实零出现——否定观测，不写成通过**；同圈 54 三轮 change_set 全 NULL、55 探针产出真事实 | 剩余：需能发四类负载的真流（真 harness 自己播发 thought/tool/plan/mode）才能端到端取证；夹具已单独验证播发路径 |
| [55](work-orders/55-provider-model-record-and-probe.md) | **G1–G4 完成 + 真实端点探测完成（070 执行，R-0011）** | 记录扩展（534535e/52659ad/f4214a7）：server_provider_models 增 base_url/auth_style/wire_api/fields_source 四列（可选，旧记录 NULL=未知不阻塞）；wire 的 providerModels.create/update 增可选 provenance 对象、providerModel 投影带 provenance（全空投影 null）；枚举校验（authStyle/wireApi/fieldsSource），未知值类型化拒绝。G2 探测（6b1abe6/23bd0dd/60a4ea1/1511e03，`model_configs/probe.py`）：`probeModels`/`probeConnection`（方法集 28→30，纯新增）、https-only（loopback http 例外）、非 loopback 私网拒绝 `PROBE_ENDPOINT_BLOCKED`、凭据仅内存注入（零 argv/日志/事件）、`PROBE_RESPONSE_TOO_LARGE`/`PROBE_FORMAT_INVALID`/`PROBE_AUTH_FAILED`/`PROBE_TIMEOUT`/`PROBE_UNREACHABLE`、**探测结果不写任何记录/配置**；十三项定向测试。**070 真机轮**：[报告](../server-round1/fullstack/provider-model-55.md) + [证据 JSON](../server-round1/fullstack/provider-model-55-real-probe.json)（真实 `GET api.deepseek.com/models` 2 次：ok `[deepseek-flash, deepseek-v4-pro]` 0.218s / reachable 0.176s；配置零写入；凭据零命中；五类反例演练各一次；R-0011 零 token 计费）；**先失败后修**：`probeConnection` 接线 ImportError、运行时把 `credentialId` 误当必填、总时限未生效（均已修 + 测试锁住） | 交回项：`providerModels.update` 与 `providerArtifacts.install` 的运行时/发布 schema 不齐（需更新语义决定）；窗口/能力无记录面（要展示须新字段）；P17 前端同步与两仓重锁仍待（strict 工件 5 项既有失败=待重锁状态） |
| [57](work-orders/57-harness-artifact-management.md) | **阶段 A 完成（逐家来源观察）；安装/更新/回滚实现待做** | [57 阶段 A](../server-round1/fullstack/artifact-sources-57-stage-a.md)：npm 系三家（pi/codex/opencode）来源与证明充分（registry dist.signatures+attestations 公开、dist.shasum 钉住、版本映射即目录源）；本仓钉住版本有意落后上游 latest（0.5.0/0.147.0/1.18.21 vs 0.9.1/0.154.0/1.18.31）——更新检测输入；hermes/dsh 内部闭包仅摘要固定；codeg 参照未取得如实记录。B 已落地（2052743：ArtifactStore——版本目录 <root>/<family>/<version>/、安装时重推导 tree digest v1、不匹配零落地、引用 .current 与回滚为指针移动、重复安装与未安装版本类型化拒绝；五项测试）。零模型调用 | 下一步：C wire 面（安装/更新/回滚/清单方法）→ D 真机证据（发布物取得 + 本地构建各一）|
| [54](work-orders/54-turn-file-change-set.md) | **本机通道切片完成（change_set 模块 + 账本，schema 9）；WSL 通道观测轮已跑（069，否定 + 根因）：账本全 NULL，原因=`sidecar.py:631-632` 把空快照 `{}` 真值折叠成 None（**非协议缺口**，Worker op 直探可用）** | 模块（change_set.py：O_NOFOLLOW 有界走查+内容副本 256KiB/8MiB/1024 条目上限+截断事实；diff added/modified/removed+文本行数；二进制/超大只报变更并注明）；本机通道 attempt 前快照、审计边界后走查、diff 发布为记录对象入 turn（schema 9）；十项定向测试（行数、symlink/特殊文件事实、二进制、副本目录独立性、凭据不进 fact）。全量 1107+ 通过（含本切片十项与严格 wire 校验）；零模型调用。**WSL 通道**（d825512）：Rust Worker `workspace.list`（本单直探 OK：path/size/digest）→ 启动器 before-snapshot → `workspace_change_set()` diff；[069 观测报告](../server-round1/fullstack/wsl-change-set-observation-069.md) + [证据 JSON](../server-round1/fullstack/wsl-change-set-observation-069.json)：pi 门 c11 一轮 3 turn（2 completed/1 failed）digest 全 NULL，插桩 + 同进程三态探针钉出根因（空快照折叠 ⇒ 连 after-listing 都不发）。观测轮（3e945b3，本机通道一圈）：三轮 `change_set_object_digest` 全 NULL——该圈工作区零编辑，与"空改动不发布变更集"一致 | 交回（069 §4）：`sidecar.py:631-632` 改 `is not None` + 空快照测试 + 复跑观测轮（正例=审计文件即非空变更集）；kilo marker 维护债已随 e394f09 解除 |
| [53](work-orders/53-usage-aggregation.md) | **USAGE_AGGREGATION_DONE（B/C/D 完成：聚合模块 + wire 方法 + 导出；所列"解析器与观测轮待续"两项已由 084 结案）** | UsageAggregator.aggregate_by_session（3deae3a 前身，现位于 usage_aggregate.py）：按会话聚合已上报 tokens，无数据会话返回 unknown（非 0）；跨会话零泄漏反例；未知轮次计数可见。定向测试 4 项 + 解析器测试 10 项全绿 | wire 面 usage.aggregate/usage.export 已接线（79e8d4e）；**hermes/claude 门级观测轮与 opencode/kilo 解析由 084 收口**（观测轮在当前基线一手复现；解析器核实自 `eb0c307` 已在树内，084 补 NULL⇒缺席、读取失败⇒unknown+原因两条反例，并把凭据面从 grep 升级成运行期守卫）：见 [084 证据](../server-round1/fullstack/usage-parsers-remaining-084.md) §2/§3/§7。聚合面**没有新增**：它消费账本里的 usage 列，各家事实齐了才完整 |
| [43](work-orders/43-harness-expansion.md) | **HARNESS_EXPANSION_ROUND1_DONE + kilo 追加（过门 4 家：dsh、claude-code、qwen、kilo——假端点门与真实模型门均 exit 0；Goose 已调研未实现；Aider 调查后不接；Crush/OpenHands 未碰）** | [dsh 封装](../server-round1/fullstack/dsh-production-packaging.md) + [claude-code 封装](../server-round1/fullstack/claude-production-packaging.md) + [qwen 封装](../server-round1/fullstack/qwen-production-packaging.md) + [kilo 封装](../server-round1/fullstack/kilo-production-packaging.md)（用户追加；OpenCode fork，原生二进制 `kilo acp`，KILO_CONFIG_CONTENT env 配置通道，费用 +4 次请求 <¥0.01）：三家六件套齐——注册表/生产模块/部署模板/双构建一致工件/假端点全链门 exit 0/**`--live` 真实模型门 exit 0**（mode=live，官方端点、授权 locator 只读注入、两轮真实答复、次轮真召回、同 native id 续接、未知模型发包前拒绝、凭据零泄漏、清理干净）；能力 observed 逐项以门证据回填；桥接补丁 1 个（ACP 分组配置选项展平，PATCHES.md §3，无品牌分支）；费用：确认真实请求 28 次（dsh 8 + claude 12 + qwen 4 + kilo 4）+ 少量后台 title 调用，估计 < ¥0.06（上限 ¥10） | Goose 接入卡已备（v1.50.1、`goose acp`、env 三件套、GOOSE_PATH_ROOT；注意 musl 静态二进制 LD_PRELOAD 不可用）——后续工单实现；Crush/OpenHands 按工单顺序未开始；检查点 d9d36b0 / 2c0735c / e63a03e / 8adebe2 + 收尾提交 |
| [37](work-orders/37-http-codex.md) | **SERVER_HTTP_CODEX_R1_PARTIAL** | [原完成审计](../server-round1/completion-audit.md) / [C/D证据](../server-round1/stage-c-d.md)保留；检查点5a45303/5b71393/cd5efbe/67c6b40。独立定向23 passed；同键并发双accept已由39复现并修复；能力不诚实已由39结构性修复 | abandon 断言经探针定性为**测试侧竞态**（终止状态持久化后约50ms才 abandon；负载高时10/10失败），已改为有界等待、断言强度不变，修后10/10通过；原生语义迁移由40执行 |
| [44](work-orders/44-environment-providers.md) | **ENV_PROVIDERS_DONE** | [环境 provider 证据](../server-round1/fullstack/local-ssh-env-providers.md) + 两份门报告（[local](../server-round1/fullstack/env-provider-gate-local.json) / [ssh](../server-round1/fullstack/env-provider-gate-ssh.json)，同一部署文档 sha256 `6026b9…`）：Worker 以 musl 静态构建上实验机（`SSH_WORKER_HELLO_OK`，控制协议 3 全握手）；第一手发现实验机 bwrap 0.4.0 缺 `--clearenv` 跑不了房间，已在实验机源码构建 0.11.0 并带备份切换（回滚见证据 §1b）；`local-env-gate` 与 `ssh-env-gate` 均 exit 0（no-model fixture，真实模型 0 次、¥0）；四家假端点门 exit 0；全量 **915 passed / 5 skipped / 0 failed**（基线 886/6，无退化，另修复两条被 skip 掩盖的既有用例与本机通道零凭据崩溃、connector 分派 kwargs 丢失两个真实缺陷） | 未做项（工单明示范围外）：前端选择器接线、Windows 原生沙箱、远端多用户/跳板机/密钥托管 |
| [38](work-orders/38-harness-extension-selection.md) | **HARNESS_EXTENSION_SELECTION_READY_FOR_DECISION** | 两轮 A/B/C 完成：[最终建议与边界](../server-round1/harness-selection/boundary.md)。保留有条件首选 `harness-remote v3.0.2`；零模型/凭据 | 首选已由40消费进入有门禁接入；不再等待决定 |
| [60](work-orders/60-profile-settings.md) | **PROFILE_SETTINGS_PARTIAL**（A–F 落地 + 两项补记；姿态逐家翻译 claude/codex 已落地，只收紧或拒绝；**翻译产物写入配置由 085 落地**） | [60 报告](../server-round1/fullstack/profile-settings-60.md)：逐工具权限求解（键/动作闭集、last-match-wins、预设回落，绝不默认 allow）+ **schema 16** 冻结进轮；归属纠正测试（会话属工作区、跨家族切换拒绝 `PROFILE_HARNESS_MISMATCH`）；克隆与逐家迁移表 + `profiles.clone`；资产重绑（`reboundAssets` 与迁移报告同源，测试断言一致）与 `profiles.setPermissions` wire；`posture_translation.py`（claude 工具名表、codex 最严格 sandbox+审批；不可表达即 `PERMISSION_POSTURE_UNEXPRESSIBLE`，laxer 永不静默）；提交 f8ed9d2（840）→03c210d（844）→8b73c7d→27dfa26（845）→e39959f（879，八家全链门 exit 0）。**[085 写入证据](../server-round1/fullstack/posture-config-keys-085.md)**：一手钉住 claude `settings.json›permissions.ask/deny` 与 codex 顶层 `sandbox_mode`/`approval_policy`（含版本漂移事实：宿主 codex 0.154.0 已拒 `untrusted`，本部署 0.147.0 接受），`posture_config.py` 只收紧 + 真实工件快照对比（`claude doctor` / `codex debug prompt-input`）；其余六家 `POSTURE_CONFIG_UNPINNED_HARNESS` 类型化拒绝，名单从注册表派生 | 60 的遗留**由 085 收窄为三条**（逐条给入口）：① **生产接线**——085 Scope 明写"不碰 wire"，`posture_config.py` 目前无调用方 ⇒ 归 **093**；② **`ask→allowedTools` 分歧**——`posture_translation.py` 仍把 `ask` 译进 allow 列表，相对中立姿态是**放宽**，与 085 G2 相冲 ⇒ **交回调度者**（一处映射修正，非扩协议；085 不代改别人的契约）；③ claude `permissions.ask` 的**运行时效果**需一次真实工具调用才可见（模型轮）。另：`ask`↔审批往返端到端；P17 前端同步与两仓重锁 |
| [61](work-orders/61-pacthold-rebrand.md) | **PACTHOLD_REBRAND_DONE**（基础设施侧；合同 ID/环境变量/import 路径零变化） | [改名报告](../branding/REBRANDING_REPORT.md)：审计计数与四类处理表、新旧映射（分发名 `pacthold`、六条 CLI 新旧同源一 main）、兼容保留清单（entry-point group/`agent-box.*@1`/`AGENTBOX_*`/数据目录）、本地 wheel `Name: pacthold` + 新名真实启动冒烟；提交 ff0c578（848）+ 30adedf（docs 拼写修正） | 插件分发名改名留后续单；发布/远端改名/数据迁移明示不做；P18 桌面侧一致性归桌面工作树 |
| [62](work-orders/62-workspace-git-status.md) | **WORKSPACE_GIT_STATUS_DONE**（DoD 的"本机与 WSL 各一次"两条腿**均已真跑**：本机 62 报告 §3，WSL 由 **083** 补跑。契约偏差澄清：WSL 路径**结构性永不报** `additions`/`deletions`（无字段级 reason 概念，62 的 `reason` 是答案级），已按 083 记录交回，不改 wire/实现，故不影响本行终态） | [62 报告](../server-round1/fullstack/workspace-git-status-62.md)：`workspaces.gitStatus` 六字段 + reason（null=拿不到不是 0；二进制在场 ⇒ 增删行 null + `GIT_BINARY_DIFF`）；porcelain v2 + numstat；流式上限超限即杀；只读性逐字节证明（index mtime 未变）；提交 76e7c35（854）。**[083 WSL 真腿](../server-round1/fullstack/wsl-legs-62-64-083.md)**：真 `wsl.exe` + 真仓 ⇒ `main`/2 改/`ahead=2`/`behind=0`；非 git 目录 ⇒ `GIT_NOT_A_REPOSITORY` 全 null；无连接器 ⇒ `GIT_UNAVAILABLE` 不编数；答案零宿主路径 | WSL 侧增删行是否补 numstat（**交回调度者拍**：多一次命令 vs 维持两字段恒空，是产品决定不是缺陷修复）；P20 前端同步与两仓重锁（新增 1 个只读方法） |
| [63](work-orders/63-profile-memory-read.md) | **PROFILE_MEMORY_READ_DONE**（本机侧完整；WSL 侧未接，如实记账） | [63 报告](../server-round1/fullstack/profile-memory-63.md)：注册表 `memory_paths`（claude/codex 一手钉住；未声明不画假分区）；`profiles.memory` 只读有界 + 扫描（`MEMORY_CONTAINS_SECRET` 拒绝项无 content）；声明了但缺失=缺席不报错；提交 4d7b0e0（858） | WSL 侧读（按 62 同族设计）；P17 前端同步与两仓重锁（新增 1 个只读方法） |
| [64](work-orders/64-execution-inventory.md) | **EXECUTION_INVENTORY_PARTIAL**（本机 pid 已接；**083 已在真 WSL 组合上跑通清单面**（空列表反例 + `placement="wsl"` + `pid=null`/`PID_NOT_REPORTED`），但 DoD 要的是"WSL 真机轮**含飞行中取样**"，那一条仍未见——组合路径阻塞见 083 证据 §3.1） | [64 报告](../server-round1/fullstack/execution-inventory-64.md)：账本同源（完成后行即刻消失）、本机 `pid` 三态（无端口/报值/报 null）、上限 200 类型化失败、零宿主路径；`executions.list` wire；提交 faaeedf（862）。**[083 WSL 腿](../server-round1/fullstack/wsl-legs-62-64-083.md)**：`build_runtime(connector=真 WslConnector)` + 真 wire 读取；通道本身另有第一手活证（真 c11 `probe()` 握手，`worker_digest` `sha256:c1e353c8…`） | **精确剩余**：真 Worker 飞行中的取样（本侧组合不出：`_builtin_connector` 仅 `os.name=='nt'`、`build_runtime_from_sidecar_deployment` 不收 `connector=`、门脚本 `--placement` 只有 `local\|ssh`；路由缺陷已另拍 **090**）；`adapterPid` 不做；P20 前端同步与两仓重锁 |
| [65](work-orders/65-profile-as-subagent.md) | **SUBAGENT_DELEGATION_PARTIAL**（A/B + C 三块：授权边与两工具契约、委派服务、真桥端到端与并发） | [65 报告](../server-round1/fullstack/profile-as-subagent-65.md)：**schema 17/18**；授予即拒环（`SUBAGENT_CYCLE`）、未授权名零泄露（只内联被授权名）、可选参数只收紧（`SUBAGENT_PERMISSION_WIDENED`/`SUBAGENT_MODEL_WIDENED`）、扇出 ≤4、10 分钟有界；真桥进程→按次令牌→真本机通道子轮→有界摘要（≤4096 字符）+ 用量同源；父 deny 继承（`inheritedFrom`）与审批镜像（同 id 到父轮）；授权 CRUD wire；提交 75253fa（865）→701ae20（872）→6854e4c（875）→07b43fa（877）→e39959f（879） | 真 harness（非夹具）父轮自己发起 `tools/call` 的一圈；P17/P20 前端（授权分区 UI 与"智能体"卡） |
| [66](work-orders/66-shared-session-store.md) | **SHARED_SESSION_STORE_DONE**（A–C 落地、G1–G5 齐；G5 的首跑竞态由 **080** 的按库首跑锁补齐） | [66 报告 §15](../server-round1/fullstack/shared-session-store-66.md) + [并发证据](../server-round1/fullstack/shared-session-store-66-concurrency.json) + [080 报告](../server-round1/fullstack/first-run-lock-80.md)：whole-db 声明与收窄共享集、叠加绑定与播种、切换前置四查、守卫（读穿 WAL、fail-closed）、凭据处置改写（共享库命中不删）；43 代门 marker 债解除（e394f09）；无锁门 `scripts/server-round1/shared-store-concurrency-gate.py` 保留为反例（真 opencode 1.18.21，零模型）；提交 3fcb2df/15b8620/dc65731/e394f09/7398e66 + 080（本轮） | G5 复验：**真 harness 7/7 全绿（有锁）/ 2/3 失败（无锁，同形状）**；远端守卫（Worker 读库）仍 fail-closed；`project` 非单例的事实更正已入报告；首跑锁的就绪=首轮终态（每库一次等待，见 080 §2 取舍） |
| [67](work-orders/67-per-session-admission.md) | **PER_SESSION_ADMISSION_DONE**（45-G3 转 pass，并在当前基线复现） | [67 报告 §9](../server-round1/fullstack/per-session-admission-67.md) + [复跑门报告](../server-round1/fullstack/per-session-admission-67-native-home-gate.json)：`_migrate_9_to_10` 去 per-profile 索引（幂等、只前向，"下次启动不建回来"）、两处 409 文案收窄到会话、`run_state`=任一活跃轮/`native_generation` 完成即 +1、`homeConcurrency` 逐家显式声明（claude/dsh/qwen 收窄锁）；提交 59fe1bb（+e8d0db8 状态）；**当前基线复跑**：native-home 门 OK（复跑 2，G3 两次都 pass：两轮都 completed、`nativeIdsDiffer`、同会话入队、运行中切换 rejected）、定向 38 passed、根套件 879 | 新增维护债（非本单门）：G8 取消竞态"空流"间歇（2 次复跑 1 败；建议召回轮加空流重试）；dsh/qwen 待其本地门首跑后可从 exclusive 收紧回 shared |
| [68](work-orders/068-ledger-catchup.md) | **LEDGER_CATCHUP_DONE** | 本行即本单产物：主表补 60–65 六行（22dc823）+ 刷新 52/54/55（cfa9eba）+ 计数口径节刷新 + G3 下调 62/64（本轮提交）；自查与反例演练见文末 §068 | 068 范围内无剩余；两个发现已如实记录（48 行两处断链证据在主树分支；62/64 的 WSL 真机腿待搭 WSL 轮） |
| [70](work-orders/070-real-endpoint-probes.md) | **REAL_ENDPOINT_PROBES_DONE** | [070 报告](../server-round1/fullstack/provider-model-55.md) + [证据 JSON](../server-round1/fullstack/provider-model-55-real-probe.json)：真实端点一轮（2×GET，0 token，¥0）；G1–G5 五类反例演练各一次（上限/总时限承重、扫描器正控命中、四码互异、无内置默认、配置摘要不变）；先失败后修三处（probeConnection ImportError、credentialId 误必填、总时限未生效）+ 新增 wire 面端到端测试 | 交回项（§6）：`providerModels.update`/`providerArtifacts.install` 运行时与发布 schema 对齐（需语义决定）；窗口/能力字段缺失；P17/P20 重锁 |
| [69](work-orders/069-wsl-observation-54.md) | **WSL_OBSERVATION_DONE**（否定观测 + 根因钉到文件:行） | [069 报告](../server-round1/fullstack/wsl-change-set-observation-069.md) + [证据 JSON](../server-round1/fullstack/wsl-change-set-observation-069.json)：pi 门 c11 真跑一轮（exit 0）+ 账本直查（3 turn 的 `change_set_object_digest` 全 NULL）；插桩复跑 + 同进程三态探针钉出根因 `sidecar.py:631-632`（空快照 `{}` 被真值折叠 ⇒ `workspace_change_set()` 提前返回、不发 after-listing）；Worker `workspace.list` 直探 OK ⇒ **非协议缺口**；G3 `git diff --stat -- src plugins` 为空 | 交回：`is not None` 一行修 + 空快照测试 + 复跑（见 069 §4）；54 行已同步修正表述 |
| [72](work-orders/072-windows-48-closeout.md) | **WINDOWS_48_CLOSEOUT_DONE** | [48 报告 §七/§八](../server-round1/fullstack/windows-placement-48.md)：两轮退出码 `-1073741502`/`0xC0000142`、H1 排除、两条结案判据、"容器承载不再追测"与"低于 Linux 侧"明示；声明核对逐处第一手（read/write isolation 仍 false、`isolation: none`、`filesystem.readonly@1` unavailable）；四份原始 JSON 入本树（含修掉 48 行两处断链）；提交 54127eb/24bc31e/本轮；G3 `git diff --stat -- src plugins tests` 为空 | 无剩余（本单只写证据）；**自查发现**：48 行此前写"报告显式写低于 Linux 侧"而文档实际缺失（已由 §七 补齐并如实记录） |
| [80](work-orders/080-first-run-lock.md) | **FIRST_RUN_LOCK_DONE** | [080 报告](../server-round1/fullstack/first-run-lock-80.md)：按库首跑锁（键=（放置,家族）；首轮独占至终态、并发首跑有界等待 `FIRST_RUN_LOCK_TIMEOUT`、终态后 ready 放行）；落点 `first_run_lock.py` + `sidecar_backend._start_run/_complete_then_retire/stop` + `sidecar.whole_db_store`（仅 whole-db）；门：**真 harness 7/7 全绿（36 s）/ 无锁同形状 2/3 失败**、接线轮两首跑窗口不相交 + 去门即相交（反例）、超时类型化；套件 **887 passed**（+5）；提交本轮 | 设计取舍与已知边界见 080 §2（就绪=首轮终态：每库一次等待；同键新库不再锁）；未做：真 opencode 经 WSL worker 打进 Server 的全栈并发轮（组合论证替代，如实记账） |
| [81](work-orders/081-relock-register-frontend.md) | **RELOCK_REGISTERED_PARTIAL**（差异已登记；**两端仍未锁定**） | [wire-review Order 81 节](../server-round1/wire-review.md)：逐字复核（**前端 P21 交回的是阶段 2 对**：TS `6e8ae84a`/工件 `f5d27269`，59 方法——订正工单前提里的 `b284f70c`；后端最后登记 `64dc9961`/`42a164a4`；本树副本 `a1bd52a4`，33 方法）；方法集 59 ⊂ 代码 64（缺 5 个=前端"刻意不编入"）；反例演练=旧值冒充已一致即与现物矛盾；G2 `git diff --stat -- src plugins tests` 为空；提交 2866457/e5fd5f1/本轮 | 交回 4 项：①换工件**本体**（摘要在两工具链间不可复现）②替换本树旧副本（strict 5 项失败之因）③定生成/比较口径 ④补 Order 57/58/59/65 小节（wire-review 0 命中） |

## 当前长期goal状态字段（执行者每阶段维护）

- backend_implementation: **BACKEND_IMPLEMENTATION_READY**（2026-09-15，用户显式授权开始联调后登记）（39/40组件门完成；41的28方法+队列终态已按
  锁定摘要29/29；Windows r4 平台门通过，**BACKEND_WINDOWS_R4_READY**。42-D 已补
  **RUNTIME_ARTIFACT_PROJECTION_READY**（工件投影底座）与 **四家生产封装全部完成**
  （Pi/Hermes/OpenCode/Codex \*_PRODUCTION_CHAIN_PREPARED，真实 adapter/agent + c5/c6/c7/c8 Worker +
  bwrap + 本机假端点两轮，同一 native id、上下文与真实重开方法）。
  **2026-09-15：四家真实模型门全部执行并通过（`--live`，官方 base URL、不覆盖配置、不装载 guard、
  授权 locator 只读注入）**——Pi/Hermes/OpenCode/Codex 四门 exit 0，各两轮真实 DeepSeek 答复、
  同 native id 续接、凭据零泄漏、清理干净、授权 locator 未被删，累计费用 <¥0.05；
  证据见 [live-model-preflight.md](../server-round1/fullstack/live-model-preflight.md) §6。
  2026-09-15 完成 **state capture 类型化错误边界返修（c7 起步，经 Reviewer 复审修复后现行 c8）**：
  runtime-artifact/Pi/Hermes/OpenCode 四门 + Windows r4/PostCheck 用 c8 串行 exit 0；Codex 门：用户已裁决 A、`.tmp` 与 `shell_snapshots` 已遮蔽、最终 4 轮全绿
  （10 绿→5 红→最近 3 绿，见 codex_native_state_findings）；详见
  [state-error-boundary.md](../server-round1/fullstack/state-error-boundary.md)。
  四家真实模型门（Worker 5s 租约缺陷已修：`WORKER_LEASE_KEEPALIVE_FIXED`）已按上一行执行完毕；
  要登记 **BACKEND_IMPLEMENTATION_READY** 还差固定 Reviewer 的阶段闭环，
  任一封装就绪或单家通过都不折算为整门通过）。
- backend_ready_closure_source: **用户授权（2026-09-15）**——用户确认"前端已经完成、后端收尾完成后即可开始联调"，
  据此登记 `BACKEND_IMPLEMENTATION_READY` 并进入双门接管。**closure 来源如实标注为「用户授权 + 执行者自审」**：
  固定 Reviewer 因额度硬限制（`try again at Sep 20th, 2026 12:11 PM`，三次投递阶段包均无 verdict）未提供本阶段
  `ACCEPT`；阶段包与全部证据已固化为
  [stage-closure-dossier.md](../server-round1/fullstack/stage-closure-dossier.md)，额度恢复后补一次只读复审。
- fullstack_integration_owner: **后端执行者（Zcode 后端 goal 会话）**，接管时间 2026-09-15 20:4x +08:00。
  接管时只读复核：前端 HEAD `8e7c138c96337fc20ed61d3c21100e6449c8ec95`、分支
  `feature/agentbox-desktop-product`、`git status --porcelain` 0 行、`writer_lease=RELEASED`、
  `DESKTOP_IMPLEMENTATION_READY`、r3 `28 PASS / 0 FAIL / 0 SKIP / 0 PENDING`（`allOk=true`）、
  wire 两摘要就地重算一致（TS `11e3b3e7…` / 工件 `5d4fa3bf…`）、无 electron/node/tsc 写入者。
  后端侧对应证据：四家 `--live` 门、Windows r4 + `-PostCheck`、`tests` 576/3/0。**发布源 main 仍只读**；
  接管范围限 42 `conditional_cross_repo_write.write_paths`。
- frontend_handoff: **DESKTOP_HANDOFF_CONSISTENT（按其自述成立；后端仍未接管）**——最新只读复测
  2026-09-15 19:00 +08:00（本轮，未写前端任何文件）：HEAD 仍 `8e7c138c96337fc20ed61d3c21100e6449c8ec95`、
  `git status --porcelain` 0 行、分支 `feature/agentbox-desktop-product`、lease 行仍为
  `writer_lease=RELEASED`、`DESKTOP_IMPLEMENTATION_READY`、`REAL_FLOW_VERIFIED=否`；
  就地重算 TS 摘要 `11e3b3e7…` 与 schema 摘要 `5d4fa3bf…` 仍与锁定值一致；
  `evidence/P06-assets-r3/results.json` = `{PASS:28, FAIL:0, SKIP:0, PENDING:0}`、`allOk=true`、`executed=28`；
  进程表无 electron/node/tsc 写入者。上一轮 2026-09-15 02:51 +08:00 复测：HEAD `8e7c138c96337fc20ed61d3c21100e6449c8ec95`
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
- 42 双门判定（后端门证据更新于 2026-09-15，四家 `--live` 门通过；前端观察仍为 02:51 +08:00）：
  BACKEND_IMPLEMENTATION_READY=**否（暂时：四家真实模型门已执行并通过，四家生产封装、HOME 隔离与
  state 错误边界（现行 c8）均已完成；只差固定 Reviewer 的阶段闭环）**；
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
  `CREDENTIAL_REQUIRED` 拒绝。（封装轮结论为 `MODEL_NOT_VERIFIED`，`workbench_model_verified_count=0`；**已由 2026-09-15 `--live` 真实模型门 `PI_PRODUCTION_CHAIN_GATE_OK` 取代**）。
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
  provider 身份 `custom`、上下文元数据回退 128K（内建表 1M）。（封装轮为 `MODEL_NOT_VERIFIED`；**已由 2026-09-15 `--live` 门 `HERMES_PRODUCTION_CHAIN_GATE_OK` 取代**）。
- opencode_production_chain: **OPENCODE_PRODUCTION_CHAIN_PREPARED**（真实 OpenCode 1.18.21
  **单文件二进制** 184 498 304 字节 / digest `sha256:c9485f62…`，经既有 `executableMounts`
  摘要固定只读挂进 bwrap 到 `/runtime/bin/opencode`（guest 内复核 `--version=1.18.21`、写 `/runtime/bin`
  得 EROFS）；**不伪装 ACP**：新增中立 driver 接缝 + 上游 `ManagedOpenCodeHost` 托管 `opencode serve`；
  两轮 delta 4,5,6<9 与 13,14,15<18、第二轮含第一轮上下文、checkpoint 4 文件（SQLite）`resumable=true`、
  重开相位 `createsInsideReopenPhase=[]` 且 `hostStarts≥2`；provider 恰 2 次、`requestsBeyondBudget=0`；
  受控重试实测上界 **6**（取代 42d 无证据的 12）；未知模型/缺凭据/坏 checkpoint/漂移二进制全部拒绝；
  token 在事件/状态/报告/Git 零命中；清理 `removed=true`。（封装轮为 `MODEL_NOT_VERIFIED`；**已由 2026-09-15 `--live` 门 `OPENCODE_PRODUCTION_CHAIN_PREPARED` 取代**）。
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
  Windows r4 exit 0 + 独立 `-PostCheck…CLEAN`（实例核对）；Python 全量【历史值】
  **820 passed/4 skipped**（现行 845/6）；Rust **27 passed**。Codex 门【历史快照：当时为
  未解决的红绿间歇（10 绿→5 红→最近 3 绿）；现行结论见顶部与 codex_decision_a_implemented】。
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
  credentialPathHits=0、state 78 文件。Python 计数【现行 2026-09-15 20:48，HEAD fdecb55：`tests` **577 passed/3 skipped/0 failed**，插件 artifacts 2 / git 4 / harnesses 127+3 skipped / runtime-local 6 / runtime-wsl 36 / sandbox-bwrap 112 / skills 8 / terminal-session 3 / web 14，另 web 的 2 个 Playwright 浏览器用例因本机缺 chromium headless shell 二进制而环境不可用；历史计数 820/833/838/840/843/845/849/852/854 均为更早 HEAD 且已被取代】；Rust 计数沿用 27 passed（本轮未改 Worker/Rust 源，`git diff -- workers/` 为空，故未重跑）；**现行（2026-09-15）：Codex 已按官方 feature flags 从源头修复；`shell_snapshot` 的因果已由逐变量差分证明。Harness 工件 = Codex 0.147.0（生产固定）；Reviewer CLI = codex-cli 0.154.0（两者不同层）。**：`features.plugins=false` 与 `features.shell_snapshot=false` 已入受审配置，无遮蔽对照轮实测 `.tmp/` 与 `shell_snapshots/` 目录均不存在、零凭据命中、门 exit 0（Python 全量 **843 passed/6 skipped/0 failed**）。**差分（同 0.147.0、同 HEAD、无 tmpfs 遮蔽）**：控制腿（去掉官方 `[features]`）第一轮即在 `native-state/shell_snapshots/*.sh` 命中注入假 token（门 exit 1），处理腿（部门原样配置）2 轮全绿零命中 → `CODEX_FEATURE_FLAG_DIFFERENTIAL_OK`；**逐变量差分**（`--strip shell_snapshot`：`plugins` 保持 false 不变，仅 `shell_snapshot` 回到官方默认开启）：控制腿 2 处凭据命中、处理腿零命中 → **`features.shell_snapshot` 单独即凭据写入原生 state 的成因**；`plugins` 的 `.tmp/plugins` 突发本轮控制腿未复现，**其因果本轮未被复现**（历史第一手观测与 tmpfs 纵深防御保留）。settled 判据现为**两阶段（turn 链 + reopen）合并**、Harness 退出后由独立扫描器同步完成。此前的“口径”说明如下（历史）：**Codex 门口径已按用户裁决 A 收口（判据=“全树走完且与上一轮字节身份完全一致”的稳定轮次至少被观测一次；活动写入竞态只入报告），真机 3 轮 2 绿 1 红，红的 1 轮是另一条既存间歇（capture 报 VIEW_INCOMPLETE，与凭据扫描无关，待定位）。原“当前红（口径待裁决）”说明如下（历史）：凭据观察器按 Reviewer 要求把“读取中变化的 state 文件”记为持久事实，而活动 Codex 的 `state_*.sqlite-wal` 运行期持续写入，故判 `CODEX_GATE_STATE_SCAN_INCOMPLETE`（files 83、cycles>200、零凭据命中、零 hit）；capture 期 sidecar 扫描仍是权威且 fail-closed；
  Worker 源未变（c8 摘要不变）；四门 + Windows r4/PostCheck 已在最终 HEAD 复跑全绿。
  **另在改动事件路径后的 HEAD（c81fdcd/3a33e68）重跑 Windows 门**：`accept-e.ps1 … -Port 18748 -Cleanup`
  exit 0 → `BACKEND_41_E_WINDOWS_WSL_WIRE_OK`（c8 `worker_digest=sha256:514f48a9…` 未重建、
  有状态 fixture `session/new→session/resume` 同 native id `stateful-13`、delta 10 < completed 12、
  `stop_mode=tree_terminate`、8s 静默 `elapsed_ms=8799`、7 项清理守卫全部按预期）+ 独立
  `-PostCheck -InstanceId <两实例>` exit 0 → `BACKEND_41_E_WINDOWS_POSTCHECK_CLEAN`。
- codex_decision_pending: **已由用户裁决 A（历史条目）**——
  Codex `.tmp/plugins` 突发（VIEW_FILE_LIMIT）与凭据瞬时入 state（SIDECAR_STATE_CONTAINS_SECRET）
  的处置方案 A（部署层 attempt-ephemeral 投影 `.tmp`，Reviewer 推荐）/B（官方配置关闭，未找到
  已验证开关）/C（Codex 暂 MODEL_NOT_VERIFIED）；**用户已裁决 A**，原挂起项关闭。ex 付费门与 preflight、
  `REVIEWER_AUTOMATION_READY` 登记、真实 locator 读取全部挂起；其他三家不受影响。
  Reviewer 第十轮结论：本阶段除该 P0 外无任何 FINDING/矛盾（REVIEWED_HEAD=47d6b64）。
  裁决 A 已实施并经多轮复审修复（壳快照泄漏路径已捕获并遮蔽）。**Pi 已取得真实模型门证据（2026-09-15）：`PI_PRODUCTION_CHAIN_GATE_OK`（mode=live）**——两轮真实 DeepSeek 答复、次轮带上下文、重开重放观测、未知模型发包前拒绝、凭据零泄漏、授权文件未被删；**Hermes 同轮通过：`HERMES_PRODUCTION_CHAIN_GATE_OK`（mode=live）**——两轮真实答复、同 native id 续接、凭据零泄漏、清理干净、授权文件未删；guard/假端点专有观测在 live 下显式记为未观测（不静默通过）。**OpenCode 同轮通过：`OPENCODE_PRODUCTION_CHAIN_PREPARED`（mode=live）**——两轮真实答复、checkpoint resumable、缺凭据派发前拒绝、凭据零泄漏、清理干净。**Codex 同轮接入 `--live` 并通过：`CODEX_PRODUCTION_CHAIN_GATE_OK`（mode=live）**——首轮 14 deltas、次轮 15 deltas 且回忆首轮 nonce、同 native id 续接、真实 `session/load` 重开（该相位 provider 流量标注为 loopback 机制审计）、真实流式答复中途取消 `202 → cancelled`（0.08 s）、未知模型派发前拒绝、`tokenIn*` 全 false、78 文件 state 零命中、`authorizedLocatorDeleted=false`、清理全 true；**四家真实模型门至此全部取得证据**，累计 <¥0.05。接入时修掉三个真实缺陷：live 下 4 处假端点专有断言、失败相位报告无法序列化（只剩 traceback）、凭据事实只记录不断言。
- stage_closure_dossier: **等待 closure 裁决的卷宗（2026-09-15）**——
  [stage-closure-dossier.md](../server-round1/fullstack/stage-closure-dossier.md)：同一份文件既是额度恢复后
  可直接投递的阶段包，也是用户裁决"以自审代替本轮 closure"的依据；含声称项与逐项命令/退出码/计数、
  本阶段自查发现并修复的 10 处缺陷（非橡皮图章证据）、明确未运行项与三个需前端裁决的合同项。
- ui_model_gate_blocker: **四家真实 UI 模型门本轮被产品面缺口阻断（非执行者放弃、非 Harness 问题）**——
  两端逐点核对：wire 28 方法**无凭据面**、Server 凭据记录靠带外写入（CLI / `CredentialRecords.register`）、
  REST 无凭据端点、**Desktop 的 Provider/Model 设置页恒发 `credentialId: null` 且无凭据控件**
  （`features/settings/agentbox-model-settings.tsx:126/285`）。因此从 UI 发不出需要凭据的真实模型轮。
  方案 A（Desktop 拥有凭据记录 + 一处只读列举面，推荐）/ B（wire 增 `credentials.*`，需重锁合同）/
  C（仅联调期绕过 UI，不得记作 UI 门）见
  [ui-model-gate-blocker.md](../server-round1/fullstack/ui-model-gate-blocker.md)。**待用户裁决**。
- ui_model_gates_2026-09-15: **逐家结果（真实 UI 模型门）**——驱动
  前端 `apps/desktop/e2e/p42-ui-model-gate.mjs`，证据 `apps/desktop/evidence/p42-ui-model-gate/`。
  **Pi 8/8、Hermes 8/8、Codex 8/8 全绿**（凭据均经界面自己的录入路径加入；两轮真实 DeepSeek 答复、
  首轮回忆 nonce、次轮带上下文）；**OpenCode 8/8（修复后通过）**：长答复诊断显示**流式 delta 与持久 final 丢失同一段尾部且逐字相同**（"数到 40"只到 31），而链路 completed、次轮语义正确 → 丢失在两者共同的上游，即 **OpenCode 读取路径**（中立 driver 接缝 / 托管 `opencode serve`），不是模型、不是 Server 投影、不是组装；截断点随答复长度变化且总在尾部，符合"回合结束事件与最后分片竞态"。**原表述为**（链路跑通但首轮助手文本是片段，未验证完整回忆
  **与 harness 自身 parts 比对已定因（同一回合原生状态）**：harness 存 87 字符（结尾 `…31\n32\n`）、我们的帧 83 字符（结尾 `…31`）——停在 32 而非 40 是部署输出上限 64 tokens（不是缺陷）；**我们少最后一片 `"32\n"` 是我们的缺陷**，位于 OpenCode 读取路径（`third_party/harness_remote/bridge/src/` 的 parts 累积/完成判定），回合结束时丢最后一批 part 更新，也解释了此前 nonce 案例总少最后一个字符。**已修（`5a8b6fc`）**：驱动此前只在"零增量"时才用权威 parts 兜底，现以 prompt 返回值为权威，只补流未送达的后缀（规则提取为 `tailSuffix`，驱动契约探针覆盖三种情形）；复跑 OpenCode UI 门 **8/8 PASS**。**四家 UI 真实模型门至此全部通过。**
  → **不记通过**）。**Hermes 的缺口已修并两端重锁**：`profiles.create` 增加可选 `credentialId`
  （缺省/null = 角色不携带凭据；给值校验存在性与 kind），工件新摘要 TS `7746404984…` /
  `14f7f736…`（取代 `11e3b3e7…`/`5d4fa3bf…`），后端对新工件 32 passed，Hermes UI 门复跑通过。
  过程中修掉两个真实缺陷（preload 把凭据 API 错嵌进 `wire`、导入请求缺 `Idempotency-Key`）。
  费用：本轮 ≈20 次真实请求、增量 **< ¥0.01**，四家累计 **< ¥0.08**（上限 ¥10）。
- integration_results_2026-09-15: **无模型全栈 22 步 + 四家真实 UI 模型门 + 重启门全部通过**——
  集成驱动 22 PASS/0 FAIL（§10 方法补齐：browse/archive、provider/role 维护、session 元数据与角色切换、
  `sendOutcome.query`、附件、审批往返、事件流 resync）；四家 UI 门各 8 PASS；Pi 带"两轮之间停并重启
  Server"9 PASS。**自审一轮见** [self-review-2026-09-15.md](../server-round1/fullstack/self-review-2026-09-15.md)
  （用户指示以自审替代 Reviewer 终审）。**最大未覆盖：真实 UI 控件路径**（发送走产品 renderer 传输，
  未驱动输入框/发送按钮/审批弹窗）。
- final_state: **FULLSTACK_CORE_PARTIAL**——双门成立、两边分别提交、无模型全栈联调在真实 Windows
  Electron 上 15/15 通过、后端四家真实模型门全绿、Windows r4/PostCheck 干净；**未完成**：四家真实
  UI 模型门（上条产品面缺口）、Windows 真实用户路径的模型段、以及固定 Reviewer 的最终只读审查
  （额度 2026-09-20 12:11 恢复后补）。不用核心 PARTIAL 冒充 GREEN，也不用后端门冒充 UI 门。
- fullstack_no_model_integration: **无模型全栈联调通过（2026-09-15，本执行者为 42 的
  `FULLSTACK_INTEGRATION_OWNER`）**——真实 Windows Electron（构建树，wire 摘要就地核对一致）经
  `workcore` slot 安装的 lifecycle connection（`{endpoint, sessionToken}` 由主进程从 Server 数据根的
  `secrets/http-token` 读入，未配置即"无服务"且给稳定原因）→ 本机 Server → `wsl.exe` c8 release
  Worker → bwrap → 显式 no-model ACP fixture：**15/15 PASS、exit 0**
  （`server.hello`、Workspace 开/列、Profile/Provider-Model 创建与版本、config describe/resolve、
  真实一轮且 delta 先于 completed、同 requestId 幂等回放只产生一个执行、排队项可见且可撤回、
  停止发布 `queued→running→stopping→stopped`、双游标域混用被拒、归档保留历史、干净关闭）。
  前端检查点 `ed1ccd85`（连接安装）+`b1136759`（驱动与证据）+`957211df`（status）；
  证据 `apps/desktop/evidence/p42-integration/integration-results.json`。
  **未读任何凭据、未调任何模型**；四家真实 UI 模型门仍待单独授权的凭据与预算（与后端侧四家门分账）。
- integration_coverage_map: **§10 联调覆盖对照（2026-09-15）**——
  [integration-coverage-map.md](../server-round1/fullstack/integration-coverage-map.md)：把 §10 每一项标注为
  **B**（后端侧已有可复跑证据）/ **U**（只能由真实 Electron 在环产生）/ **B+U**（两侧分别记账），
  并点明四项真正 UI-only 的项（生命周期连接、事件流在屏幕上的表现、正常退出、零 legacy REST 回落）。
- wire_frame_contract_check: **事件帧层跨仓合同门（2026-09-15）**——`tests/server/test_wire_v1.py`
  新增 `test_every_projected_frame_matches_the_strict_frontend_event_schema`：驱动真实生产者
  （排队发送、审批请求/决定、sidecar 桥写入、角色切换），把 `history.snapshot`（沿 `olderCursor`
  向旧翻页）与实时批量两条路径的每一帧交给前端 `EventFrame`（`additionalProperties:false`、闭枚举）
  校验；**带工件与不带工件两种跑法各 30 passed**，且帧键集与 kind 为不带工件时的常驻断言。
  同轮机械核对：错误码 12 家族集合与后端 `FAMILIES` **逐项相等**。
  同轮按合同**语义**（不止形状）核对，另修一处：停止相位——`record_cancel_request` 的事件 `state`
  是请求到达时的原状态，投影照搬，于是取消 running 执行时客户端收到 `running`，而前端 stop phase
  正由 `stopping` 帧驱动；现在投影对 `cancel_requested` 发 `stopping`（终态 `stopped` 仍是唯一确认）。
  由此发现两处「合同已声明、后端无生产者」，已按权威层处理并登记到
  [wire 反馈](../server-round1/wire-review.md)：`config.changed` **已补生产者**（`sessions.switchProfile`
  确认后同事务发 `next_send`，重放在写前返回不重发；`profiles.updateConfig` 路径仍未发、已登记待前端反馈）；
  `workspace.connection` **仍无生产者**——后端无异步准备阶段，且事件帧按构造必属某个 Session
  （`server_session_events.session_id NOT NULL` + `EventFrame.sessionId` 必填），浏览阶段没有 Session
  也就没有可承载该帧的流，需前端在合同层裁决（同步结果 or 第二条会话无关通道），后端不猜语义。
  另有一项**待集成阶段判定**：`tool.update` 目前只有 harness 失败时的一条 `state="failed"`，端口事件
  词汇里没有工具进度映射，而既有门内审计只记录 client→agent 方向，无法判定四家是否真的播发工具
  调用；需一次强制工具调用的提示再定论（不臆断）。
- self_review_round: **执行者自审（2026-09-15，Codex 额度用尽后按用户指示）**——自审第一遍
  发现并修复真实缺陷：`turn_chain_phase()` 二次归一化会丢弃链路阶段的 settled 凭据命中
  （已改幂等归一化 + 附加 capture，加两条端到端回归）；其余对照项（capture 命中按码升格、
  两阶段失败有序保留、进程树归属、ledger 唯一）均已在第 23 轮完成。自审结论：Codex 门的
  凭据证据链自洽且 fail-closed；`REVIEWER_AUTOMATION_READY` 待固定 Reviewer 额度恢复后补审登记。
- reviewer_automation: §4.1 通道门**已通过**（2026-09-15）：固定 session 机械比对一致、真实
  `codex exec resume`（read-only sandbox、flock、无 bypass）exit 0、verdict `VERDICT: ACCEPT`
  含 `REVIEWER_CHANNEL_OK`、`REVIEWED_HEAD` 与调用前 HEAD 一致、调用前后 `git status --porcelain`
  零变化。**§4.2 阶段闭环当前被固定 Reviewer 的额度阻断（2026-09-15 18:2x）**：提交
  `a7b8917..2c0ee16` 的阶段包投递成功、审阅进行中，但 session 返回
  `ERROR: You've hit your usage limit. ... try again at Sep 20th, 2026 12:11 PM.`（退出码 1），
  故**未取得本阶段 ACCEPT**。按用户指示（额度用尽时自审）执行**自审轮 2**：
  修掉 Pi 报告的 `refusedBeforeProviderRequest` 反向取值、Pi live 未知模型相位无正向断言、
  四家 gate 丢失 `turn.capture` 内层 `error_code`；`pi-live5` 的 capture 间歇按未解决记录
  （其后 3 次 Pi live 全绿）。**`REVIEWER_AUTOMATION_READY` 与 `BACKEND_IMPLEMENTATION_READY`
  均未登记**，双门未判定。
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


---

## 会话总结（2026-09-17/18，env-provider 工作树多轮执行）

### 已完成的工单

| 单 | 结论 | 关键提交 |
| --- | --- | --- |
| 44 | ENV_PROVIDERS_DONE | 前期 |
| 46 | DONE | 前期 |
| 47 | SANDBOX_PLAN_SEAM_DONE（A–D） | 8c494a2 |
| 48 | WINDOWS_PLACEMENT_DONE_IN_D5_DEGRADED_SHAPE | 前期 + spike 0340f61 |
| 49 | EVIDENCE_HYGIENE_DONE | 3302fb2 |
| 50 | CAPABILITY_LAYER_ABSORBED | 642b1af |
| 55 | USAGE_PROBES_DONE（G1+G2–G4） | 642b1af + a83df9d |
| 57 | SANDBOX_PLAN_SEAM_DONE（A–D） | 8c494a2 + 92e51a8 |
| 67 | PER_SESSION_ADMISSION_DONE（45-G3 转 pass） | 59fe1bb |

### 完成中的工单

| 单 | 已落地 | 剩余 |
| --- | --- | --- |
| 51 | USAGE_FACT_DONE：pi/codex/hermes/claude 门级观测轮全部产出事实（hermes (11,7)/(22,14)、claude (11,7)，source=声明格式）；WAL 侧车根因修复；六家解析器就绪 | kilo/opencode/dsh/qwen 模板未声明 usageProbe（解析器已备，未启用；kilo/opencode 启用时读共享库，走 66 只读规则） |
| 52 | B/D+E 完成：三新 wire kind + 四类映射入账本 + 夹具端到端 | 真 harness 观测轮已跑（pi+假端点一圈**零过程事实**，否定结果记账）；需能发四类负载的真流 |
| 65 | SUBAGENT_DELEGATION_DONE（086 收口）：A/B＋C（授权边、两工具契约、委派服务、`parent_turn_id`、有界摘要、用量同源、续接/环/扇出、取消传播、桥入 bundle、loopback 端点按次令牌、有授权才渲染、父 deny 继承、审批镜像、授权 CRUD wire、**真桥端到端（真进程→真通道子执行→摘要）**、并发扇出）＋ **真 harness 父侧自发起 tools/call 一圈**（claude-code 真 CLI/真 `.claude.json`/真桥进程，`SUBAGENT_HARNESS_ROUND_DONE`）＋ **两条死规则接上真链路**（血统由账本 `parent_turn_id` 走出、调用方不可自报；取消级联接 REST `turns.cancel` 与 wire `runs_stop` 两入口）；**深度上限与"子轮默认不带 run 工具"按 R-0016 撤销**；12 条 + 086 的 18 条测试 | 只剩 P17/P20 前端（后端无剩余；授权层的**任意环**拒绝缺口另计，见 086 未做项） | 75253fa + 701ae20 + 6854e4c + 3d19218 + 本轮 |
| 64 | EXECUTION_INVENTORY_DONE（账本同源、pid 本机可报/远端 null+reason、上限 200 类型化、零宿主路径；4 条测试） | WSL pid（需 Worker 单）；P20 同步与重锁 | 本轮 |
| 63 | PROFILE_MEMORY_READ_DONE（本机侧完整；注册表 memory_paths、只读+有界+扫描、profiles.memory wire；4 条测试） | WSL 侧读；P17 同步与重锁 | 本轮 |
| 62 | WORKSPACE_GIT_STATUS_DONE（本机侧完整 + WSL 接线；6 条测试含只读性证明） | WSL 真机轮；P20 同步与重锁 | 本轮 |
| 61 | PACTHOLD_REBRAND_DONE（基础设施侧）：A 审计/映射/保留清单、B README×2+品牌说明+banner/favicon、C 六条 CLI（新名+旧别名同源）、D wheel 元数据 `Name: pacthold`、E 服务发现未坏（新名起 Server+hello/readiness 冒烟）、合同零变化 | 插件分发名改名为后续单；发布/远端改名/数据迁移不做；P18 一致性归桌面工作树 | 本轮 |
| 60 | PROFILE_SETTINGS_PARTIAL：A/B/C/D/E/F＋资产重绑＋setPermissions wire＋**姿态逐家翻译**（claude/codex，只收紧或拒绝；2 条测试） | 翻译产物写入配置文档~~待逐家钉死设置键~~ ⇒ **已由 085 落地**（claude/codex 按一手钉死的键写入 + 真实工件快照；其余六家类型化拒绝），剩余三条见本文件 60 主行；ask↔审批端到端；P17 同步与重锁 | f8ed9d2…本轮 + 085 |
| 59 | HOOK_MODELS_PARTIAL：A 观测、逐家 schema、账本、物化 G3、触发账本 G5、hooks.* wire（+6）、**代码资产 publishPlugin（+1，逐字存储+有界预览）**；10 条测试 | 触发事实生产端未接、P16 同步与重锁、G4 端到端、OpenCode 插件物化槽位（未钉死）、Windows 差异 | 0babb42 + 5801556 + 3179535 + 本轮 |
| 58 | ASSET_HUBS_PARTIAL：A 槽位观测、skill/MCP 存储、逐家渲染、目录+绑定（schema 13）、物化进执行、**G7 目录式来源**（快照/安装/失败不落地）、**G6 MCP 有界探测**、assets.* wire（+10 方法）；15 条测试 | 凭据注入逐家钉死、P15 前端同步与重锁、commands/hooks 声明 | bddbba5…本轮 |
| 56 | SUBSCRIPTION_CREDENTIALS_PARTIAL：资产存储+锁+乐观摘要、物化/回收本机端到端、schema 12、accounts.* wire 面（+4 方法）、codex 声明、45 补节；8 条测试 | **前端 P12 同步与两仓重锁**、Worker 侧物化（home.put）、其余家登录文件路径（需真机登录轮）、G2/G4 真机登录轮 | 1299275 + 本轮 |
| 66 | SHARED_SESSION_STORE_PARTIAL：A/B/C 落地、G1–G5（G5 夹具级）、43 代门 marker 债解除 | dc65731 + e394f09 |
| 53 | USAGE_AGGREGATION_DONE：聚合模块 + usage.aggregate/export wire 方法 + 未知即未知反例 | hermes/claude 观测轮（opencode/kilo 解析器已落地，聚合面可直接消费其 fact） |
| 54 | USAGE_FACT_PARTIAL：本机+WSL 通道变更集落地、c11 五家四绿（kilo marker 维护债）、schema 9 change_set 列 | WSL 端到端观测轮（c11 已绿 pi 门）；kilo marker 维护债 |
| 55 | USAGE_PROBES_DONE（G1+G2–G4）；本机通道 usage_probe 断口已修复（67, 59fe1bb） | 真端点观测轮待做（无可用凭据端点时受限观测） |

### 未开始的工单（依赖链排后）

56（←45 PARTIAL+50）、58/59（←45 PARTIAL+50）、60（←55+58）、61（←60）、62（←?）、
63（←?）、64（←?）、65（←?）。45 G3 解除后 56/58/59 可开工；55 G2 解除后 60 可开工。

### 已解除的历史阻塞

45-G3（同 profile 两会话并行）由工单 67 解除：native-home-gate 全绿（G3=pass）。

### 全局维护债

1. ~~43 代门（dsh/kilo/qwen/claude）的 HOME_MARKER_CONFLICT~~ **已解除（2026-09-18，
   见 66 报告 §14）**：根因=locator 按名字派生而 marker 身份是 profile ID（同名 profile
   跨运行碰撞于持久 home root）+ 四家门的 scan_state 停留在 45 前模型。两处修复后
   **四家生产链门全 exit 0**。
2. 48 AppContainer 恢复 spike 需管理员权限（Windows 11 限制 IL 标签写入）。
3. terminal 短名能力词汇未版本化（slots.py 已记录，收敛待后续）。

---

## 068 账务补齐自查（2026-09-19，执行者）

**范围**：本树 `status.md` —— 主表补 60–65 六行（提交 22dc823）、刷新 52/54/55 三行（cfa9eba）；另有 1 条偏离与 2 处 G3 下调（见下）。

**G1 行数**：`grep -c '^| \[6[0-5]\]' docs/implementation/status.md` → **6** ✓
反例演练：在副本上删掉一行 60 → 同命令得 **5**（缺行即失败，守卫非零命中）✓

**G2 可追溯**：六行引用的 14 个提交（f8ed9d2 / 03c210d / 8b73c7d / 27dfa26 / e39959f / ff0c578 / 30adedf / 76e7c35 / 4d7b0e0 / faaeedf / 75253fa / 701ae20 / 6854e4c / 07b43fa）逐个 `git cat-file -e` **全部 OK**。
反例演练：对不存在的 `deadbeefcafe` 跑同一检查 → **`MISSING deadbeefcafe`**（守卫能抓到正例）✓
说明：工单 Validation 那条通用 hex 循环会把**非提交型 hex**（工件/合同摘要，如 182e7adb、08e4e057、0cdc459c 等）一并抓出报 MISSING——G2 的实质断言是"六行引用的提交"，已全过；摘要型 hex 在各行已标明其性质（TS/工件/前端提交），不是本树提交。

**G3 不冒充**：逐单按 DoD/门对照证据，**下调两行**（报告自述词与自身 DoD 不符，按证据口径记，行内已注明）：
- **62**：`WORKSPACE_GIT_STATUS_DONE`（报告自述）→ **PARTIAL**：62 §3 DoD 明示"真机证据（至少 WSL 与本机各一次）"，WSL 真机轮未跑（报告 §5 自记"本机无该侧"）。
- **64**：`EXECUTION_INVENTORY_DONE`（报告自述）→ **PARTIAL**：64 §3 DoD 明示"本机与 WSL 各一次，含 pid 有/无两种"，WSL 真机轮未跑（报告只给"协议不传"的结论）。
- 61/63 维持 DONE（各自 DoD 全项有证据；未做项是工单明示范围外/远端受限，行内已标）；60/65 维持 PARTIAL（各自剩余项来自其报告）。
反例演练：对"DONE 行 + 证据文件缺失"的合成副本跑链接核查 → 报 `MISSING EVIDENCE`（假 DONE 会被抓住）✓

**发现的既有缺陷（超出 068 九个行的范围，如实记录、未擅自修）**：主表 48 行的两个证据链接（`sandbox-conformance-windows.json` 与其反例）**在本树分支不存在**——文件实际提交在主树分支（主树 `c1b32fb`，路径 `docs/server-round1/fullstack/`）。全表链接核查：28 行中仅此 2 处断链。处理建议：由调度者决定（把文件带进本树，或把该行指向主树）。

**偏离说明（1 条，理由）**：068 scope 表写"补 6 行 + 刷新 3 行"，实际另刷新了"计数口径"节——不刷新则新行的套件数字会被该节宣布为"历史/已被取代"，账不自洽；改动只把"现行计数"改为"最近一次有记录的全量计数"并标明来源提交（e39959f），未新增未验证数字。

**投递回执**：已纳入 work order 070 投递 @111bf4d（批内排 067 之后、069 之前；章程 §3 顺序已更新）——按新队列继续，不为检查点停下。

**Validation**：`git diff --check` 干净；阶段提交后 `git status --short` 无输出。

---

## CHECKPOINT b1（2026-09-19）

**CHECKPOINT b1 [PARTIAL]**（唯一未收口的是 066 的 G5 首发锁——方案已交付、**未实施**；其余单 DONE，62/64 为 068 按证据下调的 PARTIAL）

**1 现在能试什么**（入口/命令 + 期望）

- 批次结构门：`python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders/ --batch b1 --strict` → 4 个 b1 单全 **OK、exit 0**（阶段全勾、门三列齐、场景齐）。
- 回归：`PYTHONPATH=src:plugins/... pytest tests/ -q` → **882 passed / 0 failed**（258 s，本批末实测；批内基线 879，+本批新增 3 测试）。
- 66 并发门（**红=缺陷仍在**，预期）：`python3 scripts/server-round1/shared-store-concurrency-gate.py --attempts 3` → 冷启动 6/7 失败（5×`database is locked`、1×外键竞态）、初始化后 3/3 双绿；证据 [JSON](../server-round1/fullstack/shared-session-store-66-concurrency.json)。
- 67 门（绿；注意 G8 有 1/2 间歇）：`AGENT_BOX_SANDBOX_MODULE=agent_box_sandbox_bwrap PYTHONPATH=… python3 scripts/server-round1/native-home-gate.py` → `NATIVE_HOME_GATE_OK`（G3 = 45-G3 复现：两轮都 completed、`nativeIdsDiffer`、同会话入队、运行中切换 rejected）；复现报告 [JSON](../server-round1/fullstack/per-session-admission-67-native-home-gate.json)。
- 070 探测面（绿）：经 wire 调 `providerModels.probeModels` / `probeConnection`（真实端点一轮 2×GET、0 token）；证据 [JSON](../server-round1/fullstack/provider-model-55-real-probe.json) + [报告](../server-round1/fullstack/provider-model-55.md)。
- 069 观测（否定 + 根因）：[报告](../server-round1/fullstack/wsl-change-set-observation-069.md)（WSL 变更集全 NULL ⇒ `sidecar.py:631-632` 空快照折叠）。
- 072 结案：[48 报告 §七/§八](../server-round1/fullstack/windows-placement-48.md)（两轮退出码 `0xC0000142`、H1 排除、声明仍 false、低于 Linux 侧）。

**2 要你拍的**：见本节末 **「阻塞（待人拍）」** 四条——066 首发锁实施、`providerModels.update` 省略语义、54 的一行修并入 b2、两仓重锁节奏。

**3 花了什么**

- 真实模型调用：**2 次**（070：`GET https://api.deepseek.com/models` ×2；**0 token、¥0**，R-0011 不设上限口径）；其余全部 loopback 假端点/本机，零外网。
- 门与批：全量套件 3 次（879 / 879 / 882）、native-home 2 次、pi 门（c11）3 次、共享库并发门 3 批、五类反例演练 1 批、wire/探针定向多批。
- 清理：本会话临时根已删；**保留 1 个**（069 证据引用的 kept 根 `/tmp/agentbox-pi-gate-mkb9aso9`，110 MB）；更早会话遗留的 pi-gate 根未动（非本会话产物）。

**4 恢复点**

- 下一批 **b2**（章程 §「下一批 b2」9 项：066-G5 首发锁 → 两仓重锁收口 → 45 收口 → 62/64 的 WSL 真腿 → 53 解析器 → 60 配置写入 → 65 最后一圈 → G8 间歇 → 四家真实 UI 模型门）；契约由调度者逐单投递。
- baseline = `checkpoint/b1` 指向的 commit；工作树在检查点提交后 clean。

**5 不含糊**

- **066 = SHARED_SESSION_STORE_PARTIAL**：G5 真并发腿出**确定性缺陷**（6/7 失败），首发锁方案已交付、**未实施**——不得写成 DONE。
- **62/64 = PARTIAL**：DoD 明示的 WSL 真机腿未跑（068 按证据口径下调，行内注明）。
- **67 的 G8**（取消/召回）有 1/2 间歇（复跑 1 败 1 过；失败形态=召回轮 completed 但流为空），已记入 67 报告 §9，**不是** 67 的门。
- **069 是观测轮**：WSL 变更集**否定结果**（全 NULL）+ 根因（空快照折叠），修法与测试已交回，**未实施**。
- **070 交回两项**合同不齐（`providerModels.update`、`providerArtifacts.install`）与"窗口/能力无记录面"。
- **072 自查发现**：48 行此前写"报告显式写低于 Linux 侧"而文档实际缺失——已由 §七 补齐并在行内如实记录。
- 阶段勾选：13 个复选框已勾（仅 `- [ ]`→`- [x]`，契约文本未动；068 的 `forbidden` 按"禁改契约实质"理解，如与调度者口径不符请按差量回退）。

## 阻塞（待人拍，2026-09-19）

| # | 阻塞 | 证据（指针） | 建议 | 不拍的后果 |
| --- | --- | --- | --- | --- |
| ~~B1~~ | ~~066-G5 首发锁实施~~ **已由 080 关闭**（`FIRST_RUN_LOCK_DONE`；真 harness 7/7 有锁绿 / 2/3 无锁败） | [080 报告](../server-round1/fullstack/first-run-lock-80.md) | — | — |
| B2 | `providerModels.update` 合同/实现不齐（合同 `displayName`/`credentialId` 可选；实现必填且 `params[...]` 直接取值） | [070 报告 §6.1](../server-round1/fullstack/provider-model-55.md)；`handlers._provider_model_body` | 定语义：**省略即保留原值**（改实现 + 测试）或收紧合同（改工件 + 重锁） | 合法请求被 400；若只放开校验则变 500 |
| B3 | 54 的 `sidecar.py:631-632` 一行修（空快照折叠） | [069 报告 §3-4](../server-round1/fullstack/wsl-change-set-observation-069.md)（插桩 + 三态探针） | 并入 b2 的 066-G5 收尾单（同文件族）一起改 + 空快照测试 + 复跑观测轮 | WSL 通道变更集**恒 unknown**（首轮必现，且"正例只需审计文件"） |
| B4 | **两仓仍未锁定**（081 已登记差异）：前端交回阶段 2 对 `6e8ae84a`/`f5d27269`（59 方法）≠ 后端登记 `64dc9961`/`42a164a4` ≠ 本树副本 `a1bd52a4`（33 方法）；摘要在两工具链间不可复现 ⇒ 需**换工件本体** | [wire-review Order 81 节](../server-round1/wire-review.md) | 拍四件：①后端发布 64 方法工件（或前端补 5 个后重生成）并**交换本体**；②替换本树旧副本（strict 5 项失败之因）；③定生成/比较口径；④补 Order 57/58/59/65 的 wire-review 小节（当前 0 命中） | 摘要永远对不上；前端按 59 方法实现、后端跑 64 方法，落后 5 个面的差异继续分叉 |
| B5 | **同一个 `ask` 在两处翻译方向相反**（085 阶段 1 一手登记）：60 的 `posture_translation.py::translate_claude()` 把 `ask` 译进 **`allowedTools`**，而 CLI flag 语义与 settings 层 `permissions.allow` 同义 = **预先批准、免提示**；085 的写入器把 `ask` 落进 **`permissions.ask`** = 真的弹提示。前者相对中立姿态是**放宽**，与 60 自己的"只收紧"规则和 085 G2 相冲 | [085 证据 §4](../server-round1/fullstack/posture-config-keys-085.md)（钉死的落点表）+ §7.4 | 二选一：**改 60 的 claude 表**为 `ask→permissions.ask`（一处映射修正，不扩协议，但要重跑 60 的翻译测试），或**另开一单**收口（093 的写入器上线前必须有个答案）。085 不代改别人的契约，故只登记 | 一旦 093 把冻结配置落盘，同一份姿态会同时经两条路径翻译 ⇒ 60 那条把 ask 写成"免提示"，**用户看到的 ask 与实际生效的 ask 不一致**（放宽且不可见） |
| B6 | **086 的 G2 字面与 65 的实现口径相反**（086 阶段 3 一手登记）：工单写"子轮用量**记在父轮**"，实现与 65 的 docstring 是"子轮用量**留在子轮行**、`parent_turn_id` 为链路、用量以事实形态回进父轮的工具结果"。两种都能满足"归属可追溯"，但账上只能有一种写法 | [086 证据 §9/§11](../server-round1/fullstack/subagent-harness-round-086.md) | 拍一句口径：**保持实现口径**⇒ 把 G2 改成"子轮用量归属可经 `parent_turn_id` 追溯、并在父轮工具结果内可见"；或**要"抄到父轮"**⇒ 那是一条汇总行为的新需求（要新单，且要先定"父轮重算/重复计数"怎么办） | 086 已按实现口径出具反例并登记差异；不改字面则下一张读 G2 的单会去实现"抄到父轮"，与 65 的行语义直接冲突并双计用量 |

## 待开单（本树执行者登记，2026-09-19；编号由调度者从 100 起给）

> 纪律：执行者不自行起草工单。以下是**本树跑出来的、超出当前单 `write_paths`/范围**的事实缺口，逐条给"证据已在手"的位置。

| 候选 | 一手事实 | 为什么不并入现有单 | 证据 |
| --- | --- | --- | --- |
| 授权层拒**任意环**（不只一条反向边） | `profiles/repository.py:140`（自授）与 `:157`（直接反向边）之外，A→B、B→C、C→A **三条边全建得出来**；运行期靠 `check_cycle` 拦第 3 跳，但授权表里的图**不是 DAG** | 属 65 的 C 段（授权 CRUD），而 086 的 `write_paths` 不含该面的语义扩展；R-0016 也只允许"接已有规则"，不允许本单顺手加限制 | [086 证据 §10](../server-round1/fullstack/subagent-harness-round-086.md)、用例 `tests/server/test_subagent_rule_liveness_086.py::test_a_three_edge_ring_closes_on_its_third_hop_and_is_refused` |
| Worker 侧 `session/request_permission` **无应答路径** | `grep -rn request_permission workers/agent-box-worker/src/` 只命中 `fs::set_permissions` 两处无关项；`src/agent_box` 亦无 ⇒ ACP 适配器把工具权限交给 `canUseTool` 后无处可答，真父轮只能靠 SDK 侧预批准 | `workers/**` 不在 086/085 的 `write_paths`（099 只被授权修 `home.put` 的分发臂） | [086 证据 §7](../server-round1/fullstack/subagent-harness-round-086.md) |
| 探针把连接**钉到已校验的地址**（闭掉 DNS 重绑定窗口） | 104 修好了"完全不看解析结果"，没修"看了之后不再变"：校验解析一次、`http.client` 再解析一次，TTL=0 的名字可先答公网过关再答 `169.254.169.254`。要做对得自己管 `server_hostname`/SNI 与证书校验，而**本树没有 TLS 桩**（环回例外只放 `http`）⇒ 没有反例的门不算门 | 是新的语义与新的测试面，不在 104 的射程（104 §Scope 只列"不跟随／复检／尽量钉"，且明确"做不到就写清残余风险"） | [104 证据 §10 残余风险](../server-round1/fullstack/probe-ssrf-hardening-104.md) |
| **CGNAT `100.64.0.0/10` 是否进拒绝集**（语义裁决） | 实测本机 `ipaddress`（Python 3.12）对 `100.64.0.1` 的 `is_private/is_reserved/is_multicast/is_link_local` **四个旗标全 False** ⇒ 104 的复检放过它；而 WSL2／Tailscale／VPN 的内部面常落在这段（IMDS 形状的服务常挂在那儿） | 104 §Scope 写的是"私网/保留/多播"三类，自扩拒绝集＝改变可探范围（可能拒掉用户真想探的内部网关），需要裁决而不是顺手做 | [104 证据 §8.1](../server-round1/fullstack/probe-ssrf-hardening-104.md) |
| 080 的反例门**在负载下假红**（与 087 同族，但是另一条门） | 同一份源码：`tests/server` 整腿 **687 passed** ⇒ 紧接着 `tests/` 整腿里 `test_first_run_lock.py::test_without_the_gate_the_same_first_runs_overlap` **1 failed / 986 passed**；单跑该文件 **3 次全 5 passed**、加 `tests/integration` 一起 **74 passed**。该断言是"没有锁则两次冷跑的时间窗必相交"——**相交与否取决于线程时序**；那一轮 `tests/` 用时 489.39s，同机此前两轮是 358.34s / 374.66s（慢约 30%，与 R-0023 点名的 11 GB 瓶颈一致） | 属 080 的门，而 080 已收口；本树不得为让门绿而改断言（章程 §8），且 104 没碰 `execution/**` | 本轮终态行与 [104 证据 §11](../server-round1/fullstack/probe-ssrf-hardening-104.md) |
| **086 的真实轮门也在负载下假红**（同族第三条，写法要一起治） | 113 收口那一轮 `tests/server -q`：**1 failed / 765 passed in 445.20s**（红的是 `test_subagent_harness_real_round_086.py::test_a_real_claude_parent_round_calls_run_subagent_itself`）；**同一树状态单跑该条 ⇒ `1 passed in 30.33s`**（真 claude 二进制 ＋ bwrap ＋ **环回假上游** ⇒ 真实模型仍 0 次）。该用例自己就写明"父轮必须塞进 sidecar 的 120 s 进程上限"，而整树并发时那一轮的墙钟被拉长（与 080 那条同一成因）；本轮之前一轮的同一腿 **750 passed** 里这条是绿的，而它不读 113 改过的任何一个文件（脚本/文档/新门）。**但要说清证据的档次**："因＝负载"是**推断**，支持它的是三点（同一树状态单跑绿、上一轮全量绿、红的那条与本批改动无读取关系）；该轮的**断言正文没留下来**（后台作业只截了 summary 三行），所以"端口与另一棵树相撞"这条备选原因没有被排除 | 属 086 的门，086 已收口；本树不为让门绿改断言（章程 §8）。三条同族（080 的时间窗相交、087 的取消/召回间歇、本条的 120 s 轮次）需要的是**同一个修法**：把"依赖墙钟/线程时序"的断言换成结构判据，并让失败自带可留档的正文（长门不要用 `tail -3` 收口） | 本轮终态行 ＋ [086 证据 §2](../server-round1/fullstack/subagent-harness-round-086.md)（120 s 上限那一段就写在它的门 docstring 里） |
| ~~`validate_order.py --strict` 的新并行度规则还没有落地面（61 个契约文件 ⇒ 61 FAIL）~~ **已由调度者落地**（公告 82 轮，本单登记后数分钟）：`--legacy-ok` 下本树 **51 份契约、FAIL 0**；37 张历史单与 099 都补了 `parallelism: none` ＋ 理由，`089` 补 `parallel_units: ["pi","codex"]`，A 树还在带的 10 张 runtime 线单（088/090–096/100/102）已删（权威副本移入 runtime 树）。本行留作轨迹，不再是要办的事 | 校验器 `~/.agents/skills/incremental-work-order/scripts/validate_order.py` mtime **2026-09-19 12:40**（在 097/098/104 三次记账之后被改）新增一条：必须**显式声明并行度**——非空 `parallel_units`，或 `parallelism: "none"` ＋ `parallelism_reason`。此前 31 FAIL（37…67 的 v1 历史单），现在 **61 FAIL**：多出的 30 条正是 068–105 里所有写 `parallel_units: []` 的 v2 单（含已收口的 097/098/104/105 与在做的 101/103） | 填"哪一单能并行、并行几路"是**调度裁决**（公告 63 轮已给 runtime 的 090/091/092/094/095/107/108 与 A 线 103=4，其余留 `[]`），执行者自己补那行＝替调度者裁决；且这是**契约元数据**，章程 §5 规定由调度者改并投递新版本 | [101 证据 §13](../server-round1/fullstack/wire-error-family-500-fix-101.md) |
| **`providerModels.update` 在合同上无法表达"部分更新"**（要放宽必填集 ⇒ 改合同＋重锁） | 112 一手：`_PARAM_SHAPES["providerModels.update"]` 的必填集含 `displayName/credentialId/configuration/models`，实测省略任一条 ⇒ 类型化 `INVALID_REQUEST: params shape is invalid: missing <字段>`。工单 §Requirements 那条"只给 displayName 不给 models"的场景因此**在线上发不出来**；112 把"省略即保留"落在两个可达层面（服务层 body 省略键、线面 provenance 的四列），并把这条事实钉成门而不是悄悄放宽形状 | 放宽必填集＝改 wire 形状＋重锁对，属合同面（桌面 settings 线写权、且要过 `--compare`）；112 自己的 G4 明写"wire 形状零改动" | [112 证据 §2](../server-round1/fullstack/provider-update-keeps-omitted-112.md)、门 `tests/server/test_provider_update_keeps_omitted_112.py::test_omitting_a_required_field_is_still_a_typed_shape_refusal` |
| **两处 Server 接受而合同未声明的 `provenance`**（`providerModels.update` / `probeModels`）——现在有了可复跑的探测器 | 113 的 `wire_artifact.py --compare` 实测输出：`optionalNotInContract` 恰这 2 条，`requiredSetDrift`/方法集两轴为空。修法在**合同侧**（把 `provenance` 编进那两份 `#params`）；补好后 `--compare` 退出码自己变干净，不需要有人记得改散文 | 改对方树的合同不在本树写权（113 §Scope 明写）；账上 098 §9.2 早已写"交 102 重锁"，而 102 现在属 runtime 线 ⇒ 需要调度者把它挂回**能改合同的那条线** | [113 证据 §4](../server-round1/fullstack/wire-artifact-published-113.md)、`docs/server-round1/wire-review.md` 的"工件口径（Order 113）"§4 |
| **后端清单不含 result 形状**（要后端也出可机读的 result 合同，需要一个新的形状来源） | 113 的工件每行 `result = {"declared": false, "authority": "contract"}` 是**如实**而非偷懒：后端 handler 返回的是临时构造的 dict，没有可机读声明；本单宁可显式写"我不知道"，也不让"清单里没写"被读成"两边一致" | 从 handler 生成 result schema 是新工具面（要么加返回类型注解、要么从门里采样），不是 113 的四件事之一 | [113 证据 §2/§6](../server-round1/fullstack/wire-artifact-published-113.md) |
| **两个探测方法对 `provenance` 不对称** ⇒ `probeConnection` 里那句 `_provenance(params)` 可证是死代码 | 112 顺带第一手量到：`probeModels` 接受并校验 `provenance`（全 null/混合 null 都通过，未知键类型化拒绝），而 `probeConnection` 对**任何**形态的 `provenance` 都回 `INVALID_REQUEST: params shape is invalid: unexpected provenance` ⇒ 形状门在 handler 之前就拒了，`handlers.py:1323` 那行永远看到 `None`。这把 098 终态行未做项 ③ 从"看起来是死的"变成"可复跑地是死的" | 删它＝改语义（要么让 `probeConnection` 接受 provenance，要么明确它不接受并写下理由），两个方向都是裁决而不是清理；且它牵动合同面（`probeConnection#params` 该不该有这一键） | [112 证据 §6](../server-round1/fullstack/provider-update-keeps-omitted-112.md) |


> 编号说明：上一节 `## CHECKPOINT b2`（080/081 那次）的 §2 写了"新增 B5"，但当时表里没落 B5
> （其内容并入了 B4 的四项交回）。本表 **B5 由 085 新增**，是该编号的实际持有者；批末重写那节时一并更正引用。


---

## CHECKPOINT b2（2026-09-19）

**QUEUE_EMPTY_AT 2026-09-19**（章程"队列不空规则"）：080 与 081 均已收口，`work-orders/` 里
**没有属于 b2 的下一张**（b2 计划其余 7 项：45 收口、62/64 的 WSL 真腿、53 解析器、60 配置写入、
65 最后一圈、G8 间歇、四家真实 UI 模型门——契约待调度者逐单投递）。合法停止，如实报出。

**CHECKPOINT b2 [PARTIAL]**（080 DONE；081 为"差异已登记、两端仍未锁定"的 PARTIAL——见 §5）

**1 现在能试什么**（入口/命令 + 期望）

- 批次结构门：`python3 …/validate_order.py docs/implementation/work-orders/ --batch b2 --strict` → 080/081 **OK、exit 0**。
- 回归：`PYTHONPATH=src:plugins/... pytest tests/ -q` → **887 passed / 0 failed**（233 s，本批末实测；b1 基线 882 + 080 新增 5）。
- 首跑锁（080）：`pytest tests/server/test_first_run_lock.py -q` →
  门语义（独占/有界/类型化超时）+ 接线（两首跑窗口不相交）+ 反例（去门即相交）+ **真 opencode 7 轮冷库双首跑 7/7**；
  无锁反例常备：`python3 scripts/server-round1/shared-store-concurrency-gate.py --attempts 3`（**设计上无锁**，仍会失败——这就是反例）。
- 两仓重锁登记（081）：[wire-review Order 81 节](../server-round1/wire-review.md)（三个摘要、方法集差、四项交回）。
- 66 行已由 080 翻绿：`SHARED_SESSION_STORE_DONE`（G5 补齐）。

**2 要你拍的**（见本节末「阻塞（待人拍）」更新表：B1 已由 080 关闭；B2/B3 仍开；新增 B5）

**3 花了什么**

- 真实模型调用：**0 次**（080 用本地 opencode 1.18.21 + loopback 假端点；081 只读两仓文件）。
- 批：全量套件 1 次（887）、首跑锁测试多批、无锁反例演练 1 批（2/3 失败）、真 harness 7 轮（36 s）。
- 清理：测试用 tmp_path 自清；临时根无新增残留（b1 保留的 069 证据根仍在）。

**4 恢复点**

- 下一批：**b2 剩余 7 项待投递**（契约到即按序执行）；baseline = `checkpoint/b2` 指向的 commit；工作树提交后 clean。

**5 不含糊**

- **081 = RELOCK_REGISTERED_PARTIAL**：差异已登记，**两端仍未锁定**（三个摘要互不相等）；订正工单前提——
  前端 P21 交回的是**阶段 2 对**（`6e8ae84a`/`f5d27269`，59 方法），不是 `b284f70c`。
- **080 = FIRST_RUN_LOCK_DONE**，但两处取舍必须知道：就绪=**首轮终态**（每库一次等待；不是"库就绪探测"）；
  同键的**新库**（数据根重建）不会再被锁——已知边界。
- **QUEUE_EMPTY_AT 已写**（见上）——这是调度者的投递缺口，不是执行者停工理由的托词。

---

## 工单 082 — 45 收口（2026-09-19，执行者）

| 单 | 终态码 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 082 | `LEDGER_45_CLOSEOUT_DONE` | G1 ✅ 45 行含 `NATIVE_HOME_STORAGE_DONE`；G2 ✅ 注记含 `460781c` + 复跑命令 | 无代码改动 ⇒ 不重跑套件；本单实跑 `native-home-gate.py` 于基线 `4c32992` → `NATIVE_HOME_GATE_OK` | **0 次 / ¥0** | 本单 |

- **45 行**：`NATIVE_HOME_STORAGE_PARTIAL` → **`NATIVE_HOME_STORAGE_DONE`**；G7 仍记**部分覆盖**（未改）。
- **报告**：[native-home-storage.md](../server-round1/fullstack/native-home-storage.md) 文末「082 收口注记」
  + 正文 5 处 G3 冲突就地标注（§0 结论、§3 门表 G3 行、§7 未做项 1/4、§8 后"曾未决"），原文不删。
- **本单订正了工单 082 的前提**：单文写"45-G3 在**当前基线**上通过（提交 `460781c`）"，
  但 `460781c` 之后、本单基线 `4c32992` 之前有 `cd03ada`(070) 与 `30012ad`(080) 两次代码改动，
  其中 **080 正改在 G3 走过的 `SidecarExecutionBackend`**。故本单不沿用旧记录，**本人重跑整座门**：
  G1/G2/G3/G4/G6/G8 全 pass，G3 形态与 `460781c` 逐项一致
  （证据 [native-home-45-082-rerun.json](../server-round1/fullstack/native-home-45-082-rerun.json)，
  sha256 `0501467351fe…`，`temporaryRootRemoved: true`）。
- **反例演练（G1）**：把 45 行改回 `PARTIAL` 而不加注记 ⇒ G1 失败；本单以注记 + 实跑证据满足转换，非仅换字。
- **未做项（不属本单，如实移交）**：G8 取消/召回间歇 → **087**；claude/dsh/qwen 43 代门 marker 根因 → 67 §4。

## 工单 083 — 62/64 的 WSL 真腿（2026-09-19，执行者）

- **已纳入投递**：work order `090`/`091` 修订 @`b7ca376` 与章程队列更新 @`a38d2bd`（裁决 R-0012）；
  本单 §3.1 的阻塞正是 090 的管辖面，故不越界代跑。

| 单 | 终态码 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 083 | `WSL_LEGS_62_64_PARTIAL` | G1 ✅ 真 `wsl.exe` 真仓取值 + 非 git 目录走 `GIT_NOT_A_REPOSITORY` + 无连接器走 `GIT_UNAVAILABLE`（不编数）；G2 ⚠️ **部分**：空列表反例 ✅、`placement="wsl"`+`pid=null`/`PID_NOT_REPORTED` ✅，但"真 Worker 飞行中取样"未见；G3 ✅ 两处答案零宿主路径 | 本单 6 条绿（2.59s）；Validation `-k "git_status or execution_inventory"` **10 passed / 583 deselected**；全量 **893 passed + 1 error**（= 基线 887 + 本单 6；error 是 `test_opencode_gate_cleanup.py:388` teardown，与 WSL 腿无关，本单未复核是否既有 ⇒ 挂待查） | **0 次 / ¥0** | `0d92aad`（腿 + 反例）+ 本提交（证据 + 账） |

- **62 行** → `WORKSPACE_GIT_STATUS_DONE`（DoD 两条腿齐）；**64 行**保持 `PARTIAL`，理由已从"没跑"换成"组合不出飞行中取样"。
- **证据**：[wsl-legs-62-64-083.md](../server-round1/fullstack/wsl-legs-62-64-083.md)（含一条命令的复跑方式、
  事实分级、以及两处交回项）。
- **精确剩余（本单未做，逐条给入口）**：
  1. **真飞行中的 WSL 执行清单取样**（64 的 DoD 尾项）。本侧第一手阻塞：`runtime.py:140` 的
     `_builtin_connector` 在非 `nt` 恒返回 `None`；`build_runtime_from_sidecar_deployment`（`runtime.py:449`）
     不收 `connector=`；`env-provider-gate.py --placement` 只认 `local|ssh`（且 `scripts/**` 不在本单 `write_paths`）。
     归 **090**（它有 `src/**` 写权，且已实测到路由缺陷 `sandbox-windows` → `SANDBOX_PROVIDER_UNRESOLVED` → `DispatchAmbiguous`）。
  2. **WSL 侧增删行**：`additions`/`deletions` 结构上恒 null 且答案级 `reason` 也为 null。
     补 numstat 还是把它写进 62 的契约文字 ⇒ **要人拍**（产品决定），本单只记录。
  3. **`test_opencode_gate_cleanup.py:388` 的那 1 个 teardown error** ⇒ 交回（本单权限下无法单独复跑取证）。
- **清理**：本单探查 `probe()` 时留下的 `/tmp/agentbox-worker-r1/083-probe` 已删；该根下 16 个 `server_*`
  目录属先前运行，未动；`pgrep -c -x agent-box-worker` → `0`。
- **不改协议**：两条腿都走现成 wire 与现成 `WslConnector` 方法，`src/**`/`plugins/**` 零改动。


## 工单 084 — 51/53 剩余解析器（2026-09-18，执行者）

| 单 | 终态码 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 084 | `USAGE_PARSERS_DONE` | G1 ✅ 两家各跑到**门级一轮**（非单测）：hermes 账本 `(11,7)`→`(22,14)` `source=hermes-state-db`（主文件独读为 null、带 `-wal` 侧车才出值——侧车 1,034,152 B 是第一手对比事实）；claude `(11,7)` `source=claude-projects-line`，且其**失败轮整行 NULL** 是工单"失败轮为 NULL"的真实行实例；G2 ✅ 凭据边界从 grep 升级为**运行期守卫**（`_scratch_sqlite` 逐条 trace 语句，点名 `credential(s)`/`account(s)` ⇒ `USAGE_PROBE_CREDENTIAL_QUERY` 类型化拒绝 + 临时库不残留）；G3 ✅ 列缺失⇒字段缺席、读取抛错⇒fact 保持 unknown 且日志记原因 | 本单新增 5 条；Validation `-k usage` **27 passed / 571 deselected**；`tests/server` **598 passed**（083 时 593）；根套件 **898 passed / 0 failed / 0 error**（= 083 的 893 + 5，零退化）。顺带第一手：083 交回的 `test_opencode_gate_cleanup.py:388` teardown error **本轮两根套件均未复现**（不声称修好，只记录缺席） | **0 次 / ¥0** | `bca5aef`（阶段 1–2 观测轮）+ `873a6d4`（阶段 3 守卫 + 反例）+ 本提交（阶段 4 账） |

- **51 行 / 53 行已按实况更正**：两行的"hermes/claude 观测轮与 opencode/kilo blob 解析待续"是**陈旧断言**。
  第一手核对：`parse_opencode_db`（读 `message.data` JSON 的 `tokens` blob）与 `parse_kilo_db`（读 `session` 专用列，
  按 `PRAGMA table_info` 只取存在的列）**自 51 的 `eb0c307` 起就在树内且各有测试**，`FORMATS` 六家齐。
  ⇒ 本单阶段 3 **没有重复实现**，补的是真缺的反例与守卫；账上如实写成"核实 + 补牙"，不写成"本单实现"。
- **证据**：[usage-parsers-remaining-084.md](../server-round1/fullstack/usage-parsers-remaining-084.md)
  （§1 运行前置事实、§2/§3 两轮账本表与家侧车对比、§4 凭据面、§5 清理、§7 守卫与五条测试 + 反例真会咬的演示、§8 剩余）。
- **精确剩余（本单未做，逐条给入口）**：
  1. `kilo`/`opencode`/`dsh`/`qwen` 的部署模板**未声明 `usageProbe`** ⇒ 这四家的门不会去回读用量，事实长期为 unknown。
     模板在 `plugins/**`，**不在 084 的 `write_paths`**（工单把 `plugins/**` 列为 forbidden）⇒ 需要一张有插件写权的单。
  2. 现场真库（用户自己的 `~/.local/share/opencode`、kilo 库）的**再观测本轮未跑**：读它既不在本单必要面上，
     又会把凭据承载文件读进进程；51 阶段 A 的现场值按 `eb0c307` 证据算**引用**，本轮把其中逐字抄录的行值钉成回归测试。
  3. claude 门里"哪一轮对应哪个 turn"的**归属未验证**（账本三行的轮次归属靠计数推断）；要钉死需在门内加插桩，属门脚本面。
- **账务与清理**：真实模型调用 **0 次**（两轮都用假端点，`--live` 未使用）；凭据只作 locator，未复制/未落盘/未进日志；
  两轮 `--keep` 保留的运行根（含 `<temporary>/server/state/agentbox.sqlite`）取证后已 `chmod -R u+wX` + `rm -rf` 删除并核实缺席；
  `ps -eo comm | grep -c agent-box-worker` → `0`（`pgrep -x` 因 15 字符截断不可靠，故取 `ps`）；演示目录 `/tmp/084ce` 已删。
- **不改协议、不越界**：wire 零改动；`plugins/**` 与 `scripts/**` 零改动（观测轮用现成 `--keep` 旗标，前置 env 走文档化的
  `AGENT_BOX_SANDBOX_MODULE`，未把该前置补进脚本——那要另一张有 `scripts/**` 写权的单）。


## 工单 085 — 60 遗留：先钉键，再把姿态产物写进配置（2026-09-18，执行者）

| 单 | 终态码 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 085 | `POSTURE_CONFIG_WRITE_DONE` | G1 ✅ 每个被写入的键都有**一手**依据 + 真实工件快照对比：claude CLI **2.1.270** 的 `doctor › Invalid settings`（渲染件**无话可说** / 把 `permissions.ask` 改成字符串即报**带路径的类型化错误**），codex CLI **0.147.0** 的 `debug prompt-input` 回显（把 `danger-full-access`+`never` 收紧 ⇒ 归一后与"本来就严格"的文件**逐字同一块** 473B `5db7584e377bcef7`）；G2 ✅ **只收紧**有两半反例（照姿态放宽的写入器会产出 3977B `bf9aedaed1d9cb40`，多出整段"Escalation Requests"越权指引；反向：姿态已被满足 ⇒ `changes==[]` 且**字节不变**）；G3 ✅ 类型化拒绝**六半**：未知键、未知动作、坏 base 形状、内联 `[profiles.*]`、未钉死的家、不在注册表的名字 | 本单新增 **34** 条（`-k claude` 11 / `-k codex` 10 为该文件内子集）；Validation `python3 -m pytest -q tests/server -k posture` → **39 passed / 593 deselected**（= 本单 34 + **先前既有**同名姿态测试 5，口径见证据 §7.6b）；根套件 **932 passed / 0 failed / 0 error**（255 s，= 084 的 898 + 本单 34，**零退化**） | **0 次 / ¥0** | `a323441`（阶段 1 钉键证据）+ `813d1d0`（阶段 2+3 写入器与 31 条测试 + §6 快照证据；**两阶段落一个实现提交，登记为偏差**）+ 本提交（阶段 4 类型化拒绝 + §7 证据 + 60 收口 + 本账行） |

- **实现落点**：`src/agent_box/server/profiles/posture_config.py`（`render_posture_config` / `write_posture_config`）。
  claude 只写 `permissions.ask`/`permissions.deny`，**合并进受审文件**（`allow` 与 `defaultMode` 可达但是放宽 ⇒ 不写）；
  codex 只以**文本**改顶层 `sandbox_mode`/`approval_policy`（不重排表与注释、绝不写 `danger-full-access`/`never`/`on-failure`、
  绝不产 `[profiles.*]`）。落盘 `mkstemp` + `os.replace`；返回值即快照对比（每路径一条 `before`/`after`，`before` 是文件原样）。
- **钉键的地基是一条版本事实**：宿主另有 codex **0.154.0** 已**拒绝** `approval_policy="untrusted"`，本部署钉死的 **0.147.0** 接受
  ⇒ 全部钉键观测只用**仓内工件**；写入面不得被"更安全的默认"偷偷扩大，也不得把 0.154.0 的收紧当"本部署未知键"。
- **阶段 4 的拒绝面从注册表派生，不是家名抄本**（一手）：`load_builtin_registry()` 给 8 家 ⇒ 拒绝名单 = 8 − 钉死 2 =
  `dsh, hermes, kilo, opencode, pi, qwen`。反例演练（内存内加第九家 `zz-new`）：派生名单随之变 7，
  **手抄名单会漏**；`write_posture_config(..., harness="zz-new")` 当场 `POSTURE_CONFIG_UNPINNED_HARNESS` 且目标字节未变。
- **一条容易误读的轴**（写给 093 的执行者）：注册表里只有 `codex` 声明 `permissions` 能力、`claude-code` **没有**，
  而该能力说的是"**运行时会不会应答权限请求**"，与"姿态能否物化进受审配置"**不是一条轴**。
  用它推写入面会同时得出两个错结论（claude 被误判不可写、六家被误判可写）⇒ 已由测试钉住区分。
- **60 收口（不改别人的契约）**：60 的"翻译产物写入配置"遗留**收窄为三条**并写进 60 行；**60 维持 `PARTIAL`**。
- **精确剩余（本单未做，逐条给入口）**：
  1. **生产接线**——`posture_config.py` 目前无调用方，本单 Scope 明写"不碰 wire" ⇒ 归 **093**（R-0013 第 1 层执行侧）。
  2. claude `permissions.ask` 的**运行时效果**未验证（需一次真实工具调用才看得见提示）⇒ 模型轮。
  3. **`ask→allowedTools` 分歧** ⇒ **B5（待人拍）**：见下面阻塞表。
  4. `external_directory` 无钉死的 claude 规则名 ⇒ 沿用 60 的 `PERMISSION_POSTURE_UNEXPRESSIBLE` 面，本单不发明。
- **账务与清理**：真实模型调用 **0 次 / ¥0**（三家 oracle 全零成本：`doctor`、`debug prompt-input`、读注册表）；
  两家探针全程走隔离目录，**未读**用户真实 `~/.codex`/`~/.claude`，未装载任何凭据（locator 目录全程未访问）；
  `codex debug prompt-input` 会把 cwd 的 `AGENTS.md` 渲进提示 ⇒ 只在 `/tmp` 下跑、输出经关键词过滤后才进证据文件；
  `/tmp/085*` 十项临时件（`085cx147`/`085claude-config`/`085claude-proj`/`085claude`/`085claude-help.txt`/
  `085codex`/`085cxws`/`085cx-pro.txt`/`085snap`/`085split`）已删除并核实 `ls -d /tmp/085*` 为空。
- **两条环境/账目事实（都不是本单回归）**：
  ① 裸 `python3 -m pytest` 在本机以 **40 个 collection error** 失败（`~/.local/lib/python3.12/site-packages/` 三条
  `__editable__*.pth`，mtime 2026-06-19/08-05/08-20，把 `agent_box` 指向 `/home/maoqh/projects/agent-box/src`，
  该路径**没有** `server` 包）⇒ 本树门必须带本节头「计数口径」那条 `PYTHONPATH`；**三条 pth 未改动**（只读诊断）。
  ② 上一轮挂的"893 vs 898 差 5 条"**是我这边的算术假象**：我把 `-k posture` 的选中面当成了本单文件的条数。
  一手复核后 084 的 898 **逐字成立**（`git diff --stat 873a6d4..HEAD -- tests/ src/` 只含本单两个新文件），
  本单 34 条 ⇒ 932，无悬案。详见证据 §7.6(b)。


## 工单 086 — 65 最后一圈：真 harness 父侧自发起 tools/call（2026-09-18，执行者）

> **已收口**：终态见本节末行（`SUBAGENT_HARNESS_ROUND_DONE`）。阶段 1/2/3 各有一行，G1/G2/G3 与 65 收口在阶段 3。
> 证据：[subagent-harness-round-086.md](../server-round1/fullstack/subagent-harness-round-086.md)
> ＋ 原始事实 [subagent-harness-round-086-pin.json](../server-round1/fullstack/subagent-harness-round-086-pin.json)
> （sha256 `0d2aad5e30a936cf5bd6801c58c2f45fd9fa8d9b4dd85402a0feebb0033de95f`）。

| 单 | 阶段 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 086 | 1 选家并核对工具播发 | 本阶段的门 = **读路径一手钉死 + 发散即失败**：claude CLI 的 `tools` 数组里，探针工具**只在** `.claude.json` 与 `.mcp.json` 声明时出现，**在 `settings.json`（= 65/58 的渲染落点）声明时缺席**；空白对照三文件皆无 ⇒ 断言空。生产形态组装门：有出向授予 ⇒ 桥条目**真的落进** `.claude.json` 且轮次 `completed`；无授予（反例）⇒ 角色目录里**没有** `.claude.json`；只读投影 `settings.json` 存在且**不含**桥条目 | 本单新增 **9** 条（`-k mcp_config_source` 5 / `-k subagent` 面内新 4）；Validation `python3 -m pytest -q tests/server -k subagent` → **8 passed / 633 deselected**（= 本单 4 ＋ 65 既有 4）；根套件 **941 passed / 0 failed / 0 error**（356 s，= 085 的 932 ＋ 本单 9，**零退化**） | **0 次 / ¥0** | 本提交（阶段 1） |
| 086 | 2 真 harness 父轮一轮 | **首跑未过（真缺陷）→ 099 修好后复跑绿**。首跑：真 Server 起 uvicorn 真监听 → 两个 Profile → **播种轮 completed 且没有任何一次请求播发桥工具**（"条目不是恒在"的反例成立）→ 授予 → 父轮**失败** `EXECUTION_FAILED`，根因 `WorkerError: operation is unsupported`（`sidecar.py:593` 发 `home.put`）。复跑（c12，**全一手**，`SUBAGENT_REAL_ROUND_OK`）：真 CLI 读 `.claude.json` → `tools/list` **带上两个桥工具** → 父**自己**调 `list_subagents` 拿回 `[{"name":"086 beta",...}]` → 父**自己**调 `run_subagent` → Server 派到 beta 的 Profile 跑出**一个真子轮**（`parent_turn_id` 指向父轮、`usage_source: claude-projects-line`）→ 子摘要回到父历史并被父最终文本带出 → 出口守护 loaded、非 loopback 目的地**零**次到达、`unauthorizedProviderRequests = 0`。**G1 反例仍咬得住**：同一份用例里"没有任何一次请求播发桥工具"的缺席判定 + `discovered == ["086 beta"]`（名字只可能来自桥返回的 roster，写死常量的第一版正是被授权检查打回的）| 本阶段新增 1 条真实链路用例（`tests/server/test_subagent_harness_real_round_086.py`；无 Worker 二进制或无 bwrap 时**跳过**）| **0 次 / ¥0**（端点是 loopback 脚本假端点，凭据是 gate 的假令牌；真模型一次未调） | 本提交（复跑绿）＋ 099 |

- **阶段 2 的红已按其本来的用途转绿（同一份代码、同一份用例，一手）**：登记为"已知红"时它正是 099 的门 G5 的对象，
  修好前不许改期望。复跑过程中另修掉**两处夹具自身**的缺陷（都不是放松验收）：
  ① 默认 Worker 从 `c11` 改指 `c12`——把反例留在默认位上等于"根套件故意红"，反例应由 099 的 wire 用例**按名钉住**；
  ② 读 `tool_result` 要取**最新一条消息的最后一个块**：一轮里连发两个工具时两个结果并排落在同一条 user 消息里，
  取第一个就永远先读到 roster，父轮明明已拿到子摘要却被判"没拿到"，脚本于是委派了第二次（`DELEGATION LOOP`）。
  现在把整条 `toolResults`/`historyToolCalls` 链一并记进报告，这类"多工具轮"的观测错位一眼可辨。


- **阶段 1 计数口径已作废并被复核替代**：当时写的"根套件 **941** = 零退化"只覆盖到阶段 1 新增用例，
  阶段 2 那条真实链路用例（当时红）尚未计入。099 阶段 4 修好后的全量复跑：**946 passed / 0 failed / 0 error**
  （284 s）= 941 ＋ 086 真实轮 1 ＋ 099 wire 4。留一个红的用例在阶段 2 的提交里是**有意的**：它就是 099 门 G5 的对象。

| 086 | 3a 四项核对（观测半）| 核对**不是签字，是去跑**。每条都写成"从产品真正走的那个入口进来"的用例（`tests/server/test_subagent_rule_liveness_086.py`，7 条）：**归属 ✅**（子轮用量留在子轮行、`parent_turn_id` 指向父轮、并以事实形态回到父轮请求里；反例在断言内——父轮自己 `complete` 成 3/2/5，任何"把子轮抄到父轮"的汇总会显示成 14/9/23）；**摘要 ✅**（两侧都跑：>4096 被截到 `MAX_SUMMARY_CHARS`＋省略号、界内逐字不变，反例是"用占位符替代正文"的截断器）；**取消 ❌ 红**（`turns.cancel` 真入口把父轮取消后，账上仍在 `running` 的子轮**没有任何人问它要不要停**——`cancel_children` 在 `src/agent_box` 里**零调用方**）；**审批 ✅**（65 已有的镜像用例走的是真方法 `SidecarExecutionBackend._native_event`，本次复核其生产可达性）；**环 ❌ 红**（`DID NOT RAISE`：授权层只拒**直接反向边**，A→B、B→C、C→A 三条边**都能建**，而 `run` 的 `chain` 参数**loopback 端点从不传**⇒ 第 4 跳把环闭上、又开一个子轮，按归纳可无限下去）；外加两条"别拿更绿的调用骗自己"的守卫（端点那段源码里 `service.run(...)` 确实不带 ancestry；`run` 的签名里也不该再有 `chain` 可信）| **本阶段这 7 条里 3 红**（取消 / 环 / 签名守卫），红的原因逐条是上面写死的入口与观测，**不是**"期望还没写对"；其余 4 条绿 | 本提交新增 7 条（3 failed / 4 passed，2.6 s）| **0 次 / ¥0**（全假执行端口） | 本提交（阶段 3 观测半，红为有意） |

- **一条把"死规则"这个判断救回来的更正（一手）**：我原本按 65 的措辞以为"两跳环 A→B→A 在生产上跑飞"，跑出来是
  **授权层当场拒**（`profiles/repository.py:140`，"a Profile cannot call itself" / :157 直接反向边 ⇒ 两跳环**建不出来**）。
  真缺陷是**它只看一条反向边**，三跳环能建、而运行期那一道因为 `chain` 从不传递而看不见 ⇒ 修法不是"再加一层限制"
  （R-0016 明令不许新增限制），而是**把已有的环检查接到真链路上**：祖先链由账本 `parent_turn_id` 走出来，
  调用方无权自报血统。深度上限按 R-0016 **撤销**。
- **顺带钉住的一条次序事实**：`run` 里参数校验**先于**血统检查，所以一次 `description` 只有两个词的委派会以
  `SUBAGENT_ARGUMENT_INVALID` 被打回、根本走不到环检查（第一版用例就是这么"红错了地方"的）。

| 086 | 3b 两条死规则的修法 | 修法**不加新限制**（R-0016 明令），只把已有的规则接上真链路：**血统**——`delegation.run` 的签名里再没有 `chain`，祖先链由 `SessionsRepository.turn_ancestry_profile_ids()` 沿账本 `server_turns.parent_turn_id` 逐跳走出（每跳一跳一读、带 `visited` 自守卫），交给新的 `profiles.subagents.check_cycle()`；调用方**无权自报血统**。**深度**——`DEFAULT_DEPTH_LIMIT` 连同其拒绝分支一并**删除**，留下的界仍是"每父轮 ≤4 次调用"。**取消**——`SessionService.cancel_descendants()` 把取消沿账本子轮递归下发（`live_child_turn_ids()` 只取 `ACTIVE_TURN_STATES`），并接在**两个**入口上：REST `turns.cancel`（`cancel_turn` 里本轮 stop 未确认时也要下发）与 wire `runs_stop`（在 `if not accepted:` 早返回**之前**）。反例各自咬死：环用例第 1、2 跳**必须成功**、第 3 跳（gamma→alpha）才 `SUBAGENT_CYCLE`，且断言第二跳**没留下任何子轮**；取消用例的父轮一旦取消，端口必须收到对那个子轮的 `cancel`，否则红 | 本阶段净增 **1** 条（wire 入口那条同规则用例）⇒ `tests/server/test_subagent_rule_liveness_086.py` **8 passed / 3.97 s**（3a 的 3 红全部转绿）；三份委派用例面 `test_subagent_rule_liveness_086 + test_delegation + test_subagents` **22 passed**；**根套件 954 passed / 0 failed / 0 error（382.19 s）= 099 收口时的 946 ＋ 本单阶段 3 的 8 条**，逐项对上、**零退化**。**门的可证伪性是量出来的、不是声明的**：把 `check_cycle` 与 `cancel_descendants` 在**同一进程内**替成空操作（不改任何文件，经 `pytest.main` 跑）⇒ 恰 **3 failed / 5 passed**，失败的正是 REST 取消 / wire 停止 / 环三条 | **0 次 / ¥0**（全假执行端口；凭据 locator 全程未访问） | 本提交（阶段 3 修法半）|

- **两条规则的死法不同，修法也就不该相同**：环检查**一直是对的**、只是看不见调用（`chain` 从不传递）；取消传播的
  `cancel_children` 则是**从零到有的孤儿**（`src/agent_box` 里零调用方，且它放在 `delegation.py` 里、连层级都不对）。
  故前者是"接线"（血统归账本读）、后者是"删除并换位"（cascade 归 `SessionService`，因为只有它同时握着账本与执行端口）。
- **递归的终止性**（写下来是因为它必须可论证，而不是"跑起来没炸"）：`cancel_descendants` 只在
  `live_child_turn_ids` 上递归，而运行期环检查保证任何父轮的子代里**没有重复角色** ⇒ 血统链不自交、递归自然有界；
  账本里也不存在自指行（授权层拒自授予，`turn_ancestry_profile_ids` 另带 `visited` 兜底）。
- **仍未做的环缺口（如实登记，不在本单偷修）**：授权层要拒的是**任意环**而不仅**一条反向边**——
  A→B、B→C、C→A 三条边**现在仍然建得出来**，只是运行期第 3 跳会被 `check_cycle` 拦住。
  把"图必须是 DAG"这件事做到授权层，属授权 CRUD 的面（65 的 C 段），要新工单。
- **一条契约字面交回调度者（不改契约、不自行放宽验收）**：工单 **G2** 写"子轮用量**记在父轮**"，而实现与 65 的
  docstring 是"子轮用量**留在子轮行**、`parent_turn_id` 是链路、子轮用量以事实形态回进父轮的**工具结果**里——
  没有任何东西抄到父轮"。两种口径都能满足"归属可追溯"，但**账上只有一种写法**。本单按实现口径核对并出具反例
  （断言内已把父轮自己 `complete` 成 3/2/5，任何"抄到父轮"的汇总会显示成 14/9/23），把**这句字面**交回。

- **本阶段跑出来的不是"绿了一圈"，是一条真缺陷**：65 把桥渲染进 claude 的 `mcp_target =
  `/runtime/home/.claude/settings.json`，而**该家根本不从这个文件读 MCP 服务器** ⇒ 条落进没人读的文件；
  生产模板又把同一文件声明为**只读投影**，于是"授予子代理的父 Profile"在真实部署形态下**组装期就
  `ASSET_SLOT_CONFLICT`**（`runtime.py:1020`）。65 的端到端用例之所以绿：其部署 `projectionFiles` 为空、
  且父侧由测试进程**自己写 JSON-RPC 驱动桥**——正是本单要补的那一圈的夹具限制。
- **改了什么（1 行事实，Server 零改动）**：`harnesses.toml` 的 claude-code `mcp_target`
  → `/runtime/home/.claude/.claude.json`（实测可读、落在执行期覆盖层、不是投影目标；`mcp_key` 仍 `mcpServers`）。
  落点选注册表而非 Server，是守 `runtime.py:_registry_profile_spec` 的原则"槽位是这个家自己的事实"。
  不选项目级 `.mcp.json`：那要往**用户的真实工作区**写配置。
- **连带改的三处断言（都是随事实走，不是为凑绿）**：`tests/server/test_asset_hubs.py`（58 的槽位钉值＋读取路径，
  hooks 仍留 `settings.json`）、`tests/server/test_delegation.py`（65 的两处 `.claude/settings.json` → `.claude.json`）。
  改前两处**如实失败**（`KeyError: 'mcpServers'` / "a granted parent must materialise the bridge"），改后转绿。
- **家与排除（注册表派生，非按感觉）**：工单建议"最省的一家例如 pi"这条**前提不成立**——`pi/dsh/hermes/kilo/opencode`
  **未声明 MCP 文档** ⇒ `SUBAGENT_BRIDGE_TARGET_UNSUPPORTED`，结构上不能承载桥；`qwen` 的 CLI 本宿主未安装（无法一手钉死）；
  `codex` 承载但**与自家只读投影相撞**（本单只写成断言，不越界修）。⇒ 本轮选 **claude-code**。
- **两条一手限制（不允许绕过）**：
  ① **版本漂移**：读路径观测用的是宿主 CLI **2.1.274**，本部署钉死 **2.1.270** ⇒ 对钉死版本属**未验证**，
  只能由阶段 2 的**沙箱内真 CLI** 给出最终确认（仓内工件二进制不得手跑，本轮该尝试被拒）；
  ② **`hooks_target` 同一形状**属**推导**（59 的 `settings.json` 走 `runtime.py:1018` 同一道检查）——本单**未**为
  hooks 做读路径观测，故不改、只登记。
- **一条基线既有失败（本单不修，见证据 §8）**：
  `plugins/agent-box-harnesses/tests/test_skill_projection.py::test_all_five_registry_targets_are_lossless_and_read_only`
  在**基线逐字节副本**（`git archive 4c32992 \| tar -x` 后原地复跑）上以**同一断言、同一两个字符串**失败 ⇒
  一手判定为**基线既有**、非本单回归。根因：该用例把一家的技能路径写死成 `/runtime/home/skills/{skill_id}`，
  而注册表（基线如此）里 claude 是 `.claude/skills`、qwen 是 `.qwen/skills`；根套件 `testpaths = tests` 不含
  `plugins/**/tests`，所以它一直没被跑到。**不顺手修**：属 52/58 技能投影事实，且钉正确期望要一次技能读路径的一手观测。
- **阶段 2 的硬前置（本阶段末已核实的三条事实）**：桥拨回的是 `self_url_of()`
  = `http://127.0.0.1:$AGENT_BOX_HTTP_PORT` ⇒ 必须**真监听**（`test_delegation.py:596` 的 uvicorn＋线程写法），
  `TestClient` 不算；出口守护只放 loopback ⇒ 拨回允许、审计里出现 `denied` 即本次运行不干净；
  `scripts/**` 不在本单 `write_paths` ⇒ 评审过的 `claude-production-chain-gate.py` **一个字不改**，
  在 `tests/**` 里以 `importlib` 按路径复用其部件。
- **阶段 2 探到的新约束（登记，留给阶段 3 的"审批"一项）**：ACP 适配器把工具权限检查交给
  `canUseTool` → 发 `session/request_permission`，而**Worker 侧没有该方法的应答路径**
  （`grep -rn request_permission workers/agent-box-worker/src/` 只命中 `fs::set_permissions` 两处无关项、
  `src/agent_box` 亦无）。⇒ 真父轮里的桥工具**必须在 SDK 侧就被预批准**（`permissions.allow`/`defaultMode`），
  否则这圈会卡在权限往返上；这与 085 登记的 **B5** 是相邻的两件事，阶段 2 用实测决定怎么说。
- **账务与清理**：真实模型调用 **0 次 / ¥0**（探针全走 loopback 假端点，CLI 的每次运行都记在 pin JSON 里，
  `authorized` 字段核对本注入令牌）；探针 CLI 运行全程 `HOME`/`CLAUDE_CONFIG_DIR` 指向临时目录，
  **未读也未写**用户真实 `~/.claude`；凭据 locator 全程未访问；临时件 `/tmp/086-pin.json` 已入库为证据副本、
  基线副本 `/tmp/086-baseline` 已删除并核实缺席。

| 单 | 阶段 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 086 | 终态 `SUBAGENT_HARNESS_ROUND_DONE` | **G1 真 harness ✅**（claude-code 一家：真 CLI 进程 + 真 `.claude.json` 读路径 + `tools/list` 带上桥工具 + 父**自己**发起 `tools/call run_subagent`；**反例是"夹具冒充即失败"这一条本身成立**——同一份用例里"没有任何一次请求播发桥工具"的缺席判定与 roster 名字来源都写死为断言，65 的原端到端用例正是父侧由测试进程自驱桥，才让这一圈显绿）。**G2 归属 ✅ 但契约字面交回**（见上；口径按实现：子轮用量留子轮行、`parent_turn_id` 为链、以事实形态回进父轮工具结果，反例把"抄到父轮"的汇总显示成 14/9/23 而钉死）。**G3 记账 ✅ 0 笔**（**本单真实模型请求 0 笔**，全阶段合计；R-0017 口径：门级真实调用一次未花，端点为 loopback 脚本假端点、凭据 locator 未访问。逐笔记账在本单是"零笔可记"，如实写成零而不是含糊过去）| 本单三个阶段新增用例 **9 + 1 + 8 = 18** 条；Validation `python3 -m pytest -q tests/server -k subagent` → **17 passed / 637 deselected**，且**这一跑里 0 个 skipped ⇒ 阶段 2 那条真实链路用例（真 CLI＋bwrap＋真桥）在本次复跑里又绿了一遍**，不是一次性观测；`tests/server/test_subagent_rule_liveness_086.py` **8 passed**、委派面三份 **22 passed**；根套件 **954 passed / 0 failed / 0 error**（阶段 3 复跑，= 099 收口 946 ＋ 本单阶段 3 的 8 条，**零退化**）。阶段 1 当时写的 941 口径已作废并由 954 替代 | **0 次 / ¥0** | `3d19218`（阶段 3 观测半，3 红为有意）＋ 本提交（阶段 3 修法半 + 账）|

- **摘要（本单做完的一件事，和它顺带钉死的三件事）**：65 缺的那一圈——"父侧由**真 harness** 自己发起
  `tools/call`"——已经在真 CLI、真沙箱、真桥进程上跑通并留下可复跑的用例；顺带一手钉死了 ① claude 的 MCP
  **读路径**（`settings.json` 不读，故 `harnesses.toml` 的 `mcp_target` 改指 `.claude.json`，Server 零改动）、
  ② 两条**写下来却从未被驱动**的规则（血统自报 ⇒ 取消传播孤儿）现已接到真入口上、且**门的失败是被量出来的**、
  ③ 四家里 `pi/dsh/hermes/kilo/opencode` 未声明 MCP 文档 ⇒ 结构上不能承载桥，`qwen` 本宿主未装无法一手钉死，
  `codex` 与自家只读投影相撞（只登记不越界修）。**一家可行即 DONE**，工单的 `PARTIAL` 分支条件是"三家都不可行"，不成立。
- **未做项（不含糊）**：授权层的**任意环**拒绝（现只拒一条反向边，见上）；Worker 侧 `session/request_permission`
  的**应答路径**（缺失，故真父轮依赖 SDK 预批准）；`timeoutMs` 120 s 与子轮等待 600 s 的**张力**；
  真机上的**多子并发**扇出（并发 3/3 只有假端口面）；`hooks_target` 同形状的**读路径观测**（推导、未测）；
  codex `mcp_target` 相撞的修法（`harnesses.toml` 在本单 `write_paths` 内，但修法要一家自己的读路径观测）。
  另外宿主 CLI **2.1.274** 与部署钉死 **2.1.270** 的版本漂移，已由阶段 2 的**沙箱内真 CLI**（2.1.270）给出确认。
- **65 收口**：见下一行与账本 65 行（`PARTIAL → DONE`）。


## 工单 099 — Worker 的 `home.put` 从未接上分发线（2026-09-18，调度者投递）

> 本单是 **086 阶段 2 的硬前置**：086 的 `write_paths` 不含 `workers/**`，故 086 只把缺陷如实跑出来并开单，
> 不在本单范围内偷修。证据：[worker-home-put-dispatch-099.md](../server-round1/fullstack/worker-home-put-dispatch-099.md)

| 单 | 阶段 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 099 | 1 观测 | 本阶段的门 = **真二进制上一手复现**：`home.prepare` 成功、`home.put` ⇒ `OP_UNSUPPORTED "operation is unsupported"`（不是夹具里的手写 JSON）。作用域钉死三处行号：实现在 `main.rs:2153` **完整存在**、分发臂 `main.rs:355` **缺 `"home.put"`**、兜底臂 `main.rs:491` 产该码 | 本阶段无新增测试（观测 + 契约）；根套件计数 **941 是 086 阶段 1 时的数，不能当"零退化"**（见 086 §计数口径） | **0 次 / ¥0** | `4443056` |
| 099 | 2 接线 | 一行：`"home.prepare" \| "home.put" \| "home.list" \| "home.get" \| "home.delete" =>`（`main.rs:355`）。**边界一字不动**（超限 `HOME_IO`、逃逸 `PATH_INVALID`、非普通文件拒、错误码逐字保持）。投递到**新** bundle `.acceptance-bundle-c12`（`sha256 9d8df86d214bf2b3e99afa461bd5ca83c62caae847cec507ea20e2518ce97088`），`c11` 原样留作反例（`sha256 c1e353c89609ab2feed0765205feeb3eb4c8db9679f353ba4065302df35a2457`） | `cargo test` **43 passed**；根套件见阶段 4 | **0 次 / ¥0** | `d5b7407` |
| 099 | 3 门 | **G1** 真进程 wire：c12 上 prepare→put→get 读回同一份字节、`home.list` 出现 `state/auth.json`；**反例**＝同一份用例跑 c11 ⇒ 该 op `OP_UNSUPPORTED` 且**同一条流上 `home.list` 仍正常**（反例只咬一个 op，不是一条死通道）。**G2** 空/超限/转义名/目录目标/叶子符号链接各自类型化错误，越界外那个 `outside` 哨兵字节仍 `untouched`，用例尾再发一发 `home.get` 证明流未死。**G3** 发散门 `the_dispatch_arm_and_handle_home_cover_one_home_operation_set` 读**两处真源码**比对集合；**演示**＝手工从臂里删掉 `"home.put"` ⇒ 门红并打印 `left=[4 op] right=[5 op]`（`main.rs:3203`），还原后 sha256 与备份一致 | 新增 `tests/server/test_worker_home_put_wire_099.py` **4 passed**（2 op 用例 × 2 bundle）；`cargo test` 43 passed | **0 次 / ¥0** | `5d70166` |
| 099 | 4 收口 | **G4** 根套件 **946 passed / 0 failed / 0 error**（284.51 s）＝ 941 ＋ 086 真实轮 1 ＋ 本单 wire 4，**零退化**；首轮那次 4 个 `ERROR` 是 `test_state_capture_error_boundary` 的**新鲜度门**（它按 mtime 判定 `target/debug` 二进制落后于 `main.rs`——阶段 3 往 `main.rs` 加了 90 行测试码，字节无关但 mtime 更新了），`cargo build` 后复跑即全绿，**不是产品回归**。**G5** 消费者 = 086 阶段 2 真轮由红转绿（见 086 行） | 946；插件目录不在根 `testpaths` 内（口径不变） | **0 次 / ¥0** | 本提交 |

| 单 | 终态码 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 099 | `WORKER_HOME_PUT_DISPATCH_DONE` | **G1** ✅ c12 真进程上 prepare→put→get 读回同字节、list 出现该文件；**反例真咬**：同一份用例 c11 ⇒ 该 op `OP_UNSUPPORTED` 且同一条流上 `home.list` 仍正常。**G2** ✅ 超限/转义名/目录目标/叶子符号链接各自类型化错误，`outside` 哨兵字节仍 `untouched`，用例尾 `home.get` 证明流未死；**实测与工单 §5 不一致处按实测登记**（空载荷 = `REQUEST_INVALID`，非 `HOME_IO`）。**G3** ✅ 发散门读两处真源码，删一 op 即红并打印两侧集合（演示 + 按 sha256 还原）。**G4** ✅ 946 零退化。**G5** ✅ 消费者 086 真轮红转绿 | `cargo test` **43 passed** ＋ 根套件 **946**（本单新增 wire 用例 4 条） | **0 次 / ¥0** | `4443056`＋`d5b7407`＋`5d70166`＋本提交 |


- **为什么它活得下来**：Worker 侧的 `home` 单测直接调 `handle_home`（绕过分发），Server 侧的资产写入用例走
  `TestClient`/内存实现（不经真 wire），于是"实现了但没接上"这条缝两侧都看不见。这与 58 的账行为何是
  `ASSET_HUBS_PARTIAL` 而非 DONE 是同一件事的两半——58 早就登记了真实链路未通，只是没定位到这一行。
- **影响面（分三级，不混）**：**实测** = 65 的子代理桥（阶段 1 把 `mcp_target` 改到可读物后，父 Profile 的
  资产集第一次真的非空，`sidecar.py:593` 的 `home.put` 才在真实链路上被走到）；**引用** = 58 的资产枢纽与
  56 的订阅文件（同一调用点，只是先前没有用例走到）；**未验证** = 其余通道。
- **顺手的一条契约卫生**：`082-ledger-45-closeout.md` 的三行 Stages 各带一个游离的起始 `^`，
  使 `validate_order.py --strict` 在全目录上失败；已用 `od -c` 逐字核对后删掉，勾选状态与文字一字未动。
- **本单不做**：不改 `home.put` 的边界语义（超限仍 `HOME_IO`、非普通文件仍拒、逃逸仍 `PATH_INVALID`；
  **空载荷实测到不了 `HOME_IO`**——`value_string` 先拒空串 ⇒ `REQUEST_INVALID`，该分支在真实客户端上不可达，见证据 §8 末）、
  不改 wire 形状、不动既有 bundle 目录（`c11` 留作反例样本，重建只写进新目录 `c12`）。


## 工单 097 — `server.hello` 能力表与派发表对齐（2026-09-19，执行者）

> **已收口**：终态行在本节末尾；四个阶段全部提交。
> 证据：[hello-capability-sync-097.md](../server-round1/fullstack/hello-capability-sync-097.md)

| 单 | 阶段 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 097 | 1 观测：真 hello vs 派发表 | 观测形态 = **真 Server 真监听**（`build_runtime()` → `create_app` → uvicorn 真 bind `127.0.0.1`，`TestClient` 不算）＋ 真发一次 Validation 里那条 `POST /wire/v1/server.hello`。差集一手：声明 **27**（无重复）vs 派发表 **64**（无重复）⇒ **缺 37 条、逐条与工单 §Current state 同名同数**；**反方向 0**（表里没有派发不出来的方法）。工单没写、但决定后面两道门怎么落的两条一并实测：① 这 27 条里 **11 条是 `supported:false`**（四个 `workspaces.*` ⇒ `LOCAL_SANDBOX_UNAVAILABLE`；六个 `sessions.*` ＋ `sendOutcome.query` ⇒ `EXECUTION_CAPABILITY_UNAVAILABLE`）⇒ 这就是 G3 要比对的**同一部署基线**，且因为 `build_runtime` 的 `execution=None` 是生产默认（其 docstring 明写"好让能力回答诚实"），这 11 条是**真话**不是陈旧表的产物；② `tests/server/test_capability_namespace_boundary.py:72-76` 的能力命名空间隔离断言**读源码正则、不读这张表**，它已覆盖全部 64 条 ⇒ 补声明不会把第三套词汇混进前两套（但它是第二道防线，阶段 3 点名） | 本阶段无新增测试（观测 + 契约）；两个阶段 2 决定已在证据 §4 写明理由：`server.hello` **自身声明**（发现入口对自己隐身＝假话）、派生顺序取**派发表字面插入序**而非字母序（今天常量本就按族分组，字母序会把"表变全"伪装成顺序大改，而 §必须保持不变 点名的正是顺序稳定性） | **0 次 / ¥0**（只发一次本地发现方法，不碰任何 Provider；`auth.required` 用的是 `build_runtime` 自生成的会话令牌，凭据 locator 未访问） | 本提交（阶段 1） |
| 097 | 2 派生 + 自我声明的决定 | `hello()` 的循环改成 `for capability_id in self._handlers:`（`handlers.py:392`），**`CAPABILITY_IDS` 常量整条删除**——不是"留着不用"：删除后全仓 grep 只剩 `CANONICAL_CAPABILITY_IDS`（Harness 声明词汇，另一套命名空间）⇒ 没有任何一侧还在读那张手工表，"悄悄落后"的**载体**没了。`_capability()` 的判定分支**一字未改**，只加 docstring 说清它答哪两个问题、不答第三个（存在性看派发表；写了的规则看这里；**叫不叫得通不在这里**）。工单要求的两个决定按 §4 落：`server.hello` 自我声明、顺序取派发表字面插入序 | 形状与既有事实**逐字不变**（阶段 4 真机复跑核实：顶层四键、`protocolVersion=wire/1`、`auth={"required":true,"schemes":["session_token"]}`、条目 `{id, supported, reason?}`） | **0 次 / ¥0** | `dc2076f` |
| 097 | 3 发散门 + 反例 + 37 条 | 新文件 `tests/server/test_hello_capability_sync_097.py` **7 条**（`7 passed in 3.83s`）。G1 不是"两方相等"而是**三方相等**（hello / `_handlers` / `_PARAM_SHAPES`）＋ 无重复 ＋ hello 顺序==派发表顺序；**37 条按名字断言**（`declared - 27 == 那 37 条`），不比计数；G2 两个探测方法在场且 `supported:true` 且不带 `reason`；G3 **把沙箱探针两个分支都钉**（否则这条测试只在"本宿主跑不起沙箱"时成立——本机恰好如此，绿得没有说服力），比对范围**只钉既有 27 条**，不去断言新行的支持态（断言了新行＝把 §未做 的"新族该不该有 blocker"偷偷做掉）；兜底那条同时钉住"存在性另说"：`_capability("nothing.here")==(True,None)` 而同一部署上真调用它得到 `INVALID_REQUEST`＋消息含方法名。**反例是真跑的**：进程内把 `WireService.hello` 换回"遍历一份 27 条元组"的旧形状（不动任何文件，跑完 `RESTORED True`）⇒ **5 failed / 2 passed**，红的正是 G1、37 条、G1 反例、自我声明和 **G2**（`providerModels.probeModels is not declared at all`——落后一次就把前端两个按钮打死一次），绿的恰是"从来不管同步"的 G3 与兜底 | 7 passed（本阶段定向）；全套件计数见终态行 | **0 次 / ¥0**（缺席跑是进程内 monkeypatch，无模型、无凭据、无临时数据根遗留） | `a8b93f3`（门文件；证据与账随阶段 4） |
| 097 | 4 真机复跑 + 全套件 + 账 | **真 Server 真监听复跑**（与前端 P25 的门同一形态：`build_runtime` → `create_app` → uvicorn 真 bind `127.0.0.1:0` → `POST /wire/v1/server.hello`）⇒ 声明 **64 / 64** 与派发表**对称差 `[]`**；两次独立请求**顺序逐字节相同**（钉住"缓存客户端看到的是稳定列表"这句话，而不是只钉集合）；顶层四键、`protocolVersion=wire/1`、`auth={"required":true,"schemes":["session_token"]}`、条目形状 `{id, supported, reason?}` **逐字未变**（§必须保持不变由此实测而非声称）；`server.hello` 与两个探测方法均 `supported:true`；假行 **12** 条、真行 52 条（12 而非阶段 1 推的 11：`workspaces.gitStatus` 命中 `workspaces.` 前缀分支——**推论被自己的复跑纠正并写回证据 §3**，不是事后找补）。**Windows 侧同一 probe 不可达**（`curl :18770` exit 7 / `http=000`）⇒ 记为"WSL 侧真监听已足，Windows 的 27 行表要等它从本树重建部署才会换掉"（源码改不了在跑的进程），这条**写进交回而不是假装验过** | 定向 `7 passed`（`3.83s`）；**在最终源码 `a8b93f3` 上复跑**：`tests/server -q` **661 passed in 323.31s**、`tests/ -q` **961 passed in 374.66s**，0 失败 0 跳过；与阶段 2 提交前那轮（661/961，331.10s/303.07s）**计数逐位相同** ⇒ docstring 改动行为中性是**两次独立跑出来的同一对数字**，不是我说了算。**961 = 086 收口的 954 ＋ 本单 7**，一条未掉。`validate_order.py --strict` 30 OK / 31 FAIL（FAIL 恰为 37…67 的历史格式单，非本单引入）；`git diff --check` 干净 | **0 次 / ¥0**（全程只发本地发现方法；凭据 locator 未访问；三个临时数据根跑后逐一核实缺席） | 本提交（阶段 4，含证据 §8 与账） |
| 097 | **终态 `HELLO_CAPABILITY_SYNC_DONE`** | 门：G1 三方一致（hello==派发表==`_PARAM_SHAPES`，无重复，顺序为表自身顺序）＋ 反例真跑（换回 27 条旧形状 ⇒ **5 failed / 2 passed**，红的正是 G1、37 条、G1 反例、自我声明与 G2）；G2 两探测方法在场且 `supported:true` 无 `reason`；G3 既有 27 条在**沙箱两个分支**上逐行不变（`moved == []`、`stray == []`）；G4 计数 661/961 与基线 954＋7 吻合。摘要：能力表的**唯一真相变成派发表本身**，`CAPABILITY_IDS` 常量整条删除（载体没了才叫对齐），`server.hello` 开始声明自己，`_capability` 一字未改只说清它答哪两问。费用：0 次模型 / ¥0。清理：无源码外产物，临时根全部核实删除。**未做项（不在本单射程）**：① 新声明的 37 条**该不该有 blocker 规则**（本单只保证"存在即声明"，不判定支持态；判定＝改 `_capability` 语义，属 101/103 射程）；② 派生顺带把 101 的五个 500 方法如实声明为 `supported:true`——**方法存在为真、叫得通为假**，已交回 101；③ 105 依赖的 hello 契约再锁（本树无生成物，见交回） | 见上行 | **0 次 / ¥0** | 本提交 |

## 工单 098 — `providerModels.create/update` 带 provenance 直接 500（2026-09-19，执行者）

> **已收口**：终态行在本节末尾；四个阶段全部提交。
> 证据：[provenance-500-fix-098.md](../server-round1/fullstack/provenance-500-fix-098.md)

| 单 | 阶段 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 098 | 1 观测 | 穿**真实 wire**（`raise_server_exceptions=False`，500 要以 500 的面目出现）实测：create/update 带 provenance ⇒ **500**；未知字段与枚举外值**也是 500**（工单 G3 期望它俩是类型化拒绝）；不带 ⇒ 200。**工单没点名的第三个方法**：`providerModels.probeModels` 形状同样允许可选 `provenance`（`handlers.py:90-92`）⇒ 同样一发即死；`probeConnection`（`:93-95` 不接受）那个调用点是**永远拿到 None 的死码**。**第二缺陷（本阶段最重要）**：`_provenance()` 返回 **SQL 列名**键（`:1336/:1346`），而服务层按 **wire 驼峰名**取（`service.py:67`、`:89`）⇒ **只修 NameError 会得到 200 ＋ 四列全 NULL ＋ `project()` 里没有 provenance 键**（静默丢数据，比 500 更难发现），工单 G2 是唯一能咬住它的门。覆盖核对一手：`grep -rn provenance tests/` 的 12 个文件命中**全是另一套词汇**（capability grant / sidecar commit / catalog ownership），且 `auth_style\|fields_source` 在 tests/ **零命中** ⇒ 55 的 provenance 面从 handler 到 store **一行测试都没有**（比工单判断更空一档） | 本阶段无新增测试、未改源码。行号核对：常量在 `:1315/:1320`、`_provenance` 在 `:1328`（工单行号整体 +13 漂移，因 097 删了 27 项常量）；类名是 `WireService` 不是 `WireHandlers` | **0 次 / ¥0**（`baseUrl` 全程本机 discard 端口 `127.0.0.1:9`，未出站、未访问凭据） | `8deb41c` |
| 098 | 2 修（三处一起） | ① **作用域**：`@staticmethod` → `@classmethod` ＋ `cls.` 引用（不提到模块级：两个常量是 `WireService` 的私有合同细节，本文件无模块级常量先例，且四处调用点**一字不改**）；② **返回键**：`_PROVENANCE_COLUMNS{field→column}` → **`_PROVENANCE_FIELDS`（四个 wire 字段名）**，列名归属留在 `repository.py`（不改名会留一个说谎的常量：它的值在修完后无人再读，名字却仍承诺做列映射；改前 grep 证明只有 `handlers.py` 与该工单文本命中）；③ **错误族**：`INVALID_PARAMS` 不在 `FAMILIES` 12 项闭集 ⇒ 两条**拒绝路径自己也是 500**（101 的缺陷族，101 §Scope 明写这两处划给 098）⇒ 改 `INVALID_REQUEST`，消息文本逐字未动 | 三个枚举值与四个存储列名**逐字未动**；不带 provenance 的路径逐字未动（`provenance is None` 保持"缺席即未知"）。全仓 90 个字面 `WireError(` 构造点扫完：射程内非法家族清零，剩 `handlers.py:1195`/`:1243` 两处原样带进 101 ⇒ **2 个字面点＝101 点名的 5 个方法** | **0 次 / ¥0** | `7f70440` |
| 098 | 3 门（11 条） | `tests/server/test_provenance_wire_098.py` **11 条全部驱动真实 wire**。G1＋G2：create 四字段读回、**再换一次独立调用（`providerModels.list`）读一遍**（回声骗不过去）、update 只给一个字段 ⇒ 其余三个保持；G4：不带 provenance 仍 `None`；G3：未知字段 / 枚举外值 / 非对象载荷三条都必须 `http=200` ＋ `INVALID_REQUEST`；第三个方法 `probeModels` 带 provenance 必须类型化不是 500；另加一条单独钉第二缺陷（返回键与四个列名**交集为空**）。**反例不止在文件里**：整份门拿去咬两种源码（把 `src/agent_box` 复制到 `/tmp` 只替换副本里的 `handlers.py`，工作树一字未动，跑完核实目录缺席）⇒ 旧代码 **10 failed / 1 passed**（唯一绿的是"不带就保持缺席"，它守的本来就是没坏的那条路）；**"只修作用域"的半修法 8 failed / 3 passed**，红的正是三条接受/读回与三条拒绝族 ⇒ **工单 §Scope 设想的那一行改法会自认"201 做完了"，实际 11 道门里 8 道不过** | 定向 `11 passed in 5.59s`。另与**已锁工件**对一遍（`AGENT_BOX_WIRE_SCHEMA`）⇒ 9 passed / 2 failed，两条失败都是工件漂移不是代码缺陷（`update#params` 与 `probeModels#params` 未声明 `provenance` 而服务端接受）⇒ 交 102；工件反成第三证人：`create#result` 的 provenance 子对象就是驼峰四键＋同三个枚举，`WireError.code` 的 enum 就是那 12 项家族 | **0 次 / ¥0** | `fb31cf5` |
| 098 | 4 真机复跑 + 计数 + 账 | **真监听复跑**（`build_runtime(临时根)` → `create_app` → `uvicorn.Server` 真 bind `127.0.0.1` 随机端口 → `urllib` 真发，`lifespan="on"`）：带四个合法 provenance 的 `create` ⇒ **200 且四字段原样读回**；紧接着**另开一次 `list`** 再读 ⇒ 落库确认（不是同一次响应的回声）；未知字段 / 枚举外值 ⇒ **200 ＋ `INVALID_REQUEST` ＋ 逐字消息**；`update` 只给 `fieldsSource` ⇒ 四字段齐全、其余三个保持；不带 ⇒ `None`；`probeModels` 带 provenance ⇒ `200 {status:failed, code:PROBE_UNREACHABLE}`（本机 discard 端口，未出站）；`server.hello` 顺带 200（097 的成果没被本单碰坏）。跑完 `TEMP_ROOT_ABSENT True`。**工单 §Validation 那条"对试用 Server 发"没做**，两条理由与"要人拍"登记见证据 §9.1/§10 | 全套件（在 `fb31cf5` 上）：`tests/server -q` **672 passed in 444.11s**、`tests/ -q` **972 passed in 358.34s**，0 失败 0 跳过；**672=661＋11、972=961＋11** ⇒ 两条都只长了本单新增的份数。差量（docstring 一段散文）由定向跑覆盖：`098＋097＋test_wire_v1` **55 passed**。`validate_order.py --strict` 30 OK / 31 FAIL（FAIL 恰为 37…67）；`git diff --check` 干净 | **0 次 / ¥0**。全程只有本机回环与 SQLite；`api.deepseek.com` 只是**一次 create 的字段值**，从未被解析、从未被连接；凭据 locator 未访问；三处临时根与两处 `/tmp` 旧码副本全部核实删除 | 本提交（阶段 4） |
| 098 | **终态 `PROVENANCE_500_DONE`** | 门：G1 带合法 provenance 的 create/update 不再 500（真监听复跑＋11 条门）；G2 四列写入且 `project()` 读回一致——**这条是本单真正的门**，它同时否决了"只修作用域"的半修法（8/11 红）；G3 未知字段与枚举外值都**真的被类型化拒绝**（不是 500、不是静默接受），另加非对象载荷一条；G4 不带 provenance 的路径与全套件计数不变（672/972 恰 ＋11）。反例三条真跑：旧代码 10 红 / 半修法 8 红 / 文件内两条进程内 monkeypatch。**摘要**：`_provenance` 的作用域、返回键、错误族三处一起改，provenance 面从"一用就崩"变成"能写能读、拒绝是类型化的"，前端 P28 的来源标注有了能用的上游。**费用**：0 次模型 / ¥0。**清理**：无源码外产物。**未做项（逐条点名）**：① 工单 §Validation 的"对**试用 Server**"那一腿——在跑的实例是本单修复之前构建的，对它复现只会再量一次 500，需要**先从本树重建部署**，且会往用户数据根留一条 Provider 记录 ⇒ 属部署动作＋要人拍，不是代码缺口；② `providerModels.update#params` / `probeModels#params` 在**已锁工件里仍没有 `provenance`**（守合同的客户端至今发不出这条腿）⇒ 交 102 重锁；③ `probeConnection` 里那个永远拿到 `None` 的死调用点未删（删它是改语义）⇒ 交 103 的覆盖面自然照出；④ 097 §9 那句"本树没有生成的 wire 工件"是**我找错目录得出的错结论**，已在 097 证据里就地更正（工件在 `docs/server-round1/fullstack/generated/wire-v1.schema.json`，且只覆盖 33/64 个方法） | 同上行 | **0 次 / ¥0** | 本提交 |

## 工单 104 — 探测出站的 SSRF 两条绕过 ＋ 凭据随行（安全；2026-09-19，执行者）

> **已收口**：终态行在本节末尾。阶段 1 与 4 与 5 各一次提交，阶段 2＋3 合一（理由见本节末注）。
> 证据：[probe-ssrf-hardening-104.md](../server-round1/fullstack/probe-ssrf-hardening-104.md)

| 单 | 阶段 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 104 | 1 观测 | 两条绕过都在**公开入口**上实测（不只私有 helper）：① 字面私网被拒（`https://169.254.169.254`、`https://10.255.255.254` ⇒ `PROBE_ENDPOINT_BLOCKED`），**同一地址换成域名就通过**；把 `socket.getaddrinfo` 换 tripwire 数出来：`_validate_endpoint` 期间 **0 次解析**，`pull_models` 全程只有 **1 次且发生在连接层**，返回值没人看 ⇒ 拒绝与否取决于 URL 写法而不是目标是否内网；② 本机起两个回环假端点，A 回 302→B：`出站请求总数 = 2`、**二跳带 `Authorization: Bearer <同一假值>`**（合同说一次）。**工单没写的第三条（撞出来的）**：`getproxies()` 在本机非空 ⇒ 探针走默认 opener 就交给系统代理——`https` 腿代理只见 `CONNECT host:443`（看不到头），`http` 腿代理收到**绝对 URI ＋ 明文凭据**并且 `pull_models` 回 `ok/1 model ids`（Server 以为在探声明端点，实际整次对话由中转方完成）；按本机真实代理环境跑"302→`http://169.254.169.254`"：跳 1 直连被记录、**跳 2 离开本进程由代理代跑**（回 502——是那个外部进程不放行，不是我们的代码拒绝） | 无新增测试。既有面核对：唯一的 SSRF 门 `test_usage_parsing.py:392-404` **只喂字面 IP**（3 个都不是域名），全仓 tests/ 里 **302/redirect 零命中** ⇒ 与 098/099/101 同一形状：实现有门、门只走一条腿。出站清扫表：Python 侧带凭据出站**只有 `probe.py:94`** 一处；`workers/**` 零命中；JS 三处不是同一威胁模型（表在证据 §4） | **0 次 / ¥0**（凭据只用字面假值；目标只有 127.0.0.1 与一个从未被解析的 `.invalid`/`.example` 名字；tripwire 让"解析"这一步也不出本机） | 本提交（阶段 1） |
| 104 | 2＋3 修（一跳 opener ＋ 解析复检） | **阶段 2**：`_open_request` 改用模块级 `_OPENER = build_opener(_OneShotRedirect(), ProxyHandler({}))`——`redirect_request` **抛 `HTTPError`** 而非返回新请求 ⇒ 第二跳**没有发起的机会**；系统代理彻底不参与。实测（回环 A 回 302→B）：`PROBE_ENDPOINT_BLOCKED`、**A 侧 1 次 / B 侧 0 次**、凭据没跟到二跳；并**把 `http_proxy` 故意指到 A 自己**，A 记到的请求行是原点形式 `/models` ⇒ 代理没被用（不是"用了但恰好同一台"）。顺手修掉一个会骗人的地方：`_typed_http_error()` 定义了却**零调用者**（内联另有同款映射），3xx 分支只有统一走它才真生效。**阶段 3**：`_validate_endpoint` 的"`ip_address(host)`，`ValueError` 就跳过"换成 `getaddrinfo` ＋ **对全部答案**复检（环回豁免；私网/保留/多播/链路本地拒），解析失败仍回 `PROBE_UNREACHABLE`（不新增码；3xx 也复用 `PROBE_ENDPOINT_BLOCKED`——新增码要动 wire 词汇，不是一张修 bug 的单顺手做的事） | 两条既有测试因语义变严而各补一行 `getaddrinfo` 桩（它们只打桩 transport 却用不存在的名字；**断言一字未动**），改前 `2 failed / 69 passed`、改后 **`71 passed`**。阶段 3 的八行判定全部**打桩解析、零 DNS 零出站**：IMDS 域名 / 公网+内网混合 / `fe80::1` ⇒ 三类都 `PROBE_ENDPOINT_BLOCKED`；仅公网、字面私网、`ftp://`、回环正例四类的既有结论一字未变 | **0 次 / ¥0** | 本提交（两阶段合一，理由见下） |
| 104 | 4 门（15 条，全部门都数请求） | `tests/server/test_probe_egress_104.py` **15 条**，每条连的都是本机回环 `ThreadingHTTPServer` 假端点，断言"谁收到几条、请求行长什么样、带没带 `Authorization`"。G1 四条：类型化 `PROBE_ENDPOINT_BLOCKED`、**源站 `count==1` 且目标站 `count==0`**（"跟完再抱怨"过不了）、凭据只到源站、`probe_connection` 同一条腿；§2 那条旁路两条：假代理 `count==0` ＋ 声明端点记到的**不是绝对 URI**，再把 `urllib.request._opener` 换成"一用就抛"证明它有自带 opener；G2 三条：域名→IMDS 拒（**且 `create_connection` 记录为空**——"拒了但还伸手"过不了）、公网＋内网混合拒、`fe80::1` 拒；G3 四条：字面私网结论一字未变、仅公网名字在连接被打桩时**仍通过校验**（"通过"只能来自判定放过）、`gaierror` 仍 `PROBE_UNREACHABLE`、两条公开入口端到端 `ok`/`reachable`、`ftp://` 在"`getaddrinfo` 一被调用就抛"下仍被拒（顺序没挪）；G4 一条：全文件 DNS 流量就是两张列表（问过的名字 ⊆ 自表；直接答的数字 ⊆ 声明常量）。**反例真跑**：整份门拿去咬 `d2b2036` 的旧 `probe.py`（`/tmp` 副本，工作树未动，跑完核实删除）⇒ **9 failed / 6 passed**，红的正是 G1 四条＋判定三条＋默认 opener 那条，且其中一条红成 `attempted to connect to ('127.0.0.1', 7897)`——**旧代码在测试里就把请求交给了本机代理**。**代理那条在旧码跑里是绿的，原因写明**：旧码用 `urlopen` 的默认 opener，那是进程内首次使用时的快照，后面的 `setenv` 不起作用 ⇒ 它的反例在阶段 1 §2.2/§2.3（修复前代码上实测），门这边留的是"修完不许复发" | 定向 `15 passed in 6.66s`；`tests/server -k "probe or usage or provider or model"` **71 passed**（两条既有夹具补了 `getaddrinfo` 桩，断言未动）；全套件见终态行 | **0 次 / ¥0**，且这不是记账是**机制**：桩对表外名字一律 `gaierror`、`create_connection` 一律"记录并抛"，真发一次就红 | 本提交（阶段 4） |

> **阶段 2 与 3 合一提交（`e036d60`）的理由**：两处改动落在**同一个文件的同一函数区**
> （`_validate_endpoint` 与 `_open_request`/`_typed_http_error`），拆开必须靠"改—回退—再改"来造两个提交，
> 而章程禁止对工作树做那种编辑再恢复；两道的门本来也各自独立（G1 走 opener、G2 走解析）。
> 证据里 §7 与 §8 是分开记的，各自带实测。
| 104 | 5 账与清理 | 计数：门 `15 passed in 6.66s`；`tests/server -q` **687 passed in 332.20s**（687 = 672 ＋ 本单 15）；`tests/ -q` 第一轮 **1 failed / 986 passed in 489.39s**、复跑 **987 passed in 298.45s**（987 = 972 ＋ 15）；`validate_order.py --strict` 30 OK / 31 FAIL（FAIL 恰为 37…67）；`git diff --check` 干净。**那一条红不是本单的回归，按事实记三行**：红的是 080 的反例门 `test_without_the_gate_the_same_first_runs_overlap`（断言"没有锁则两次冷跑时间窗必相交"，相交与否是线程时序）——同一份源码在 `tests/server` 那一腿 687 全绿（该文件含在内）、单跑该文件 3×5 passed、加 `tests/integration` 一起 74 passed、出问题那轮用时 489.39s 而同机前后是 358.34/374.66s 且无并发复跑只用 298.45s ⇒ 指向负载拉长时序（与 R-0023 点名的 11 GB 瓶颈一致）。**本树没有为让门绿改那条断言**，已连同"它需要一个不看墙钟时间的写法"登记进 §待开单 | 见上行 | **0 次 / ¥0，且是机制不是承诺**（表外名字一律 `gaierror`、需要它的用例把 `create_connection` 换成"记录并抛"，真发一次就红）；凭据 locator 未访问，全程只有一个字面假值；`/tmp/104-oldcode` 与三个临时根逐一核实删除 | 本提交（阶段 5） |
| 104 | **终态 `PROBE_SSRF_HARDENING_DONE`** | 门：G1 不跟随（3xx ⇒ 类型化 `PROBE_ENDPOINT_BLOCKED` **且源站计数恰 1、目标站 0**）；G2 解析复检（域名→IMDS／公网+内网混合／`fe80::1` 三类全拒，且**没有一次 connect 发生**）；G3 回归（字面私网、`ftp://`、`gaierror→UNREACHABLE`、两条公开入口端到端 `ok`/`reachable` 逐条钉住）；G4 零真机成本由机制保证。反例真跑：整份门咬 `d2b2036` 的旧 `probe.py` ⇒ **9 failed / 6 passed**（绿的六条各自说明理由，其中代理那条按事实写明"在旧码跑里为什么是绿的"、它的反例在阶段 1 §2.2/§2.3）。摘要：**探针的"一次、且只到声明的端点"从模块自述变成可证的事实**——不跟 3xx、不用系统代理、看解析结果而非名字写法；顺带修掉一个会骗人的地方（`_typed_http_error` 曾是零调用者，错误映射有两份）。费用 0 次 / ¥0。清理无源码外产物。**未做项（逐条）**：① **DNS 重绑定窗口不消除**（校验解析一次、连接再解析一次）⇒ 需要把已校验地址带进连接层＋TLS 测试桩，已登记 §待开单并交回；② **CGNAT `100.64.0.0/10` 仍可通过**（`ipaddress` 四旗标全 False，实测 §8.1）⇒ 语义裁决，不自扩拒绝集；③ 工单 §Scope 写的正例是"合法 **https** 端点（本地假服务）成功"，本机没有 TLS 桩（环回例外只放 `http`）⇒ 正例用的是**环回 http 例外**这条合法路径，https 侧只到"通过校验"（`test_a_public_name_still_passes_the_endpoint_check`）；④ 代理腿的反例是阶段 1 的两处一手测量而非进程内门（原因写明在 §9.2） | 同上行 | **0 次 / ¥0** | 本提交 |

## 工单 105 — `server.hello` 声明已注册的 harness 家族（2026-09-19，执行者）

> **已收口，终态 `HELLO_HARNESSES_DONE`**：先按当时事实判 `PARTIAL`（重锁不在本树射程），
> 桌面 settings 线落地 `ed6592b7` 后就地改判并登记摘要——见本节末的更正行与证据 §12。
> 证据：[hello-declares-harnesses-105.md](../server-round1/fullstack/hello-declares-harnesses-105.md)

| 单 | 阶段 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 105 | 1 观测 | 真监听 `hello`（注册表里放三个家族、故意乱序注册）⇒ 顶层仍是 `['auth','capabilities','protocolVersion','serverId']`、**没有 `harnesses`**、`capabilities` 64 条（097 完好）。注册表侧一手：`registered()` 的实现是 `tuple(sorted(self._descriptors))`，实测 zeta→alpha→mido 的注册顺序回来是 `('alpha','mido','zeta')` ⇒ **工单 §Scope 要的"稳定排序（按 id）"注册表本来就给**，handler 里不该再排一次。`HarnessDescriptor` 字段逐个读（`dataclasses.fields`）：`harness_type` 必填、`credential_kind`/`model_control_id` 默认 `None`、另有 `credential_environment`/`capability_claims`/`control_options`/`security_locked_controls`；**`wire_protocols` 这个字段不存在**（`hasattr == False`）⇒ 工单 §Current state 那行（"描述符已带 wire_protocols，来自 092 修订"）**与实不符**，092 在 runtime 线尚未落地 ⇒ 本单只暴露 `{id, credentialKind?, modelControlId?}`，**不发明** `wireProtocols`。**默认组合 `build_runtime()` 注册 0 个家族** ⇒ G3 的 `[]` 不是人造用例；真机家族来自部署文档（`bootstrap/runtime.py:491-499` 逐条读 `id`/`modelControlId`/`credentialKind`——正是本单要暴露的两个可选键；该文件按 R-0023 属 runtime 线，本树只读不写） | 无新增测试；`handlers.py:282` 证明 `WireService` 已持有注册表（`self.harnesses`），不需要新注入 | **0 次 / ¥0**（只发本地发现方法；凭据 locator 未访问；临时根核实删除） | 本提交（阶段 1） |
| 105 | 2 加字段 | `hello()` 的返回多出 `harnesses`，来源**只有注册表**（`self.harnesses.registered()` ＋ `get(id)`；`WireService` 本来就持有注册表 `handlers.py:282` ⇒ 无新注入）。三条决定各给理由：**不在 handler 里再排一次**（`registered()` 已是 `tuple(sorted(...))`，两处排序迟早分叉，顺序的真相只能有一个持有者）；**`None` 就不给键**（给 `null` 会把"没声明"和"声明为无"混成一件事，破坏 §必须保持不变的"缺席即未知"）；**只出 `{id, credentialKind?, modelControlId?}`**（`credential_environment`/`control_options`/`capability_claims`/`security_locked_controls` 是实现细节不是目录）。**真机复跑**（uvicorn 真 bind ＋ `urllib` 真发两次）：乱序注册的 zeta→alpha→mido 出去是 `alpha(全声明)/mido(只 credentialKind)/zeta(只有 id)`，两次 `json.dumps` 逐字节相同，顶层五键、`capabilities` 仍 64 条 | 定向：`097 ＋ 098 ＋ test_wire_v1 ＋ 本单` **65 passed**（7＋11＋37＋10）⇒ hello 的既有消费者一个没掉；全套件见终态行 | **0 次 / ¥0**（只发本地发现方法；凭据 locator 未访问；临时根 `TEMP_ABSENT True`） | 本提交 |
| 105 | 4 门（10 条） | G1 三条：条目集合**等于** `registered()`（不是写死名单）、两次调用逐字节相同且**不等于**注册顺序、**摘掉一个家族名单跟着变**（该用例先建一条引用 `alpha` 的 Profile 记录 ⇒ 派生自记录的写法会留下 `alpha` 又丢不掉 `mido`，一条门同时钉住"来源是注册表"）。G2 两条：键集 ⊆ 三键 ＋ 整段 JSON 小写扫 13 个特征词（`credentialenvironment`/`adapter`/`controloptions`/`capabilityclaims`/`securitylockedcontrols`/`sha256`/`digest`/`c:\`/`/home/`/`/mnt/`/`.agentbox`/`token`/`secret`）一个不许有；家族 id 与 `capabilities` 的 id **交集为空**（§明确不做 ①）。G3：空注册表 ⇒ `[]` ＋ 200 ＋ `capabilities` 仍 64。G4：**拿已锁工件校验真响应，必须抛错且消息含 `harnesses`**——把"还没重锁"变成机器可读的现状而不是散文承诺。回归一条：顶层键恰为旧四件＋新键、`protocolVersion`/`auth` 逐字不变、每行仍是 `{id, supported(+reason?)}` 且条数==派发表长度。**反例真跑**：整份门咬 `f9bc012` 的 `handlers.py`（`/tmp` 副本，工作树未动，跑完核实删除）⇒ **10 failed / 0 passed**，连"工件仍拒绝新键"也红（旧码没有该键 ⇒ 响应恰好通过旧工件校验）——这正说明 G4 的两半是一件事：**字段存在**与**工件放行**必须一起成立 | 定向 `10 passed in 3.91s`；见上行的 65 passed 组合跑 | **0 次 / ¥0** | 本提交 |
| 105 | 5 账与终局 | 计数：门 `10 passed in 3.91s`／旧码 `10 failed`；`tests/server -q` **697 passed in 269.87s**（=687＋10）；`tests/ -q` **997 passed in 289.77s**（=987＋10，本轮无并发全量）；`validate_order.py --strict` 30 OK / 31 FAIL（FAIL 恰为 37…67）；`git diff --check` 干净。**终态 `HELLO_HARNESSES_PARTIAL`**——差的只有 G4 的一半：字段、排序、空态、不泄漏、反例、真机响应全绿，但**重锁要改的是前端树的 TS 权威与由它导出的工件**，本树既没有生成器（全树 grep 命中为零）也没有写权（工单 `forbidden` ＋ R-0023 线切分）⇒ 不拿"改本树的 33 方法证据副本"冒充重锁。交出去的是可直接采纳的 `harnesses` schema 片段（§8，`required:["harnesses"]`、条目 `required:["id"]`、`additionalProperties:false`）＋ 当前三个摘要（TS 权威 `1019b38b06…`、前端工件 `1a3604ee9d…`、本树副本 `a1bd52a4fb…`）＋ 一条会自动找上门的门：现在它要求"工件必须拒绝新键"，重锁完成后它变红，**把它改成正向校验那一步就是重锁完成的凭据** | 同上行 | **0 次 / ¥0**；临时根与 `/tmp` 副本全部核实删除 | 本提交 |

| 105 | **更正行（同一执行者，稍后）** | **终态改判 `HELLO_HARNESSES_DONE`**。桌面 settings 线把 G4 那一半做了（`ed6592b7`，2026-09-19 11:44：`wire-v1.ts` ＋14、其测试 ＋35、生成工件 ＋21、`contracts/wire-v1/README.md` 同步）。**不采信公告文字**，从对方 commit 里取出工件一手核对：`hello#result.properties` 已是 `['auth','capabilities','harnesses','protocolVersion','serverId']`，条目 `{id, credentialKind?, modelControlId?}`／`required:["id"]`／`additionalProperties:false` ⇒ 与本单发射形状**逐键相同**；两摘要登记为 **工件 `c4255b31dba1…`／TS 权威 `58d61ebb3593…`**（`ed6592b7`）。本树动作：把重锁后的工件**原样**放进证据副本路径（覆盖 33 方法的陈旧副本 `a1bd52a4fb68…`，其摘要与缺口留在证据 §4 表里可查），门里**按摘要钉住**该文件 ⇒ "两棵树说的是同一份工件"成为断言。§9/§10 的 PARTIAL 判定**不删**：那一刻工件确实没有这个键、本树也确实没有生成器，世界变了就改判并留痕迹 | 门随之翻转（正是 §10 预告的那一步）：`仍拒绝新键` → `重锁工件接受服务端所发`（摘要比对 ＋ 真响应过 schema）**＋ 三条篡改反例**（多一个 `credentialEnvironment` 键／`credentialKind` 写成 `null`／去掉 `id` 都必须被拒）——**没有删反例**，只是把它从"合同还没宽"换成"合同宽了但仍是笼子"。复跑：`AGENT_BOX_WIRE_SCHEMA=<重锁工件>` 下本单门 **13 passed**、`test_wire_v1.py` **37 passed**（既有 wire 全套对新锁仍一致＝081/21 那套登记动作补上）；全套件计数见 101 终态行（同一份源码） | **0 次 / ¥0** | 本提交 |

## 工单 101 — 五个合同方法必然 500（错误族被内部码顶位）（2026-09-19，执行者）

> **已收口**：终态行在本节末尾；阶段 1 与 2＋3＋4 与 5 各一次提交（2/3/4 合一，理由见本节末注）。
> 证据：[wire-error-family-500-fix-101.md](../server-round1/fullstack/wire-error-family-500-fix-101.md)

| 单 | 阶段 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 101 | 1 观测 | 默认组合上五方法**逐个实测**全 500（`raise_server_exceptions=False`，参数按 `_PARAM_SHAPES` 给全）⇒ 工单事实成立。**但五个不是同一缺陷的五个副本**：注入真实现（`UsageAggregator(runtime.repository)`／`ArtifactStore(root)`，构造签名 `inspect.signature` 一手读）后 `usage.aggregate`/`usage.export`/`providerArtifacts.list` 变 **200 带真结果**，而 `install`/`rollback` **仍 500**。第二堵墙之一：`providerArtifacts.install` **今天两条路都堵死**——不带 `digest` ⇒ `KeyError: 'digest'`（500）；带 ⇒ `INVALID_REQUEST: unexpected digest`（形状表没这个键）⇒ **不存在任何请求能让它成功**；且漂移方向可判：权威工件 `install#params` 的 `required` **本来就有 `digest`** ⇒ 是服务端形状落后，补它＝对齐既有合同（与 105 相反：那是往合同里加新键 ⇒ 必须重锁）。第二堵墙之二：三个 `provider_artifacts_*` 方法体里 `try:`/`ServerError`/`ArtifactStoreError` 捕获**全无**，而 `ArtifactStoreError(RuntimeError)` 不是 `ServerError` ⇒ 两类**用户可犯的错**（`ARTIFACT_DIGEST_MISMATCH`、`ARTIFACT_VERSION_MISSING`，两者一手复现）今天都是 500。家族账：90 个字面 `WireError(` 构造点全扫，非法只剩 **2 处**（`_artifact_store()` 一处顶三个方法、`usage_aggregate` 一处顶两个，因 `usage_export` 是 `return self.usage_aggregate(params)`）⇒ **2 点＝5 方法**，本单报告按方法给结果、按点给改动 | 无新增测试；098 交回的 `INVALID_PARAMS` 两处**已由 098 修掉**，归属在此确认不重做 | **0 次 / ¥0**（全程本地 SQLite 与临时目录；凭据 locator 未访问；两次观测的临时根核实删除） | 本提交（阶段 1） |
| 101 | 2＋3 修（家族位 · 形状 · 映射 · 组合面核对） | 五处改动：`_artifact_store()` 与 `usage_aggregate` 的守卫把内部码从**家族位挪进 `details.internalCode`**（与 `from_server_error` 的收敛语义逐字一致，`errors.py:121`）；`_PARAM_SHAPES["providerArtifacts.install"]` 必填集补 **`digest`**（值仍过 `_bounded(...,128)`）；三个 `provider_artifacts_*` 各加 `try/except ArtifactStoreError → _artifact_error`；新增模块级 `_ARTIFACT_FAMILIES`：`*_VERSION_MISSING`/`*_SOURCE_MISSING`→`NOT_FOUND`、`*_VERSION_EXISTS`→`CONFLICT_REQUEST`（依 `errors.py` 里 `ENTERPRISE_STATE_CONFLICT` 的先例）、其余→`INVALID_REQUEST`，一律带内部码。**没新增家族、没改信封形状**。**阶段 3 的组合面核对结论**：零个组合注入这两个服务（`bootstrap` 连 import 都没有 ⇒ 修后 wire 对这五个说的是"这台服务没有这个面"＋哪个面，而不再是"内部错误"——这正是 097 交回那条的另一半） | 装配点 `bootstrap/**` 按 R-0023 属 runtime 线 ⇒ 本单**不做装配**，交回；工件一律未触碰（`digest` 是服务端落后于既有权威，102 同步时会看到两边已一致） | **0 次 / ¥0**（本地 SQLite ＋ 本地假 store ＋ 字面假摘要；凭据 locator 未访问） | 本提交（与阶段 4 合一，理由见本节末注） |
| 101 | 4 门（17 条） | `tests/server/test_wire_error_family_101.py`：G1 参数化**五个各一次**（必须 `http=200` ＋ `UNAVAILABLE` ＋ 两个内部码之一）、G1 另一半是"注入真实现后拿到**真结果**"（不是永不报错式假绿）；G2 两条：文本扫 `handlers.py` 全部字面 `WireError(` 第一参⇒非法集为空 **且** 每个名字**真的构造**一遍、`FAMILIES` 仍是 12 项；§4 两类用户错 ⇒ `NOT_FOUND`/`INVALID_REQUEST`＋内部码；第二堵墙两条（形状含 `digest`、缺它是类型化拒绝不是 `KeyError`）；第三族在映射上断言（真装一版需两侧算出同一摘要，那属 57 的测试面）；**反例两条**：进程内换回旧守卫 ⇒ 回到 500、换回旧形状 ⇒ `KeyError` 又变 500（钉住"只修家族位不够"）。**整份门咬 `90a11cb` 的旧码**（`/tmp` 副本，工作树未动，跑完核实缺席）⇒ **13 failed / 4 passed**，四条绿的各有理由（`FAMILIES==12` 本单没改；两条"注入后可用"旧码也确实可用；反例 A 与源码版本无关），不是漏网 | 定向 `17 passed in 5.33s`；**真监听复跑**（uvicorn 真 bind ＋ `urllib`）：无服务时五个各 200＋类型化 `UNAVAILABLE`，注入后三个真结果＋两个类型化用户错，**没有一条是 500**；顺带 `server.hello` 200／`capabilities` 64／`harnesses: []` 说明 097/098/105 没被碰坏 | **0 次 / ¥0** | 本提交 |
| 101 | 5 账与终局 | 计数（工作树 = `f3dcea7` ＋ 同时未提交的 105 更正，即与本树最终源码同一份）：门 `17 passed in 5.33s`；`tests/server -q` **717 passed in 285.83s**；`tests/ -q` **1017 passed in 335.92s**，**0 失败 0 跳过**；算术 `717 = 697 ＋ 101 的 17 ＋ 105 更正净增 3`、`1017 = 997 ＋ 17 ＋ 3`。另记：`tests/ -q` 在 `f3dcea7` 上的**上一轮**是 1 failed / 986→1013 passed，红的那条是 080 的负载敏感反例门（同一文件本轮全绿，见证据 §12）。`validate_order.py --strict` 现在 **61 FAIL**（此前 30 OK/31 FAIL）——**本单引入 0 条**，多出的是 12:40 校验器新规则要求显式声明并行度（证据 §13，已登记 §待开单，且调度者当场开始逐份补） | 见上行 | **0 次 / ¥0**。全程本地 SQLite ＋ 本地临时假 artifact store；凭据 locator 未访问；`digest` 是字面假摘要；三处临时根与 `/tmp/101-oldcode` 逐一核实删除 | 本提交 |
| 101 | **终态 `WIRE_ERROR_FAMILY_FIX_DONE`** | 门：G1 五个方法在无服务组合上各回**类型化信封**（`UNAVAILABLE` ＋ `details.internalCode`）而不是 500、注入服务后三个拿到**真结果**；G2 `handlers.py` 里所有字面 `WireError(` 第一参 ∈ 12 家族（文本扫描 ＋ 逐个真构造），且 `len(FAMILIES)==12` 被钉住；G3 两类 store 用户错（摘要不符、回滚未装版本）⇒ `INVALID_REQUEST`/`NOT_FOUND` ＋ 内部码；G4 回归 717/1017。反例**四条**真跑：进程内换回旧守卫 ⇒ 500、换回旧形状 ⇒ `KeyError`→500、整份门咬 `90a11cb` 旧码 ⇒ **13 failed / 4 passed**（四条绿的各有理由）、真监听两遍（无服务＝五个全类型化；注入后＝三真结果＋两类型化用户错，**没有一条 500**）。**摘要**：五个登记合同方法从"任何组合上必 500"变成"没有这个面就明说没有、有就给真数据、用户错就点名"；顺带挖出并修掉**工单没写的两堵墙**（`install` 因形状缺 `digest` 而两条路都堵死；三个 `provider_artifacts_*` 零错误映射）；`digest` 是**服务端形状落后于既有权威**，补它不扩词汇、不需重锁。**费用**：0 次 / ¥0。**清理**：无源码外产物。**回填前端交回项**：P26（Providers 页）当年实测到 live 500 并转后端、一直无人接手的那条 ⇒ **本单交付**，`usage.aggregate`/`usage.export`/`providerArtifacts.*` 现在回类型化 `UNAVAILABLE`（内部码在 `details`）而非 500；**前端树由前端执行者自己改**（本树 `forbidden`），故此处只回填事实。**未做项（逐条）**：① **不装配**——`bootstrap/runtime.py` 从不 import 这两个实现，装不装是产品裁决且该文件属 runtime 线 ⇒ 交回；② `CONFLICT_REQUEST` 那条族只在**映射**上断言（真装一版需两侧算出同一摘要，属 57 的测试面）；③ 已锁工件里 `update#params`/`probeModels#params` 仍缺 `provenance`（098 交回、102 射程，本单一手复核两侧一致地缺） | 同上行 | **0 次 / ¥0** | 本提交 |

> **101 的阶段 2/3/4 合一提交（`f3dcea7`）的理由**：三处改动都落在
> `src/agent_box/server/wire/handlers.py` 的**同一批方法体**里（守卫、`_PARAM_SHAPES`、三个
> `provider_artifacts_*`），拆开需要"改—回退—再改"地动工作树，章程不允许；证据里 §7／§8／§9 仍分段记，各自带实测。
> **104 的阶段 2/3 合一提交（`e036d60`）**同理（同一文件同一函数区），其账见该节末注。

## 工单 103 — 元门：每个已登记方法至少被真实 wire 驱动过一次（2026-09-19，执行者）

> **收口**：本记阶段 1–4 与终态行，终态 `WIRE_DRIVE_COVERAGE_DONE`。
> 证据：[wire-drive-coverage-103.md](../server-round1/fullstack/wire-drive-coverage-103.md) ＋ 生成的账 [wire-drive-coverage.md](../server-round1/fullstack/wire-drive-coverage.md) ＋ 豁免册 [wire-drive-exemptions.md](../server-round1/fullstack/wire-drive-exemptions.md)

| 单 | 阶段 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 103 | 1 观测（前提核对） | 三个口径一手复算：派发表 **64**；只算 `test_wire_v1.py` ⇒ 驱动 **28** / 缺 **36**（与工单 §Current state 逐字相同）；把整个 `tests/` 当语料 ⇒ 驱动 **64** / 缺 **0**。⇒ 工单那句"36 从未被驱动"要读作"**在那个门文件里**从未被驱动"：`assets.*`/`hooks.*`/`accounts.*`/`profiles.clone|setPermissions|memory|subagent*`/`executions.list`/`workspaces.gitStatus`/`sessions.switchProfile`/`providerModels.probe*` 都在各自单的文件里被真 wire 驱动过（逐条 file:line 在生成的账里）；真正"本批之前零驱动"的是 101 那五条，其唯一证据就是 101 补的文件 | 无新增测试（本阶段是扫描器与前提） | 0 次 / ¥0（读文件，不执行文件） | 与本提交合一 |
| 103 | 2 元门＋反例 | 扫描器 `scripts/server-round1/wire_drive_coverage.py`：判"驱动"要求方法名出现在**请求驱动的调用位置**（`ok(`/`err(`/`call(`/`_wire(`/`_wire_post(`/`post(`/`wire(` 或 `"/wire/v1/<m>"` 字面量）且该文件含 `/wire/v1/`（多行调用点回看 3 行）；**数据字面量不算**。门 9 条见证据 §4。**造工具时自己踩的两个坑都由门逮住**：① 按 12 空格缩进的正则解析派发表 ⇒ **静默只数到 54/64**（正是 097 手写表那种"看起来全其实少"），改读 AST（且必须认 `AnnAssign`）；② 方法名首段是驼峰（`providerModels.*`/`sendOutcome.*`）⇒ 正则 `[a-z]+\.` 让账**无声少 4 行**。两条都留下对应门：解析集合必须 == 活运行时 `runtime.wire._handlers` 键集合且为 64；账与生成器逐行相等（方法集合／引用路径存在／条数列非零）。**能咬**：把 `usage.aggregate` 唯一的证据文件从语料里拿掉 ⇒ 缺口立刻出现（门里点名用它，不用随机一条） | 定向 `9 passed in 4.20s` | 0 次 / ¥0 | 与本提交合一 |
| 103 | 3 覆盖 / 4 豁免册 | 本单**不新写覆盖**（前提见 §1：按整个 `tests/` 扫已无缺口）、**零条豁免**。豁免册因此写成"为什么是空的"——工单要的是"没有证据必须有理由"，实测下来是"没有需要豁免的东西"，而空册本身也被门钉：每行必须三格（理由/类型/复验条件），且**能被驱动的方法不许进册**（防止它变成缺口收容所）。同时留了一条方向相反的证明：临时语料里三种数据字面量（tuple/dict/list）证据必须为 0，而同文件那条真 `"/wire/v1/sessions.send"` 必须为 1 ⇒ 规则不是"什么都不算"也不是"什么都算"。观察名单进账：**45/64 个方法只被一个文件驱动**（删掉即成缺口） | 全套件见终态行 | 0 次 / ¥0 | 与本提交合一 |
| 103 | **终态 `WIRE_DRIVE_COVERAGE_DONE`** | 门：**G1** 账 64 行齐全且每行有证据（实测**零缺口 ⇒ 零豁免**，而空册本身被门钉：每行三格、能被驱动者不许进册）；**G2** 元门＝`_handlers` 键集合 ⊆ 证据 ∪ 豁免，差集非空即红并**点名方法**，反例两条真跑（藏掉 `usage.aggregate` 唯一的证据文件 ⇒ 缺口立刻出现；账里删一行 ⇒ 逐行相等门红）；**G3** "驱动"的口径能咬两边——tuple/dict/list 三种数据字面量证据必须为 **0**，同文件那条真 `"/wire/v1/sessions.send"` 必须为 **1**（否则它可被写成"什么都不算"来假绿）；**G4** 真实模型 **0 次**（扫描器读文件不执行文件，门不发任何出站）；**G5** 回归 `tests/server` **726 passed**（基线 717 ＋本单 9）、根 `tests/` **1026 passed**（基线 1017 ＋ 9），exit 0 且**本轮无失败**——上一轮那条负载敏感的 `test_first_run_lock` 未复现（同一提交 `6e6d72b` 上跑）。摘要：工单要的"缺口可见 + 没证据必须有理由"落地成三件产物（扫描器 / **生成**的账 / 豁免册）＋一道可复跑的门（`--check` 退出码即结论）；而工单的前提**只在一半上成立**——"64 里 28 被驱动 / 缺 36"逐字复现于 `test_wire_v1.py`，按整个 `tests/` 扫是 **0 缺**，所以本单**不新写覆盖、不留豁免**，交付的是"这件事从此是个断言"。工具自身的两个坑都由门逮住（缩进正则**静默**数到 54/64；驼峰首段让账**无声**少 4 行）⇒ **元门也被证伪过一遍**。费用：**0 次 / ¥0**。**清理**：无源码外产物（`/tmp` 只剩 pytest 自己的临时目录）。**未做项（逐条点名）**：① 元门**没有挂进任何 CI**——本仓无 CI 入口，脚本即为该用途而写，挂哪属调度裁决；② **45/64 个方法只被一个文件驱动**（账里"观察名单"），是脆不是缺口，是否补"高价值面至少两处独立驱动"要预算裁决，本单不悄悄补 45 份重复用例；③ 口径只答"**被真实 wire 驱动过**"，不答"响应被断言过"——不检查结果的 `ok(` 也算证据，这是有意的窄口径（证据 §3），要"断言强度"须另立单；④ 工单 §Current state 那句"36 从未被驱动"**未改契约**（章程 §5 由调度者改），事实留在证据 §1/§5 | 同上行 | **0 次 / ¥0** | 本提交 |

## 工单 112 — `providerModels.update`：省略即保留原值（2026-09-19，执行者）

> 契约：[112](work-orders/112-provider-update-omitted-keeps-value.md)（R-0032 ③ / AQ-0007，基线 `4ac8263`）
> 证据：[provider-update-keeps-omitted-112.md](../server-round1/fullstack/provider-update-keeps-omitted-112.md)

| 单 | 阶段 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 112 | 1 观测（现状语义） | 真 wire 逐条量（证据 §1）：**"省略会写空"在 provenance 上不成立**——不带 `provenance` 的 update 让四列逐字保留（`repository.py:85` 的 `COALESCE(?,col)`），只给一列时未给的三列也保留（**部分更新已经成立**）。**真正的缺陷是反向的**：四列**显式 `null`** ⇒ 200、值一字未动，清空意图既不生效也不报错，被两层吞掉（`handlers.py:1391` `if value is None: continue` ＋ SQL `COALESCE`）。另三格现状钉清楚：`displayName:null`/`models:[]` ⇒ 类型化拒绝（不允许清空者已经是类型化的）；`省略 displayName`/`省略 models` ⇒ 类型化 `INVALID_REQUEST`（**"只给 displayName"在这棵树的合同上发不出来**，必填集含四件）；service 层 `update(body 省略键)` ⇒ **`KeyError`**（未处理异常形状，内部调用者可达）。CAS 用旧 `expectedVersion` ⇒ `CONFLICT_VERSION`（本单不得动的现状） | 无新增测试（本阶段是测量） | 0 次 / ¥0 | 与本提交合一 |
| 112 | 2 修（省略＝保留、显式 null＝清空） | 三层各改一处，缺一层都还有另一层把 null 吞掉：`handlers._provenance` 不再丢弃显式 null（`field not in raw` 才是"没给"），`service.update` 以 `self.project(current)` 打底再叠 body（省略的 `displayName/credentialId/configuration/models` 取原值；provenance 四列"给了就写（含 None）、没给传 `KEEP`"），`repository.update` 的四列默认从 `None` 换成哨兵 `KEEP` 并按需生成 `SET` 片段——**`COALESCE(?,col)` 从这条写路径消失**。`configuration/models` 是内容寻址的，"保留"＝把同一份文档再发布一次得到同一个摘要，而不是跳过写入。create 一字未动（写 NULL 到默认 NULL 的列是同一行） | 本阶段无新增门；门与定向回归见下一行（阶段 2/3 合一提交：同一件事的两侧，分开提交会留下一个必然红的中间态） | 0 次 / ¥0 | 与本提交合一 |
| 112 | 3 门（正例＋反例） | `tests/server/test_provider_update_keeps_omitted_112.py` **24 passed in 38.11s**：G1×4（省略保留，含服务层"只给 displayName"那条工单场景）、G2×5（显式 null 真的清空、单列清单列、同请求三种意图并存、读回而非回显）、G2b×3（`displayName:null`/`models:[]` 类型化拒绝，`configuration:[]` 合法清空）、G3×4（CAS `CONFLICT_VERSION` 带 `current`、重放不双加版本、098 的枚举/超长仍拒绝、**create 中性**）、G4×5（`_PARAM_SHAPES` 必填集字面钉死＋省略必填字段仍是点名该字段的拒绝）。反例三条：进程内把 `if value is None: continue` 装回 ⇒ 缺陷当场复现；仓储形参默认必须 `is KEEP` 且源码无 `COALESCE`；`KEEP is not None`（哨兵若被并成 None，其余门全绿而这条红）。**对旧码真跑（`/tmp` 副本退三文件到 `0f7b865`，不编辑工作树）⇒ 9 红 / 15 绿**，绿的三条"省略即保留"正是要写进账的前提修正；另有一条红是退码跑脚手架的假红（旧模块没有 `KEEP`，我注入的替身没有 `__repr__`），已在证据 §4 标注而不当证据用 | 定向 `pytest tests/server -k "provider or update or provenance"` ⇒ **68 passed / 682 deselected**，0 失败 | 0 次 / ¥0 | 与本提交合一 |

## 工单 113 — 后端发布 64 方法工件 + 两仓按名字对表 + 旧副本归位（2026-09-19，执行者）

> 契约：[113](work-orders/113-publish-wire-artifact-and-exchange.md)（R-0032 ④ / AQ-0008，基线 `4ac8263`）
> 证据：[wire-artifact-published-113.md](../server-round1/fullstack/wire-artifact-published-113.md) ＋ 口径节 [wire-review.md](../server-round1/wire-review.md)（"工件口径（Order 113）"）

| 单 | 阶段 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 113 | 1 观测（副本与门入口） | 工单点的那份副本**已经不换内容了**：实测 `fullstack/generated/wire-v1.schema.json` 现 sha `c4255b31…`、**134 键（64×2）**——105 收口时把它换掉了，AUD-B-003 量的 `a1bd52a4…`/33 方法那一刻为真但已被消解。**残留的形状是"无声"**：文件名自称 the artifact、零消费者、没有任何东西保证它不过时 ⇒ 本单第 4 项的做法从"替换内容"改成"**把身份写进文件名**"（`contract/wire-v1.schema.registered-c4255b31.json`，`git mv` 前后字节逐字未变，两次 `sha256sum` 相同）；门入口实测：`Wire.call` 仅在 `AGENT_BOX_WIRE_SCHEMA` 被设时校验、**无默认路径**，`test_wire_v1.py` 内不出现副本硬路径 | 无新增测试（本阶段是测量） | 0 次 / ¥0 | 与本提交合一 |
| 113 | 2 后端工件生成 | `scripts/server-round1/wire_artifact.py` 从**源码 AST** 出 64 行清单（方法 → handler → 必填/可选名集），`result` 一律 `{"declared": false, "authority": "contract"}`——**宁可显式写"我不知道"**，因为缺键会让"清单没写 result"看起来像"两边一致"。生成器**复用 103 的解析器**（给它加 `dispatch_pairs()`/`param_shapes()`，`dispatch_methods()` 改由同一棵 AST 派生）：一个仓里两份解析器互相点头不算证据。确定性实测：`--print-digest` 两次同值 `eaae9330…`，`methodCount 64` | 103 的 9 条门在解析层重构后仍全绿（与 113/105 同跑 ⇒ 38 passed in 13.48s） | 0 次 / ¥0 | 与本提交合一 |
| 113 | 3 旧副本处置 | 旧位置留 `generated/README.md`：写明**权威在桌面 settings 线**、两份东西各在哪、以及"门必须显式写路径"；副本**按摘要命名**⇒ 过期从"看不出来"变成"名字对不上内容" | 门 G2 三条（旧路径不存在／内容哈希==登记 `c4255b31…`／名字里的 8 位==内容哈希）＋一条反例（把副本内容换成别的字节而名字仍声称 c4255b31 ⇒ 红，实测假文件哈希 `ea6caae5…`） | 0 次 / ¥0 | 与本提交合一 |
| 113 | 4 口径 + 两仓对表 | `wire-review.md` 新增"工件口径（Order 113）"节：**生成／比较／门入口**三件事在同一节里，四条命令可复跑，`--write/--check/--compare` 对**仓外路径直接退出**。对表实测（`--compare`，退出码 1）：**方法集 64 vs 64 一致、required 名集 0 漂移、`provenance` 两条具名漂移**（`providerModels.update`/`probeModels`：Server 接受、合同未声明——正是 098 §9.2 交回、账上写"交 102 重锁"的同一条）。⇒ 本单**不改对方合同**，把差异点名交回；"两仓一致"在**摘要轴**成立（本树副本 == 公告第 58 轮登记值），在**内容轴**如实报 2 条 | 门共 **16 条**（G1×4＋G1b×1＋G2×3＋G3×2＋G4×3＋越界×2＋G5×1）；反例进程内真跑 **4 红 / 2 复位绿**（旧位置放无名副本→红、内容改名不改→红、口径删一条命令→红、提交清单落后→红）；全套件见终态行 | 0 次 / ¥0 | 与本提交合一 |

## 工单 089 — 两家真实 UI 门（pi + codex）：登记为阻塞，不声明终态码（2026-09-19，执行者）

> 契约：[089](work-orders/089-four-real-ui-gates.md)（R-0011 / 修订 v2 依 R-0014·R-0015·R-0017）

**为什么不跑而不跑**：三条都是第一手或明文，不是一条含糊的"等依赖"。

1. **依赖未满足（契约自己的 depends_on）**：`090` 与 `091`。`090` 按公告第 73 轮报 DONE；
   **`091` 报 `PARTIAL`**（同一公告，且调度者对 091 的架构问题当场给了裁决、活未收口）。
   工单的依赖条件是"**控制面同步与每执行凭据投影可用**"——PARTIAL 不等于可用，本单因此没有意义（工单 §修订 v2 第 1 点原文：前置不落地本单无意义）。
2. **门要的宿主不在这棵树**：G1 要求"真 Electron + 真 Worker + 真模型答复"，R-0014 把控制面定在 **Windows**。
   本树跑在 WSL，没有可点击的桌面应用；而 089 的 `forbidden` 里点名桌面树 ⇒ 我不能替桌面侧起 UI，
   也不能"退而求其次"用 WSL 侧 Server 跑（那条权宜之计正是被 R-0014 取代的那一段）。
3. **窗口口径未定**：R-0033 ① 把第 3 轮验收前置写成 `P42` ＋ `109`/`110` 先落地，④ 写"不得以'带已知缺陷开窗'的方式交接"；
   公告第 101 轮显示窗口**已被开窗交接**、且其"已知缺口"清单里含 **`112`（本树刚落地）** 与 `110`/`108`。
   这个不一致由调度者与验收会话处理（我不改 `docs/acceptance/**`），但在我这一侧的后果是：**现在点 089 会跑在一个口径未定的窗口上**。

**要人拍/要人跑的部分（精确到腿）**：① 从本树 `df115c7` 在 Windows 侧起一份 Server（真实数据根＋真实凭据 locator）；
② 桌面应用按 `ORDESSA_SERVER_ROOT`/`ORDESSA_SERVER_PORT` 连上；③ pi 与 codex 各发一条最小提示并记账
（请求数/tokens/估算费用逐家逐轮）；④ 至少一条失败路径（关凭据或指坏端点）给类型化原因；⑤ 证据落
`docs/server-round1/fullstack/ui-gates-89/`（G3 的零凭据命中检查就是对着这个目录跑的）。

**因此**：本单**不声明终态码**（没有执行就没有码——`FOUR_REAL_UI_GATES_DONE`/`_PARTIAL` 都不写），
记为**阻塞：等 `091` 收口 ＋ 需要人在 Windows 控制面上点**。真实模型 **0 次 / ¥0**（未发起任何调用）。

---

## A 线队列状态（2026-09-19，执行者）

`104 → 105 → 101 → 103 → 112 → 113` 六张已收口（`089` 如上阻塞）。本树 `work-orders/` 里
**没有下一张可执行的单** ⇒ **QUEUE_EMPTY_AT 2026-09-19**（章程"队列不空规则"：合法停止，如实报出）。

**恢复点**：`df115c7`（113）＋ 收口提交；`checkpoint/b2` 仍在 `4c32992`（080/081 那次批末报告），
**未新建 tag**——追加批次（097/098/104/105/101/103/112/113）的名字与批次归属是调度裁决，
执行者不自己造 tag 名（tag 亦不得覆盖）。

**本树还能做、但需要新单的事**（全部已在 §待开单点名，编号归调度者）：
必填集放宽（⇒ 部分更新可在线上表达）与那两条 `provenance` 漂移的合同侧声明，都属**重锁家族**；
探针的 DNS 钉定与 CGNAT 语义仍开着。

| 单 | 终态码 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 112 | **`PROVIDER_UPDATE_KEEPS_OMITTED_DONE`** | 门：**G1** 省略即保留（不带 `provenance` 四列逐字不动、只给一列时未给的三列不动、`{}` 不动、**服务层只给 `displayName` 时其余全部保留且 `version+1`**——工单那条场景在服务层被钉成断言）；**G2** 显式 `null` **真的清空**（全清 ⇒ 读回 `provenance: null`、单列清 ⇒ 只动那一列、**同一请求里清一列/改一列/留两列**三种意图并存，且都从 `providerModels.list` 另一次调用读回而不是回显）；**G2b** 不允许清空者仍点名拒绝（`displayName:null`、`models:[]`）而 `configuration:[]` 合法清空；**G3** 不退化（旧 `expectedVersion` ⇒ `CONFLICT_VERSION` 带 `current`、同 `requestId` 重放不双加版本、098 的枚举/超长仍类型化、**create 中性**逐字同投影）；**G4** 不越界（`_PARAM_SHAPES` 必填/可选集字面钉死；省略任一必填字段仍是点名该字段的类型化拒绝）。反例：把 `if value is None: continue` 装回 ⇒ 缺陷当场复现；仓储四形参默认必须 `is KEEP` 且源码无 `COALESCE`；`KEEP is not None`。摘要：`_provenance`/`service.update`/`repository.update` 三层各归位，"省略"与"显式清空"从不可区分变成两种意图两条路径；`COALESCE` 从这条写路径消失，"保留"改成 `KEEP` 显式表达而不是靠 SQL 吞。费用：**0 次 / ¥0**（全程本地 SQLite ＋ 环回；凭据 locator 未访问）。清理：`/tmp/o112` 退码副本已删并核实不存在。**未做项（逐条）**：① 工单场景"只给 displayName 不给 models"**在线面上不可表达**（必填集含四件），放宽必填集＝改合同＋重锁 ⇒ 登记 §待开单并交回；② 那条退码跑的 15 条绿里有一条红是我脚手架的假红（已在 112 证据 §4 标注，不当证据用）；③ `probeConnection` 那句死 `_provenance` 调用点仍未删（本轮把它从"看起来是死的"变成"可复跑地是死的"，见证据 §6）；④ 公告第 101 轮把 `112` 列进 ACC-R3 的已知缺口——落地后该由调度者从窗口清单里划除（我不改 `docs/acceptance/**`） | `tests/server -q` **765 passed / 1 failed in 445.20s**（失败的是 086 的真实轮门，负载敏感假红：同一树状态**单跑 30.33s 绿**、且在紧接着的根套件腿里**也是绿的**）；根 `tests/ -q` **1066 passed / 0 failed in 547.39s**；算术 `766 = 750 ＋ 113 的 16`、`1066 = 1026 ＋ 112 的 24 ＋ 113 的 16`；定向 `pytest tests/server -k "provider or update or provenance"` **68 passed / 682 deselected** | **0 次 / ¥0** | 本提交 |
| 113 | **`WIRE_ARTIFACT_PUBLISHED_PARTIAL`** | 门：G1 本体（`--print-digest` 两次同值 `eaae9330…`、64 方法、清单方法集 == 活运行时 `_handlers` 键集、**提交件 == 现算件**）；G1b 每行 `result` 显式 `{"declared": false, "authority": "contract"}`（沉默不许被读成同意）；G2 旧副本（旧路径不存在＋指针点名权威与摘要＋**副本名字里的 8 位 == 内容哈希**）；G3 口径（生成/比较/门入口三件事在同一节，四条命令可复跑，"没有默认工件"这句话本身被断言）；G5 不越界（64、`server.hello`、`update` 必填七件字面未动，仓外路径一律 `SystemExit`）。反例真跑：4 红（旧位置放无名副本、内容改了名字不改、口径少一条命令、提交清单落后）＋2 复位绿。摘要：后端第一次有了**自己生成、自己解释得清边界**的工件；本树的合同副本改成"名字里带自己的 sha256"，从"看起来像当前工件"变成"过期就叫出自己新名字"；两仓**按名字比**当场点名 2 条 `provenance` 漂移（098 §9.2 那条）而不是假设一致。费用：**0 次 / ¥0**。清理：临时目录与副本逐一核实删除。**精确剩余（PARTIAL 的三个字值在哪）**：**跨树只读核验那一腿没跑**——对桌面 settings 树的读取被本环境拦下（实测：对该树的只读 `ls` 被策略拒绝），所以"两边本体一致"目前只有"本树副本 == 公告第 58 轮登记的 `c4255b31…`"这一条支撑，**不是字节对表**；补法＝调度者或 settings 线跑一次 `wire_artifact.py --compare <它送来的那份>`。**其余未做**：那两条漂移的合同侧声明（属 102/重锁家族）、081 交回第 4 条（`wire-review` 缺 57/58/59/65 小节）仍开着、清单不含 result 形状（要新的形状来源） | `tests/server -q` **765 passed / 1 failed**（红的是 086 的负载敏感真实轮门，与本单无关：本单没动 `src/**`；同一树状态单跑该条 `1 passed in 30.33s`、根套件腿里也绿）；根 `tests/ -q` **1066 passed / 0 failed in 547.39s**（HEAD `df115c7`）；本单门 **16 passed**，与 105/103 同跑 **38 passed in 13.48s**；`validate_order.py --legacy-ok` ⇒ **53 份契约 FAIL 0**，`--strict` ⇒ **52 FAIL**（原因只有两类：31 条 v1 历史单缺 frontmatter；其余是同线 `write_paths` 两两重叠＝公告 FB-9 等用户拍的那条结构性反馈，`112` 因与 `113` 共享 `status.md`/`tests/**` 被点名，**本单引入 0 条真实并发风险**，契约元数据归调度者，见章程 §5） | **0 次 / ¥0** | 本提交 |

---

## CHECKPOINT b2-2（A 线追加批次，2026-09-19）

> 批次名沿用投递的契约 front matter（`097/098/104/105/101/103/112/113` 都写 `batch: b2`）。
> `checkpoint/b2` 已指向 080/081 那次的批末报告，**同名不复用、更不覆盖**（README §3.2）⇒ 本次叫 **`b2-2`**。
> **已纳入 work order 112 / 113 投递 @`6e6d72b`（父树 @`baeaf81`）**，回执按 §3.5b 记这一行。

**1 现在能试什么**（每条都是本批落地的、可在本树复跑的入口）

| 试什么 | 命令/动作 | 期望看到 |
| --- | --- | --- |
| `server.hello` 说得出家族（105） | `TestClient` 或真 Server 打一次 `server.hello` | `harnesses:[{id, credentialKind?, modelControlId?}]`；顺序＝注册表自身顺序、两次**逐字节相同**；没声明的家族**没有那个键**（不是 `null`） |
| 探测"获取上游模型列表"是安全的（104） | 真 key 现在可用于 `providerModels.probeModels` | 3xx ⇒ `PROBE_ENDPOINT_BLOCKED`（且源站计数恰 1、目标站 0）；名字解析到内网/保留/多播 ⇒ 拒；**不走系统代理** |
| 五个方法不再必 500（101） | 无 artifact/usage 组合上调 `usage.aggregate`、`providerArtifacts.list/install/rollback` | 类型化 `UNAVAILABLE` ＋ `details.internalCode`（不再是 HTTP 500），`FAMILIES` 仍 12 项 |
| `provenance` 能写、能留、能清（098＋112） | create 带四列 → update 不带 → update 带显式 `null` | 第一步读回四列；第二步**逐字保留**；第三步**真的清空**（读回 `provenance: null`）；`displayName:null` 与 `models:[]` 仍是点名拒绝 |
| 覆盖账与元门（103） | `python3 scripts/server-round1/wire_drive_coverage.py --check` | 退出码 0；账 64 行、每行有 file:line 证据；**藏掉某个文件就出现缺口** |
| 工件本体与漂移（113） | `python3 scripts/server-round1/wire_artifact.py --compare docs/server-round1/fullstack/contract/wire-v1.schema.registered-c4255b31.json` | 方法集 64 vs 64 一致、required 0 漂移，**点名 2 条 `provenance`**，退出码 1（有差异就不是"静通过"） |

**2 要人拍的**（问题 / 选项与代价 / 建议 / 不拍的后果）

| # | 问题 | 选项与代价 | 我的建议 | 不拍的后果 |
| --- | --- | --- | --- | --- |
| P1 | **089 谁能点**：门要真 Electron＋真 Worker＋真模型，控制面在 Windows（R-0014），且 `091` 仍是 PARTIAL | ① 人在 Windows 上点一轮（要一份从本树构建的部署）；② 收紧本单范围只验"服务端已能声明＋线能跑通"（**这是放宽**，需明示） | ①，且等 `091` 收口 | Stage 1 的真实 UI 门一直空着，验收第 3 轮没有后端侧的点击证据 |
| P2 | **`providerModels.update` 的部分更新**要不要能在线上表达（必填集放宽 ⇒ 改合同＋重锁） | ① 放宽并走重锁（要 settings 线配合，一对摘要再换一次）；② 维持现状（客户端必须整条发回） | ②不动语义、①按 R-0032 ⑤"透明传达"一侧走——但这是裁决不是清理 | 前端"只改一个字段"的意图永远只能靠重发整条，老客户端并发编辑会互相覆盖 |
| P3 | **两条 `provenance` 漂移归谁修**（合同侧补声明；102 现属 runtime 线，改合同又在 settings 线） | ① 派一张合同面小单给 settings 线；② 并入 102 的重锁 | ①，因为它现在**有可复跑的探测器**（`--compare`），落地即自动干净 | 守合同的客户端至今发不出 `update`/`probeModels` 的 provenance 这条腿 |
| P4 | **`probeConnection` 的死 `_provenance` 调用点** | ① 让它接受 provenance（与 `probeModels` 对称）；② 明确它不接受并删调用 | 先定语义再动代码；两条都改可观察行为 | 留着就是一处"看起来支持"的假面（本轮已把它量成可复跑的事实） |
| P5 | **负载敏感的三条门**（080 时间窗相交、087 取消/召回、086 的 120 s 真实轮） | ① 逐条改成结构判据（要一张卫生单）；② 继续"全量偶发红→单跑绿"记账 | ①：本批已两次撞见，账越记越贵 | 每次全量都要人重跑一遍才知道是不是回归 |
| P6 | **tag 命名**：`checkpoint/b2` 已被 080/081 那次占用 | ① 本次记 `b2-2`（§3.2 的重试用法）；② 给追加批次另起名字（如 `a1`） | ①（不改名最省，且不改历史） | 批末动作没有落点，恢复点只能靠 sha |
| P7 | **FB-9**（同线单必然 `write_paths` 重叠 ⇒ `--strict` 52 FAIL）等用户/调度定口径 | 见公告第 82 轮 | 不在执行者射程 | `--strict` 永远红，批末"活单必须干净"没法判 |
| P8 | 103 的 **45/64 单文件驱动**要不要补成"高价值面至少两处独立" | 要预算（45 份重复用例不值） | 只挑真会被误删的高价值面 | 删一个文件就掉回缺口，但门会立刻叫 |

**3 花了什么**：**真实模型调用 0 次 / ¥0**——本批 6 张（104/105/101/103/112/113）**每一张都是 0 次**，
全部门在本地 SQLite ＋ 环回假端点/假 artifact store 上跑；凭据 locator（`~/.agent-box-acceptance-secret.*/deepseek-api-key`）
**未被访问**（未读取、未复制、未落盘、未入日志）；子代理：**未使用**（112 声明 `parallel_units: ["single"]`；
113 声明 3 个单元但**本树实际单线程做**，如实记，不因"能并行"而制造并行）。
清理证据：`/tmp/o112`（退码副本）、`/tmp/101-oldcode`、`/tmp/104-oldcode` 与各临时数据根逐一核实删除；
本树工作区除本节外无未提交改动。

**4 恢复点**：下一单＝**无**（`QUEUE_EMPTY_AT 2026-09-19`，见上节）；`089` 阻塞在 `091` 收口＋人在 Windows 侧点。
基线：本批起点 `4ac8263`（调度者投递 112/113 的那次），终点＝本节所在提交；
`checkpoint/b2` = `4c32992`（080/081 那次）**未动**，新 tag **`checkpoint/b2-2`** 指向本节提交。
未提交改动：**无**（先提交，再在提交上打 tag）。

**5 不含糊**：
① **113 是 `PARTIAL` 不是 `DONE`**——跨树字节对表那一腿没跑（读取被拦），不拿"摘要相符"冒充"本体对表"；
② **089 没有执行 ⇒ 不写任何终态码**（`_DONE`/`_PARTIAL` 都不写），只记阻塞与要人跑的腿；
③ 全量里那条红（086 真实轮门）**不粉饰成"已修"**，也不为它改断言，按假红登记并留三点支持证据与一条未排除的备选原因；
④ 两张单的**前提修正**都写在证据里而不是悄悄改契约（103："36 从未被驱动"只在一半上成立；113："33 方法旧副本"已被 105 消解，残留的是"无声"），112 更是把工单的因果整个反过来量（"省略会写空"→ 实际是"显式 null 被当省略"）；
⑤ `--strict` 的 52 FAIL 如实报，**不**因为"不是我引入的"就不写进账。

---

## §Spend（本树账：请求数 / 真实模型调用 / 费用）

> 章程 §7 点名要这一节，此前**没有**——费用一直记在各单终态行的"真实模型"列里。本节从 2026-09-19 起补上，
> 并把 A 线追加批次的账汇成一处（历史单不回填，它们的账在各自终态行）。

| 单 | 真实模型调用 | 估算费用 | 上游 | 凭据 locator | 备注 |
| --- | --- | --- | --- | --- | --- |
| 097 | 0 | ¥0 | 无（本地组合） | 未访问 | 全程 TestClient ＋ 临时数据根 |
| 098 | 0 | ¥0 | 环回假上游（真监听一次） | 未访问 | 探测未发真请求 |
| 104 | 0 | ¥0 | **只有环回假端点** | 未访问 | 出站由机制保证（表外名字一律 `gaierror`） |
| 105 | 0 | ¥0 | 无 | 未访问 | 门为本地 hello |
| 101 | 0 | ¥0 | 无（本地假 artifact store） | 未访问 | `digest` 为字面假值 |
| 103 | 0 | ¥0 | 无 | 未访问 | 扫描器读文件不执行文件 |
| 112 | 0 | ¥0 | 无 | 未访问 | 本地 SQLite |
| 113 | 0 | ¥0 | 无 | 未访问 | 工件/门只在源码与 JSON 上算 |
| **合计** | **0 次** | **¥0** | — | **全程未访问** | DeepSeek 额度未消耗；R-0011 的授权本批未被使用（真实调用留给 089 那一类门） |

子代理：**0 个**（本批全部单线程执行，含 113 声明的 3 个 `parallel_units` 未使用）⇒ 无额外请求与费用。

## 工单 112 — 更正与补做：**已纳入 work order 112 修订 v2 @`6c09534`**（2026-09-19，执行者）

> 回执按主树 README §3.5b 记这一行；修订原文见 [112 契约 §修订 v2](work-orders/112-provider-update-keeps-omitted-112.md)，
> 登记正文见 [112 证据 §7](../server-round1/fullstack/provider-update-keeps-omitted-112.md)。

| 单 | 阶段 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 112 | 5 修订 v2 的第二半（逐字段登记可空性） | 调度者按阶段 1 实测改了这张单，裁定"省略即保留只是一半，**显式清空不许被吞**；可空性以合同/工件为准，逐字段登记"。补做四条门：① **合同可空列（`credentialId`，`anyOf [string,null]`）真的解绑**——绑定态→null ⇒ 读回 null、版本 +1，而服务层省略该键 ⇒ 绑定保持（两种意图第一次在同一列上可分辨并各自生效）；② 三个非空列（`displayName`/`configuration`/`models`）给 null 一律**点名**类型化拒绝；③ **可空性表与工件逐字段核对**（重锁改了可空性 ⇒ 这条先红，而不是让行为断言悄悄过期；并钉住"`update` 接受的字段集就是这七个"）；④ 一处**如实登记的偏差**：`models: []` 合同合规（无 `minItems`）而 Server 拒（`Models must be non-empty and unique`）——它**说话**不是静默，故不改只钉，合同哪天加了 `minItems` 这条门会红并要求重看。`provenance` 四列因**合同里没有这一键**（113 点名的漂移）而以 Server 侧登记，并在表里标明这一格是合同缺口 | 门 24 ⇒ **28 passed in 9.89s**；定向 `pytest tests/server -k "provider or update or provenance or artifact or coverage"` ⇒ **120 passed / 650 deselected，0 失败** | 0 次 / ¥0（`/locator/never-read` 是字面 locator，未读取任何凭据内容） | 本提交（在 `checkpoint/b2-2` **之后**；tag 不移动——README §3.2 禁止覆盖，本次以更正行入账） |

### 公告第 102 轮那条提醒的入账（113 的工件何时该重生成，2026-09-19）

公告写："**`113` 的工件要在 `110` 落地后的现状上生成（含 `pauseReason`），否则又差一个字段**"。第一手核对本树现状：

| 检查 | 实测 |
| --- | --- |
| `wire_artifact.py --check <清单>` | `inventory is current (eaae9330…)`，退出码 **0** ⇒ 清单与**本树源码**一致 |
| `grep -rn pauseReason src/agent_box` | **零命中** |
| `storage/database.py:11` | `PRODUCT_SCHEMA_VERSION = **18**`（`110` 把它抬到 19 那一改在 **runtime 线**，`49083af`） |

⇒ 本树工件**现在不含 `pauseReason` 是事实而不是遗漏**：这条线里没有那个字段。等两线合并（或 `110` 的成果到达本树）之后，
**不需要有人记得**：`--check` 会红（清单落后于源码）、`--compare` 会点名差异（合同与清单不再同)——这正是 113 把门写成
"内容必须等于现算"与"副本名字必须等于自己的哈希"的原因。另记一条跨线口径：**清单的 result 轴一律不声明**，
所以 `pauseReason` 这类**视图/事件字段**天然只会在重锁后的合同那侧显形；两仓对表的三条轴（方法集/required/可选名）
不会因它假绿，也不会因它假红。

### `checkpoint/b2-2` 之后的三笔（tag **不移动**，README §3.2）

| 提交 | 内容 | 为什么在 tag 之后 |
| --- | --- | --- |
| `d56535f` | **已纳入 112 修订 v2 @`6c09534`** 的补做：逐字段可空性登记（合同为准）＋ 4 条新门（门 24 ⇒ 28） | 修订在批末报告提交之后才到达本树；tag 是审计点，不追改 |
| `9a46f31` | 公告第 102 轮"工件需在 110 落地后生成"的入账（本树 schema 仍 18、`pauseReason` 零命中 ⇒ 现在是事实不是遗漏） | 同上 |
| `a9d7ee9` | 112 证据 §8：把"保留＝再发布同一份文档"量成代价（两摘要不变、文件数 8→8、无孤立对象） | 同上 |

**恢复点更正（以现物为准）**：上表三笔之后即**本节所在提交**（写这行时它还不在表里——把它写全就会自相矛盾，故以 `git log --oneline -4` 现物为准）；`checkpoint/b2-2` 仍指 `beee590`（报告正文的那次提交）。
两套全量计数（765/1、1066/0）对应 `df115c7` 的源码状态；`d56535f` 只加测试与文档，其门为
`28 passed in 9.89s` ＋ 定向 `120 passed / 650 deselected`，未重跑全量（不拿局部绿冒充全量计数）。
