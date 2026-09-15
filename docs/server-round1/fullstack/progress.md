# Work Order 42 — 交付、等待与真实模型验收进度

日期：2026-09-14。本轮零泄漏：任何证据、日志、命令行参数均不含凭据内容；
已发生的1次可达性请求由后端受控进程读取仓库外 locator，未把内容写入仓库或输出。
授权真实 credential 的 SecretStore→Worker 投影尚未执行，不以测试值路径冒充付费验收事实。

## 2026-09-15 — 四家真实模型门（`--live`）全部执行并通过

详细证据：[live-model-preflight.md](live-model-preflight.md) §6。

- **四家逐一串行**（主执行者唯一串行调度，子代理未接触 secret 或付费请求）：
  Pi `PI_PRODUCTION_CHAIN_GATE_OK`、Hermes `HERMES_PRODUCTION_CHAIN_GATE_OK`、
  OpenCode `OPENCODE_PRODUCTION_CHAIN_PREPARED`、Codex `CODEX_PRODUCTION_CHAIN_GATE_OK`，
  四门均 **exit 0**。live 语义：官方 base URL、**不覆盖配置、不装载 loopback guard**，
  授权 locator 只读复制进 gate 自建 0600 临时 token 文件（用户文件绝不写、绝不删；
  Codex 门新增 `authorizedLocatorDeleted=false` 断言）。
- **每家都验到**：两轮真实 DeepSeek 答复（`deepseek-flash`，模型线上值精确）、终止前 delta 已持久化、
  第二轮上下文/同 native id 续接、取消与清理、未知模型发包前拒绝、凭据不进
  deployment/argv/日志/事件/state/checkpoint/workspace/Git、进程与 Worker 投影清理干净。
  Codex 另验 Responses API、`codex-acp`→`app-server`、隔离 `CODEX_HOME`（
  `codexHomeMatchesDerivedDefault=true`）、`ephemeral` 下无 `auth.json`、真实 `session/load` 重开。
- **分账**：假端点/守卫专有的观测（静默窗口、请求体形状、请求计数、出口守卫审计、重试上界）
  在 live 下**显式记为"未观测"并给出理由**，不静默跳过、不冒充通过；机制证据与真实模型证据
  分别记账，不互相替代。
- **Codex 门接入时修复的真实缺陷**（都有回归测试）：
  ① 链路里仍有 4 处只在假端点模式成立的断言（静默窗口、请求体形状、未知模型请求计数、
  取消挂起），live 下抛 `AttributeError`；
  ② 该异常被相位证据收进报告后**报告无法序列化**，整个失败运行只剩 traceback——现由
  `phase_evidence_for_report`（码/文本入报告、异常对象仍留给判据）+ `unserializable_value`
  兜底 + `report_text()` 修复；
  ③ 凭据事实此前只记录不断言，现 `tokenIn*` 为真即 `CODEX_GATE_CREDENTIAL_EXPOSED` 硬失败。
- **本轮复跑（提交前最终代码）**：Codex 无模型门 exit 0（3 请求、`unauthorized=0`、静默 8.0 s、
  view 峰值 112、`tokenInState=false`、未知模型 0 请求）+ Codex `--live` exit 0。
  Python：`tests` **575 passed / 3 skipped / 0 failed**；插件 `artifacts 2 / git 4 /
  harnesses 127+3 skipped / runtime-local 6 / runtime-wsl 36 / sandbox-bwrap 112 / skills 8 /
  terminal-session 3 / web 14` 全绿，另 `agent-box-web` 的 2 个 Playwright 浏览器用例在本机
  **环境不可用**（`~/.cache/ms-playwright` 无 chromium headless shell 二进制，属环境缺失、
  与本轮改动无关，如实记录不计作通过）。本轮未改 Worker/Rust 与任何插件源码
  （`git diff --stat` 为空），故 Rust 套件与 c8 Worker 摘要不变
  （`_PRODUCTION_CHAIN_GATE_OK` 运行的 Worker `sha256:514f48a9…`，与本轮前一致）。
  **修复一处自己引入的回归**：OpenCode gate 的 `--live` 接入把 `live` 关键字传给 `run_chain`，
  而 `tests/server/test_opencode_gate_cleanup.py` 的 stub 未接受该关键字 → 该文件 11 项失败
  （此前只在真机跑门、未跑该文件，故未被发现）；stub 已按 Pi 的同一方式接受该关键字，
  修复后该文件 **20 passed**、`tests` 全绿。
- **费用**：本轮增量 **< ¥0.05**（四家各 2–6 次运行 × 每轮 1–2 请求、输出 ≤64 tokens/次；
  可见的失败运行都在发包前结束）。累计仍远低于 ¥10 上限，未充值、无第三方代理。
- **未做**：固定 Reviewer 的 §4.2 阶段闭环（额度恢复后补），因此
  `REVIEWER_AUTOMATION_READY` 与 `BACKEND_IMPLEMENTATION_READY` 均**未登记**；
  双门未判定、未接管前端工作树、未联调。

## 2026-09-15 — state capture 类型化错误边界（c7 起步 → 现行 c8）+ 前端最终交接收口（返修轮）

【历史轮次注：本节的错误码语义（"文件/目录消失、文件被缩短"=`VIEW_CHANGED`）与
812/22 计数已被同日的 **Reviewer 复审修复轮（c8，820/27）** 取代——见下一节
"Reviewer 复审闭环"；真实 Worker 端到端中 vanish/首次越界的现行语义为确定性
`VIEW_MISSING`/`VIEW_INVALID` + capture 层转换。】

详细证据：[state-error-boundary.md](state-error-boundary.md)。本阶段禁止真实模型调用，
模型调用 **0**、费用增量 **¥0**。

- **先复现后修**：实现前 Rust 新测/改断言 **8 failed / 12 passed**、Python 新测
  `test_state_capture_error_boundary.py` **13 failed / 4 passed**。跨层测试从 Worker 源的
  被审计位置**提取实际错误码**（结构化标记，不匹配英文 message）驱动真实 settle 循环；
  另有 2 项测试驱动**真实 Worker 进程**端到端核对特殊文件/文件数上限/vanish/shrink 的实际返回码。
- **错误分类收口**：`VIEW_SPECIAL_FILE`（FIFO/socket/设备、get 目标非普通文件）、
  `VIEW_TRAVERSAL_LIMIT`（>4096 访问条目）、`VIEW_FILE_LIMIT`（>1024 文件，listing 与 manifest）
  为确定性拒绝、**立即失败且不改写**；`VIEW_CHANGED`（文件/目录消失、fetch 越过缩短后的末尾）
  为唯一可重试的 Worker 侧码；sidecar 瞬态集合收窄为
  `{SIDECAR_STATE_IDENTITY_CONFLICT, VIEW_CHANGED}`，`VIEW_INVALID`/`VIEW_IO`/`VIEW_INCOMPLETE`
  不再被无条件重试。分类只读 `code`（message 交叉互换测试锁定）。上限/symlink/特殊文件/
  凭据/受保护路径语义全部保持；deadline 到期仍是 `SIDECAR_STATE_NOT_SETTLED`。
- **协议兼容**：只新增错误码值，`{"ok":false,"error":{"code","message"}}` 帧形状未变
  （`view_error_envelope_tests` 逐帧断言），**ABW1 `wireVersion=1` 与 control
  `PROTOCOL_VERSION=3` 均不升版**，兼容性说明入 `protocol.rs` 并由测试锁定。
- **如实记录一次间歇失败**：Codex 门首两跑（分别用 c7 与 c6）曾在第一轮捕获报
  `VIEW_FILE_LIMIT`/`VIEW_INVALID`（capture 时 view 超 1024 文件）。两版 Worker 都出现、
  计数规则未改 → 非本修复引入；修复只把"10s 重试后 NOT_SETTLED"变成"立即准确码"。
  此后 c7 复跑 **10 轮全部 exit 0**、view 峰值稳定 **114** 文件，触发条件未找到，
  作为未解决环境级间歇项记录；gate 现常驻采样 `stateProjectionObservation`（峰值/最重子树/
  是否超限），且 blocker 注记只在"观察到别名链接且 turn 失败"时输出。
- **c7**：`sha256:6408fbc7da63e9b85c52ab1902ab12e3faa5160021187328b03b5fa9dc9848d4`
  （c4 `31e92959…`/c5 `92eac03a…`/c6 `96256b2e…` 未覆盖，复跑前后摘要核对未变）。
  版本口径：ABW1 frame/manifest `wireVersion=1`；Worker control `PROTOCOL_VERSION=3`。
- **五门 + Windows 用 c7 串行复跑**：runtime-artifact `…_GATE_OK`；Codex 默认模式 10 轮
  `…_GATE_OK` + 外部工件模式 exit 0（treeDigest `sha256:9051b844…`）；Pi `…_GATE_OK`；
  Hermes `…_GATE_OK`；OpenCode `…_PREPARED`；**Windows r4 exit 0**
  （`worker_digest=sha256:6408fbc7…`、`tree_terminate`、`session/new→session/resume`、
  delta 10<12、`state_projection=/runtime/home/sessions`、8 秒静默默认租约
  `elapsed_ms=8840` 完成）+ **独立 `-PostCheck …_POSTCHECK_CLEAN`**。
- **全量验证**：python **812 passed/4 skipped/0 failed**（+19：错误边界 19 项；4 项既有
  平台/环境 skip 未扩大）；`cargo fmt --check` 干净、`cargo test --locked --release`
  **22 passed**；`git diff --check` 通过。残留：门临时根无残留，两个 `--keep` 诊断根与
  Rust scratch 目录按属主核对后删除；进程表仅剩 pytest `--delay-seconds 300` 有界自退助手。
- **前端最终交接（只读复测，HEAD 已推进）**：`8e7c138c96337fc20ed61d3c21100e6449c8ec95`
  （00:51 release 提交）、`git status --porcelain` **0 行**、`writer_lease=RELEASED`、
  `DESKTOP_IMPLEMENTATION_READY`、r3 `28 PASS/0 FAIL/0 SKIP/0 PENDING`、handoff 文件在场，
  上一轮的 `DESKTOP_HANDOFF_INCONSISTENT` 被该 release 提交收口；wire 两摘要重算一致
  （TS `11e3b3e7…` / 工件 `5d4fa3bf…`）。工作树内仅 2 个长闲置进程，无写入者；
  **未取得写权、未记录 `FULLSTACK_INTEGRATION_OWNER`、未写前端任何文件**。
