# state capture 类型化错误边界 + c7（付费真实模型门之前的最后返修）

日期：2026-09-15。执行分支 `feature/server-harness-extension-v1`（起点 `897a833`）。
模型调用 0、费用增量 ¥0；未读取任何真实凭据；未写前端工作树。

## 1. 缺陷与先失败后修

缺陷：Worker 把特殊文件、traversal 上限、文件数上限全部报成同一个 `VIEW_INVALID`，
而 sidecar 的 `_STATE_TRANSIENT_CODES` 又把 `VIEW_INVALID`/`VIEW_IO`/`VIEW_INCOMPLETE`
无条件当作"state 还在变"，于是这些**确定性拒绝**都会被重试到 deadline，最后被改写成
`SIDECAR_STATE_NOT_SETTLED`——失败原因与失败层级全部丢失。

先写会失败的测试（实现前的真实输出保存在本轮会话记录）：

- Rust（`workers/agent-box-worker/src/main.rs` `view_listing_tests`）：改断言 + 新测共
  **8 failed / 12 passed**，失败信息都是 `left: "VIEW_INVALID"` —— 即旧合同的实际产物。
- Python（新文件 `tests/server/test_state_capture_error_boundary.py`）：
  **13 failed / 4 passed**。该文件的代码不是自造的：它从 `workers/agent-box-worker/src/main.rs`
  的**被审计位置**提取 Worker 实际返回的错误码（结构化标记，不是英文 message），
  再用这些码驱动真实 settle 循环，所以"确定性拒绝被当作 churn"在实现前是可观测失败。
- 跨层端到端：同文件另有两个测试**启动真实 Worker 进程**（ABW1 协议）验证
  特殊文件/文件数上限/缺失/首次越界的实际返回码，并把返回码与 sidecar 分类对照
  （vanish 与首次越界的现行语义见 §2 修复后合同；本句为第一轮时的措辞）。

## 2. 最终错误分类表（Worker → Sidecar）

| Worker 位置 | 码 | 分类 |
| --- | --- | --- |
| `list_view_files`：FIFO/socket/设备；`view.get`：目标非普通文件或路径经符号链接解析 | `VIEW_SPECIAL_FILE` | 立即失败 |
| `list_view_files`：访问条目 > 4096 | `VIEW_TRAVERSAL_LIMIT` | 立即失败 |
| `list_view_files`/`view.list`：普通文件 > 1024；`view.prepare`：manifest > 1024 | `VIEW_FILE_LIMIT` | 立即失败 |
| `view.get`：条目不存在（首次请求即无历史证明） | `VIEW_MISSING` | 立即失败；capture 对"刚列出过的路径"把它转换为 `SIDECAR_STATE_IDENTITY_CONFLICT` 重试 |
| `read_view_entry`：fd 打开后 fstat 身份（dev/ino/size）改变，或读出超过上限 | `VIEW_CHANGED` | 瞬态（有界重试） |
| `view.get`/`_view_bytes`：size/offset/digest 在分块读取中改变 | `SIDECAR_STATE_IDENTITY_CONFLICT` | 瞬态（有界重试） |
| `view.get`：fetch range 非法、超过 artifact 上限、路径非法、首次 offset 越过末尾 | `VIEW_INVALID` | 立即失败 |
| `view.get`/`view.list`：真实 I/O 故障（非 NotFound） | `VIEW_IO` | 立即失败 |
| view 未提交 / commit 读回缺失 | `VIEW_INCOMPLETE` | 立即失败 |
| commit 读回摘要不符 | `VIEW_DIGEST_MISMATCH` | 立即失败 |
| state：凭据命中 / >256 文件 / >8 MiB / 受保护路径 | `SIDECAR_STATE_CONTAINS_SECRET` / `SIDECAR_STATE_OUTSIDE_BOUNDS` / `SIDECAR_STATE_PROTECTED_PATH` | 立即失败 |

不变式：deadline 到期仍是 `SIDECAR_STATE_NOT_SETTLED`（绝不静默 checkpoint）；
重试集合 = `_STATE_TRANSIENT_CODES = {SIDECAR_STATE_IDENTITY_CONFLICT, VIEW_CHANGED}`；
分类只读 `code`，**从不读英文 message**（`tests/…error_boundary.py::test_the_classification_never_reads_the_error_message`
把两条 message 交叉互换仍按 code 分类）。4096/1024/256/8 MiB 上限、symlink
不跟随不读取不捕获但计入 traversal、特殊文件拒绝、protected 恢复拒绝——全部保持。

"确定性错误不再被改写"的原因：重试只对"字节还在动"的码合法；拒绝类码表达的是
调用方必须看到的决定（政策或资源上限），重试不可能改变它，只会掩盖原因。

### 2.1 fd 锚定 no-follow 打开（Reviewer 复审 P0 修复）

