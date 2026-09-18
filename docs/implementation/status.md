# Backend Server — status

## 计数口径（工单 49 G3；2026-09-17）

**现行计数（全文件仅此一条，随每轮回归更新）**：

- 范围 `tests/`（根套件）：`PYTHONPATH=src:plugins/agent-box-harnesses/src:plugins/agent-box-runtime-wsl/src:plugins/agent-box-runtime-local/src:plugins/agent-box-sandbox-bwrap/src:plugins/agent-box-skills/src:plugins/agent-box-terminal-session/src python3 -m pytest tests/ -q` → **601 passed / 0 failed / 0 skipped**，HEAD = 49 实现提交（工作树含 45 遗留修复：Worker 审计帧 1MiB、审计超时 120s、audit 元数据竞态容忍；该三项随 49 后提交收口）。
- 范围 `plugins/agent-box-harnesses/tests/`（插件套件）：`python3 -m pytest plugins/agent-box-harnesses/tests/ -q` → **195 passed / 3 skipped / 0 failed**，同上 HEAD。
- 范围 `workers/agent-box-worker`（Rust）：`cargo test --locked --release` → **38 passed / 0 failed**，同上 HEAD。

**除上述三条外，本文件出现的其余全部计数一律视为历史（已被取代）**——包括 577 / 605 / 608 /
820 / 843 / 886 / 890 / 915 等根套件数字与各阶段增量；历史条目的原文保留不改写，
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
| [45](work-orders/45-native-home-storage.md) | **NATIVE_HOME_STORAGE_PARTIAL** | [原生目录证据](../server-round1/fullstack/native-home-storage.md) + [G门报告](../server-round1/fullstack/native-home-gate.json)：阶段A/B/C/D(部分)完成——Worker home操作族 + 协议3→4双向拒绝 + bundle c9（sha256:c7fcab3a…，Rust 38 passed）；native-home直挂/审计manifest schema 3/`server_sessions`+2列（schema 6）；wire零改动。**G1/G2/G6/G8第一手通过**（含续接真召回、取消后召回不断、审计漂移可见）；四家假端点门c9上全部exit 0；全量**890 passed/5 skipped/0 failed**。**G5的Windows r4(c9)全套+PostCheck已于2026-09-17补齐**（A/B/C/D/E+PostCheck全exit 0，3次真实Codex请求，崩溃重启后同native id续接；顺带修正验收栈6处过期假设——accept脚本部署合同/UTF-8请求体/delta拼接/schema 3断言/PYTHONUTF8解码崩溃；证据[windows-r4c9/](../server-round1/fullstack/windows-r4c9/)）；G7记部分覆盖（真实应用二轮上下文由46-G3八家8/8覆盖，续接能力由r4 C/D+E双层覆盖）。**捕获三根因修复已收口（提交 67085b4，2026-09-17）**：真实迁移场景六轮capture失败（5×审计响应超64KiB帧→EXECUTION_FAILED、1×VIEW_IO元数据竞态）→ 审计帧上限1MiB（协议版本仍4、旧二进制超限帧类型化拒绝）+ 审计RPC 120s窗口 + 元数据NotFound记截断；修复经 Rust 38/根套件 601/wire 37/pi门c8 exit0/Windows accept-b exit0 验证，**迁移最终验证 MIGRATION_FINAL_OK**（codex-main与hermes-main各一真实轮 completed/captured/cleaned，checkpoint落库 native_platform=wsl、home_locator=codex-main/.codex 与 hermes-main/.hermes、原生会话id齐备；用户直接委托的1.x迁移任务，2次真实调用另账，六轮失败轮模型均已真实答复）。未过：G3并行双轮（产品语义裁决；现行类型化拒绝满足「不静默换地」底线，但「两轮都完成」未达成）；**§1b/落地设计§14（session库独立于profile home）已实现并逐家定性**（提交 717a643/20d66d6，证据 [stage A](../server-round1/fullstack/session-store-14-stage-a.md) + [45报告§9](../server-round1/fullstack/native-home-storage.md)：机制=Worker session-store 模式+房间库绑定+审计走库根；**codex/pi 声明 split 且门在 c10（sha256:d92c6716…）全绿**，hermes 更正为共享DB式、opencode/kilo 同；claude/dsh/qwen 声明撤回（其43代门自45起未在Linux复跑，本轮修复三层接口漂移后仍卡 HOME_MARKER_CONFLICT，根因未定位，记录为维护债） | 下一步：G3产品裁决；43代门 marker 冲突根因；其余收口 |
| [46](work-orders/46-all-harnesses-fullstack.md) | **ALL_HARNESSES_FULLSTACK_DONE**（证据边界见报告 §0b，2026-09-17 收口复核补记：G4反例为两家fixture双向+launcher正控制、非8×8矩阵；UI门第二轮nonce断言语义见F46-4；请求精确计数19次、排障重跑未逐笔粗估另<10次） | [46证据（§8终版）](../server-round1/fullstack/all-harnesses-install-set.md) + [并存JSON](../server-round1/fullstack/all-harnesses-coexistence.json) + [隔离JSON](../server-round1/fullstack/all-harnesses-isolation.json) + [8家UI门](../server-round1/fullstack/ui-gates-46/)：扩展分支合并（c1a7ea9，3冲突按接缝解决，195/3）；8家安装集（幂等，digest逐家固定，deployment sha `5dce588b…`）；并存8/8；**D隔离完成**（ISOLATION_GATE_OK——home互不覆盖、B家零字节、launcher边界正控制；覆盖面边界见 §0b）；**C逐家真实DeepSeek UI门完成（2026-09-17）**：真实Electron+真实Windows Server+真实WSL Worker，8家各8/8步骤PASS exit 0，凭据经界面录入，精确计数19次<¥0.05逐家记账（排障重跑未逐笔、见§0b）——F46-1的「外部资源缺席」判断被用户纠正（WSL互操作可直驱Windows），同路径顺带补齐45的G5 Windows腿（r4全套+PostCheck全绿）。不退化：44两门、45 G门、r4全套、插件195/3、全量608/1全exit 0；wire零改动。§6缺口F46-2三方案记录待裁决（非DoD项）。清理：沙箱/数据根/home/进程全清，`git diff --check`净 | 下一步：§6缺口方案交用户裁决（F46-2）；45-G3产品裁决 |
| [37](work-orders/37-http-codex.md) |
| [37](work-orders/37-http-codex.md) |
| [49](work-orders/49-evidence-hygiene.md) | **EVIDENCE_HYGIENE_DONE** | [49报告](../server-round1/fullstack/evidence-hygiene-49.md)：G1 九门缺参类型化失败（GATE_WORKER_REQUIRED，反例测试 2 passed）；G2 pi门+Windows accept-b 显式c8 exit 0（c8现行摘要 ce7fdeb2…，工单所写 514f48a9 为历史值——c8已在45/46期间重建，如实记账）；G3 status计数口径节（现行唯一+历史声明）；G5 prune两残留清零、未删任何bundle（c2/c3/c5/c6/c7 在49开工前即缺失，不入git不可追溯，记账）；legacy_codex.py连两个测试删除（47 §2.E 收口项提前完成并在47文档登记）；G4 根套件 601/0、插件 195/3、Rust 38，零真实模型调用 | 无未做项（Windows r4 C/D真实模型段按49零调用约束不复跑，记账） |
| [50](work-orders/50-absorb-capability-layer.md) | **CAPABILITY_LAYER_ABSORBED** | [50报告](../server-round1/fullstack/capability-layer-absorbed-50.md)：按内容吸收 `feature/capability-entry-v1 @ 1c74d15`（不合并历史/调度）——capability 库七模块 + `declarations.py` + 八组测试 + gate 测试移植；Server 三文件（runtime/sidecar/sidecar_backend）逐段重放到当前签名；唯一强制门在 `open_execution` 前（fail-closed，零 spawn），反例：未批准 provider / 伪造声明 / 空授权集（≠不限制）全部类型化拒绝；`network.none@1` 收敛为逐执行声明 unavailable（argv 缺失锚点，第一手观测），`_CAPS` 写明跨模板并集；新增 `slots.py` 登记槽位↔具体能力关系 + 守卫测试（拼造 id 无槽位、`_CAPS`==isolation 组）。修正源分支一处缺陷（helper 插错位置解除 skip 守卫）。回归：根套件 **748/0**、插件套件 **331/3**、四家全链门（pi/hermes/opencode/codex）显式 c8 全部 exit 0。零真实模型调用 | 无未做项；terminal 短名词汇版本化与 47 的房间网络参数按工单边界留后续 |
| [47](work-orders/47-sandbox-plan-seam.md) | **SANDBOX_PLAN_SEAM_DONE**（Windows r4 本轮未复跑，记账） | [47报告](../server-round1/fullstack/sandbox-plan-seam-47.md)：中性沙箱端口（`extensions/runtime_composition/sandbox_port.py`，三级名字解析、不猜、fail-closed）——通道（sidecar/local_channel）与装配（runtime.py）都按名字拿 provider，**生产代码 grep agent_box_sandbox_bwrap 零命中（G2）**；文法上移 （home_projection/runtime_artifacts → `resource_contracts/`，部署文档格式零改动）；bwrap 真的声明 `isolation.wrap@1`，协调器 preflight 未声明即 `CAPABILITY_UNDECLARED` 拒绝（G3）；新一致性门 [sandbox-conformance.json](../server-round1/fullstack/sandbox-conformance.json) **OK/exit 0**（home 真目录、宿主 /home 不可见、RO EROFS、ephemeral 无痕、凭据不进 argv、树杀含正控制、清理有界、none 姿态诚实拒绝），反例 fake-redirect-home **FAILED/exit 1**（G4/G5）；`host-substitution` 门 **OK**（roomDiffersOnlyInBindings=true）+ 四家全链门显式 c8 全 exit 0（G1）；全量 **754 passed/0 failed**（G6）。零真实模型调用 | 未做项：Windows r4 复跑（48 时一并）；runtime-*/tests 3 处 bwrap fixture 引用保留（测试语义） |
| [48](work-orders/48-windows-placement.md) | **WINDOWS_PLACEMENT_DONE_IN_D5_DEGRADED_SHAPE**（spike 授权的降级形态；读写隔离声明 false，报告显式写低于 Linux 侧） | [48报告](../server-round1/fullstack/windows-placement-48.md) + [spike](../server-round1/fullstack/windows-spike.md)：**新插件 agent-box-sandbox-windows**（47 接缝：Job 生命+物化+环境块凭据；隔离半边声明 unavailable）；宿主栈（local_channel Windows Job 分支、runtime-local windows realm、tmux 全表面 Windows unsupported、装配按平台选默认 provider id）；**一致性门平台声明驱动**：Linux bwrap OK（回归）+ **Windows 真机 OK exit 0**（[报告](../server-round1/fullstack/sandbox-conformance-windows.json)）+ **Windows 反例 FAILED exit 1**（[反例](../server-round1/fullstack/sandbox-conformance-windows-counterexample.json)）；逐家声明不可用（八家均无 Windows 工件）；全量 **1103 passed/3 skipped**。零模型调用 | 未做项：AppContainer 恢复 spike（管理员）、逐家真 harness 轮（等 Windows 工件）、45 G8 Windows 重跑 |
| [51](work-orders/51-usage-context-fact.md) | **USAGE_FACT_PARTIAL（pi 与 codex 端到端含 wire；四家解析器就绪并经真实数据验证；hermes/claude 门级观测轮与其余家 blob 解析待续）** | [51 阶段 A 观察](../server-round1/fullstack/usage-context-observation-51.md)：逐家用量/上下文来源的第一手清单（codex rollout 的 total_token_usage、hermes state.db 的完整细分、claude projects 的 token 键、opencode/kilo 无专用列、pi/dsh/qwen 待验证；ACP 协议无 usage/contextWindow——neutral fact 必须走 native 回读）；B/C 已落地（a2143c3）：schema 7（turns 的 usage_* 列 + sessions.latest_usage）、usageProbe 部署声明（format 注册表，未知即部署拒绝）、解析器 （usage.py；ACP 的 usage 在 row.message.usage——阶段 A 文档已按工单 §1 更正 ACP 结论）、完成边界在 channel 存活期读取（迟到即如实 unknown）。端到端：pi 门 c10 exit 0 且 turns 记 11/7/18 source=pi-acp-journal、session latest_usage 落库、failed 轮 NULL。零模型调用 | D 已落地（eefa148/8e41e73：usage.updated 事件 + latestUsage 投影 + FRAME_COVERAGE + 严格校验 37 passed 带工件；两仓摘要见 wire-review.md；E 交接文档已入前端仓 evidence 35258dac） | codex 观测轮已绿（c10，turns 记 11/7/18→22/14/36 累计 source=codex-rollout，解析器经真实 rollout 行验证 payload.info 嵌套；hermes 解析器经真实 state.db 验证）；下一步：claude 观测轮（待其门适配）+ opencode/kilo blob 解析 + 观测轮补齐 |
| [52](work-orders/52-session-process-facts.md) | **B/D 完成（thought/plan/mode 三新 wire kind + 四类映射入账本；严格校验 37 passed 带工件）；E 前端交接与真 harness 观测轮待做** | [52 阶段 A 观察](../server-round1/fullstack/session-process-facts-observation-52.md)：ACP sessionUpdate 词汇覆盖全部四类事实（thoughts/tool/plan/mode）——缺口在桥与 Server 的 `_forward()` 只转发 agent_message_chunk；native 层佐证（hermes messages 表的 reasoning/tool 列、codex rollout 的 response_item/event_msg、claude 的 assistant/output_style 行）。零模型调用 | 下一步：B 中性映射 → C 账本 → D 与 51 共享 wire 重锁 → E 前端交接。B/D 已落地（b0c124f）：_forward() 映射四类 ACP 通知、_native_event 落账本、wire 加 thought.delta/plan.updated/mode.updated（前端合同 b1f44a23、工件 0cdc459c，13 kind）、严格校验 37 passed 带工件 |
| [55](work-orders/55-provider-model-record-and-probe.md) | **G1 记录扩展完成（schema 8 + provenance 面两仓重锁）；G2–G4 探测未开始** | 记录扩展（fabf088 前的 51/55 批次 + 73ea5d59 前端合同）：server_provider_models 增 base_url/auth_style/wire_api/fields_source 四列（可选，旧记录 NULL=未知不阻塞）；wire 的 providerModels.create/update 增可选 provenance 对象、providerModel 投影带 provenance（全空投影 null）；枚举校验（authStyle/wireApi/fieldsSource），未知值类型化拒绝。两仓摘要：TS 182e7adb、工件 ec37b962（wire-review.md 记录）；严格校验 47 passed 带工件。零模型调用（探测也零——G2 留下一切片） | 下一步：G2–G4 有界探测（models.list/connection.test，SSRF 防护）+ 反例；claude 观测轮 |
| [57](work-orders/57-harness-artifact-management.md) | **阶段 A 完成（逐家来源观察）；安装/更新/回滚实现待做** | [57 阶段 A](../server-round1/fullstack/artifact-sources-57-stage-a.md)：npm 系三家（pi/codex/opencode）来源与证明充分（registry dist.signatures+attestations 公开、dist.shasum 钉住、版本映射即目录源）；本仓钉住版本有意落后上游 latest（0.5.0/0.147.0/1.18.21 vs 0.9.1/0.154.0/1.18.31）——更新检测输入；hermes/dsh 内部闭包仅摘要固定；codeg 参照未取得如实记录。B 已落地（2052743：ArtifactStore——版本目录 <root>/<family>/<version>/、安装时重推导 tree digest v1、不匹配零落地、引用 .current 与回滚为指针移动、重复安装与未安装版本类型化拒绝；五项测试）。零模型调用 | 下一步：C wire 面（安装/更新/回滚/清单方法）→ D 真机证据（发布物取得 + 本地构建各一）|
| [54](work-orders/54-turn-file-change-set.md) | **B/C 切片完成（change_set 模块 + 本机通道 + 账本，schema 9）；WSL 通道的变更集如实 unknown（Worker 无 workspace 列举 op，协议面待扩展）** | 模块（change_set.py：O_NOFOLLOW 有界走查+内容副本 256KiB/8MiB/1024 条目上限+截断事实；diff added/modified/removed+文本行数；二进制/超大只报变更并注明）；本机通道 attempt 前快照、审计边界后走查、diff 发布为记录对象入 turn（schema 9）；十项定向测试（行数、symlink/特殊文件事实、二进制、副本目录独立性、凭据不进 fact）。全量 1107+ 通过（含本切片十项与严格 wire 校验）；零模型调用 | 下一步：Worker workspace 列举 op（协议 5 或扩展）→ WSL 通道端到端；观测轮补齐 |
| [53](work-orders/53-usage-aggregation.md) | **USAGE_AGGREGATION_DONE（B/C/D 完成：聚合模块 + wire 方法 + 导出；hermes/claude/opencode-kilo 解析器与观测轮待续）** | UsageAggregator.aggregate_by_session（3deae3a 前身，现位于 usage_aggregate.py）：按会话聚合已上报 tokens，无数据会话返回 unknown（非 0）；跨会话零泄漏反例；未知轮次计数可见。定向测试 4 项 + 解析器测试 10 项全绿 | wire 面 usage.aggregate/usage.export 已接线（79e8d4e）；hermes/claude 观测轮与 opencode/kilo blob 解析待其门/来源适配 |
| [43](work-orders/43-harness-expansion.md) | **HARNESS_EXPANSION_ROUND1_DONE + kilo 追加（过门 4 家：dsh、claude-code、qwen、kilo——假端点门与真实模型门均 exit 0；Goose 已调研未实现；Aider 调查后不接；Crush/OpenHands 未碰）** | [dsh 封装](../server-round1/fullstack/dsh-production-packaging.md) + [claude-code 封装](../server-round1/fullstack/claude-production-packaging.md) + [qwen 封装](../server-round1/fullstack/qwen-production-packaging.md) + [kilo 封装](../server-round1/fullstack/kilo-production-packaging.md)（用户追加；OpenCode fork，原生二进制 `kilo acp`，KILO_CONFIG_CONTENT env 配置通道，费用 +4 次请求 <¥0.01）：三家六件套齐——注册表/生产模块/部署模板/双构建一致工件/假端点全链门 exit 0/**`--live` 真实模型门 exit 0**（mode=live，官方端点、授权 locator 只读注入、两轮真实答复、次轮真召回、同 native id 续接、未知模型发包前拒绝、凭据零泄漏、清理干净）；能力 observed 逐项以门证据回填；桥接补丁 1 个（ACP 分组配置选项展平，PATCHES.md §3，无品牌分支）；费用：确认真实请求 28 次（dsh 8 + claude 12 + qwen 4 + kilo 4）+ 少量后台 title 调用，估计 < ¥0.06（上限 ¥10） | Goose 接入卡已备（v1.50.1、`goose acp`、env 三件套、GOOSE_PATH_ROOT；注意 musl 静态二进制 LD_PRELOAD 不可用）——后续工单实现；Crush/OpenHands 按工单顺序未开始；检查点 d9d36b0 / 2c0735c / e63a03e / 8adebe2 + 收尾提交 |
| [37](work-orders/37-http-codex.md) | **SERVER_HTTP_CODEX_R1_PARTIAL** | [原完成审计](../server-round1/completion-audit.md) / [C/D证据](../server-round1/stage-c-d.md)保留；检查点5a45303/5b71393/cd5efbe/67c6b40。独立定向23 passed；同键并发双accept已由39复现并修复；能力不诚实已由39结构性修复 | abandon 断言经探针定性为**测试侧竞态**（终止状态持久化后约50ms才 abandon；负载高时10/10失败），已改为有界等待、断言强度不变，修后10/10通过；原生语义迁移由40执行 |
| [44](work-orders/44-environment-providers.md) | **ENV_PROVIDERS_DONE** | [环境 provider 证据](../server-round1/fullstack/local-ssh-env-providers.md) + 两份门报告（[local](../server-round1/fullstack/env-provider-gate-local.json) / [ssh](../server-round1/fullstack/env-provider-gate-ssh.json)，同一部署文档 sha256 `6026b9…`）：Worker 以 musl 静态构建上实验机（`SSH_WORKER_HELLO_OK`，控制协议 3 全握手）；第一手发现实验机 bwrap 0.4.0 缺 `--clearenv` 跑不了房间，已在实验机源码构建 0.11.0 并带备份切换（回滚见证据 §1b）；`local-env-gate` 与 `ssh-env-gate` 均 exit 0（no-model fixture，真实模型 0 次、¥0）；四家假端点门 exit 0；全量 **915 passed / 5 skipped / 0 failed**（基线 886/6，无退化，另修复两条被 skip 掩盖的既有用例与本机通道零凭据崩溃、connector 分派 kwargs 丢失两个真实缺陷） | 未做项（工单明示范围外）：前端选择器接线、Windows 原生沙箱、远端多用户/跳板机/密钥托管 |
| [38](work-orders/38-harness-extension-selection.md) | **HARNESS_EXTENSION_SELECTION_READY_FOR_DECISION** | 两轮 A/B/C 完成：[最终建议与边界](../server-round1/harness-selection/boundary.md)。保留有条件首选 `harness-remote v3.0.2`；零模型/凭据 | 首选已由40消费进入有门禁接入；不再等待决定 |

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
| 52 | B/D+E 完成：thought/plan/mode 三新 wire kind + 四类映射入账本 + process-facts 端到端 | 真 harness 观测轮（假 peer 已定向验证，真 harness 轮待跑） |
| 60 | PROFILE_SETTINGS_PARTIAL：A/B（schema 16、冻结进轮）、C 归属、D 克隆+迁移表、E 分档、F 收口、**资产重绑写路径 + setPermissions wire**；10 条测试 | 权限姿态逐家翻译与 ask↔审批端到端、P17 同步与重锁 | f8ed9d2 + 03c210d + 8b73c7d + 本轮 |
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