- **Reviewer 复审闭环（§4.2 第一轮 → 修复）**：Reviewer 对 `897a833..eefe652` 给出
  `CHANGES_REQUIRED`（P0 视图读取 TOCTOU、P1 无历史证明的"瞬态"分类、4×P2）。逐项修复：
  Worker 视图读取全部改为 **fd 锚定逐组件 `openat(O_NOFOLLOW)`**（fd `fstat` 取类型/大小、
  `take` 有界读、读后 `(dev,ino,size)` 身份复核）；首次越界 offset 与不存在的路径改为确定性
  `VIEW_INVALID`/`VIEW_MISSING`，`_view_bytes` 在"刚列出过"的上下文把 `VIEW_MISSING` 转换为
  `SIDECAR_STATE_IDENTITY_CONFLICT` 重试；`protocol.rs` 注释改写为错误码合同（增量扩展、
  unknown code 一律拒绝不重试、混合世代向更严格方向退化）；gate blocker 注记因果化（仅
  capture 阶段 + state/view 码，其余记 co-observation）并新增 5 例诊断测试；清理 trailing
  whitespace；status 旧表述日期化。反例测试新增：末组件换链（外部 sentinel 不被读）、父目录
  换链、超限不无界读、manifest 1025 拒绝、分块中截断→重试不混字、未知码 fail-closed。
  修复后重建 **c8**（`sha256:514f48a9…`，c4–c7 未覆盖；Worker 源在 c8 构建后未再变，
  c8 仍为现行 bundle）复跑：runtime-artifact/Pi/Hermes/OpenCode exit 0、Windows r4 +
  `-PostCheck…CLEAN`（fresh 实例核对）、python **820 passed/4 skipped**、Rust **27 passed**
  （中间轮为 python 820 / Rust 27；更早 c7 轮为 812/22——均已日期化取代）。Codex 门【历史：当时为未解决的红绿间歇，用户已裁决 A 后转绿】，
  全部如实记录、红不掩盖。
- **两个第一手定位的 Codex 原生行为发现【历史：用户已裁决 A 并已实施】**：①运行时把内置 plugin/skill 语料解包进
  `$CODEX_HOME/.tmp/plugins/`（实测峰值 **5529 文件**；与列表上限 1024 相撞即确定性
  `VIEW_FILE_LIMIT`——旧行为同条件是重试 10s 后 `NOT_SETTLED`；该突发与捕获的重叠为
  未解决的红绿间歇【历史快照：2026-09-15 晚间曾连续 5 轮红】）；②约 1/15 轮凭据扫描在原生
  state 命中假 token（扫描正确拒绝，命中文件
  待捕获）。Reviewer 复审亦给出方案 A/B/C 并推荐 A（部署层 attempt-ephemeral 投影 `.tmp`
  + fail-closed 扫描）；**用户已裁决 A 并已实施（`.tmp` 与 `shell_snapshots` 遮蔽）**。均见
  [state-error-boundary.md](state-error-boundary.md) §4.2/§4.3。
- **Reviewer 自动化 §4.1 通道门通过**：固定 session 真实 `codex exec resume`（read-only、
  flock、无 bypass）exit 0，`VERDICT: ACCEPT` + `REVIEWER_CHANNEL_OK` 机械命中，
  调用前后仓库零写入。§4.2 当前阶段真实审查在阶段提交后执行。
- 四家仍 **MODEL_NOT_VERIFIED**、`workbench_model_verified_count=0`；
  `BACKEND_IMPLEMENTATION_READY` 未登记。

## 2026-09-15 — Worker view 合同收紧 + state 捕获内容稳定性门（返修轮）

- **先复现后修**：Rust 新测（4 项）在实现前编译失败即"合同不存在"；Python 新测 `test_state_capture_settle.py`
  7 项在实现前全部失败（同长度改写被判稳定、deadline 静默返回）。
- **Worker view 合同**：目录递归、文件列出、**符号链接跳过但不跟随/不读取/不捕获**、**特殊文件（FIFO/socket/
  设备）类型化拒绝整个 listing**（原先被静默跳过）；**所有访问条目计入统一 traversal 上限 4096**，超过即
  `VIEW_INVALID`；`view.get` 仍拒绝一切非普通文件；被跳过的链接不被删除、cleanup 仍可用。
- **state 捕获**：完整 snapshot（path+size+digest）连续两次相同才算稳定，返回的字节即与稳定 snapshot 相符
  的那一份；分块读取中 digest 改变继续等待（有界）；**deadline 到期抛 `SIDECAR_STATE_NOT_SETTLED`**，不再
  静默进入 checkpoint；空 state 两次空 snapshot 即稳定；256 文件/8 MiB/受保护路径/凭据扫描规则不变。
- **c6**：`sha256:96256b2ea76218448183fc0b1063aba92c15fca3fb22fa8a00f7e0f7efc2466e`（c4/c5 未覆盖）。
  版本口径：ABW1 frame/manifest `wireVersion=1`；Worker control `PROTOCOL_VERSION=3`（响应形状未变，不升版）。
- **验证**：python 793 passed/4 skipped；Rust 15 passed；四家 gate + runtime-artifact gate 用 c6 串行 exit 0
  （Codex 外部工件模式 exit 0）；**Windows r4 用 c6 exit 0 + `-PostCheck…CLEAN`**。
- **Codex 配置边界只读复核**：产品值未改；用工件内 0.147.0 二进制探测确认 `ephemeral` 受支持（非法值报
  `expected one of file, keyring, auto, ephemeral`）；运行后 checkpoint 无 `auth.json`；未执行官方脚本、
  未读用户 `~/.codex`。
- 模型调用 0、费用增量 ¥0；四家仍 MODEL_NOT_VERIFIED。

## 2026-09-15 — 四家原生 HOME 隔离实施 + Codex 生产封装（并行两条 lane）

详细证据：[profile-home-isolation.md](profile-home-isolation.md) §8b（隔离实施）、
[codex-production-packaging.md](codex-production-packaging.md)（Codex 封装）。

- **通用 HOME 投影底座**（Lane A，主执行者接缝）：新 `home_projection.py` 定义 `/runtime/home/**` 的
  target 语法与 protected 关系；bwrap **按深度升序**发射所有 bind，保证"可写 state 是只读配置祖先"时
  顺序正确（真实下标断言：RW state index 60 < RO config index 63；**旧顺序反证**：config 变成 0 字节空文件）；
  runtime.py 派生 `_protected_state_paths` 并透传；主执行者把 guest 环境改为 `HOME=/runtime/home` 与
  XDG 三元组、为 `SidecarHarnessPort` 增加受保护路径的**捕获排除**与**恢复拒绝**
  （`SIDECAR_STATE_PROTECTED_PATH`）。
- **三家迁移**（Lane A）：Pi → `.pi/agent` + `sessions`；Hermes → `.hermes`（确认 RO config **不被 state
  bind 遮蔽、不进 checkpoint**，删除"bootstrap 物化配置"语义，改为 fail-closed 校验只读姿态）；OpenCode →
  `.config/opencode` + `.local/share/opencode`。三条 gate 在新布局上重跑 **全部 exit 0**；通用 HOME 测试
  35 项（sentinel/双重收敛/旧布局拒绝/受保护路径）。
- **Codex 生产封装**（Lane B）：官方脚本 1.3.0（SHA `0a3a3370…`，只读、不执行）与完整 models.json
  （76107B，与既有资产逐字节相同）；工件 20 包/529 条目/320.8MB/tree digest `sha256:9051b844…`（双构建一致；
  codex-acp 1.1.14 + Codex 0.147.0）；生产配置（`wire_api=responses`、官方根、`model_catalog_json` 指向
  隔离绝对路径、`env_key=CODEX_API_KEY`、`cli_auth_credentials_store=ephemeral`）。
- **Codex 全链门 exit 0**（默认与外部工件两种模式）：两轮 completed、delta 4<7 与 10,12<15、`/responses`
  路径、model 精确 `deepseek-flash`、**实测重开为 ACP `session/load`（带重放）**、`CODEX_HOME` 与
  `$HOME/.codex` 收敛、host-home sentinel 不可见、RO 写入 EROFS、state 100 文件可续接、未知模型发包前拒绝、
  取消与清理、外部工件保留且无残留。`HAS_PRODUCTION_DEPLOYMENT` 在门通过后才翻 True，能力观测只含真实
  发生过的五项（attach/permissions 保持未观测）。
- **本阶段发现并修复的两个通用缺陷**：①Worker `list_view_files` 遇符号链接即整份失败（Codex 必写 argv0
  别名链接）→ 改为跳过非普通条目、`view.get` 仍拒绝（附 Rust 测试）；②四个 gate 的假端点在"从未 start"
  时 `stop()` 会永久阻塞（实测 40 分钟挂起）→ stop 幂等，且 Codex gate 对缺失外部工件类型化快速失败，
  **不静默重建**。
- **bundle c4 → c5**（Worker 修复）：c4 未覆盖、仍为历史有效证据；协议版本仍 1。**Windows r4 用 c5 通过**
  （`sha256:92eac03a…`、`state_projection=/runtime/home/sessions`、`session/new→session/resume`、
  delta 9 < completed 12、8 秒静默在默认租约下完成）+ 独立 `-PostCheck` clean。
- 验证：python 全量 **786 passed/4 skipped**；四家 gate + runtime-artifact gate 串行 exit 0（Codex 外部工件
  模式另 exit 0）；node 25/25、13/13、42d 4/4、构建器 11/20/9/9；Rust fmt 干净 + 11 passed。
- 模型调用 0、费用增量 ¥0；四家仍 MODEL_NOT_VERIFIED；workbench_model_verified_count=0；
  BACKEND_IMPLEMENTATION_READY 未登记。

## 2026-09-14 — 能力合同诚实性返修（假阳性 + 命名空间边界 + 完成线程生命周期）

- **假阳性（先复现后修）**：首版 `merge_capabilities` 把"声明了但**未观测**"的实现级能力算成
  `supported=true`，于是 ①`HarnessRegistry.capability_view("codex")` 在 Codex 无生产封装、零观测时报
  start/observe/finish/stream 支持；②sidecar 执行中**首条 delta 之前** `stream.supported` 已为 true；
  ③任何 `declared=true, observed=null` 都给出虚假支持。先写失败回归（`tests/server/test_capability_truth_table.py`，
  7 failed）再改语义。
- **修正后的唯一规则**：`supported == (declared is true and observed is true)`；真值表四行（含
  `true/null → false / CAPABILITY_NOT_OBSERVED`）。实现级/语义级分类保留，但只用于规定**观测来源与证据
  强度**，不再代替观测。真实观测路径保持：`open_execution`→start、拿到原生会话身份→observe、
  `prompt` 返回→finish、首条真实 delta→stream；attach/permissions/native_continuation 各自要求原生证据；
  steer 不虚构。Profile 的静态 `{id: declared}` 形状不变，静态 canonical 视图只报候选上限、全部
  `supported=false`。
- **命名空间边界**：Work Core 的 `ExecutionProvider.capabilities()` /
  `ExtensionRegistry.require_capability()` 是 **operation** 词汇（`streaming`/`cancel`/`approvals`），与
  Harness canonical 能力绝不互相投影；`require_capability` **就是**消费方（含 `CapabilityUnsupported`
  拒绝路径），此前"无消费方"的说法已更正。边界由
  `tests/server/test_capability_namespace_boundary.py` 锁死（operation 键不得出现在 Profile / Session
  effective / `server.hello` / deployment claims 任何一处，反向亦然；未发现交叉消费或向上泄漏）。
- **真实崩溃（同轮修复）**：`SidecarExecutionBackend._complete` 的完成线程在 prompt worker 结束后仍通过
  **共享** Work Core 连接写账，而 `stop()` 只等 prompt worker → 后续重置连接时在 SQLite 段错误（两次实测
  core dump，栈见 status）。现在 `stop()` 追踪所有存活完成线程并**有界等待**（独立于会被回收的
  `_active`），超时**如实返回 False**；补 3 项定向测试（等待语义 / 诚实 False / 无残留线程），去掉
  join 即失败（双向验证）。
- **验证**：python 全量 **683 passed/4 skipped**；受影响子集连续 3 次 **237 passed**（修前会段错误）；
  node 25/25 与 13/13；`git diff --check` 干净。按工单未重跑 Windows r4、四条 gate 与工件构建（本轮未改
  Windows 脚本、Worker、协议或生产部署）。