状态源是 Harness 可写 bind，"先 lstat 检查、再按路径打开"存在 TOCTOU：检查与打开之间把
普通文件或父目录换成指向 view 外的符号链接，`fs::read` 会跟随。现 Worker 全部视图读取
改为 **fd 锚定逐组件 no-follow**：`view.get`/`view.commit`/`view.list` 先把 view 目录
打开为 fd，`open_beneath` 用 `openat(.., O_NOFOLLOW|O_DIRECTORY|O_CLOEXEC|O_NONBLOCK)`
逐组件打开；读取用已验证 fd 的 `fstat` 取类型/大小，读以 artifact 上界为限（`take`），
读后再 `fstat` 比较 (dev,ino,size)，不一致报 `VIEW_CHANGED`。反例测试：**末组件换链**
（`state.db` 原子换成指向 view 外 sentinel 的链接 → `VIEW_SPECIAL_FILE`，sentinel 未被读）、
**父目录换链**（`a` 换成外部目录链接 → 确定性硬失败，外部字节不会出现）、
**超过上限**（`set_len(MAX+1)` → 打开后按 fd 大小拒绝，不做无界读）。
列出时子目录在遍历中消失/变链按 churn 跳过（下一 snapshot 自然不同），其余保持类型化拒绝。

## 3. 协议兼容性（错误码合同的精确化）

只新增错误码值，帧格式与响应形状未变：失败仍是 1 个 `WorkerError` 帧、
`{"requestId","ok":false,"error":{"code","message"}}`（`view_error_envelope_tests`
逐帧断言 key 集合不增长，含新旧码各值）。因此 **ABW1 frame/manifest `wireVersion = 1`**
与 **Worker control `PROTOCOL_VERSION = 3`** 均不变。

错误码**是合同的一部分**，其扩展规则与混合世代语义已写入 `protocol.rs` 并由测试锁定：
码集只做增量扩展；请求/响应永不增加码专属字段；客户端对**不认识的码一律视为拒绝、
绝不重试**（fail closed）；sidecar 的重试清单只包含它已知含义为"字节在动"的码。
因此混用两个世代只会向更严格方向退化：旧客户端遇到新 Worker 的新码直接拒绝；新客户端
遇到旧 Worker 的共享 `VIEW_INVALID` 拒绝也直接拒绝（不再重试）——两个方向都不会把失败
变成假绿。混合行为已被第一手验证：旧 c6 Worker + 新 sidecar 的复测中，旧码 `VIEW_INVALID`
被立即拒绝而非重试（见 §4.1）。

## 4. c7 与五门复跑（串行，全部用 c7）

c7 = `.acceptance-bundle-c7/agent-box-worker`，
sha256 `6408fbc7da63e9b85c52ab1902ab12e3faa5160021187328b03b5fa9dc9848d4`，
manifest `wireVersion=1`；c4（`31e92959…`）/c5（`92eac03a…`）/c6（`96256b2e…`）未覆盖，
复跑前后摘要逐一核对未变。

| 门 | 结果 |
| --- | --- |
| runtime-artifact-gate | exit 0，`RUNTIME_ARTIFACT_PROJECTION_GATE_OK`，`worker_left_no_projection=true` |
| Codex（默认模式，双构建工件） | exit 0，`CODEX_PRODUCTION_CHAIN_GATE_OK`，连续 10 轮 |
| Codex（外部工件模式，`--artifact`） | exit 0，`treeDigest=sha256:9051b844…`，stateScan 79 文件无 token 命中 |
| Pi | exit 0，`PI_PRODUCTION_CHAIN_GATE_OK` |
| Hermes | exit 0，`HERMES_PRODUCTION_CHAIN_GATE_OK` |
| OpenCode | exit 0，`OPENCODE_PRODUCTION_CHAIN_PREPARED` |
| Windows r4（c7） | exit 0，`BACKEND_41_E_WINDOWS_WSL_WIRE_OK`，`worker_digest=sha256:6408fbc7…`，`stop_mode=tree_terminate`、`session/new→session/resume`、delta 10 < completed 12、`state_projection=/runtime/home/sessions`、**lease_silence：声明 8s 静默、`lease_ms=5000`、`lease_override=false`、`elapsed_ms=8840` 完成** |
| 独立 PostCheck | exit 0，`BACKEND_41_E_WINDOWS_POSTCHECK_CLEAN`（DataRoot/workspace/端口/进程/worker view 全空） |

### 4.1 如实记录：Codex 门的一次间歇失败（已诊断到层，未复现）

c7 首跑与 c6 对照跑（01:2x–01:3x +08:00）曾在**第一轮 state 捕获**失败：c7 报
`VIEW_FILE_LIMIT`、c6 报 `VIEW_INVALID`（同一位置：capture 时 view 列表超过 1024 个
普通文件）。要点：

- 两个不同 Worker 版本都失败，且计数规则本轮未改——**不是本修复引入的条件**；
- 修复只改变结果的可读性：旧行为会把同一条件重试 10s 后报 `NOT_SETTLED`，新行为立即
  报准确码；
