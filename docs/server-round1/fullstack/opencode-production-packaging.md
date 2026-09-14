# 42-D OpenCode 生产封装与本机假端点全链验证（草稿，待主会话复核）

日期：2026-09-14。分支 `feature/server-harness-extension-v1`（起点 `f6f74119b1eb883b69a51269f747fa27c378a5be`）。
本阶段把 OpenCode 以**单文件二进制**的生产封装接进同一条链路，只连接本机假
DeepSeek 兼容端点：

```text
Server（真实 build_runtime_from_sidecar_deployment + create_app + TestClient）
  → Core → generic sidecar deployment → c4 真实 release Worker（ABW1 interactive）
  → bwrap → /runtime/bin/opencode（摘要固定、只读）
  → driver-native.mjs 托管的 `opencode serve`（loopback + 一次性基本认证）
  → 本机 127.0.0.1 假端点（真分片流式）
```

终态：**OPENCODE_PRODUCTION_CHAIN_PREPARED**。OpenCode 仍为 **MODEL_NOT_VERIFIED**：
本阶段不是付费模型验收，未读凭据、未访问任何非 loopback 目的地。
`BACKEND_IMPLEMENTATION_READY` 未登记。**模型调用 0、费用增量 ¥0。**

## 0. 本阶段新增文件（全部为本子代理新建，未改动任何既有文件）

| 文件 | 作用 |
| --- | --- |
| `scripts/server-round1/build-opencode-authorization.mjs` | 单文件二进制授权工具：解析入口符号链接、受控安装路径校验、ELF 头解码、全量 sha256、大小、`--version` 取证；输出 `{source, resolved, digest, sizeBytes, version, fileType}` 与 `executableMounts`，可选 `--deployment-out` 片段 |
| `scripts/server-round1/build-opencode-authorization.test.mjs` | 该工具的单测（9 项，含摘要漂移/版本不符/symlink/目录/用户目录/整个 node_modules/非 ELF/不可执行/真实安装取证） |
| `plugins/agent-box-harnesses/src/agent_box_harnesses/opencode/production.py` | 生产模板（新文件；`opencode/` 下既有文件未改）：官方根地址、产品/原生模型值、`executableMounts`、`projectionFiles`、`stateProjection`、`credentialKind/Environment`、`modelControlId`、驱动声明 |
| `plugins/agent-box-harnesses/deploy/opencode/opencode.json` | 逐字段等于 42d `openCodeModelConfig()` 的原生配置（无秘密） |
| `plugins/agent-box-harnesses/deploy/opencode/driver-native.mjs` | **驱动模块**：用上游复用组件 `ManagedOpenCodeHost` 托管 `opencode serve`，SSE 增量 → `message_delta`，`open` 只重开存储里的会话，未知模型/未知会话/附件在发包前拒绝 |
| `plugins/agent-box-harnesses/deploy/opencode/egress-guard.c` | **仅门使用**的 loopback 出口守护源码（LD_PRELOAD 预载，生产模板从不引用） |
| `plugins/agent-box-harnesses/tests/test_opencode_production_template.py` | 模板门（10 项）：dry-run 逐字段等值、官方根地址、无秘密、挂载形状、驱动声明、别名跨语言一致、生产默认无 gate-only 变量、驱动契约 node 探针 |
| `tests/server/test_opencode_gate_cleanup.py` | 全链门的清理与失败语义门（15 项） |
| `scripts/server-round1/opencode-production-chain-gate.py` | 本机假端点全链门（本报告 §3 的全部证据来源） |
| `docs/server-round1/fullstack/opencode-production-packaging.md` | 本报告（草稿） |

## 1. 单文件二进制授权（任务 A）

工具默认入口 `/home/maoqh/.npm-global/bin/opencode`（npm 安装的符号链接），解析到真实文件：