- 模型调用 0、费用增量 ¥0；未读凭据；Codex 生产封装、Profile HOME 实施与四家真实模型门仍未做。

## 2026-09-14 — 四家能力合同统一（canonical capability contract）

详细矩阵与证据：[harness-capability-matrix.md](harness-capability-matrix.md)。

- **唯一词汇**：8 个 canonical id + scope + 实现级/语义级分类版本化在
  `src/agent_box/resource_contracts/harness_capabilities.py`（`CAPABILITY_SCHEMA_VERSION=1`）；registry 不再
  持有自己的常量副本。**五处声明收敛**：TOML == JS 只读投影（`capability_declarations.json`）== 四家
  production `capabilityClaims`（逐项等值测试），JS 原生映射 ⊆ 上限（Node 断言）。
- **声明/观测/有效**：`deployment.capabilityClaims` 严格校验（canonical id + 真 bool，漂移别名类型化拒绝）；
  合并规则 6 行逐条参数化，`supported ⇒ declared`，runtime 不得抬高产品能力；`observed` 三态，且观测
  **不回写**静态声明。ACP `resume`：空对象算已播发、显式 false 为不支持、缺失为未观测。
- **行为从有效能力读取**：checkpoint `resumable`、附件门（未生效即派发前 `ATTACHMENT_UNSUPPORTED` 且不留
  孤儿会话）、审批（未声明不产生虚假支持）都改读有效视图；`SidecarHarnessPort.effective_capabilities()`
  为唯一读出口。
- **边界分离**：`hello.capabilities`（28 wire 方法，未改）、Profile 视图（canonical 静态声明，不读 DB
  快照）、Session/execution 有效能力。
- **四家矩阵（逐项证据）**：Codex 全部未观测（无生产封装，`codex/production.py` 只有能力声明、
  `HAS_PRODUCTION_DEPLOYMENT=False`）；Pi/Hermes/OpenCode 的 start/observe/finish/stream/
  native_continuation 已观测；Pi 的 `attach` 只有一半证据（真实播发 image 但从未送过非空附件）→ 有效
  false；`steer` 无人声明。Hermes/OpenCode 的静态 `continuation.kind` 按证据从 `transcript_handoff`
  收口为 `native_session`（消费方核对：该字段只被 registry 自身校验读取，legacy 两家 provider 未注册、
  语义不交叉，无冲突）。
- **顺带修复**：Server 端口品牌默认值去除；通道已关闭时的裸 `ValueError`（会在停机取消时逃逸并连带一次
  flaky 段错误）改为类型化 `SIDECAR_CLOSED`；三家 gate 与 Windows 验收部署的别名迁 canonical；有状态
  harness 补 `native_continuation`（否则 checkpoint 诚实地变成不可续接）；能力投影 JSON 进入 sidecar bundle。
- **验证**：python 全量 664 passed/4 skipped；插件套件 112 passed/3 skipped；node 25/25 + 13/13 + 42d 4/4 +
  构建器 11/20/9；Rust fmt 干净 + 10 passed；四条门串行 exit 0；Windows c4 r4 exit 0 + `-PostCheck` CLEAN
  （8 秒静默在默认 5 秒租约下完成、resume 链与 delta 顺序不变）。**Wire 未改**：`wire/1`、28 方法、TS 与
  生成工件摘要与锁定值一致。
- **模型调用 0、费用增量 ¥0**；未读真实凭据；Codex 生产封装、Profile HOME 实施与四家真实模型门仍未做。

## 2026-09-14 — 原生 HOME 隔离设计锁定 + Worker 租约保活修复（本轮）

详细设计：[profile-home-isolation.md](profile-home-isolation.md)。缺陷与修复设计：
[native-driver-seam.md](native-driver-seam.md) §5。

### 原生 HOME 双重收敛隔离：设计已锁定，实施待完成

- 用户批准后落文档 `docs/server-round1/fullstack/profile-home-isolation.md`：
  `PROFILE_NATIVE_HOME_ISOLATION_DESIGN_LOCKED` / `implementation=PENDING_HARDENING`。
- 核心：安全边界由 bwrap mount namespace 提供（环境变量**不是**边界）；Windows 保持 Profile/Session
  权威、不把权威根长期 RW 挂给 Worker；Server 生成有界 WSL Profile view，Worker 校验后映射到
  `/runtime/home`，只回收批准的状态子树；每家**同时**设置隔离 `HOME` 与其原生专用变量，使默认路径与
  显式路径收敛到同一投影；配置 RO / session 有界 RW / cache·log 临时或按声明 / credential 只走临时
  secret；Server/Core/Worker 不新增品牌分支。
- 逐家目标（Codex `/runtime/home/.codex`+`CODEX_HOME`；Pi `/runtime/home/.pi/agent`+
  `PI_CODING_AGENT_DIR`；Hermes `/runtime/home/.hermes`+`HERMES_HOME`；OpenCode
  `HOME`/`XDG_CONFIG_HOME`/`XDG_DATA_HOME`/`OPENCODE_CONFIG`）、权限矩阵、sentinel 双向验收、以及
  "迁移后三家假端点门必须重跑"都写在文档里。
- **当前差距如实登记**：四家今天仍跑 `/tmp/agentbox-home` 系路径（Hermes 的 bootstrap 物化配置是过渡
  实现），**未迁移**、**未验收**。该文档不登记 READY、不提高模型验收计数。

### Hermes 精确模型映射：产品模型 id 即线上值（用户裁决 → 官方自定义 provider 路径）

- 调查结论（H 子代理，零改动、只读）：Hermes 0.19 在 `agent_init` 里对非聚合 provider **无条件**调用
  归一化，`_normalize_for_deepseek()` 把非一等公民 id 折叠为 `deepseek-chat`；`model.default`、
  `providers.<p>.models.<id>` 的 per-model 元数据、`HERMES_*` 环境变量都**不能**保留原 id（ACP 不读
  这些变量），唯一受支持路径是 Hermes 官方的"用户自定义 provider"声明。按硬性规则向用户提问后，用户
  **裁决采用该路径**（并授权同步修改 42-D 权威配置与其测试）。
- 实施与实测：`model.provider` 与块键都用 Hermes **实际持久化的裸 `custom`**（`providers.custom` 块内容
  不变：官方根 / `key_env` / `chat_completions` / `models.deepseek-flash` / `extra_body.thinking=disabled`）。
  关键发现：`custom:<key>` 形式在新会话能命中块，但 Hermes 持久化的是裸身份 `custom`，**resume 轮**按它
  重解析会退化为默认端点（OpenRouter）+ 占位密钥——第一版实现正是这样丢了凭据（门 exit 0 但第二轮
  `unauthorizedRequests=1`）。改用裸 `custom` 后四条解析路径（new/resume 各两条）全部命中声明的块。
- 结果：两轮请求体 `model` **精确为 `deepseek-flash`**（`observedModels` 三相位一致），产品 id / native
  选择（`custom:deepseek-flash`）/ 线上值三者硬断言；历史 `EFFECTIVE_MODEL_ID="deepseek-chat"` 接受
  逻辑已删除；门新增 `HERMES_GATE_CREDENTIAL_NOT_DELIVERED`（任何请求未带注入假 token 即失败）。
  其余 10 条验收不退化（同 native id、第二轮上下文、`resume_session`、未知模型发包前拒绝、缺凭据
  `CREDENTIAL_REQUIRED`、请求数/重试上界不变、工件与 state 不退化、token 零泄漏、差异逐字段）。
- 代价（如实登记）：native 选择为 `custom:deepseek-flash`、provider 身份 `custom`、上下文元数据由内建
  1,000,000 回退为启发式 **128,000**；模型控制仍不声明（Hermes 的 ACP configOptions 面为空）。
  Hermes 仍 **MODEL_NOT_VERIFIED**。

### Worker 5 秒租约缺陷：已修复（WORKER_LEASE_KEEPALIVE_FIXED）

- 机制：Worker 只在收到**客户端帧**时刷新租约；唯一发送方曾是 `wait_terminal`，而一轮 prompt 期间
  Server 阻塞在 prompt 响应、channel 线程阻塞在队列上 → 静默超过 5 秒的 attempt 被 Worker 取消。
  修复前第一手复现：8 秒静默 → 轮次被取消（`attempt does not accept stdin writes`）；仅把租约改成
  120000 才通过。
- 修复：`WorkerClient` 新增**保活 owner**（间隔 = `max(lease_ms/3000, 0.05)`，不写死 5 秒；attempt
  spawn 前启动，terminal/cleanup/disconnect/异常时停止并 join）；`request()` 全程串行化（帧号、写入、
  响应路由同锁），heartbeat 不与 cancel/stdin 交错；失败类型化为
  `WORKER_LEASE_HEARTBEAT_FAILED`，由 `_WorkerChannels.iter_chunks()` 有界轮询发现并经
  `SidecarEnvelope` 把 code 交给等待方（prompt 不再无限等待）；**默认租约仍 5000、Worker 过期取消
  未关**（停止保活后孤儿 attempt 仍在租约边界内被回收）。
- 反例：客户端层 13 条 + sidecar 层 5 条（8 秒静默完成且实测 5 次 heartbeat、terminal 后冻结、
  stop/close 无线程残留、disconnect 读写两侧类型化、静默中 cancel 有界、heartbeat 出错类型化、
  停止保活后 2.1s 内 Worker 仍写 `cancelled=true`、并发不串 `requestId`/`sequence`、间隔随租约派生、
  `wait_terminal` 不退化）。
- **Windows 真机证据**（c4 release Worker `sha256:31e92959…`，**未重建**）：`accept-e.ps1` 新增
  "默认租约 + 8 秒静默"一步，实测 `lease_ms=5000`、`lease_override=false`、`elapsed_ms=8839`、
  `turn_state=completed`、`delta_text="controlled stream"`；整轮 exit 0，
  `-PostCheck` = `…_POSTCHECK_CLEAN`（DataRoot/workspace/端口/进程/worker view 全部干净）。
- 残余：保活 fail-closed——单请求长时间独占串行化锁（约一个租约周期）会把该轮判为
  `WORKER_LEASE_HEARTBEAT_FAILED`；当前无已知正常路径触发，留待真实模型门观察。

## 2026-09-14 — 42-D Hermes 与 OpenCode 生产封装（并行两条）

详细证据：[hermes-production-packaging.md](hermes-production-packaging.md) /
[opencode-production-packaging.md](opencode-production-packaging.md) /
[通用原生 driver 接缝](native-driver-seam.md)。终态 **HERMES_PRODUCTION_CHAIN_PREPARED** 与
**OPENCODE_PRODUCTION_CHAIN_PREPARED**，两家仍 **MODEL_NOT_VERIFIED**，
`BACKEND_IMPLEMENTATION_READY` 未登记、`workbench_model_verified_count` 仍 0。

### Hermes（子代理 A，专属写集）