- 随后 c7 复跑 **10 轮**（9 轮默认模式 + 1 轮外部工件模式）全部 exit 0，门内新增的
  `StateSymlinkWatcher` 采样显示 view 峰值稳定在 **114 个普通文件**（上限 1024）；
- 未找到产生 >1024 的触发条件，作为**未解决的环境级间歇项**记录；为使下次可诊断，
  watcher 现在常驻记录 `stateProjectionObservation`（峰值文件数/最重子树/是否超限），
  且 `annotate_known_blocker` 只在"观察到别名链接且 turn 失败"时输出历史诊断
  （绿跑不再误报 blocker）。

## 4.2 Reviewer 复审后的修复验证（c8）【历史快照：本节计数与 Codex 门状态已被 §4.4 取代】

Reviewer `CHANGES_REQUIRED` 的修复（§2.1/§7.1）落地后重建
**`.acceptance-bundle-c8` = `sha256:514f48a9c24c8a13edefa4eb3aa5473b0f3a25d88a94aea1a19bb16ea2707975`**
（取代而非覆盖 c7；c4–c7 摘要逐一核对未变）。用 c8 串行复跑：

| 门 | 结果 |
| --- | --- |
| runtime-artifact-gate（c8） | exit 0，`RUNTIME_ARTIFACT_PROJECTION_GATE_OK` |
| Pi（c8） | exit 0，`PI_PRODUCTION_CHAIN_GATE_OK` |
| Hermes（c8） | exit 0，`HERMES_PRODUCTION_CHAIN_GATE_OK` |
| OpenCode（c8） | exit 0，`OPENCODE_PRODUCTION_CHAIN_PREPARED` |
| Codex（c8，默认模式）【历史快照：现行状态见 §4.4 的红绿间歇】 | 当轮 10 轮 exit 0（`…_GATE_OK`）+ 2 轮失败（见下，均已第一手定位） |
| Windows r4（c8） | exit 0，`BACKEND_41_E_WINDOWS_WSL_WIRE_OK`，`worker_digest=sha256:514f48a9…`，`tree_terminate`、`session/new→session/resume`、delta 9 < completed 12、8 秒静默默认租约 `elapsed_ms=8817` 完成 |
| 独立 PostCheck（c8 实例） | exit 0，`…_POSTCHECK_CLEAN`（DataRoot/workspace/端口 18746/进程/view 全空） |
| Python 全量【历史值，已被 843/6 取代】 | **820 passed / 4 skipped / 0 failed**（gate 诊断当时 5 例；+8：边界改约 6、既有微调；4 项既有 skip 未扩大） |
| Rust | fmt 干净；`cargo test --locked --release` **27 passed** |

### 4.3 两个第一手定位的 Codex 原生行为发现（待用户裁决，未擅自处置）

1. **技能/插件物化突发（`VIEW_FILE_LIMIT` 的根因）**：门内采样器在失败轮测得 view 峰值
   **5529 个普通文件**，全部位于 `agentbox-sidecar/deployment/codex/native-state/.tmp/plugins/…`
   —— 即 Codex 0.147.0 运行时把内置 plugin/skill 语料（react-best-practices、vercel、nvidia、
   zoom 等）解包进 `$CODEX_HOME/.tmp/plugins/`，而该目录在声明 state 投影（`$CODEX_HOME`）内。
   突发是瞬态的（绿跑峰值仅 114 文件），但它一旦与捕获重叠，Worker 列表上限 1024 立即
   `VIEW_FILE_LIMIT`（确定性拒绝，行为符合本阶段合同）。这不是本修复引入的：旧码时代同一
   条件重试 10 秒后报 `SIDECAR_STATE_NOT_SETTLED`。
2. **凭据材料瞬时入 state（凭据扫描正确拦截）**：一轮中 sidecar 凭据扫描在原生 state 里
   命中假 token（`SIDECAR_STATE_CONTAINS_SECRET`，扫描消息现含文件相对路径、绝不含凭据
   内容）。约 1/15 概率复现；命中文件尚未捕获到（view 已被清理）。假端点轮 budget 内无额外
   provider 请求，故最可能是 Codex 在某条路径（如 ephemeral 凭据或请求重试日志）把凭据
   **瞬时写进自己的 home**。对付费真实模型门这是关键前置风险：真实 key 一旦入 state，
   捕获扫描会（正确地）拒绝。

## 4.4 Reviewer 第二轮后的修复与最终复跑（2026-09-15）

第二轮 `CHANGES_REQUIRED` 的窄化发现与处置：

1. **真实分块截断的失败层级**：`_view_bytes` 现把"已持有至少一个分块后的 range
   `VIEW_INVALID`"转换为 `SIDECAR_STATE_IDENTITY_CONFLICT`（瞬态、有界重试）；首次请求的
   range 错误保持确定性硬失败。新增三层反例：脚本视图"首块成功→后续块 VIEW_INVALID"持续
   →`NOT_SETTLED` 且 get≥3、单次→以完整新字节收敛、真实 Worker 端到端（40 000 字节文件
   两块 put，第一块返回后截断，第二块得确定性 `VIEW_INVALID`）。