| 项 | 值 |
| --- | --- |
| entry | `/home/maoqh/.npm-global/bin/opencode`（符号链接，`entryIsSymlink=true`） |
| resolved / source | `/home/maoqh/.npm-global/lib/node_modules/opencode-ai/bin/opencode.exe` |
| sizeBytes | **184 498 304** |
| digest | `sha256:c9485f62576606dbde6404647405df2401fada964b7f669f799dc125dbbeff99` |
| version | **1.18.21**（工具自己运行 `--version` 取证，宿主复核一次） |
| fileType | `ELF 64-bit LSB executable, x86-64`（工具直接解码 ELF 头，不调用 `file`） |
| executableMounts | `[{"source": "<resolved>", "target": "/runtime/bin/opencode", "digest": "sha256:c9485f…ff99"}]` |
| guest 内复核 | `/runtime/bin/opencode --version` = **1.18.21**（门在评审过的 bwrap 策略里跑，见 §3.7） |

受控路径规则（全部类型化拒绝，测试与门都覆盖）：入口必须是绝对且 canonical 的路径；
挂载 source 必须等于解析后的真实文件（传符号链接本身 → `OPENCODE_SOURCE_SYMLINK`）；
必须是受控安装包目录（整个 `node_modules`、用户 `~/.config`、`~/.cache`、任意非安装目录
→ `OPENCODE_SOURCE_NOT_CONTROLLED`）；必须是普通文件、可执行、ELF；摘要/大小/版本可声明比对
（`OPENCODE_DIGEST_DRIFT` / `OPENCODE_SIZE_DRIFT` / `OPENCODE_VERSION_MISMATCH`）。

## 2. 生产配置、部署模板与驱动（任务 B）

**原生配置**：`deploy/opencode/opencode.json` 与 42d 预备配置**逐字段相等**（模板测试运行
`model-validation-42d.mjs --family opencode --secret-file <测试自建 0600 假 token> --dry-run`
并断言 `config` 等值）：官方根 `https://api.deepseek.com`、provider `deepseek`、
`npm: @ai-sdk/openai-compatible`、API key 仅 `{env:DEEPSEEK_API_KEY}`、产品模型 `deepseek-flash`、
`reasoning:false`、`thinking:{type:disabled}`、`limit:{context:1000000, output:64}`。

**产品/原生模型值**：产品 `deepseek-flash` → 原生 `deepseek/deepseek-flash`；翻译由
`runtime/profile_extensions.mjs` 的 `AGENTBOX_MODEL_ALIASES.opencode`（主会话已写入）完成，
模板的 `model_aliases()` 与之**跨语言比对相等**（模板测试）。驱动不写死任何模型映射。

**deployment 通用字段**（Server/Core/Worker/bwrap 只看到这些）：

| 字段 | 值 |
| --- | --- |
| id | `opencode` |
| adapter.command / args | `/runtime/bin/opencode` / `[]`（直接执行挂载好的单文件二进制） |
| adapter.driver | `{"source": "deploy/opencode/driver-native.mjs"}` |
| adapter.environment | `OPENCODE_CONFIG=/tmp/agentbox-home/opencode.json`、`XDG_DATA_HOME=/tmp/agentbox-home/opencode-state`、`OPENCODE_DISABLE_AUTOUPDATE=1`、`OPENCODE_DISABLE_MODELS_FETCH=1`、`OPENCODE_DISABLE_LSP_DOWNLOAD=1` |
| projectionFiles | 只读 `deploy/opencode/opencode.json → /tmp/agentbox-home/opencode.json` |
| stateProjection.target | `/tmp/agentbox-home/opencode-state`（= 驱动进程的 `XDG_DATA_HOME`，即 SQLite 存储根） |
| credentialKind / credentialEnvironment | `api-key` / `DEEPSEEK_API_KEY` |
| modelControlId / controlOptions | `model` / `{model: []}`（不给默认值） |

**输出上限与环境变量名的取舍（实测记录）**：42d 用 `OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX=64`
给输出上限，但它含 `TOKEN`，被 Server/Core 的环境变量名规则拒绝，**不能**作为 adapter environment；
本阶段改用配置里的 `limit.output: 64`，并用假端点实测它确实进入请求体（两轮都是
`max_tokens=64`，见 §3.4）。模板测试同时断言生产默认的环境变量名不含
TOKEN/SECRET/KEY/PASSWORD/CREDENTIAL/AUTH，也不含 `LD_PRELOAD` / `AGENTBOX_EGRESS_AUDIT` /
`AGENTBOX_DRIVER_AUDIT` / `NODE_OPTIONS`。