- **隔离 Python 运行闭包**：`scripts/server-round1/build-hermes-runtime-artifact.mjs`，只读已安装
  发行版（**不跑 pip、不联网**），从 `hermes_agent-0.19.0` 的 `Requires-Dist` 递归解析（marker 按
  linux/posix/cpython3.12 求值，win32-only 排除），**60 包 / 4 765 条目 / 108 441 979 字节**，
  tree digest `sha256:b3fb1e4be73552d07f4be9081b966d7db8a8e0dbf23be3062965f577f1cf662a`；
  双构建一致；0555/0444 只读、owner marker、manifest 在树外、原子发布；`python3 -S` 自足性导入
  13 个模块全部落在工件内。**未挂用户 site-packages**。已声明偏差：`rich` 声明 `==14.3.3` 而本机
  实装 `15.0.0`（全机无 14.3.3），如实登记为 `pinDeviations`，不写作"已固定"。
- 工件含两个**声明过的** overlay：`agentbox_hermes_bootstrap.py`、`sitecustomize.py`
  （原因：Hermes 的原生会话库是 `$HERMES_HOME/state.db` 文件，而通用 `stateProjection` 只能持久化
  一个目录子项 → `HERMES_HOME` 必须就是那个持久目录，只读投影的 `config.yaml` 由工件的
  bootstrap 物化进去；不 patch Hermes 任何代码）。
- **生产模板**（`hermes/production.py` + `deploy/hermes/config.yaml`）与
  `model-validation-42d.mjs --family hermes --dry-run` 的 `config` **逐字段相等**；官方根
  `https://api.deepseek.com`、64 输出上限、`agent.api_max_retries=1`（声明上界
  `maxProviderAttempts=2`）、`DEEPSEEK_API_KEY` 仅环境引用；**不声明产品模型控制**
  （Hermes 0.19 只播发 ACP `models`、对 `session/set_config_option` 返回空列表，上游 bridge
  只认后者 → 任何冻结模型值都会在发包前被判不可用）。
- **全链门** `scripts/server-round1/hermes-production-chain-gate.py` exit 0（本会话复跑）：
  两轮 delta 4<7 与 11<14；每轮**恰 1 次** provider 请求（合计 2，`requestsBeyondBudget=0`、
  `unauthorizedRequests=0`）；第二轮请求体含第一轮 user+assistant；checkpoint
  `schema_version=2`/`resumable=true`/`harnessType=hermes`，state 含 `state.db`/`state.db-wal`
  与物化的 `config.yaml`（10 文件 1 085 661 字节，**零 token 命中**）；重开方法**直接观测**为
  ACP `new_session → resume_session`（**不是** `session/load`）；注入一次 500 → 实测仅 1 次尝试、
  不重试；未知模型与 `deepseek-flash` 都在发包前被拒（0 新增请求）；缺凭据由 Server
  `CREDENTIAL_REQUIRED` 拒绝且不派发；清理 `removed=true` 无残留；外部 `--artifact`/`--keep`
  语义与 Pi 同级。
- **实测残余（真实模型门前必须先解决）**：产品模型 `deepseek-flash` 在本家 native 面不可寻址，
  有效模型被 Hermes 自己的静态折叠规则（`hermes_cli.model_normalize._normalize_for_deepseek`，
  纯字符串、不联网）改写为 **`deepseek-chat`**；门已把"本轮实际生效模型 = 记录值"做成硬断言
  （漂移即失败），并登记为白名单（只有 `deepseek-flash`）冲突。另有 Hermes 原生探针外联
  （`api.deepseek.com` 默认端点、`models.dev`、`openrouter.ai`）被只读守门逐类拒绝（
  `unclassified=0`、零非 loopback 成功连接）。

### OpenCode（子代理 B，专属写集）

- **单文件二进制授权**：`scripts/server-round1/build-opencode-authorization.mjs` 解析入口符号链接 →
  真实文件 `/home/maoqh/.npm-global/lib/node_modules/opencode-ai/bin/opencode.exe`，
  **184 498 304 字节**、ELF 64-bit、版本 **1.18.21**、digest
  `sha256:c9485f62576606dbde6404647405df2401fada964b7f669f799dc125dbbeff99`；经既有
  `executableMounts`（摘要固定、只读）进入 bwrap 到 `/runtime/bin/opencode`，**未退化为整目录或
  PATH 信任**；guest 内复核 `--version=1.18.21`、写 `/runtime/bin` 得 `EROFS`。
- **原生路径，不伪装 ACP**：新增中立 **driver 接缝**（见 native-driver-seam.md），
  `deploy/opencode/driver-native.mjs` 用上游 `ManagedOpenCodeHost` 托管 `opencode serve`
  （loopback + 一次性基本认证），SSE 增量 → 中性 `message_delta`；Server/Core/Worker/bwrap 无
  OpenCode 分支。
- **生产配置** `deploy/opencode/opencode.json` 与 42d dry-run `config` 逐字段相等；官方根、64 输出
  上限（实测进入请求体 `max_tokens=64`；`OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX` 因键名含 `TOKEN`
  被 Server 规则拒绝，未声明）、thinking 关闭、自动更新/模型目录/LSP 下载关闭、
  `{env:DEEPSEEK_API_KEY}` 仅环境引用。
- **全链门** `scripts/server-round1/opencode-production-chain-gate.py` exit 0（本会话复跑）：
  两轮 delta 4,5,6<9 与 13,14,15<18（真分片流式）；第二轮请求含第一轮 user+assistant；
  checkpoint 4 个状态文件（`opencode.db`+`-wal`/`-shm`+日志）、`resumable=true`、native id 两轮相同；
  重开相位 `createsInsideReopenPhase=[]`、`hostStarts≥2`、托管端口事后全部关闭；
  provider 请求**恰 2 次**、`requestsBeyondBudget=0`、`unauthorizedRequests=0`；受控重试实验实测
  **6 次**尝试（取代 42d 无证据的 12），声明上界 `MEASURED_RETRY_ATTEMPTS=6`；未知模型发包前拒绝、
  缺凭据 `CREDENTIAL_REQUIRED`、坏 checkpoint `SIDECAR_CHECKPOINT_INVALID`、漂移二进制被 Worker
  引导拒绝；token 在事件/状态（827 KB）/报告/Git 零命中；清理 `removed=true`。
- 残余：驱动显式拒绝附件（不静默丢弃）；原生日志会进入 checkpoint（已扫描无凭据）。

### 2026-09-14 — 提交态假绿返修（OpenCode gate token / driver status 合同）

- **复现**：在最终提交态 `736060b` 上跑五文件定向 pytest → 69 passed / 4 failed，4 项均被
  `OPENCODE_GATE_TOKEN_IN_GIT` 顶替。根因：门把固定假 token 写进自身 tracked 源码，同时 cleanup 断言
  "tracked Git 零命中"——源码未提交时能绿，提交后源码自己就是命中项。
- **返修**：token 改为每次运行现生成（前缀 `agentbox-opencode-gate-fake-token-` + `secrets.token_hex(16)`），
  生命周期收在 `main()` 的一次运行窗口内（进入时创建、清理核验后 `clear()`，窗口外 `current_token()`
  抛 `OPENCODE_GATE_NO_ACTIVE_RUN`）；扫描函数 `token_appears_in_tracked_content(root, value)` 只对
  **本次实际注入的完整值**逐字匹配；生成值不打印、不进 argv、不读真实 locator。
- **新增回归 5 项**（`tests/server/test_opencode_gate_cleanup.py`）：动态 token 不在 tracked 内容且
  报告与输出都不含它；两次运行 token 不同且不写回源码；扫描入口在测试独占的临时仓库上取到真/假两性；
  阳性反证（见下）；以及"index 写入只允许绑定临时仓库变量"的源码守卫。
- **阳性反证的隔离（本轮返修）**：早先的实现用 `git add -N` 把 fixture 临时登记进 **AgentBox 主仓的
  index**、再用 `git reset` 撤销——测试全绿也不可接受：那是共享 checkout 的 index 写入，中途崩溃会把
  index 留给其它写入者。现在阳性反证完全在 `tmp_path` 里的**测试独占 Git 仓库**执行（`git init` +
  仓库本地 `user.name`/`user.email` + 写入本轮实际 token + `git add` + `git commit`），生产扫描入口
  `token_appears_in_tracked_content` 对它有真实 `git grep` 命中，完整门据此以
  `OPENCODE_GATE_TOKEN_IN_GIT` 非零失败；主仓只被读取，且该文件每个测试前后比对
  `git status --porcelain=v1` 与 `git diff --cached --name-only` 必须完全相同。
- **driver 合同收紧**：`runtime/native-driver.mjs` 的 `DRIVER_METHODS` 加入 `status`；新增 2 项测试——
  缺 `status` 的驱动注册即以 `DRIVER_METHOD_MISSING` 拒绝（并指出缺失方法名），以及**从接缝模块读取
  方法表**、对测试 fixture 与真实 OpenCode driver 各构造一次实例核对齐备。
- **最终提交态（`407c379`）复跑**：五文件定向 **78 passed**；`build-opencode-authorization.test.mjs`
  9/9；OpenCode 全链门 exit 0（`OPENCODE_PRODUCTION_CHAIN_PREPARED`，两轮 delta 4,5,6<9 与
  13,14,15<18，`cleanup.tokenInTrackedGitContent=false`、`fakeTokenRemoved=true`、`removed=true`）；
  Hermes 全链门 exit 0（delta 4<7、11<14，provider 请求 2、越预算 0）；全量 python
  **534 passed / 4 skipped / 0 failed**；`git diff --check` 干净；tracked 内容只有 token **前缀**
  （门里的常量），无任何生成值；无进程/监听端口/临时根残留。
- **反馈返修（同一轮）：阳性反证不得写主仓 index**。上一版用 `git add -N` 把 fixture 临时登记进 AgentBox
  主仓 index、再 `git reset` 撤销——测试全绿也不可接受（共享 checkout 的 index 写入，中途崩溃会留给别的
  写入者）。现改为：阳性反证在 `tmp_path` 内**测试独占的 Git 仓库**里做真 `git add` + `git commit`，
  生产扫描入口对它真实 `git grep` 命中并使门以 `OPENCODE_GATE_TOKEN_IN_GIT` 非零失败；扫描函数只在测试内
  以委托形式指向临时仓库（生产默认仍扫真实 `REPO`，没有新增任何"跳过主仓扫描"的运行时选项）；
  该文件每条测试前后比对 `git status --porcelain=v1` 与 `git diff --cached --name-only` 必须完全相同，
  另有源码守卫要求写 index 的 git 调用只能绑定临时仓库变量。复跑：五文件定向 80 passed、
  gate cleanup + native driver 定向 39 passed、node 工具 9/9、两条全链门 exit 0、`git diff --check` 干净、
  无进程/端口/临时根残留，主仓 index 前后一致。

- 本轮只修验收与合同缺口：**未改 Worker lease、Worker 协议、Windows bundle 与前端**；
  模型调用 0、费用增量 ¥0（两条门仍只连 127.0.0.1 假端点，假 token 运行期生成、用后丢弃）。

### 通用接缝：中立原生 driver

- 新增 `plugins/agent-box-harnesses/runtime/native-driver.mjs`（加载规则 + 事件深红删）、
  `worker-entry.mjs` 的 driver op 路由、`runtime.py` 的 `adapter.driver` 打包、
  `sidecar.py` 的 `message_delta`/`driver_exit` 映射与 bundle 收录；
  通用测试 `tests/server/test_sidecar_native_driver.py` 17 项（含"未声明 driver 时仍走 ACP 注册"与
  模块越界/缺入口拒绝）。ACP 路径回归：`test_harness_sidecar.py` 91 passed、Node 25/25。