2. **alias blocker 因果再收窄**：`VIEW_FILE_LIMIT` 与 `SIDECAR_STATE_CONTAINS_SECRET` 从
   `STATE_CAPTURE_CODES` 移除（二者已有第一手的无关根因）；新增负向测试
   （file-limit/secret-scan 即使 capture 失败也不得生成 alias blocker）。
3. **文档矛盾清理**：status/progress/evidence 中 c7 现行表述、旧 `VIEW_CHANGED` 语义、
   "token 绝不入 state"绝对结论、812/22 计数——全部日期化标注取代关系。

最终复跑（Worker 源自 c8 构建后未再变，`git diff <fix-commit> -- workers/` 为空，c8 摘要
仍为现行 bundle；c4–c7 未覆盖）：runtime-artifact/Pi/Hermes/OpenCode **exit 0**；Windows r4
（c8）**exit 0** + 独立 `-PostCheck…CLEAN`（本次 fresh 实例核对）；Python 全量
**820 passed / 4 skipped / 0 failed**【历史值，已被 843/6 取代】（更早 812/22 亦已取代）；Rust fmt 干净 +
`cargo test --locked --release` **27 passed**；`git diff --check` 通过。
【历史快照：未解决的红绿间歇（已被现行检查点取代）】**——`.tmp/plugins` 突发间歇性重叠捕获：2026-09-15
晚间连续 5 轮红（峰值恰 5529 → 确定性 `VIEW_FILE_LIMIT`）；alias 诊断非因果化修复提交后
**最近 3 轮绿**（`…_GATE_OK`，报告无 blocker 键、绿跑无任何注记键）。两种状态都如实记录，
按 §4.3 待用户裁决。

## 4.5 用户裁决 A 的实施（2026-09-15，决策：方案 A）

用户裁决：方案 A——`.tmp` 声明为 attempt-ephemeral 投影，1024 上限与 fail-closed 扫描不变。

实施（通用机制，无品牌分支）：
- `stateProjection` 新增可选 `ephemeralPaths`（相对 state 目标的子路径，≤8 项，逐项过
  `home_projection` 目录语法）；部署加载器缺省兼容（无该键 = 无临时路径）。
- bwrap 编译器新增 `ephemeral_state_mounts`：校验必须落在已声明可写 state 目录内、
  且不得包含任何只读投影文件；在**全部 bind 之后**按序追加 `--tmpfs <target>`（遮蔽语义）。
- `WslSidecarLauncher` 透传 `state_ephemeral_paths`；Codex 生产模板声明
  `ephemeralPaths: [".tmp"]`；Codex 门 launcher 同步。

证明与测试：
- 真实 bwrap 遮蔽测试：沙箱内写 `.tmp/plugins/blob` 成功可见，但宿主 state 目录只有
  空挂载点 `.tmp` 与普通兄弟文件——burst 文件永不落盘；argv 顺序断言 tmpfs 在 state bind
  之后；越界路径/含 RO 文件两类拒绝；部署缺省兼容。
- **c8 有界复跑 3 轮**：全部 exit 0（`…_GATE_OK`），view 峰值 **113**（不再出现 5529 突发）、
  `tokenInState=false`、captured state 78 文件；`state/checkpoint/workspace/Git` 的假 token
  扫描全部通过。
- Python 全量 **822 passed / 6 skipped / 0 failed**；Rust fmt 干净 + 27 passed；
  Worker 源未变（`git diff` 为空，c8 摘要仍为现行 bundle）；`git diff --check` 通过。
- **泄漏路径已捕获（watcher 诊断，第一手）**：门内凭据路径观察器（只记脱敏相对路径，
  每文件只读前 64 KiB，token 为运行期生成假值）在 `--legacy-state-diagnostic` 轮命中：
  `native-state/shell_snapshots/<uuid>.<ns>.sh`——Codex 0.147.0 把 shell 快照（含全部
  环境导出，即注入的凭据环境变量原文）写进该目录。因此方案 A 扩展为
  `ephemeralPaths: [".tmp", "shell_snapshots"]`（同一 tmpfs 机制）。
  **遮蔽后最终复跑（4 轮，本 HEAD）**：全部 exit 0（`…_GATE_OK`）、view 峰值 **112**、
  `tokenInState=false`、credentialPathHits=0、state 78 文件。
- 无遮蔽诊断分账（历史）：诊断模式 9 轮全绿（含 1 轮 --keep），secret 与突发未复现——
  与写入时机相关；遮蔽模式早期 3 轮绿 + 最终 4 轮绿。以上均按日期入库本节。

