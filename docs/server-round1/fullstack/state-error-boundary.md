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
| Python 全量 | **820 passed / 4 skipped / 0 failed**（gate 诊断当时 5 例、并例后现行 3 例；+8：边界改约 6、既有微调；4 项既有 skip 未扩大） |
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
**820 passed / 4 skipped / 0 failed**（现行；中间计数 822 与更早 812/22 均已日期化取代）；Rust fmt 干净 +
`cargo test --locked --release` **27 passed**；`git diff --check` 通过。
**Codex 门现行状态：未解决的红绿间歇**——`.tmp/plugins` 突发间歇性重叠捕获：2026-09-15
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
- 泄漏路径定位（如实记录）：门新增 `--legacy-state-diagnostic`（无遮蔽、仅假 token、无模型）
  专用于定位；在该模式 + 遮蔽模式下合计 **14 轮**（8 遮蔽/6 遮蔽+诊断……准确分账：
  遮蔽模式 6 轮全绿峰值 113；无遮蔽诊断 9 轮全绿）中，secret 命中与 5529 突发**均未复现**
  ——两类现象都与"捕获与写入突发重叠"的时机相关，本机负载相关。fail-closed 扫描保持，
  付费 preflight 前继续定位；若泄漏路径在 `.tmp` 内，方案 A 已同时隔离它。

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