- 一次性探针（未入库）在真实 c4 Worker+bwrap 上证明：模块投递与加载、凭据经 `spawnProcess` 进到
  driver 的**孙进程**（`CRED_OK`）、可写 state 投影回读为 checkpoint 并在下一轮回投、native id 稳定。

### 本阶段发现的通用缺陷（历史快照：当时未修复、阻塞四家真实模型门；**已由 WORKER_LEASE_KEEPALIVE_FIXED 取代**）

- **Worker 默认 5 秒租约会取消"客户端静默"的运行中 attempt**。代码级：只有客户端帧刷新
  `lease_deadline`，而一轮 prompt 飞行中 Server 不发任何帧（心跳只在 `wait_terminal` 里发）。
  第一手复现：同一 fixture 驱动静默 8 秒，`lease_ms=5000`（生产默认）下轮次被取消并最终以
  `WorkerError: attempt does not accept stdin writes` 结束；仅把租约改成 `120000` 后两轮
  `completed`、checkpoint 与回投正常。既有假端点门因为毫秒级应答从未暴露。
  详见 [native-driver-seam.md](native-driver-seam.md) §5；**修好之前不启动四家真实模型门**。

### 验证与计数（本会话串行复跑）

```text
python3 scripts/server-round1/hermes-production-chain-gate.py          → exit 0（HERMES_PRODUCTION_CHAIN_GATE_OK）
python3 scripts/server-round1/opencode-production-chain-gate.py        → exit 0（OPENCODE_PRODUCTION_CHAIN_PREPARED）
python3 scripts/server-round1/pi-production-chain-gate.py              → exit 0（PI_PRODUCTION_CHAIN_GATE_OK，底座未退化）
python3 scripts/server-round1/runtime-artifact-gate.py --worker <c4>   → exit 0（RUNTIME_ARTIFACT_PROJECTION_GATE_OK）
node --test plugins/agent-box-harnesses/tests/harness_remote/*.test.mjs→ 25 passed / 0 failed
node --test scripts/server-round1/model-validation-42d.test.mjs        → 4 passed / 0 failed
node --test build-pi-runtime-artifact.test.mjs                         → 11 passed / 0 failed
node --test build-hermes-runtime-artifact.test.mjs                     → 20 passed / 0 failed
node --test build-opencode-authorization.test.mjs                      → 9 passed / 0 failed
python3 -m pytest -q tests plugins/agent-box-harnesses/tests \
  plugins/agent-box-runtime-wsl/tests plugins/agent-box-sandbox-bwrap/tests \
  plugins/agent-box-runtime-local/tests                                → 529 passed / 4 skipped / 0 failed
git diff --check                                                       → 干净
精确秘密扫描（本阶段改动与报告）                                        → 无命中（未读任何真实 secret locator）
```

上一阶段基线 python 444 passed/4 skipped；本阶段 +85 项（Hermes 36、OpenCode 25、driver 接缝 17、
Pi 别名/翻译断言加强 2、其余为参数化增量）。4 个 skip 为既有平台/环境条件项，未扩大。

- **模型调用 0、费用增量 ¥0**；累计仍为 1 次 / 12 tokens / `<¥0.01`（上限 ¥10）。未读任何真实凭据
  （假 token 由各家门自建、0600、用后删除）；未访问任何非 loopback 目的地。
- 清理：本阶段三个门（Hermes/OpenCode/Pi）的临时根、Worker view/secret、假 token、托管进程与端口
  全部移除；早前手工探测遗留的 `opencode serve` 已终止。
  **诚实留痕**：主会话收口复核时又发现一个**门之外**的残留——Hermes 子代理 recon 阶段启动的
  `python3 fake.py`（cwd `/tmp/agentbox-hermes-recon`，已删除的目录）仍在 127.0.0.1:40727 监听
  （开始于 16:22，早于该家全链门）。已终止并复核端口关闭、无本阶段进程残留。该残留不在任何门的
  断言范围内（门只对自己的临时根/端口/进程负责），故不改变两条门的 exit 0 结论，但如实登记，
  提醒后续阶段：子代理的"实验期"资源也必须纳入收口扫描。
- c4 仍**无 Windows 平台证据**（本阶段未跑 Windows r4）；Windows r4 复验与四家真实模型门均待后续。

## 2026-09-14 — Pi gate 清理假绿返修（单点验收）

- **缺陷**：`pi-production-chain-gate.py` 首次提交用 `shutil.rmtree(temporary, ignore_errors=True)` 清理
  临时根；临时根内由 Pi 构建器发布的工件是 0555/0444，`rmtree` 没有目录写权限就无法 unlink 其条目，
  而 `ignore_errors=True` 把失败吞掉。结果：命令 **exit 0** 却在 `/tmp/agentbox-pi-gate-*/` 留下只读工件树；
  `run.removed` 当时已被如实算成 `false`，但没有机制因残留而失败，证据文档又引用了更早一次使用外部
  `--artifact` 的运行（临时根内无只读树、删除成功）而写成 `run.removed=true`。已复现（exit 0 + 残留）。
- **返修**：禁用 `ignore_errors`；删除前先做身份校验（必须是本次 `mkdtemp` 返回的完全相同路径、位于系统
  临时目录、属主为本用户、无组/其他权限、非符号链接）；对只读工件显式改写为可写后再删除，并复核路径
  确已消失；**任何残留使退出码非零**；`--keep` 报告保留路径且不声称 `removed=true`；外部 `--artifact`
  只读且绝不删除/改权限（复核摘要与模式，记 `preservedAfterCleanup=true`）；清理失败不覆盖主失败
  （主失败为主因 + 脱敏 `cleanupFailure`，仍非零）。
- **定向测试 12 项**：默认运行含 0555/0444 嵌套工件后无残留、`--keep` 确实保留、外部 `--artifact`
  未被删改、身份/边界不满足时拒绝危险清理（不同路径/符号链接/组可访问/前缀不符/非目录）、注入删除失败
  非零退出、主失败与清理失败并存时主失败证据不丢失、源码中不得再出现 `ignore_errors`。
  另外：测试套件自身运行前后不新增任何临时根。
- **残留清理**：报告指名的 `/tmp/agentbox-pi-gate-bvhe10su` 本次核查时**已不存在**；现场另有 6 个
  返修前的残留根，其中 5 个通过身份校验（前缀/位置/属主/权限/含 Pi 构建器 marker）后用修复后的
  gate 清理函数删除（`madeWritable` 分别 15461/9/11/15461/11），1 个不含 gate 内容（本会话调试用
  临时目录）被**拒绝**并改用非递归 `rmdir` 清除。现 `/tmp/agentbox-pi-gate-*` 为空。
- **修复后实测**：默认运行（自行构建工件）exit 0 + `run.removed=true` + `cleanup.madeWritable=15510`
  + 无残留；外部 `--artifact` 运行 exit 0 + `preservedAfterCleanup=true` + 工件摘要与 0555 模式不变 + 无残留。
- 模型调用 0、费用增量 ¥0；未读凭据、未改 Pi 生产配置、未动 ACP capability 修复与 Server/Core/Worker 合同。

## 2026-09-14 — 42-D Pi 生产封装与本地假端点全链

详细证据：[pi-production-packaging.md](pi-production-packaging.md)。终态 **PI_PRODUCTION_CHAIN_PREPARED**；
Pi 仍 **MODEL_NOT_VERIFIED**，`BACKEND_IMPLEMENTATION_READY` 未登记。

- 真实 Pi 全链打通：Server → Core → sidecar deployment → c4 release Worker(ABW1 interactive) → bwrap →
  **真实 `@automatalabs/pi-acp@0.5.0` + 真实 Pi 依赖闭包** → 本机 loopback 假 DeepSeek 兼容端点。
  门 `scripts/server-round1/pi-production-chain-gate.py` 退出码 0。
- Pi 运行时工件：`scripts/server-round1/build-pi-runtime-artifact.mjs`（只用现有 package-lock 与
  node_modules，不联网、不跑 npm），317 包 / 15458 条目 / 64.9 MiB / tree digest
  `sha256:afe238d3…`；双构建 digest 与 manifest 一致；输出只读、带 owner marker、原子发布，
  未标记的非空输出**拒绝且不删除**。
- 生产模板由插件拥有（`agent_box_harnesses.pi.production` + `deploy/pi/{models.json,settings.json}`），
  与 `bc7d95b` 的 42-D 准备配置**逐字段相等**（测试跑 `model-validation-42d.mjs --dry-run` 比对），
  官方根地址、`deepseek-flash`、64 tokens、thinking 禁用、agent/provider 重试双关；
  loopback 覆盖只改 `baseUrl` 一个字段且不落盘为生产配置。
- 两轮实测：provider 请求**恰 2 次**（`/chat/completions`，`model="deepseek-flash"`，`max_tokens=64`，
  `thinking.type=disabled`，Authorization 与注入的假 token 相符、0 未授权、0 超预算）；delta 序号
  4<7 与 11<14；第二轮请求含第一轮 user 与 assistant 内容；同一 Server Session 第二轮沿用同一
  native id；重开时 adapter **重放了已存储轮次** → 走的是重放语义的 `session/load`（**不是**
  `session/resume`），并已有直接观测证据。
- 发现并修复真实公共缺陷：ACP 用空对象播发 session 能力（`resume: {}`），Python 侧 `bool({})`
  把真实 Pi 判为不可续接，导致第二轮以 `SIDECAR_CHECKPOINT_INVALID` 失败；改为"存在且非 False
  即视为已播发"，参数化 7 例回归，端到端复核第二轮恢复成功。
- 未知模型在发 HTTP 前拒绝（0 新增请求，`Harness model is not available`）；缺凭据由 Server 以
  `CREDENTIAL_REQUIRED` 拒绝且不派发。假 token 经既有 SecretStore→secret frame→sidecar 注入，
  未出现在事件、checkpoint、报告或 Git；运行后 views/secrets/进程/临时目录全部清理。
- 验证：构建器 11/11；模板 12/12；Server sidecar 91 passed；全量 python 444 passed/4 skipped
  （上阶段基线 424/4，+20）；Node sidecar 25/25 与 42d 4/4；既有 runtime-artifact gate 仍 exit 0。
- 模型调用 0、费用增量 ¥0；累计仍 1 次 / 12 tokens / <¥0.01。c4 仍无 Windows 平台证据（本阶段未跑 r4）。
- 措辞修订：`runtime-artifact-gate.py` 与 `runtime-artifact-projection.md` 中原"本机无 wsl.exe"
  改为准确表述——该门有意直接启动 WSL 内 release Worker 并使用相同 ABW1 协议，未经过
  Windows Server→wsl.exe 路径，Windows c4 复验仍待后续。

## 2026-09-14 — 42-D 运行时工件投影底座（provider-neutral）

详细证据：[runtime-artifact-projection.md](runtime-artifact-projection.md)。终态
**RUNTIME_ARTIFACT_PROJECTION_READY**；`BACKEND_IMPLEMENTATION_READY` 仍未登记。

- 新增中立能力 `runtimeArtifactMounts`：部署声明「canonical WSL 源目录 + 受限 target
  `/runtime/artifacts/<stable-name>` + 稳定 tree digest」；Server 只做通用 schema 校验并透传，
  connector bootstrap 携带预期摘要，**Worker 在 WSL 内权威重算并比对**，bwrap 只对该已授权目录
  `--ro-bind`。Server/Core/Worker/bwrap 无品牌分支；Harness 专有路径/环境变量留给后续插件阶段。