## 4.6 最终 HEAD 的逐门结果（Reviewer 第十二轮 P2 要求）

以下每一项都在同一实现树（HEAD 见本节末的提交号）上执行，命令与退出码逐条记录：

| 门/套件 | 命令 | 结果 |
| --- | --- | --- |
| runtime-artifact | `python3 scripts/server-round1/runtime-artifact-gate.py --worker <c8> --json` | exit 0，`RUNTIME_ARTIFACT_PROJECTION_GATE_OK` |
| Pi | `…/pi-production-chain-gate.py --worker <c8> --json` | exit 0，`PI_PRODUCTION_CHAIN_GATE_OK` |
| Hermes | `…/hermes-production-chain-gate.py --worker <c8> --json` | exit 0，`HERMES_PRODUCTION_CHAIN_GATE_OK` |
| OpenCode | `…/opencode-production-chain-gate.py --worker <c8> --json` | exit 0，`OPENCODE_PRODUCTION_CHAIN_PREPARED` |
| Codex（遮蔽模式，最终版） | `…/codex-production-chain-gate.py --worker <c8> --json` | exit 0，`CODEX_PRODUCTION_CHAIN_GATE_OK`，view 峰值 112、`tokenInState=false`、`credentialPathHits=0`；观察器判据：`cyclesCompleted≈224`、`filesObserved≈83`、`incomplete=null`（连续 3 轮） |
| Windows r4 | `accept-e.ps1 … -Port 18746 -Cleanup`（c8，`worker_digest=sha256:514f48a9…`） | exit 0，`BACKEND_41_E_WINDOWS_WSL_WIRE_OK` |
| 独立 PostCheck | 同参数 `-PostCheck -InstanceId <两实例>` | exit 0，`BACKEND_41_E_WINDOWS_POSTCHECK_CLEAN` |
| Python 全量 | `PYTHONPATH=src + 全部 plugins/*/src python3 -m pytest -q tests <插件 tests>` | **852 passed / 6 skipped / 0 failed**（现行；本表其余计数均为该表形成时的历史值） |
| Rust | `cargo fmt --check` + `cargo test --locked --release` | fmt 干净；27 passed |

skip 说明：6 项均为既有平台/环境条件项（不含本轮新增测试）。清理：门临时根与
`--keep` 诊断根已按属主核对删除；Windows DataRoot/workspace/端口/进程由 PostCheck 独立复核。
对应实现：`b0820d4`（壳快照遮蔽）+ 本文件所在提交的 `fix:` 提交（fd 锚定观察器与
fail-closed 判据）；Worker 源自 c8 构建后未变（`git diff -- workers/` 为空），故 c8 摘要仍为现行 bundle。

## 4.7 源头修复：官方 Codex feature flags（用户提示调研后第一手验证）

用户指出 Codex 官方已公开 app-server 接入面、值得查资料；据此离线检查了本机
`@openai/codex` 0.154 平台二进制的配置 schema 字符串，发现**官方 feature flag 家族**
（与 `features.code_mode`、`features.multi_agent` 同族）里有本次观测到的两个行为开关：

- **`features.plugins`**（默认开）→ 会把内置 plugin/skill 语料物化进
  `$CODEX_HOME/.tmp/plugins/`（本次实测峰值 5,529 文件）。
- **`features.shell_snapshot`**（默认开）→ 写 `$CODEX_HOME/shell_snapshots/*.sh`，
  即注入凭据环境变量原文被第一手捕获的位置。

两者已加入受审配置 `deploy/codex/config.toml`（`[features]` 置于顶层键之后、
`[model_providers.deepseek]` 之前；`OFFICIAL_FEATURE_FLAGS_OFF` 常量 + 模板测试锁定）。

**验证（无遮蔽对照，历史记录）**：在 **完全关闭 tmpfs 遮蔽** 的 `--legacy-state-diagnostic`
轮内，`codex-production-chain-gate.py` exit 0、view 峰值 112、`credentialPathHits=[]`，且保留根中
`shell_snapshots/` 与 `.tmp/` 目录均不存在。**该轮的准确含义**：这两个目录在该轮没有出现；
`shell_snapshot` 的因果此后由 §4.9 的逐变量差分证明，`plugins` 的因果仍未复现
（见 §4.8 的"控制腿六轮未复现"与 §4.9 的逐变量结论）。遮蔽机制（§4.5）保留为纵深防御。

## 4.8 第十九轮：settled 窗口按裁决 A 的原文重做 + 官方 flags 差分（含如实结论）

- **settled 窗口重做（Reviewer P0）**：判据不再是"线程里恰好稳定的轮次"，而是
  **Harness 进程退出后的同步有界扫描**（`settle_after_attempt`：先有界等待
  `codex-acp`/`app-server`/audit-shim 进程消失，再做一次同步 `scan_once`）；view 已被
  capture 管线回收时，同一窗口的证据是 **capture 边界扫描**（`scan_state` 读回 checkpoint
  并对 token 致命失败）。线程轮次降级为观察；真机两轮 `harnessExited=true`、
  `settledScan=capture-boundary`、零命中、门 exit 0。