**驱动**（`deploy/opencode/driver-native.mjs`）：随 deployment 进入评审过的 bundle，由
`runtime/native-driver.mjs` 只从同一 bundle 的 `deployment/` 目录加载。它

1. 用 `ManagedOpenCodeHost`（bundle 内上游快照）启动 `opencode serve --pure --hostname 127.0.0.1 --port <随机空闲端口>`，
   每次运行生成一次性基本认证口令；口令只经 `/usr/bin/env` 的**瞬时 argv**与子进程环境传递，
   最终 opencode 进程的 argv 里没有口令（驱动审计 `credentialsInArgv:false`）；
2. 订阅 `GET /event`，把 `message.part.delta`（field=text）即时 `emit({event:"message_delta"})`；
3. `create` 始终写标题（不写标题时 OpenCode 会为生成标题多发一次 provider 请求——实测）；
4. `open` 只 `GET /session/<id>` 校验存在性并读回消息条数，**绝不新建**；不存在即
   `OPENCODE_SESSION_NOT_FOUND`；
5. 在发包前用 `GET /config/providers` 校验模型可寻址，未命中即
   `OPENCODE_MODEL_NOT_AVAILABLE: Harness model is not available: <值>`；
6. 附件显式拒绝（`OPENCODE_ATTACHMENTS_UNSUPPORTED`），不静默丢弃；
7. `close` 停托管进程并等其退出（必要时 SIGKILL），随后 Server 回读 state 投影；
8. `status` 与 `start/create/open/prompt/abort/close` 同属接缝的**必需**方法集合：缺任一个，注册阶段即被
   `DRIVER_METHOD_MISSING` 拒绝（本阶段把 `status` 明确纳入合同，并由测试从接缝模块读取方法表、
   对 fixture 与真实 driver 各构造一次实例核验）。

## 3. 本机假端点全链门（任务 C）

命令（退出码与结果见 §3.9）：