- 跨语言 tree digest v1（Python `agent_box_sandbox_bwrap.artifacts` / Rust `artifacts.rs`），
  golden fixture 两侧逐字节一致（`protocols/worker/golden/runtime-artifact-tree-v1*.json`）。硬上限
  32768 条目 / 1 GiB 内容 / 4096 字节路径；拒绝 root 或内部 symlink、FIFO/socket/设备、非可打印
  ASCII 路径、重复或 ASCII 大小写冲突、越界、与 workspace/worker root 重叠。
- Worker control protocol **2 → 3**（bootstrap 结构变化），双向拒绝均有测试；其中「新客户端 + 旧
  Worker」用真实历史二进制 `.acceptance-bundle-c3` 复现。bootstrap 拒绝改为类型化 `WORKER_ERROR`
  帧，Server 侧重抛为带 code 的 `SidecarError`，原因进入持久 dispatch 账本。
- 新 acceptance bundle `.acceptance-bundle-c4`：
  `sha256:31e92959b06b3ee9f30ebfb9ce6b2bee74af847e4a147bba906bff7ecf681fa6`；c2/c3 未覆盖未删除。
  **本阶段不运行 Windows r4**：c3 的 r4 仍为历史有效证据，c4 尚无 Windows 平台证据。
- 真实 release Worker(c4)+bwrap 无网络无模型门 exit 0：
  `python3 scripts/server-round1/runtime-artifact-gate.py --worker <.acceptance-bundle-c4/agent-box-worker>`
  → fixture 从 `/runtime/artifacts/fixture-dep` 加载依赖返回固定值、guest 写入被拒、宿主树未变、
  摘要不符时 turn 失败且无伪造 session、无残留 view/secret。只登记**运行工件投影门**，
  **不登记任何 Harness/model 通过**。
- 缺陷核查：工作令所述 sidecar bundle「重复嵌套分块上传」在 HEAD `989c9f2` 上**未复现**（单个
  (path, offset) 唯一一次 `view.put`）；已补行为测试并按工作令形态做临时反证（测试随即失败）后
  还原，未做无谓“修复”、未降低 view digest 或完整性断言。细节见证据文档 §7。
- Python 全套 `424 passed, 4 skipped, 0 failed`（41 记录基线 348/4；本阶段收集 +76 项）；Node 25/25
  与 42d 4/4；Rust `cargo fmt --check` 干净、`cargo test --locked --release` 10 passed（基线 4）。
- 模型调用 0、费用增量 ¥0；累计仍 1 次 / 12 tokens / <¥0.01；未读凭据内容。
- 前端只读观察（14:54 +08:00）：HEAD `6a29fd7043fc2c1af34eb478eaaa08564763c986`、工作树 clean、
  `writer_lease=ACTIVE`、`frontend_implementation=PARTIAL`；TS/生成工件摘要就地重算未变（未重锁）。
- 下一阶段：在同一底座上分别封装 Pi（Node 模块目录）、Hermes（隔离 Python 包闭包）、
  OpenCode（单文件二进制沿用 existing executableMounts，不退化），随后进入 42-D 逐家真实门。

## 2026-09-14 — Work Order 41 Windows r4 平台门通过

Windows 真机、`py.exe -3.12`、真实 `wsl.exe`、digest 固定的 release Worker、locked 28 方法 wire schema、
端口 18744、隔离 DataRoot `%LOCALAPPDATA%\AgentBox\acceptance-server-41-r4` 与 WSL workspace
`/tmp/agentbox-server-41-r4` 上单次执行 `accept-e.ps1 -Cleanup`，退出码 0：

```json
{"approval_execution":"execution_c619a5fb923647ec9f3750e6546ffbcc","attachment_execution":"execution_fb479cdd3aad47e9b050f3db51fc0248","cancelled_execution":"execution_cd35d32508544be2b469371af56c42ad","data_root":"C:\\Users\\maoqh\\AppData\\Local\\AgentBox\\acceptance-server-41-r4","distribution":"Ubuntu","fixture":"explicit no-model ACP peer","profile_id":"profile_489c3e31ec5d457081e5570e64d10a83","provider_model_id":"provider_f8738a7bbf3a45088040d5b8c5060871","r4":{"checkpoint_digest":"sha256:a6525f3b20a69c19abac3ce3834982696bb3eb2eb0423829e76a01b37da5a06d","checkpoint_files":["native-state.json","reopen-method.txt"],"checkpoint_native_id":"stateful-13","cleanup_guards":{"data_root_that_is_not_a_directory_refused":true,"data_root_with_mismatched_marker_refused":true,"data_root_with_owner_marker_accepted":true,"data_root_without_owner_marker_refused":true,"linked_data_root_target_refused":true,"marked_workspace_accepted":true,"workspace_without_owner_marker_refused":true},"completed_seq":12,"delta_seq":10,"first_execution":"execution_387c3382ee694dd4b088813f6c7763f0","first_round_reopen":["session/new"],"fixture":"tests/server/fixtures/stateful_acp_peer.mjs","harness":"hermes","lock_instance_after_final_stop":"server_79296dd8029948d0bf7c18bff0ae24cf","lock_instance_after_first_stop":"server_6dd995a9dfd14795b6ad975f249ae9e9","nonce":"STATEFUL-NONCE-R4-7F3A9C","second_execution":"execution_71d57937cc8346faa45fe9df22ad8bf6","second_round_reopen":["session/new","session/resume"],"server_id_after_restart":"server_639bc04679554c66ac6b1e77661e70f1","session_id":"session_88a29fa110254843a6ceee9a12545e43","state_projection":"/tmp/agentbox-home/sessions","stop_mode":"tree_terminate","timeout_ms":30000},"result":"BACKEND_41_E_WINDOWS_WSL_WIRE_OK","server_id":"server_639bc04679554c66ac6b1e77661e70f1","session_id":"session_97b27f612778411f92c9bb68e1ef9a13","windows_server":true,"wire_event_stream":"wire.eventStream/1","worker_digest":"sha256:bb90e346bbd857f02eba8d267f47c3ce793d30c9894ca823dc09c482d886f5eb","workspace":"/tmp/agentbox-server-41-r4","workspace_id":"ws_cb0eb4a7e01541b4a622935e606b6b5f"}
```

逐项证据：

- **崩溃式重启（`stop_mode=tree_terminate`）**：第一轮完成后，脚本以 `taskkill /T /F` 做**有界进程树
  强制终止**才真正结束 Server（py.exe 启动器持有 python.exe 子进程），随后以同一 DataRoot 重启并
  恢复 live；`server.hello` 返回同一稳定 server_id `server_639bc04679554c66ac6b1e77661e70f1`。
  DataRoot 锁（`server.lock`）的持有实例在第一次停止后为
  `server_6dd995a9dfd14795b6ad975f249ae9e9`，最终停止后为 `server_79296dd8029948d0bf7c18bff0ae24cf`；
  两者不同，即锁已由前一实例释放并被重启后的实例重新获取（脚本把两者相等直接判为清理问题）。锁文件
  在持有期间被 Windows 字节区间锁保护、不可读，因此“停后仍可读”本身即释放证据。
  该路径是**强制终止后的恢复门**，**不是**正常/graceful 关闭：Server 的完整生命周期退出与最终清理
  仍留作全栈最终验收项，本轮未覆盖。
- **同 native id resume**：第二轮 checkpoint 的 `nativeSessionId` 与第一轮相同（`stateful-13`），
  Server 的 Session REST read projection（`GET /api/v1/sessions/{id}`；wire 里没有，也不存在
  `sessions.get` 方法）返回的 `checkpoint.native_id` 亦未变；fixture 在第二轮只接受
  `session/load`/`session/resume`，遇到 `session/new` 会以 `-32011` 拒绝，而捕获到的
  `reopen-method.txt` 记录第二轮实际发送的是 `session/resume`（首轮为 `session/new`），且第二轮
  返回了首轮 nonce `STATEFUL-NONCE-R4-7F3A9C`。
- **终止前 delta**：第二轮 `message.delta` 序号 10 早于 completed 状态帧序号 12，两者同一持久事件流。
- **ObjectStore checkpoint**：从 Windows DataRoot `objects/sha256/…` 直接读取 Server 返回的 checkpoint，
  重算内容摘要与 Server 给出的 digest 一致（未伪造、未改写）；`schema_version==2`、`resumable==true`、
  `harnessType=="hermes"` 与 Profile 一致、`files` 非空且每个 `path`/`size`/`digest` 合法并能在
  ObjectStore 中按 size 命中；`sourceExecutionId` 绑定该轮 Core execution。
- **清理**：退出后 DataRoot 按 marker 删除（删除前重新校验 owner marker/非 reparse/非普通文件）、
  WSL workspace 删除且 `test -e` 断言其确实不存在、端口 18744 无监听、无本轮 Server/Worker/sidecar
  残留进程、Worker `views`/`secrets` 无残留。随后以独立进程再跑 `-PostCheck`（退出码 0）：

```json
{"check":"BACKEND_41_E_WINDOWS_POSTCHECK","data_root_absent":true,"workspace_absent":true,"port_listening":false,"residual_processes":[],"residue_scope":"instance","worker_view_residue":[],"result":"BACKEND_41_E_WINDOWS_POSTCHECK_CLEAN"}
```

- **恢复/清理反例**：无 owner marker、marker 不匹配、DataRoot 为 junction（reparse）、DataRoot 为普通文件、
  WSL workspace 缺 marker 均被拒绝清理；正例（marker 正确、workspace 有 marker）被接受。
  checkpoint 不可用时（schema 版本错、`resumable` 非真、native id 不符、checkpoint 对象缺失、
  state 文件对象缺失）第二 turn 必须以失败告终、不得静默成功或新造 native 会话：
  `tests/server/test_harness_sidecar.py::test_unusable_checkpoint_fails_the_turn_without_inventing_a_session`
  的 5 个参数化用例断言 turn=`failed`、Session 的 checkpoint digest/native id 保持原值、无该 turn 的
  delta，且 Core 账本记录唯一的 ambiguous dispatch 携带原因 `SIDECAR_CHECKPOINT_INVALID`，同时
  全 Session 只有首轮一次 dispatch accepted。

上方 JSON 取自提交检查点上的独立复跑（同一脚本、同一锁定工件、退出码 0），此前一次同结构运行亦
exit 0；两次的实例/会话标识不同，结构与断言语义一致，记录值即复跑值——本节的锁实例、稳定
server_id、checkpoint digest 与其他标识一律以上方 JSON 为准，不引用首跑的旧值。

检查点区分（三个不可互相替代）：native-state 实现基础为 `3e4282b`，r4 验收脚本/测试代码检查点为
`713b2e3`，本节证据是**已提交脚本上的 r4 复跑结果**，记录检查点为 `87b17a3`。`3e4282b` 只是
native-state 的实现基础，不是 r4 后端检查点。

环境与工件（本轮实测）：Windows 10.0.26200.9445、PowerShell 5.1.26100.9444、
Windows Python 3.12.10（`C:\WINDOWS\py.exe -3.12`）、WSL `Ubuntu`、Node v22.23.2、`/usr/bin/bwrap`；
Worker `sha256:bb90e346bbd857f02eba8d267f47c3ce793d30c9894ca823dc09c482d886f5eb`
（workerVersion 0.1.0 / wireVersion 1）；wire 生成工件
`sha256:5d4fa3bfeec6c3273c6073b37794e4ab2aca6e07e48184bc3a2b878c1fe5e4ed`（28 方法，脚本启动前校验；
前端 TS 权威 `11e3b3e70d332585d31900c09ba063d95aa6b72b1904921c665fb72f81c10035`，未改动前端）。