- **官方 feature flag 差分（Reviewer P1）**：新增
  `scripts/server-round1/codex-feature-flag-differential.py`——同一 0.147.0 工件、同一 Worker、
  **完全不加 tmpfs 遮蔽**，控制腿用 `--feature-flag-control-leg` 从 loopback 配置中**只删掉
  `[features]` 表**（其余字节不动、产物必须能被 tomllib 解析、含 sentinel 注释），处理腿用
  部署原样配置。**如实结论：控制腿连续 6 轮都未复现两个 churner**（峰值恒 112、零命中、
  无 `.tmp`/`shell_snapshots`），处理腿 2 轮同样干净——即"flags 是这两个行为的原因"在这一轮
  **未被差分复现**；此前（同配置去掉 flags 的时代）的第一手观测仍然成立（`.tmp/plugins`
  峰值 5,529 与 `shell_snapshots` token 命中各有多轮记录），但**该差分本身是不确定的**。
  处置：官方 flags 保留为源头防线，tmpfs 遮蔽保留为纵深防御，capture 边界扫描保持权威
  fail-closed；把"控制腿未复现"如实入库，作为待补的确定性触发实验（需让假端点驱动一次
  shell/工具调用，属下一阶段工作）。
- **P2**：`--official-feature-flags` 后缀开关删除（配置里已有 `[features]`，避免重复表），
  loopback 配置在 `loopback_config_bytes()` 内强制 `tomllib` 解析；新增
  `finalize_run()` 作为唯一后置判据入口（token 优先、链路失败结构化保留），并由
  `test_finalize_run_drives_the_real_control_flow` 直接驱动真实 watcher 与真实异常类型。

## 4.9 配对差分证明因果（生产 0.147.0、同 HEAD、无 tmpfs 遮蔽）

第 19 轮的差分只是"处理干净、控制未复现"（不确定）。第 20 轮把扫描器重构（独立实例、
严格排序、两阶段合并）并修好 reclaimed-view 语义后重跑差分，控制腿第一轮即复现：

```text
control[0]  CODEX_PRODUCTION_CHAIN_GATE_FAILED  peak=112
            credentialPathHits = [
              "native-state/shell_snapshots/<session>.sh",
              "native-state/shell_snapshots/<session>.tmp-<ns>",
              "native-state/shell_snapshots/<session>.<ns>.sh"]
treatment[0] CODEX_PRODUCTION_CHAIN_GATE_OK  peak=112  hits=[]
treatment[1] CODEX_PRODUCTION_CHAIN_GATE_OK  peak=112  hits=[]
result: CODEX_FEATURE_FLAG_DIFFERENTIAL_OK（controlDemonstratedChurn=true，treatmentClean=true）
```

即：**官方 `features.shell_snapshot` 默认开启就是"注入凭据被写进原生 state"的成因**，
关掉它该路径消失；`.tmp/plugins` 突发在本轮控制腿未复现（间歇），仍以历史第一手观测
（峰值 5,529、确定性 `VIEW_FILE_LIMIT`）为准并保留 tmpfs 遮蔽作纵深防御。
差分脚本为三态：只有"控制出现 + 处理全净"才 `…_OK`/exit 0；控制未复现为 `…_INCONCLUSIVE`
且非零退出（`tests/server/test_codex_feature_flag_differential.py` 锁定）。

同轮的结构修正（对应第 19 轮 7 项发现）：`CredentialStateScanner` 成为独立类（观察线程与
settled 扫描各持一个实例，零共享可变状态）；`settle_after_attempt` 严格排序
（等进程退出 → 停并 join → 独立同步扫描）；`harness_processes` 只按**本轮临时根**匹配
（并发 Codex 实例既不误伤也不误判，后代由 bwrap `--die-with-parent` 覆盖）；
`resolve_run_failure` 把 **turn 链 + reopen 两阶段**合并后统一判定（reopen 会再起两次
adapter 并注入同一 token，之前不在判据内）；reclaimed view 的 fallback 必须消费**结构化
capture 证据**（`stateScan` 存在、无 token、native id 绑定、各轮 capture completed），
否则 `CODEX_GATE_STATE_SCAN_INCOMPLETE`。

## 4.10 第二轮合并修复（第 20 轮 8 项）与两阶段独立证据

- `CredentialStateScanner.scan()` 的完整性现在要求**至少扫描到一个目标 view**：空 `views/`、
  候选 view 全部消失都不得冒充完整 settled 扫描，必须回落到 capture 证据。
