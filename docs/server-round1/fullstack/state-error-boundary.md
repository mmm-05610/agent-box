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
  特殊文件/文件数上限/vanish/shrink 的实际返回码，并把返回码与 sidecar 分类对照。

## 2. 最终错误分类表（Worker → Sidecar）

| Worker 位置 | 码 | 分类 |
| --- | --- | --- |
| `list_view_files`：FIFO/socket/设备；`view.get`：目标非普通文件 | `VIEW_SPECIAL_FILE` | 立即失败 |
| `list_view_files`：访问条目 > 4096 | `VIEW_TRAVERSAL_LIMIT` | 立即失败 |
| `list_view_files`/`view.list`：普通文件 > 1024；`view.prepare`：manifest > 1024 | `VIEW_FILE_LIMIT` | 立即失败 |
| `view.get`：文件在读取中消失；目录在遍历中消失 | `VIEW_CHANGED` | 瞬态（有界重试） |
| `view.get`：offset 超过当前文件末尾（文件被缩短） | `VIEW_CHANGED` | 瞬态（有界重试） |
| `view.get`/`_view_bytes`：size/offset/digest 在读取中改变 | `SIDECAR_STATE_IDENTITY_CONFLICT` | 瞬态（有界重试） |
| `view.get`：fetch range 非法、超过 artifact 上限、路径非法 | `VIEW_INVALID` | 立即失败 |
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

## 3. 协议兼容性

只新增错误码值，帧格式与响应形状未变：失败仍是 1 个 `WorkerError` 帧、
`{"requestId","ok":false,"error":{"code","message"}}`（`view_error_envelope_tests`
逐帧断言 key 集合不增长，含新旧码各值）。因此 **ABW1 frame/manifest `wireVersion = 1`**
与 **Worker control `PROTOCOL_VERSION = 3`** 均不变；兼容性说明写入
`protocol.rs` 的版本注释，由上述测试锁定。

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

## 5. 全量验证与清理

- Python 全量（tests + 全部插件 tests）：**812 passed / 4 skipped / 0 failed**
  （较上轮 793 +19：错误边界 19 项新测；4 项既有平台/环境 skip 未扩大）。
- Rust：`cargo fmt --check` 干净；`cargo test --locked --release` **22 passed / 0 failed**。
- 残留：本轮五个门的临时根无残留；Windows DataRoot/workspace/端口/进程由 `-PostCheck`
  独立复核为 CLEAN；两个 `--keep` 诊断根与 Rust 测试 scratch 目录已按属主核对后删除；
  `git diff --check` 通过。进程表里仅剩 pytest 的 `--delay-seconds 300` 清理助手
  （有界自退），不是门残留。

## 6. 前端最终交接（只读复测，2026-09-15 02:1x +08:00）

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

## 8. 费用与凭据

本轮 DeepSeek 模型调用 **0**、费用增量 **¥0**；累计仍为 42 §D 的
1 次可达性调用 / 12 tokens / <¥0.01（上限 ¥10）。未读取任何 secret locator 内容、
未发任何真实模型请求；各门的假 token 均为运行期生成、0600、用后删除。