`accept-e.ps1` 本轮修复的自身缺陷（首次失败的精确现象保留在下节）：

1. 工作令指定的固定 bundle `workers/agent-box-worker/.acceptance-bundle-c2`（
   `sha256:08e4e057aef068997eb4efaa3717096a4f3fad54fd182a568853d8ed97a803c2`，2026-09-13 20:45）
   **早于 interactive channel 协议升级**（`05053f9`/`72d6258`），当前客户端发送的 bootstrap 带
   `protocolVersion`/`executables`，旧 Worker 因 `deny_unknown_fields` 拒绝为 `invalid bootstrap`，
   `workspaces.open` 直接 `WORKER_UNREACHABLE`。已按 `scripts/server-round1/build-worker.sh` 从当前
   源码重建为 `.acceptance-bundle-c3`（cargo 已是最新，未触发重编译），digest `bb90e346…`，与 r3
   证据中的 Worker digest 一致；c2 保持原样不再使用。
2. 广覆盖 fixture `fake_acp_peer.mjs` 未声明任何 model 目录，而 sidecar 现已按 adapter 实际提供的
   `configOptions` 校验模型，导致配置了 `fixture-model` 的 Profile 在 `create` 阶段被拒
   （`SIDECAR_OP_FAILED: Harness model is not available: fixture-model`）。fixture 现在声明它唯一接受的
   `fixture-model`，模型门因此在 Windows 真机链路上被真实走通，而不是把 Profile 的模型配置删掉绕过。
3. `test -e -- <path>` 在 GNU test 下对存在与不存在都返回 2，使 workspace 残留断言**恒真**；
   已改为读取退出码并把“无法求值”也算失败。这是 r3 记录中唯一被削弱的断言，现修复。
4. 清理期的断言会把真正的失败替换掉（finally 抛错覆盖主异常）；现改为收集清理问题并与主失败
   一起报告，且失败时保留 Server stdout/stderr 以便定位。
5. `session/resume` 归属：带权威 journal 的 `pi` 档案重开走 `session/load`，本次 r4 的有状态 fixture
   绑定无 journal 的 `hermes` 注册键才真正走 `session/resume`；两者现已分别断言，此前把 pi 的无模型
   双轮门记作 `session/resume` 的说法按此更正。

本阶段模型调用 **0**、费用增量 **¥0**；42 累计仍为 1 次/12 tokens/`<¥0.01`（上限 ¥10）。未读取任何密钥、
未发模型请求、未改前端、未读 WO42 locator。

41 平台门记为 `BACKEND_WINDOWS_R4_READY`。**不**登记整体 `BACKEND_IMPLEMENTATION_READY`：
Pi 生产封装已完成（PI_PRODUCTION_CHAIN_PREPARED，仍 MODEL_NOT_VERIFIED）；Hermes/OpenCode 生产封装与
**四家（Codex/Pi/Hermes/OpenCode）真实模型门**仍未完成，前端也未满足双门，故仍未进入全栈联调。
r4 证明的是 `tree_terminate` 有界强制树终止后的崩溃式重启、DataRoot 锁释放/重新获取与 native
`session/resume`；正常 Desktop/Server 生命周期退出与最终清理仍是后续全栈最终验收项，本轮不宣称
已覆盖。`workbench_model_verified_count` 仍为 **0**；费用账仍为累计 1 次/12 tokens/`<¥0.01`
（上限 ¥10），本阶段增量 ¥0。goal 未完成，也未进入全栈联调。

### 精确命令与结果

```text
powershell.exe -NoProfile -Command "[Parser]::ParseFile(accept-e.ps1)"        → PARSE_OK（语法/静态解析）
git diff --check                                                              → 通过
python -m pytest -q tests plugins/agent-box-harnesses/tests \
  plugins/agent-box-runtime-wsl/tests plugins/agent-box-sandbox-bwrap/tests \
  plugins/agent-box-runtime-local/tests
  → 348 passed, 4 skipped, 0 failed（PYTHONPATH 覆盖 src 与全部插件 src）
python -m pytest -q tests/server/test_harness_sidecar.py -k "state_projection|unusable_checkpoint"
  → 7 passed（2 个 resume 门 + 5 个不可用 checkpoint 反例）
node --test plugins/agent-box-harnesses/tests/harness_remote/*.test.mjs        → 25 passed, 0 failed
node --test scripts/server-round1/model-validation-42d.test.mjs                → 4 passed, 0 failed
cargo fmt --check && cargo test --locked --release（workers/agent-box-worker） → 4 passed, 0 failed
powershell.exe -File accept-e.ps1 … -Port 18744 -Cleanup                       → exit 0（上方 JSON）
powershell.exe -File accept-e.ps1 … -Port 18744 -PostCheck -InstanceId <两实例>  → exit 0（上方 JSON）
```

4 个 skip 为既有平台/显式环境条件项，未扩大。

### 本轮首次失败记录（均已修复后重跑）

1. `accept-e.ps1`（改后首跑）exit 1，原因是被断言掩盖：
   `Residual Server/Worker/sidecar processes remain: wsl:254523 … agent-box-worker --cleanup-manifest
   /tmp/pytest-of-maoqh/…`。定性：进程扫描过宽，匹配到同仓 pytest 留下的 `--delay-seconds 300`
   清理助手以及脚本自身命令行；**不是**残留 Server/Worker。
2. 修窄扫描后 exit 1：`workspaces.open failed: WORKER_UNREACHABLE`，Server 同期给出
   `Worker control stream closed … invalid bootstrap`。定性：c2 bundle 早于协议升级（见上）。
3. 换用重建 bundle 后 exit 1：`did not reach completed … state=failed error_code=EXECUTION_FAILED`。
   读 Windows DataRoot 的 Core 账本得
   `ExecutionDispatchAmbiguous error="SidecarError: SIDECAR_OP_FAILED: Harness model is not available:
   fixture-model"`。定性：fixture 未声明 model 目录（见上）。
4. 再次 exit 1：`First-round checkpoint is not bound to its own execution`。定性：断言比较对象写成
   Server turn id，而 checkpoint 的 `sourceExecutionId` 是 Core execution id（turn 行的 `execution_id`）。
5. 再次 exit 1：`另一个程序已锁定文件的一部分` + 清理期 `server.lock 正由另一进程使用`。定性：
   Server 持有 `server.lock` 的字节区间锁时 `Get-Content` 必然失败；同时 stop 走 `taskkill /T /F`
   树终止前不得读锁。改法见上（停止→读锁作为释放证据；清理问题不再掩盖主失败）。
6. 再次 exit 1：`Second round did not reopen … session/resume: System.Object[]`。定性：`Get-R4ReopenMethods`
   返回数组时被 `@()` 再包一层，比较的是内部数组而非最后一项；首轮只有一行故侥幸通过。

其中第 5 次失败在隔离 DataRoot 留下未完成的删除（仅剩 `server.lock`，owner marker 已被部分删除）。
已按“先核对再处理”的原则人工核对内容与路径后才删除该残留，另有一次 DataRoot 删除被 marker 守卫
正确拒绝（左侧文件被占用），均未绕过守卫。

## 2026-09-14 13:24 +08:00 — native state 双轮纵向检查点

- `3e4282b` 把部署声明的有界 native-state 子树从 Worker 回收到 Windows ObjectStore，并以 schema 2
  checkpoint 绑定 harness/native id 后投递到下一 turn。状态捕获限制 256 文件/8 MiB，验证路径、长度、
  offset、digest 并扫描本次凭据原文；只读配置投影与可写 state target 冲突时在启动前拒绝。
- 真实无模型门由两个全新的 sidecar 进程穿过 Server→Core→真实 Worker ABW1 interactive→bwrap：首轮
  写入 nonce，第二轮必须以 ACP `session/resume` 打开同一 native id 并回答该 nonce；第二轮 delta 先于
  completed，退出后 views/secrets 均不存在。
- 真实 `codex-acp 1.1.14`→Codex app-server `0.147.0` 另行完成隔离配置读取门，仅到 session create、
  无 prompt；使用测试 credential，未读取授权 locator、未发模型请求。wheel 已包含官方完整 models JSON
  和固定 sidecar TOML。
- 回归：Server `98 passed, 1 skipped`；WSL runtime+bwrap `43 passed`；本阶段定向 Python `71 passed`；
  Node `13 passed`。累计费用仍为 1 次/12 tokens/`<¥0.01`。Windows r4 尚未运行；该结论随后由本文件顶部
  的 r4 平台门小节取代（`BACKEND_WINDOWS_R4_READY`）。

## 2026-09-14 — Codex 官方 Responses 隔离投影检查点

- 只读取得 DeepSeek 官方 `codex-deepseek-setup.sh` 1.3.0，脚本 SHA-256
  `0a3a33704e1fb1579300d559f009279c7db8e06aa428a0cba07ac9e265a130ca`；未执行脚本、未修改用户
  `~/.codex`。仓内 `deepseek-models.json` 与官方 heredoc 原始字节完全一致，包含
  `deepseek-flash`、`deepseek-v4-pro` 各39字段；AgentBox运行白名单仍只有 `deepseek-flash`。
- `399d78d` 增加 Harness-owned 无密钥配置生成、实际wheel目录包含性、deployment内的adapter source/
  非敏感环境/配置文件、摘要固定外部可执行文件挂载，以及ACP `api-key`首选认证接缝。TOML固定
  `responses`、官方根URL、`high`、禁用搜索，catalog指向隔离内实际绝对路径；首次真实尝试只走
  Worker秘密帧注入的 `CODEX_API_KEY`，配置里没有 `experimental_bearer_token`。
- 定向验证为 Python 53 passed、Node 25 passed，wheel确实包含完整目录；未读密钥、未发模型或网络请求，
  费用账不变。
- 该检查点的集成审阅当时发现并如实降级：每turn清理临时native home，只有native id、没有会话文件，
  尚不能证明第二轮上下文或原生resume。此历史缺口随后由 `3e4282b` 的通用有界捕获/Windows
  ObjectStore持久化/下一轮回投与真实无模型双轮门关闭；Server/Core仍未增加Codex分支。

## 2026-09-14 12:44 +08:00 — 模型冻结与秘密投影代码检查点

- `502f4b5` 将 Profile 的模型引用解析为包含 ProviderModel id/version、provider、model、credentialId
  和非敏感配置的不可变 execution 投影；排队项继续持有同一对象摘要，后续 ProviderModel 更新不会
  改写已接受工作。
- 生产 sidecar 装配在派发时才把 credentialId 解析到 SecretStore；内容只经 Worker `secret.put`
  进入一次性帧，并固定只读挂载到隔离内。adapter 只收到部署声明的环境名，模型进入原生
  `create`/`prompt`；正常关闭、启动拒绝和 Worker 终态均安排秘密清理。
- 定向验证：Server/wire 相关 45 passed，Worker/bwrap 32 passed，Node envelope 4 passed；其中新增
  5 个冻结、kind mismatch、argv 非泄漏和启动异常清理反例。没有读取真实 locator、没有模型或网络
  请求，累计费用仍为 1 次/12 tokens/<¥0.01。