- 阶段化：`observe_phase()` 每阶段独立（自己的 watcher/scanner + 退出后 settled 扫描），
  **不再抛异常**，而是返回 `{result, evidence, failure}`；`observe_reopen()` 现在把
  `capture_execution` 返回的字节做**本阶段自己的** token 扫描与 native id 绑定
  （`captureEvidence`）；`resolve_run_failure()` 先聚合**两阶段**再算一次判据，
  **凭据命中优先**，链路/reopen 异常随后作为 `secondaryFailure` 结构化保留。
- `merge_phase_evidence()` 逐阶段判定完整性：每阶段要么有完整 settled view 扫描，要么有
  **它自己的** capture 证据；任一阶段两者皆无即 `CODEX_GATE_STATE_SCAN_INCOMPLETE`。
- 进程身份：`process_table()` 读 `ps -eo pid=,lstart=,args=`，身份 = **(pid, 启动时间) + 本轮根**；
  改名后代仍被匹配（根字符串），无关 Codex 实例既不被匹配也不会阻塞；watcher 记录
  `harness_identities`，退出判定要求这些身份**全部消失**。
- 差分支持**逐变量**（`--strip shell_snapshot`）：只关 `shell_snapshot`（`plugins` 保持默认）
  控制腿 2 处凭据命中、处理腿零命中 → 因果归属于该单一变量。
- 真机两轮（本 HEAD）：`phases=2`、逐阶段 capture 证据（turn-chain 76–78 文件、
  reopen 77 文件 / 2.66 MB，均 `nativeSessionId=true`、零命中）、门 exit 0。

## 5. 全量验证与清理

精确命令（原始输出留在本轮会话日志，不入 Git）：

```text
cargo fmt --check && cargo test --locked --release   # workers/agent-box-worker → 见本节计数
cargo build --locked                                  # 刷新 target/debug 供跨进程测试
PYTHONPATH=src:plugins/agent-box-runtime-wsl/src:plugins/agent-box-sandbox-bwrap/src:plugins/agent-box-harnesses/src \
  python3 -m pytest -q tests/server/test_state_capture_error_boundary.py tests/server/test_state_capture_settle.py
PYTHONPATH=src + 全部 plugins/*/src \
  python3 -m pytest -q tests plugins/agent-box-harnesses/tests plugins/agent-box-runtime-wsl/tests \
    plugins/agent-box-sandbox-bwrap/tests plugins/agent-box-runtime-local/tests
scripts/server-round1/build-worker.sh workers/agent-box-worker/.acceptance-bundle-cN
python3 scripts/server-round1/runtime-artifact-gate.py --worker <bundle> --json              → exit 0
python3 scripts/server-round1/{pi,hermes,opencode}-production-chain-gate.py --worker <bundle> --json → exit 0（c7/c8 各轮均绿）
python3 scripts/server-round1/codex-production-chain-gate.py --worker <bundle> --json
  → 【历史快照：本行的绿/红序列已由 §4.4 的现行结论"未解决的红绿间歇（10 绿→5 红→最近 3 绿）"
  取代】c7 轮 10 连绿；c8 轮 10 连绿后于 2026-09-15 晚间出现连续 5 红（.tmp/plugins 突发，§4.3）
powershell.exe -File accept-e.ps1（-SourceRoot \\wsl.localhost\Ubuntu\… -DataRoot …\acceptance-server-r4-cN
  -ManifestPath <bundle>\manifest.json -WireSchemaPath <前端生成工件> -LinuxWorkerPath <bundle>/agent-box-worker
  -WorkspaceLinuxPath /tmp/agentbox-server-r4-cN -Port 18745 -Cleanup）  → exit 0（BACKEND_41_E_WINDOWS_WSL_WIRE_OK）
  同参数 -PostCheck -InstanceId <lock_after_first>,<lock_after_final>     → exit 0（…_POSTCHECK_CLEAN）
git diff --check <起点>..<HEAD>
```

- 【已被 §4.2/§4.4 的现行计数取代：python 820/4；Rust 27】c7 轮当时：Python 全量
  812 passed / 4 skipped / 0 failed；Rust fmt 干净、`cargo test --locked --release`
  22 passed / 0 failed。
- 残留：本轮五个门的临时根无残留；Windows DataRoot/workspace/端口/进程由 `-PostCheck`
  独立复核为 CLEAN；两个 `--keep` 诊断根与 Rust 测试 scratch 目录已按属主核对后删除；
  `git diff --check` 通过。进程表里仅剩 pytest 的 `--delay-seconds 300` 清理助手
  （有界自退），不是门残留。

## 6. 前端最终交接（只读复测 2026-09-15 02:51 +08:00，同一结论）

- 工作树 `/home/maoqh/projects/agent-box-desktop-next-wsl-round1`，分支
  `feature/agentbox-desktop-product`，HEAD `8e7c138c96337fc20ed61d3c21100e6449c8ec95`
  （`docs(desktop): release the frontend implementation lease (P06 product-surface closeout)`，
  2026-09-15 00:51:21 +0800）。