```text
PYTHONPATH=src:plugins/agent-box-harnesses/src:plugins/agent-box-runtime-wsl/src:\
plugins/agent-box-sandbox-bwrap/src:plugins/agent-box-runtime-local/src:plugins/agent-box-terminal-session/src \
python3 scripts/server-round1/opencode-production-chain-gate.py --json
→ 退出码 0；result = OPENCODE_PRODUCTION_CHAIN_PREPARED

两次独立运行（同一代码、同一宿主）给出同一形状的证据：
第一轮 delta 4/5/6 < completed 9、第二轮 delta 13/14/15 < completed 18、
checkpoint schema_version=2/resumable=true、重试 3 次（窗口）与 6 次（有界观测）、
cleanup.removed=true 且无残留。

### 3.1 二进制与 guest 入口

授权工具给出摘要，门**独立复核**（自己算 sha256、自己读 ELF 头、自己跑宿主 `--version`）；
随后在评审过的 bwrap 策略里再跑一次 `/runtime/bin/opencode --version` → **1.18.21**。
`/runtime/bin` 在 guest 内**只读**：同一探针写 `/runtime/bin/opencode` 得到 `EROFS`，
写 `/workspace` 成功（`workspaceWritable:true`）。

### 3.2 两轮同一 Server Session（同一持久事件流）

| 轮次 | 状态 | delta 序号 | completed 序号 | delta 先于 terminal | delta 文本 |
| --- | --- | --- | --- | --- | --- |
| 第一轮 | completed | 4,5,6 | 9 | 是 | `OC-GATE-NONCE-1C7B42 `、`PART-TWO-1 `、`PART-THREE-1 ` |
| 第二轮 | completed | 13,14,15 | 18 | 是 | `OC-GATE-NONCE-2E5D93 `、`PART-TWO-2 `、`PART-THREE-2 ` |

假端点用**真 chunked 分帧逐词流式**输出（不是一次性整段），所以每一轮的 3 条 delta 是
真实增量；`deltas < completed` 说明增量在被持久化后先于终态到达 Server。

checkpoint（第一轮后）：`schema_version=2`、`resumable=true`、`harnessType=opencode`、
`nativeSessionId=ses_f60a32bcaffecaoS7LfooW77Hw`（另一次运行为 `ses_f60a5ca49ffeQ3p9dQzVCpf0ex`），捕获文件 4 个
（`opencode/opencode.db{,-wal,-shm}` 与 `opencode/log/opencode.log`），第二轮 checkpoint 的
`native_id` 与第一轮**相同**。

### 3.3 原生上下文续接（不是 Server 重放）

第二轮 provider 请求体（脱敏结构）：

```text
messages = system(9553 字符) + user(48, 含 NONCE-1) + assistant(45, 含 NONCE-1) + user(53, 第二轮问题)
```

即第一轮的 user 与 assistant **都在第二轮请求体里**，说明上下文来自 OpenCode 自己的 SQLite
存储，而不是 Server 重放；门对此有独立断言（缺失即失败）。

### 3.4 provider 请求结构与预算

两轮合计**恰好 2 次** provider 请求（`/chat/completions`），
`requestsBeyondBudget=0`（超出声明的每轮预算时假端点立即 500 并计数，隐式重试藏不住），
`unauthorizedRequests=0`，`Authorization` 与注入的假 token 相符（端点只记"是否相符"，从不记录值）。
两轮请求体都是：`model="deepseek-flash"`、`max_tokens=64`、`thinking={"type":"disabled"}`、
`stream=true`、`tools=11`；第二轮多出的增量即 §3.3 的续接上下文。

### 3.5 重开方法与恢复路径（按真实证据，不猜）

**Server 路径（第二轮）**：Server 关闭第一轮 sidecar、捕获 state，再把 state 回投进第二轮的
新 sidecar；驱动审计 `driverEvidence` 里第二轮是
`{"event":"open","method":"GET /session/<id>","created":false,"storedMessages":2,"title":"<第一轮的标题>"}`
——**没有新建会话**，重开方式就是 server API 的 `GET /session/<id>`（同一 SQLite 存储）。

**直接观测（同一 launcher/bundle/二进制/凭据路径）**：
- A 轮：`create`（标题 `observe-round-1`）+ prompt → 3 条增量；state 4 个文件 817 015 字节；
- B 轮：把 A 轮 state 回投（`stateRestoredFiles`/`stateRestoredBytes` 与 A 轮一致）后
  `open` → 同一 `nativeSessionId`；`storedMessages=2` 读回上一轮；prompt 的 provider 请求体
  再次带上 A 轮内容；
- 重开相位里 `createsInsideReopenPhase=[]`：**没有任何 create**；
- 4 个托管 host 端口在停止后都关闭（`closedPortsSilent=true`，等待 0.27 秒）；
- 驱动审计逐行记录实际 argv（`["serve","--pure","--hostname","127.0.0.1","--port",N]`）、
  数据目录、状态目录、重开方式，且 `credentialsInArgv=false`。

### 3.6 未知模型、缺凭据、坏 checkpoint（都在发包/派发之前拒绝）

| 反例 | 结果 |
| --- | --- |
| 未知模型 `deepseek-unknown` | turn `failed`；**0** 次新增 provider 请求；理由 `OPENCODE_MODEL_NOT_AVAILABLE: Harness model is not available: deepseek-unknown`；拒绝位置：驱动在 `POST /session/<id>/message` 之前 |
| Profile 无授权凭据（ProviderModel 显式不带 credentialId） | `CREDENTIAL_REQUIRED`，`sessionsCreated=0`（未派发） |
| 不可用 checkpoint（`resumable:false`/schema 不符） | `SIDECAR_CHECKPOINT_INVALID`，未派发 |
| 恢复一个从未存储的 native session | `OPENCODE_SESSION_NOT_FOUND`，本相位 `sessionsCreatedInThisPhase=0` |
| 摘要漂移的二进制（声明原摘要、内容被翻 1 字节） | Worker 引导阶段拒绝：`"authorized executable digest mismatch"`，0 次 provider 请求 |

### 3.7 凭据零泄漏

假 token 是门**每次运行现生成**的（`agentbox-opencode-gate-fake-token-` 前缀 + `secrets.token_hex(16)`），
只存在 0600 临时文件与运行窗口内，经既有 `MemorySecretStore` → `CredentialRecords` →
`ProviderModel.credentialId` → 冻结执行配置 → Worker `secret.put` → sidecar 环境注入：

- 端点两次请求都带**相符**的 `Authorization`（说明秘密确实送达原生进程）；
- 持久事件里 `tokenInEvents=false`；checkpoint 的**每一个**捕获状态文件 `tokenHits=[]`
  （4 个文件、827 593 字节，含 SQLite 三件套与原生日志）；
- 门报告自身 `tokenInReportableState=false`；扫描的是**本次实际注入的完整值**
  （`token_appears_in_tracked_content`），提交态复跑 `tokenInTrackedGitContent=false`。

**修复记录（提交态假绿）**：门最初把固定假 token 写进自身 tracked 源码，同时断言 tracked Git 零命中——
未提交时能绿，提交后源码自己就是命中项，4 项清理语义测试在提交态必红。现改为运行期生成、运行窗口内
持有、核验后清空（窗口外 `current_token()` 抛 `OPENCODE_GATE_NO_ACTIVE_RUN`），并补 5 项提交态回归。
其中**阳性反证在测试独占的临时 Git 仓库里执行**：`tmp_path` 内 `git init` + 仓库本地 user +
把本轮实际 token 写成 fixture 后 `git add`/`git commit` 成真正的 tracked 内容，再用生产扫描入口
`token_appears_in_tracked_content` 对它取到 `true`（真的跑 `git grep`，不是 mock 成常量），并让完整门
以 `OPENCODE_GATE_TOKEN_IN_GIT` 非零失败；**AgentBox 主仓的 index 与工作树从未被写入**（该文件每个测试
前后比对 porcelain 与 cached diff）。生成值不打印、不进 argv、不读真实 locator。

### 3.8 非 loopback 访问：实际证明到什么程度

- 门的假端点只绑 `127.0.0.1`（自检通过）；生产配置的 loopback 覆盖**只改 baseURL 一个字段**
  （`documented_differences` 断言）。
- 门把评审过的 C 守卫编译后以 `LD_PRELOAD` 预载进 guest 内的 opencode 进程（**仅门使用**，
  生产默认里没有它——模板测试与门都断言）。守卫在 `connect`/`getaddrinfo` 上拒绝非 loopback，
  并把 `guard-loaded` 与每次拒绝写进 workspace 审计文件。
- 本次运行：`guardLoaded=true`（18 次加载），审计里的拒绝只有
  `denied resolve registry.npmjs.org` ×9（OpenCode 启动时尝试解析 npm registry，被拒后
  仍用自带的 provider 实现完成两轮）与 `denied connect 1.1.1.1:443`（门自己的对照实验），
  **没有任何一次指向官方根 `api.deepseek.com`**（`officialRootDenied=[]`）。
- **阳性对照**（证明机制在这个 guest 里真的生效，而不只是"没记录到拒绝"）：同一 guest 策略下
  连接 `1.1.1.1:443` 得到 `EACCES`，连接 `127.0.0.1:1` 得到 `ECONNREFUSED`（不是守卫的拒绝）。
- 强度与残余：LD_PRELOAD 覆盖 libc 的 `connect`/`getaddrinfo`（已实测：构造函数确实在
  opencode 进程里执行；一次成功的两轮会话中除 loopback 外零连接）。它**不覆盖**直接走
  `syscall(SYS_connect)` 的代码路径——本阶段没有观察到这种路径，但这是本证据的边界，不是
  "已证明不存在"。

### 3.9 清理

- 成功且非 `--keep` 的运行**验证后**移除本次运行的临时根（先做身份校验：必须是本次 `mkdtemp`
  返回的**完全相同**路径、位于系统临时目录、属主为本用户、无组/其他权限、非符号链接），
  记 `run.removed=true`、`cleanup.madeWritable`、`fakeTokenRemoved=true`、`workspaceRemoved=true`、
  `workerProjectionsRemoved=true`；**任何残留或端口仍监听都非零退出**（单测注入删除失败验证）。
- 进程检查按**本次运行的临时根前缀**限定（只扫 `/proc/*/cmdline` 与 `/proc/*/cwd`），不会误伤
  并发的兄弟门；托管 host 的 4 个端口逐一复核不再监听。
- Worker 退出路径会派生设计内的延迟结果清理助手（`--cleanup-manifest <manifest>
  --delay-seconds 300`）：门把它单列记录（`workerDeferredCleanupHelpers`），主动终止并复核其消失，
  而不是当成残渣失败、也不是视而不见。
- `--keep` 只报告保留路径且不声称 `removed=true`；外部 `--binary` 只读、不删除、不改权限
  （清理后复核摘要与模式不变，`preservedAfterCleanup=true`）。

## 4. 反例清单与结果

| 反例 | 期望 | 实测 |
| --- | --- | --- |
| 摘要漂移（工具 `--expect-digest` 不符） | `OPENCODE_DIGEST_DRIFT` | 一致 |
| 版本不符（`--expect-version 1.18.20`） | `OPENCODE_VERSION_MISMATCH` | 一致 |
| 挂载 source 是符号链接 | `OPENCODE_SOURCE_SYMLINK` | 一致 |
| entry 是目录 | `OPENCODE_ENTRY_MISSING` | 一致 |
| 非 ELF（受控包内） | `OPENCODE_SOURCE_NOT_ELF` | 一致 |
| 不可执行（受控包内） | `OPENCODE_SOURCE_NOT_EXECUTABLE` | 一致 |
| 相对路径 entry | `OPENCODE_ENTRY_NOT_ABSOLUTE` | 一致 |
| 用户配置目录（`$HOME/.config/...`，假 HOME） | `OPENCODE_SOURCE_NOT_CONTROLLED` | 一致 |
| 缓存目录（`$HOME/.cache/...`，假 HOME） | `OPENCODE_SOURCE_NOT_CONTROLLED` | 一致 |
| 整个 `node_modules` 作为安装根 | `OPENCODE_SOURCE_NOT_CONTROLLED` | 一致 |
| 漂移二进制被声明成授权摘要（Worker 侧） | 引导拒绝、0 请求 | 一致（`authorized executable digest mismatch`） |
| guest 对 `/runtime/bin` 可写 | 必须不可写 | `EROFS` |
| 缺凭据 | `CREDENTIAL_REQUIRED` 且不派发 | 一致（`sessionsCreated=0`） |
| 未知模型 | 发包前拒绝、端点计数不变 | 一致（0 次新增请求，理由含模型名） |
| 额外 provider 请求 | 立即 500 且门非零 | 一致（`requestsBeyondBudget=0`；超预算路径由单测与端点逻辑覆盖） |
| 非 loopback 访问 | 被守卫拒绝并留痕 | 一致（阳性对照 `EACCES`） |
| 不可用 checkpoint | 拒绝且不新建 session | 一致（`SIDECAR_CHECKPOINT_INVALID` + 驱动 `OPENCODE_SESSION_NOT_FOUND`） |
| 清理失败 | 非零退出且不覆盖主失败 | 单测注入删除失败，两种组合都断言 |
| 假 token 泄漏 | 事件/状态/报告/Git 零命中 | 一致（全 false/空） |

## 5. 重试与请求上界（含一条真实发现）

- **正常一轮** prompt 恰好 **1** 次 provider 请求（会话带标题，不触发标题生成）——
  门的主链预算就是按此执行的，超预算立即失败。
- **受控重试实验（门内，两段）**：
  * 窗口实验：先拒 2 次、第 3 次作答 → 一轮 prompt 恰好 **3** 次尝试
    （两次独立运行的实测时间线：22.48 / 24.84 / 29.22 秒；23.99 / 26.07 / 30.82 秒），
    prompt 正常完成 → 证明 5xx 之后确实重试；
  * 有界观测：一直拒到客户端放弃 → **6** 次尝试
    （32.48 / 34.87 / 39.40 / 47.44 / 66.66 / 103.83 秒，另一次为
    34.31 / 36.74 / 41.33 / 50.44 / 67.75 / 102.20 秒），未触及视野上限，门断言
    `2 ≤ 尝试次数 ≤ 声明上界 6`。
- **声明上界**：`production.MEASURED_RETRY_ATTEMPTS = 6`，由本阶段四处独立测量一致得到
  （宿主直连、宿主+守卫、guest `run` 模式、guest `serve` 模式，均为 6 次、退避形状一致：
  +2.1s / +4.9s / +8.1s / +18.7s / +37.7s）。42d 预备脚本里的 `maxProviderAttempts: 12`
  **没有证据**，本阶段以实测 6 取代（模板测试固定该值，门复核该上界）。
- **本阶段发现（不在本工作集内，交主会话判断）**：Worker 的默认
  `lease = 5s` 会在客户端 5 秒内没有任何控制帧时取消**正在运行**的 attempt。本地假端点下的
  长重试观测因此在第 2 次 provider 尝试后（约 5 秒）被整体掐断（证据：同一路径下只有 2 次
  尝试、时间线 +2.27s 后停滞，且观测到的 provider 请求不再增长）。本门用**门侧**更大的 lease
  （`GATE_LEASE_MS = 120000`，`spawn` 超时上限仍是 120s）完成长重试观测；
  **生产默认值未被本阶段改动**。含义：任何"原生进程静默超过 5 秒"的真实轮次（例如真实模型
  调用）都会被 Worker 取消——这属于通用接缝层的问题，需要一条独立工单。

## 6. 验证命令与结果（本阶段实测）

```text
node --test scripts/server-round1/build-opencode-authorization.test.mjs   → 9 passed, 0 failed
PYTHONPATH=<src + plugins/*/src> python3 -m pytest -q \
  plugins/agent-box-harnesses/tests/test_opencode_production_template.py \
  tests/server/test_opencode_gate_cleanup.py                              → 25 passed（模板 10 + 门 15）
PYTHONPATH=<...> python3 scripts/server-round1/opencode-production-chain-gate.py --json
                                                                          → 退出码 0；OPENCODE_PRODUCTION_CHAIN_PREPARED
python3 -m py_compile / node --check <本阶段全部新增文件>                  → 通过
```

## 7. 范围、残余风险与未完成项

- 本阶段只登记 **OPENCODE_PRODUCTION_CHAIN_PREPARED**；OpenCode 仍为 **MODEL_NOT_VERIFIED**，
  `workbench_model_verified_count = 0`。门用的是本地假端点与固定 nonce，不是模型能力证据。
- **模型调用 0、费用增量 ¥0**；未读任何真实凭据（假 token 由门自建并在清理时删除）。
- 不再把"ACP"当作 OpenCode 的通道：OpenCode 从未被伪装成 ACP profile，链路走的是
  deployment 声明的通用 `driver` 接缝。
- 已知残余：① LD_PRELOAD 证据的覆盖边界（§3.8）；② Worker 默认 5s lease（§5，交主会话）；
  ③ 附件不支持（驱动显式拒绝，不静默丢弃）；④ 原生日志 `opencode/log/opencode.log` 会被
  捕获进 checkpoint（属 native state，扫描确认不含凭据）。
- 未做（后续阶段）：OpenCode 真实模型门（需要显式凭据授权与费用批准）；Windows c4 复验。

## 8. 声明

- 模型调用 **0**、费用增量 **¥0**；未读取任何真实凭据；未发起任何真实模型/付费请求；
  未访问任何非 loopback 目的地（§3.8 有强制机制与对照实验）。
- 未提交（未 commit / 未 push / 未改 git index）；未修改任何既有文件；
  未改动 `runtime/**`、`src/agent_box/**`、`workers/**`、`protocols/**`、`third_party/**`。