- 此检查点只证明接线与组件生命周期。Pi/Hermes/OpenCode 的原生运行时工件/配置进入生产 bwrap
  以及逐家真实模型门仍需完成；Windows r4 平台门已通过，但后端状态不提前升级。

## 2026-09-14 12:15 +08:00 — 28 方法 wire 重锁

- 前端提交：`3aba5c5c8743401b964f80c88bd43e847fa3d5a8`；writer lease 仍 ACTIVE，未接管前端。
- 双方摘要：TS `11e3b3e70d332585d31900c09ba063d95aa6b72b1904921c665fb72f81c10035`；生成工件
  `5d4fa3bfeec6c3273c6073b37794e4ab2aca6e07e48184bc3a2b878c1fe5e4ed`。
- 后端对该实际工件严格回归 `29 passed in 67.57s`，队列终态差异关闭，状态
  `WIRE_LOCKED_FOR_IMPLEMENTATION`。
- 尚未进入全栈联调；Windows r4 重确认已完成（见顶部）。真实模型调用数与费用无变化：累计1次、
  12 tokens、<¥0.01。

## A — 前端只读观察与 wire 增量协作（**历史快照，段内观察均属 2026-09-14；当前结论见本文件顶部最新条目**）

后端在41收口期间按42-A同等写权约束做只读检查（未写前端任何文件、未杀其进程、未发第二个 goal）。

### 2026-09-14 14:24 +08:00 — 历史只读观察（**不构成当前结论**；最新观察见本文件顶部 42 条与 status）

- 工作树 `/home/maoqh/projects/agent-box-desktop-next-wsl-round1`，分支
  `feature/agentbox-desktop-product`，实际 HEAD `b02093ce9ee60dfaea7867afefe3500262ec8cc0`
  （`docs(desktop): audit the 28-method client matrix`，提交于 2026-09-14 14:11:55 +08:00）。
  工作树 **dirty**：17 个已修改文件（composer/Profile/i18n 等生产与测试文件）+ 1 个未跟踪测试文件，
  属正在施工；后端不取写权。
- 其 `docs/desktop-product-delivery/status.md`：`frontend_implementation=PARTIAL`
  （当前阶段为 P05 客户端矩阵只读审计：22 PRODUCTION_REACHABLE、6 FIXTURE_ONLY_FRONTEND_GAP、
  0 CLIENT_READY_NO_SURFACE、1 EXTERNAL_LIFECYCLE_BLOCKED；P04 production lifecycle connection 与
  P06 无模型独立验收待续，`REAL_FLOW_VERIFIED=否`），
  `writer_lease=ACTIVE — Codex frontend goal`（09:20 接管；声明完成后停止写入并回报，不提前 RELEASE），
  尚未达到 `DESKTOP_IMPLEMENTATION_READY`。该文件自述 `updated_at: 2026-09-14 14:32 (+08:00)`，
  晚于其文件 mtime（14:11:24）与 HEAD 提交时间（14:11:55）；按只读观察如实记录并报告，不改前端。
- wire 摘要未变：就地重算 `apps/desktop/src/types/wire/wire-v1.ts` =
  `11e3b3e70d332585d31900c09ba063d95aa6b72b1904921c665fb72f81c10035`、
  `docs/desktop-product-delivery/contracts/wire-v1/generated/wire-v1.schema.json` =
  `5d4fa3bfeec6c3273c6073b37794e4ab2aca6e07e48184bc3a2b878c1fe5e4ed`，生成工件内仍为 28 个方法，
  与后端锁定值一致，故锁保持 `WIRE_LOCKED_FOR_IMPLEMENTATION`：未重锁、未改合同。
- 前端 ACTIVE/dirty 不是阻断，不构成接管条件；后端未写前端任何文件、未杀其进程。

### 2026-09-14 12:15 +08:00 — 上一轮观察（历史）

- 工作树 `/home/maoqh/projects/agent-box-desktop-next-wsl-round1`，2026-09-14 12:15 +08:00
  实际 HEAD `3aba5c5c8743401b964f80c88bd43e847fa3d5a8`；writer 正在 P04 下一切片，工作树非 clean。
- 其自身 status：`frontend_implementation=PARTIAL`（P00/P01 GREEN、P02 A/B1/B2/C/D、
  P03纵切1–2和 P07 28方法增量已提交；P03生产调用者及 P04–P06待续），
  `writer_lease=ACTIVE — Codex frontend goal`（09:20 接管），
  尚未达到 `DESKTOP_IMPLEMENTATION_READY`。
- 前端已消费核心维护与队列终态反馈，并在同一 wire 提交 Session/history 28方法增量及
  completed/failed/cancelled 编码。后端对实际生成工件 29/29 回归通过，双方摘要已锁定；
  无需用户逐字段批准。

## B — 双门判定（**2026-09-14 历史快照；当前判定见 status 的 42 双门与前端观察字段**；表内"剩余"项已于其后各轮完成——Codex 封装与四家 HOME 见 c5 轮、错误边界/c7 见 2026-09-15 轮）

| 门 | 判定 | 依据 |
| --- | --- | --- |
| BACKEND_IMPLEMENTATION_READY | **否（暂时）** | 28方法+队列终态已锁定并29/29；Windows r4 平台门已通过（`stop_mode=tree_terminate` 有界强制树终止后的崩溃式重启、DataRoot 锁释放/重新获取、同 native id `session/resume`、终止前 delta、ObjectStore checkpoint、清理与独立 `-PostCheck`；正常生命周期退出未覆盖）；**四家生产封装与四家原生 HOME 隔离均已完成**（\*_PRODUCTION_CHAIN_PREPARED，仍 MODEL_NOT_VERIFIED）；此后剩余的唯一后端门是 **四家真实模型门**（历史表述"剩余 Codex 生产封装、四家原生 HOME 实施"已被 c5 轮与错误边界/c7 轮取代） |
| DESKTOP_IMPLEMENTATION_READY | **否（历史快照）** | 前端自报 PARTIAL，且 `writer_lease=ACTIVE`（未释放）；独立实现/验收门未完。（已被其后前端 r2/r3 与 2026-09-15 复测取代：r3 28 PASS、lease RELEASED、clean、HEAD `8e7c138c`） |

因此仍**没有**记录 `FULLSTACK_INTEGRATION_OWNER`，**没有**接管前端工作树，
**没有**启动跨端链路。这是纪律要求，不是进度不足的借口。

## C — 无模型联调

未进入（依赖 B 的双门）。

## D — 真实模型授权与逐家验收（**四家已验通过，见本文件顶部 2026-09-15 轮；以下为过程记录**）

授权：仅 DeepSeek 官方 API，全轮累计 ≤ ¥10；凭据 locator 见工单 §D。

### 已完成

1. **凭据 locator 校验**：目录 0700 / 文件 0600、长度 35、`sk-` 前缀（只读元数据，
   未打印内容）。未读取其他凭据、未读取旧 37 密钥或任何登录态。
2. **官方 API 可达性（有界最小调用）**：`POST https://api.deepseek.com/chat/completions`，
   `model=deepseek-chat`，`max_tokens=8`。返回 HTTP 200，内容 `ok`，
   usage `{prompt_tokens: 11, completion_tokens: 1, total_tokens: 12}`。
   **这是 API 可达性证据，不是 Harness 验收**。
3. **Codex 家：保留错误配置失败，撤回协议不兼容结论。** 先前 Provider 配置
   （`$CODEX_HOME/config.toml` 定义 `model_providers.deepseek`，`base_url` 指向
   DeepSeek 官方、`env_key=DEEPSEEK_API_KEY`）驱动内嵌 Codex 0.147.0：

   ```text
   session/new → error -32603 "Internal error"
   data: "failed to reload config: .../config.toml:8:12: `wire_api = \"chat\"` is no longer
   supported. How to fix: set `wire_api = \"responses\"` in your provider config."
   ```

   这只能证明 Codex 0.147.0 拒绝过时的 `wire_api="chat"`，不能证明 DeepSeek 官方服务不支持
   Responses。用户提供的 DeepSeek 官方 `codex-deepseek-setup.sh` 1.3.0（2026-09-14 只读取得
   SHA-256 `0a3a33704e1fb1579300d559f009279c7db8e06aa428a0cba07ac9e265a130ca`）明确配置
   `base_url="https://api.deepseek.com/"` 与 `wire_api="responses"`，并提供完整模型目录。
因此撤回“协议不兼容/证伪”结论；原错误与零模型调用事实保留。`399d78d` 已完成官方 Responses
非敏感配置和完整目录投影，但尚未发真实模型请求；不会执行该脚本、修改用户真实 `~/.codex` 或建设协议代理。

### 未完成

- Pi / Hermes / OpenCode（并入 Codex 后为四家）的真实模型验收：无模型配置与有界 runner 已在 `bc7d95b` 完成，
  `502f4b5` 完成生产 sidecar 的冻结/秘密投影基础；原生运行时封装及付费验证尚未完成。本轮仍未执行、
  未用组件结果冒充。
- 42-D 的「UI 选择角色 → 首次发送 → 终止前内容 → 继续一轮 → 关闭重开恢复历史」
  完整链路依赖 42-B 双门，未执行。

### 费用账（累计）

| 项 | 调用数 | 用量 | 估算费用 |
| --- | --- | --- | --- |
| DeepSeek 官方 API 可达性检查 | 1 | 12 tokens（11 in / 1 out） | < ¥0.01 |
| Codex 错误 chat 配置尝试 | 0 次模型调用 | 0（在 `session/new` 阶段即失败，未发起模型请求） | ¥0 |
| Pi 全链门（`--live`，含 2 次缺口失败后重跑） | ~10 | 每轮数百 in / ≤64 out | < ¥0.01 |
| Hermes 全链门（`--live`） | ~6 | 同上 | < ¥0.01 |
| OpenCode 全链门（`--live`，含 1 次缺口失败） | ~8 | 同上 | < ¥0.01 |
| Codex 全链门（`--live`，含 4 次缺口失败，其中 1 次为 locator 路径笔误、1 次为报告序列化缺陷） | ~12 | 同上 | < ¥0.01 |
| **合计** | ~37 | 12 tokens + 四家两轮 | **< ¥0.05 / 上限 ¥10** |

（四家每轮输出上限 64 tokens 由受审配置固定；上界换算见 [live-model-preflight.md](live-model-preflight.md) §2，
最坏情形 < ¥0.4，实测远低于此。缺口失败的运行都在发包前结束，不计模型调用。）

未预留、未充值。若后续继续，建议按 8 元停止新增测试留结算余量（工单建议）。

## E — 最终验收与提交

未执行（依赖双门与真实门）。41 的25方法/Windows基线检查点为 `72d6258`；r4 相关检查点为 native-state
实现基础 `3e4282b`、r4 验收脚本/测试代码 `713b2e3`、已提交脚本上的 r4 复跑证据 `87b17a3`（见顶部），
跨仓联调仍待双门。
更早检查点见 status：
`b84dc87`(39) → `38b28d6`(40-A) → `05053f9`(40-B) → `340fcad`(40-C) → `b70cd3f`(40-D)
→ `7e9ffd8`(41) → `8eeb422`(42-A 观察) → `978918d`(sidecar 桥)。
未 push、未 merge、未 force、未改动发布源或用户真实数据。