- `git status --porcelain=v1` **0 行**（含 untracked=全部）；无 staged。
- `docs/desktop-product-delivery/status.md` 终态：`P06_GREEN —
  FRONTEND_INDEPENDENT_ACCEPTANCE`、`DESKTOP_IMPLEMENTATION_READY`、
  `REAL_FLOW_VERIFIED=否`、`writer_lease=RELEASED`；与
  `evidence/DESKTOP_IMPLEMENTATION_HANDOFF.md`（存在，16 120 B）一致，
  不再存在 00:50 观察到的"释放被自己暂停"矛盾（该 HEAD 即释放提交）。
- Windows r3：`evidence/P06.md` 记录 `executed 28 → allOk=true;
  counts={"PASS":28,"FAIL":0,"SKIP":0,"PENDING":0}`。
- wire 摘要就地重算一致：TS `11e3b3e7…c10035`、生成工件 `5d4fa3bf…5e4ed`。
- 进程：该工作树内仅 2 个长闲置进程（zcode-cli 415512 自 09-14 16:57、bash 562153 自
  09-14 20:12），无 electron/node 写入者，release 提交之后无任何文件 mtime 更新；
  按纪律未终止任何进程。**未取得写权、未记录 FULLSTACK_INTEGRATION_OWNER。**

## 7. Reviewer 自动化 §4.1 通道门（已通过）

- session 文件机械比对 = `01a0a0f8-2df5-7be0-93c6-a8603a07534b`；
- 真实 `codex exec resume -m gpt-5.6-sol -c 'sandbox_mode="read-only"'`
  （flock 持锁、无 bypass 参数）exit 0，CLI 回显 session id 与固定值一致；
- verdict `/home/maoqh/.agentbox-reviewer/channel-check-verdict.md`（仓库外）：
  `VERDICT: ACCEPT` 精确命中、含 `REVIEWER_CHANNEL_OK`，
  `REVIEWED_HEAD: 897a833…` 与 `WORKTREE_STATE: DIRTY` 与调用前实况一致；
- 调用前后 `git status --porcelain` diff 为空：Reviewer 未产生任何仓库写入。

## 7.1 Reviewer 第一轮结论与逐项处置（2026-09-15，CHANGES_REQUIRED → 本节即修复记录）

固定 Reviewer（session `01a0a0f8…`，gpt-5.6-sol，read-only）对 `897a833..eefe652` 给出
`CHANGES_REQUIRED`，逐项处置：

| 级别 | 发现 | 处置 |
| --- | --- | --- |
| P0 | `view.get`/listing 先按路径检查后按路径打开，Harness 可写 bind 下可换链逃逸、绕过 64 MiB | §2.1：fd 锚定逐组件 no-follow + fd fstat + 有界读 + 读后身份复核；三个反例测试（换链/换父/超限） |
| P1 | 首次越界 offset 与首次不存在的路径被归为 `VIEW_CHANGED`（无历史证明的"瞬态"） | Worker 改为确定性硬失败（`VIEW_INVALID`/`VIEW_MISSING`）；`_view_bytes` 在"刚列出过"的上下文把 `VIEW_MISSING` 转换为 `SIDECAR_STATE_IDENTITY_CONFLICT`；新增"首次越界=硬失败""缺路径=确定性码+capture 层转换""分块中截断→重试且字节不混合"三类反例 |
| P2 | `protocol.rs` 注释称 code 是 opaque，与 sidecar 按 code 分类矛盾 | 注释改写为错误码合同：增量扩展、unknown code 一律拒绝不重试、混合世代向更严格方向退化；由 envelope 测试 + 未知码 fail-closed 测试锁定 |
| P2 | gate blocker 注记因果过宽（任意 turn 失败 + 观察到链接即标注） | 仅"capture 阶段失败且码属 state/view 集合"才记 blocker；其余记 `stateSymlinkCoObservation`；新增 `tests/server/test_codex_gate_diagnostics.py` 5 例（含绿跑与无关失败反例） |
| P2 | 提交范围 `git diff --check` 实际有 trailing whitespace，证据却称通过 | 已清除；本文件以修复后 HEAD 重新执行并记录准确范围 |
| P2 | status.md 仍有旧 writer/旧 HEAD/Codex 未封装的现行表述、时间不精确 | 全部更新或标注日期化历史并指向取代项；`更新：` 行与 frontend_checked_at 改为精确时间（02:51 +08:00 复测） |
| 证据缺口 | manifest 1024/1025 边界无直接回归；缺原始命令输出 | 新增 `a_manifest_over_the_file_limit_is_refused_at_prepare`；本文件记录全部命令与退出码（原始日志不入 Git，防凭据/噪声） |

## 8. 费用与凭据

本轮 DeepSeek 模型调用 **0**、费用增量 **¥0**；累计仍为 42 §D 的
1 次可达性调用 / 12 tokens / <¥0.01（上限 ¥10）。未读取任何 secret locator 内容、
未发任何真实模型请求；各门的假 token 均为运行期生成、0600、用后删除。
