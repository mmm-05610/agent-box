# 42-D Hermes 生产封装与本地假端点全链验证（草稿）

日期：2026-09-14。分支 `feature/server-harness-extension-v1`。本阶段用**真实 Hermes Agent 0.19.0
与其已安装的 Python 依赖闭包**，只连接本机假 DeepSeek 兼容端点，打通：

```text
Server → Core → generic sidecar deployment → c4 Worker ABW1 interactive → bwrap
       → /usr/bin/python3 -m hermes_cli.main acp（真实隔离闭包）
       → local fake DeepSeek endpoint
```

终态：**HERMES_PRODUCTION_CHAIN_PREPARED**。Hermes 仍为 **MODEL_NOT_VERIFIED**（本阶段不是付费模型
验收：未读凭据、未访问真实模型或任何非 loopback 目的地，费用增量 ¥0）。`BACKEND_IMPLEMENTATION_READY`
未登记。

## 1. Hermes 运行时工件闭包

构建入口：`scripts/server-round1/build-hermes-runtime-artifact.mjs`（只读已安装发行版，**不跑
pip、不联网**；`node` 标准库即可运行）。

| 项 | 值 |
| --- | --- |
| 输出布局 | `<output>/site-packages/…` + owner marker `.agentbox-hermes-runtime-artifact` |
| 入口 | `site-packages/hermes_cli/main.py`（guest 内以 `-m hermes_cli.main acp` 运行） |
| 包数 | **60** |
| 条目数 | **4765**（上限 32768） |
| 字节数 | **108 441 979**（约 103.4 MiB；上限 1 GiB） |
| tree digest | `sha256:b3fb1e4be73552d07f4be9081b966d7db8a8e0dbf23be3062965f577f1cf662a` |
| 解析摘要 | `sha256:1b9dd64bc330f99a4974d2642353bd3a9b544e572a66830770bb2826cc930d9a` |
| manifest | `<output>.manifest.json`（在工件树**之外**，故不改变 digest；不入 Git，输出目录在工作区外） |
| 只读化 | 目录 0555、文件 0444 |
| 双构建一致 | 同一输入连续两次构建 digest／条目／字节／manifest 完全相同（构建器测试内断言） |
| 自足性 | `/usr/bin/python3 -S -c "import hermes_cli.main, acp, openai, distro, markupsafe, pytz, six, markdown_it, mdurl, rich, jinja2, croniter"` 全部解析到工件内（`-S` 关闭 site，系统 dist-packages 与用户 site 都不可用） |

闭包规则：

- 起点 `hermes-agent==0.19.0`，按自身 `Requires-Dist` 递归（含 requirement extras，如
  `httpx[socks]`、`uvicorn[standard]`、`PyJWT[crypto]`）；marker 按本平台求值
  （linux/posix/cpython 3.12/x86_64），因此 win32-only 需求（`tzdata`、`pywinpty`、
  `concurrent-log-handler`）自然排除，并被单独记录为 `excluded.win32OnlyRequirements`。
- **入口点自己的 extra**：`acp` 是唯一被提供的 extra。证据是硬性断言，不是习惯：`acp_adapter/entry.py`
  在 `main()` 里无条件 `import acp`，而提供顶层 `acp` 包的唯一发行版就是 `agent-client-protocol`
  （METADATA 声明为 `extra == "acp"`）。因此工件包含 `agent-client-protocol==0.9.0`（及其 `pydantic`
  依赖），其余全部 extra 一律排除；额外做**精确 extras 差集校验**：闭包中"只因 extra 才进入"的集合必须
  恰好等于入口 extra 需求的传递闭包，否则 `HERMES_ARTIFACT_UNRELATED_DISTRIBUTION`。
- **双来源根（按序）**：`~/.local/lib/python3.12/site-packages`（Hermes 自己所在，主根）优先；
  主根无法满足的依赖落到声明过的平台根 `/usr/lib/python3/dist-packages`，并在 manifest 里逐包记录
  `root`/`fallback`。实测落到平台根的 6 个：`distro 1.9.0`（`openai` 硬 import）、
  `markdown-it-py 3.0.0`/`mdurl 0.1.2`（`rich`）、`MarkupSafe 2.1.5`（`jinja2`）、
  `pytz 2024.1`（`croniter`）、`six 1.16.0`（`python-dateutil`）。
- 文件清单来自发行版**自己的元数据**：wheel 安装读 `RECORD`，Debian 平台安装（无 `RECORD`）读
  `top_level.txt`；两者都在 manifest 里以 `filesFrom` 逐包登记。`__pycache__`/`*.pyc` 一律排除；
  无 symlink/FIFO/socket/设备文件（否则 `HERMES_ARTIFACT_SHAPE_INVALID`）；重复或仅大小写不同的路径
  被拒（`HERMES_ARTIFACT_PATH_CONFLICT`）；非可打印 ASCII 路径被拒。
- **唯一的、已声明的 pin 偏差（结论："声明与实装不一致，已如实登记"，不是"已固定"）**：
  `hermes-agent 0.19.0` 声明 `rich==14.3.3`，而本机（Hermes 自己运行的那个用户 site）装的是
  `rich 15.0.0`，全机不存在 14.3.3。构建器不会静默放过，也不会假装满足：该偏差必须逐条写在
  `DECLARED_PIN_DEVIATIONS` 里并带理由，manifest 记入 `pinDeviations`（含声明值、实装值、根、理由），
  门报告原样转发。其余每一个 pin 都逐条校验一致；任何未声明的偏差都是
  `HERMES_CLOSURE_VERSION_MISMATCH`。端到端门就是在实装的 15.0.0 上跑通 Hermes 的（见 §3）。
- 无关注入：`unrelatedReference`（`flask`）闭包差集被记录（实测 `blinker/flask/itsdangerous/werkzeug`，
  `excluded.unrelatedOnlyPackages`），全部不得进入工件；`boto3` 这类"装了但没人要"的包不在闭包里。
- **manifest 里登记的三类"构建内幕"**（报告同样逐条给出，不埋在 manifest 里）：
  1. `overlays`：插件自有、非任何发行版提供的文件——`deploy/hermes/bootstrap.py` →
     `site-packages/agentbox_hermes_bootstrap.py`（sha256:bfd796a0…）、`deploy/hermes/sitecustomize.py`
     → `site-packages/sitecustomize.py`（sha256:9d8d066b…）。门在两种路径（自建/外部工件）都断言
     overlay 存在且来源以 `deploy/hermes/` 开头（`HERMES_GATE_ARTIFACT_OVERLAY_MISSING`）。
  2. `pinDeviations`：唯一一条 `rich`（声明 `==14.3.3`、实装 `15.0.0`、根与理由入 manifest）；
  3. `packages[].fallback/root/filesFrom` 与 `entry.sourceRoots`：6 个平台根包与其清单来源。

反例（构建器单元测试 19 项，全部通过）：缺依赖、pin 版本不符、入口版本不符、缺入口发行版、入口 extra
未声明、入口 extra 解析出意外发行版、入口不 import 其 extra 提供的模块、闭包内 symlink、闭包内 FIFO、
RECORD 记录但未安装的文件、既无 RECORD 又无 top_level、仅大小写不同的路径冲突、超 1 GiB、
输出在仓库内/相对路径/用户配置目录（`.config`/`.local`/`.hermes` 等）、非法来源根、未标记的非空输出
（**拒绝且不删除**）、已属本构建输出需 `--replace`、真实已安装闭包可构建且自足。

## 2. 生产模板与两处**实测**出来的边界

生产模板由插件拥有：`plugins/agent-box-harnesses/src/agent_box_harnesses/hermes/production.py`
+ `deploy/hermes/{config.yaml,bootstrap.py,sitecustomize.py,loopback-guard.py}`。**不复制第二套漂移
实现**：测试跑 `model-validation-42d.mjs --family hermes --dry-run`（测试自建 0600 假 token）并断言
`config` 与插件模板**逐字段相等**。

锁定值：

| 项 | 生产值 |
| --- | --- |
| 产品/ProviderModel modelId | `deepseek-flash`（不变；**线上生效值见 §2.2**：Hermes 归一为 `deepseek-chat`，门逐轮断言） |
| provider | `deepseek`；`transport: chat_completions` |
| 根地址 | `https://api.deepseek.com`（**官方根地址**，`model.base_url` 与 `providers.deepseek.api` 两处） |
| API key | 环境引用 `DEEPSEEK_API_KEY`（配置文件内无任何秘密） |
| 输出上限 | `max_tokens: 64`（配置文件；线上实测 64，见 §3） |
| thinking | 禁用（`providers.deepseek.extra_body.thinking.type=disabled`） |
| 重试 | `agent.api_max_retries: 1`（最低可支持的重试数，即每轮最多 2 次 provider 尝试），gates 以 2 为上界 |
| adapter | `/usr/bin/python3 -m hermes_cli.main acp`，`PYTHONPATH=/runtime/artifacts/hermes-runtime/site-packages` |
| 配置投影 | `deploy/hermes/config.yaml` → `/tmp/agentbox-home/config.yaml`（只读） |
| native 会话存储 | `HERMES_HOME=/tmp/agentbox-home/state`，`stateProjection.target` 与之一致 |
| credential | `kind=api-key`、`credentialEnvironment=DEEPSEEK_API_KEY` |
| 模型控制 | **不声明**（`MODEL_CONTROL_ID is None`，理由见下） |

### 2.1 实测事实一：Hermes 的 native 会话库是 **`$HERMES_HOME/state.db` 文件**，不是子目录

- 直接证据：`hermes_state.DEFAULT_DB_PATH = get_hermes_home()/"state.db"`、
  `acp_adapter.session.SessionManager._get_db()` 动态构造 `get_hermes_home()/"state.db"`；本机实跑
  `hermes acp` 后 `$HERMES_HOME` 下出现 `state.db` + `state.db-wal` + `state.db-shm`，`sessions/`
  目录为空（JSON 快照默认关闭，且不是恢复来源）。
- 通用契约只能持久化 `/tmp/agentbox-home` 的一个**目录**子项（`stateProjection.target` 正则 +
  bwrap 只给该 target 一个可写 `--bind`），而 Hermes **没有**任何配置键或环境变量能挪动 `state.db`；
  `config.yaml` 又只能投到 `/tmp/agentbox-home/<单段>`，即 `HERMES_HOME` 本身。
- 结论：`HERMES_HOME` 必须**就是**被持久化的那个目录，而评审过的 `config.yaml`（仍按模板投影为只读的
  `/tmp/agentbox-home/config.yaml`）需要在 Hermes 读取之前物化进该目录。工件因此发布一个
  **bootstrap**：`site-packages/sitecustomize.py`（CPython 启动时自动导入）调用
  `agentbox_hermes_bootstrap.apply()`，把只读投影的字节原样写入 `$HERMES_HOME/config.yaml`（内容不同
  才写、写临时文件后 `os.replace`）。**它不 patch Hermes 任何代码**：Hermes 的每次读写都是原生的。
  失败是致命的（`SystemExit`，因为 CPython 会吞掉 `sitecustomize` 的普通异常），所以配置缺失时
  adapter 进程带原因退出，而不是悄悄用默认端点。
- 门对此逐项取证：`bootstrap.applied`（首轮 `written`、后续 `unchanged`）、checkpoint 文件清单里同时
  出现 `config.yaml` 与 `state.db`、`nativeStorePath.files=[state.db, state.db-wal]`、第二轮在原
  native session id 上续接成功。

### 2.2 实测事实二：Hermes 0.19 的 ACP **模型控制**在固定版本的 bridge 上无法送达

- 直接证据（通过真实 sidecar 探测）：Hermes 的 `session/new` 返回 `models.availableModels` 与
  `modes`，**没有** `configOptions`；`session/set_config_option` 明确"接受但没有类型化配置面"并返回
  `config_options=[]`；模型选择走 ACP 的 unstable `models`/`session/set_model`。
- 而 pinned 的上游 bridge 只用 `configOptions` 选模型：`setModel` 在找不到 `id="model"` 选项时直接
  `throw Harness model is not available: <model>`。因此**任何**被冻结的模型值都会在 sidecar 内被拒，
  且发生在任何 provider 请求之前（实测：`create` op 返回
  `SIDECAR_OP_FAILED: Harness model is not available: deepseek-flash`，假端点计数 +0）。
- 所以生产模板**不声明**产品模型控制：一旦声明，Server 会把 `model=<产品模型>` 冻进每次执行，**每一轮
  都会失败**。产品模型只在 native 配置里**声明**（`model.default`），实际生效值由 Hermes 自己的归一
  规则决定（下一条）；门用一个显式的 test-only 变体（`model_control_id="model"`）把这条限制作为
  证据跑出来，而不是写在注释里（§3 的 `modelControl`）。
- **有效模型不等于产品模型：这是本家 native 名称归一的必然结果，且已加硬断言。**
  Hermes 在 `agent_init` 里对非聚合 provider 调用
  `hermes_cli.model_normalize.normalize_model_for_provider()`，DeepSeek 走
  `_normalize_for_deepseek()`：只有**一等公民 id**（`deepseek-v<数字>...`）与 reasoner 类名称能原样通过，
  其余一律折叠为 `deepseek-chat`（纯字符串逻辑；该模块内**没有任何网络调用**，实测 grep 无
  `requests/httpx/urllib/fetch`）。`deepseek-flash` 既非一等公民也不含 reasoner 关键字 ⇒ 线上模型是
  `deepseek-chat`。
  在 42-D 冻结配置下**无法**让 native 有效模型等于 `deepseek-flash`：`model.default`、`model.provider`
  都是权威配置字段（模板必须与 42-D 逐字段相等），而能原样透传的写法只有 `deepseek-v4-flash` 这类
  一等公民 id 或换成 `provider: custom`——两者都会改动权威配置，本阶段不做也不该做。因此：
  - 门**断言**而不是观测：`observedModels`（round-1 / round-2 / retry 三个相位）必须逐一等于记录值
    `deepseek-chat`，任何漂移即 `HERMES_GATE_EFFECTIVE_MODEL_DRIFT` 失败；
  - `modelResolution` 记录 `configuredModelDefault=deepseek-flash`、`effectiveModel=deepseek-chat`、
    规则来源（从**工件内**读到的 `site-packages/hermes_cli/model_normalize.py`）、`networkDependent=false`
    与两个谓词的求值结果（`passthroughPatternMatched=false`、`reasonerPrefixMatched=false`）。
  - **联网与否不改变这一结论**：被离线守门拒绝的 `models.dev`/`openrouter.ai` 只喂"可选模型列表"
    （ACP `models.availableModels`），固定版本的 bridge **不使用**它；折叠规则本身不联网。所以真实
    （联网）生产里有效模型同样是 `deepseek-chat`。**但这只是"会不会发 deepseek-flash"的证据**：线上
    究竟发哪个 id 属于真实模型验收范围，本条不得当作"产品模型已通过"。
  - 结论：**产品模型选择在本家 ACP 面上不可寻址，有效模型是 Hermes 自己的默认值**；这是本家进入
    **真实模型门之前必须先解决的残余风险**（AgentBox 白名单只有 `deepseek-flash`）。

### 2.3 生产环境与只读闸门的差异（运行期施加，不落盘为生产配置）

1. 假端点：`model.base_url` 与 `providers.deepseek.api` 改指 loopback（`documented_differences`
   断言**只改这两项**）；
2. `PYTHONPATH` 前面追加 `/tmp/agentbox-home` 并把评审过的离线守门
   `deploy/hermes/loopback-guard.py` 投影为 `/tmp/agentbox-home/sitecustomize.py`（生产模板里绝不允许
   出现它）；
3. adapter 环境追加三个审计 sink：`AGENTBOX_EGRESS_AUDIT`、`AGENTBOX_ACP_AUDIT`、
   `AGENTBOX_BOOTSTRAP_AUDIT`（都指向 `/workspace`）。
生产默认里既没有 `NODE_OPTIONS`、也没有任何 `AGENTBOX_*` 键（测试逐项断言）。

`HERMES_MAX_TOKENS` **不在**生产环境里：Server 的 deployment 校验会拒绝形如凭据的环境键
（`TOKEN|SECRET|KEY|…`），`HERMES_MAX_TOKENS` 命中 `TOKEN`（实测 `SIDECAR_DEPLOYMENT_INVALID`），
所以 64 的出口上限声明在 Hermes 真正读取的 `model.max_tokens`，门断言线上 `max_tokens<=64`。
`HERMES_MAX_ITERATIONS`、`HERMES_MODEL`、`HERMES_INFERENCE_MODEL`、`HERMES_TUI_PROVIDER`、
`HERMES_INFERENCE_PROVIDER` 保留（42-D 准备过的环境；实测 ACP 从 `config.yaml` 取模型/供应商，故它们
是一致性声明而非承重项）。

## 3. 真实 Hermes + 本地假端点全链结果

命令与退出码：

```text
PYTHONPATH=<src + 全部 plugins/*/src> \
python3 scripts/server-round1/hermes-production-chain-gate.py [--artifact <built>] [--keep] [--json]
→ 退出码 0；result = HERMES_PRODUCTION_CHAIN_GATE_OK
```

链路：唯一 release c4 Worker + bwrap + `/runtime/artifacts/hermes-runtime` 只读投影 + 真实
`hermes-agent 0.19.0` 闭包 + 本机 127.0.0.1 假端点。凭据为**临时 0600 假 token**，经既有 Server
SecretStore → `CredentialRecords` → Profile.credentialId → 冻结执行配置 → Worker `secret.put` 帧 →
sidecar 注入 `DEEPSEEK_API_KEY` 到 adapter 进程。

脱敏结果（gate JSON 摘录）：

```json
{"rounds": {"first":  {"state": "completed", "deltaSeq": [4],  "deltaText": ["HERMES-GATE-NONCE-1C4E71"], "completedSeq": 7,  "deltasBeforeCompletion": true},
            "second": {"state": "completed", "deltaSeq": [11], "deltaText": ["HERMES-GATE-NONCE-2A9D05"], "completedSeq": 14, "deltasBeforeCompletion": true}},
 "checkpointAfterFirst": {"schemaVersion": 2, "resumable": true, "harnessType": "hermes",
                          "nativeSessionId": "e06ad8ea-…-9acfd5612fc8",
                          "files": [".skills_prompt_snapshot.json", "SOUL.md", "auth.json", "auth.lock",
                                    "config.yaml", "logs/agent.log", "logs/errors.log",
                                    "state.db", "state.db-shm", "state.db-wal"]},
 "nativeStorePath": {"files": ["state.db", "state.db-wal"], "note": "Hermes keeps its authoritative session database at $HERMES_HOME/state.db …"},
 "chainProviderRequests": {"round1": 1, "round2": 1},
 "round2Continuation": {"model": "deepseek-chat", "maxTokens": 64, "stream": true, "toolCount": 15,
                        "roles": ["system", "user", "assistant", "user"],
                        "round2CarriesRound1User": true, "round2CarriesRound1Assistant": true},
 "acpMethods": {"chain": ["new_session", "resume_session"],
                "chainAndModelControl": ["new_session", "resume_session", "new_session", "resume_session", "new_session", "resume_session"]},
 "modelResolution": {"configuredModelDefault": "deepseek-flash", "effectiveModel": "deepseek-chat",
                     "rule": "hermes_cli.model_normalize._normalize_for_deepseek (read from the artifact)",
                     "networkDependent": false,
                     "witness": {"passthroughPatternMatched": false, "reasonerPrefixMatched": false, "foldReturnPresent": true},
                     "note": "product model id is not addressable on this harness's native surface; the effective model is Hermes' own default"},
 "observedModels": [{"phase": "round-1", "model": "deepseek-chat"},
                    {"phase": "round-2", "model": "deepseek-chat"},
                    {"phase": "retry", "model": "deepseek-chat"}],
 "egress": {"classified": {"guard-self-test": 16, "harness-catalog-probe": 8,
                           "provider-default-endpoint": 6, "unclassified": 0},
            "zeroSuccessfulNonLoopbackConnections": true},
 "modelControl": {"declaredControl": "model",
                  "cases": [{"label": "product", "modelId": "deepseek-flash", "state": "failed",
                             "providerRequestsAfterRefusal": 0, "refusedBeforeProviderRequest": true,
                             "reasonMentionsModelAvailability": true,
                             "reasons": ["SidecarError: SIDECAR_OP_FAILED: Harness model is not available: deepseek-flash"]},
                            {"label": "unknown", "modelId": "deepseek-unknown", "state": "failed",
                             "providerRequestsAfterRefusal": 0, "refusedBeforeProviderRequest": true,
                             "reasons": [ "… Harness model is not available: deepseek-unknown"]}]},
 "credentialRefusal": {"refused": true, "code": "CREDENTIAL_REQUIRED", "dispatched": false, "providerRequests": 0},
 "credential": {"injectedTokenReachedProvider": true, "unauthorizedRequests": 0,
                "tokenInEvents": false, "tokenInReportableState": false},
 "stateScan": {"files": 10, "bytes": 1085661, "tokenHits": [], "tokenInState": false},
 "deltaAttribution": {"deltas": 2, "unattributed": 0},
 "egress": {"guardLoaded": true, "selfTestOk": true, "nonLoopbackAttempts": 30,
            "deniedDestinations": ["198.51.100.7:443", "api.deepseek.com:443", "models.dev:None", "openrouter.ai:None"]},
 "bootstrap": {"applied": ["bootstrap-applied home=/tmp/agentbox-home/state config=written bytes=402", "… config=unchanged …"]},
 "workerPosture": {"writableTargets": ["/tmp/agentbox-home/state", "/workspace"],
                   "readOnlyTargets": ["/bin","/etc","/lib","/lib64","/mnt/wsl/resolv.conf",
                                       "/runtime/artifacts/hermes-runtime","/runtime/secret/credential",
                                       "/runtime/view","/tmp/agentbox-home/config.yaml",
                                       "/tmp/agentbox-home/sitecustomize.py","/usr"],
                   "artifactMountedReadOnly": true, "credentialMountedReadOnly": true},
 "retryObservation": {"failFirst": true, "modelRequests": 1, "retriedAfterInjectedFailure": false,
                      "assistantText": "API call failed after 1 retries: HTTP 500: gate-injected transient failure",
                      "declaredApiMaxRetries": 1, "declaredMaxProviderAttempts": 2, "requestsBeyondBudget": 0},
 "artifactDriftCheck": {"detected": true, "files": 1},
 "cleanup": {"workerProjectionsRemoved": true, "adapterProcessesRemoved": true,
             "fakeTokenRemoved": true, "workspaceRemoved": true, "removed": true}}
```

逐项：

- **provider 模型请求：两轮合计恰好 2 次**（每轮 1 次；假端点按 phase 计预算，超出立即计
  `requestsBeyondBudget` 并让门失败）。两次都带 `Authorization: Bearer <注入的假 token>`，
  `unauthorizedRequests=0` → 秘密确实经 Server→Worker→sidecar 送达 adapter 进程。
- **第二轮上下文**：请求 2 = system + 第一轮 user（含 NONCE-1）+ 第一轮 assistant（含 NONCE-1）+ 新的
  user → 续接来自 Hermes 自己的 `state.db`，不是 Server 重放。
- **delta 顺序**：第一轮 delta 序号 4 < completed 7；第二轮 11 < 14（同一持久事件流）；无归属不明的
  delta。
- **native 恢复**：第二轮 checkpoint 的 `nativeSessionId` 与第一轮相同；checkpoint
  `schema_version=2`、`resumable=true`、`harnessType="hermes"`；捕获的 state 里含 Hermes 自己的
  `state.db`/`state.db-wal` 与由 bootstrap 物化的 `config.yaml`。
- **重开方法（直接观测，不是猜）**：门在 adapter 进程内安装的只读观测钩子（评审过的 gate 资产
  `loopback-guard.py` 包住 Hermes 自己的 ACP 会话方法）记录到 **`new_session`（第一轮）→
  `resume_session`（第二轮）**：Hermes 播发 `sessionCapabilities: {fork,list,resume}`，bridge 对声明
  权威 transcript 的 harness 选**无重放**的 `session/resume`。另有独立复现相位
  （`observe_reopen`，同一 launcher/工件/bwrap/Worker）记录 chunk 序列与 `nativeSessionIdStable`。
  **不得**把它写成 `session/load`。
- **未知/不可送达模型在发 provider 请求之前被拒**：声明了模型控制后，产品模型 `deepseek-flash` 与
  `deepseek-unknown` 都在 sidecar 内以
  `Harness model is not available: <model>` 失败，假端点计数**均零新增**。理由与位置（sidecar `create`
  op → bridge 模型可用性检查）写进 JSON。
- **缺凭据**：不带 credential 的 Profile 其 send 被 Server 以 `CREDENTIAL_REQUIRED` 拒绝，
  `dispatched=false`、provider 请求 0（不派发）。
- **重试上界（真实证据）**：假端点先对一次 `/chat/completions` 返回 500 → Hermes 只发出 **1** 次
  provider 请求（HTTP 层未重试），并把错误当成 assistant 文本交付
  （`API call failed after 1 retries: HTTP 500: …`），该轮仍 `completed`。声明上界
  `maxProviderAttempts=2`（`api_max_retries=1`）为保守值；超出即门失败。
- **凭据扫描**：checkpoint 内 10 个 state 文件（1 085 661 字节）与持久事件中**均无**假 token；
  gate 报告本身也不含 token 值。
- **egress（逐类定性 + 失败语义不放松）**：只读守门加载且**自测通过**（固定的 TEST-NET 探针
  `198.51.100.7:443` 在解析/连接前被拒并写审计）。本阶段共 30 次非 loopback 尝试被拒，**逐类**为：

  | 类别 | 目的地 | 次数（本次运行） | 定性 |
  | --- | --- | --- | --- |
  | `guard-self-test` | `198.51.100.7:443` | 16 | 守门自身的 fail-closed 自测探针（TEST-NET-2，永不可路由），证明"拒绝发生在任何系统调用之前" |
  | `harness-catalog-probe` | `models.dev`、`openrouter.ai` | 8 | Hermes 的模型元数据/目录探测；离线被拒，且**不可能**改变有效模型（折叠规则是静态字符串逻辑，见 §2.2） |
  | `provider-default-endpoint` | `api.deepseek.com:443` | 6 | Hermes 自身的辅助/上下文长度路径使用**供应商默认端点**而非配置端点；**模型请求**全部到达 loopback 端点（由 `provider.requests` 与授权匹配证明） |
  | `unclassified` | — | **0** | 出现即失败 |

  失败语义（不因本次为 0 而放松）：任何**未归类**的非 loopback 拒绝即
  `HERMES_GATE_EGRESS_UNCLASSIFIED_DESTINATION` 失败；provider 请求未能到达 loopback 端点、或审计里
  出现针对非 loopback 目的地的 "allowed" 行，同样失败。因此**零成功的非 loopback 连接**是断言而非
  陈述；残余（如实登记）：该守门在 Python `socket` 层拦截，若某个原生 C 扩展绕过 `socket` 自行发起
  系统调用，本阶段不覆盖，bwrap 网络姿态亦未改。
- **sandbox 姿态（Worker argv 取证）**：每个执行恰好两个可写 `--bind`：`/workspace` 与
  `/tmp/agentbox-home/state`；其余全部 `--ro-bind`（含工件、投影、守门、凭据）；**没有任何**用户目录
  挂载。
- **工件摘要漂移自检**：把工件私有一份拷贝改 1 个字节后，评审过的 `runtime_artifact_tree_summary`
  摘要必变（`detected=true`，两个 digest 均入报告），说明"摘要校验"是真的。
- **清理**：成功且非 `--keep` 的运行会**验证后**移除本次运行的临时根——身份校验（必须是本次
  `mkdtemp` 返回的**完全相同**路径、位于系统临时目录、属主为本用户、无组/其他权限、非符号链接），
  再把其中由 Hermes 构建器发布的只读工件显式改写为可写（`cleanup.madeWritable=4850`），删除后复核
  路径确已消失；Worker `views/`、`secrets/` 无残留；无存活 Hermes adapter 进程；临时假 token、
  workspace、DataRoot、假端点与临时工件目录全部移除。`--keep` 只报告保留路径且**不**声称
  `removed=true`（实测 exit 0 + `run.removed=false` + `kept=<path>`）。外部 `--artifact` 只读且
  **绝不删除、绝不改权限**（复核摘要与 0555 模式不变，记 `artifact.external=true`、
  `preservedAfterCleanup=true`）。清理失败不覆盖主失败：两者并存时仍非零退出。

## 4. 本阶段发现的真实边界与缺陷

1. **Hermes 的 native 会话库是 HERMES_HOME 里的文件**（`state.db` + WAL/SHM），不是目录。通用
   `stateProjection` 只能持久化一个目录子项，且 Hermes 无配置键可挪动它 —— 这条组合决定
   `HERMES_HOME` 必须是那个持久化目录，配置必须由工件的 bootstrap 物化进去（§2.1）。没有改
   Server/Core/Worker/bwrap 任何一行。
2. **固定版本 bridge 无法把模型选择送达 Hermes 0.19**（configOptions 面缺失，§2.2）：这是真实
   产品能力缺口，本阶段以"不声明模型控制 + 门内显式取证"的方式如实登记，而不是让每一轮都失败。
3. **产品模型 id 在本家 native 面上不可寻址，有效模型被静态折叠**：Hermes 的
   `_normalize_for_deepseek()`（纯字符串逻辑、不联网）把非一等公民的 `deepseek-flash` 折叠成
   `deepseek-chat`；在 42-D 冻结配置下没有不改权威配置的 native 途径可让线值等于产品模型 id。门已把
   "本轮实际生效模型 = 记录值" 做成硬断言（漂移即失败）并记录规则来源。这是**真实模型门之前的必须先
   解决的残余风险**（白名单只有 `deepseek-flash`）：要么把产品/白名单模型改成 Hermes 一等公民 id
   （如 `deepseek-v4-flash`），要么由 harness 侧给出显式映射，**不得**据此主张已通过。
4. **`HERMES_MAX_TOKENS` 无法作为 adapter 环境键声明**：Server 的凭据形态键校验命中 `TOKEN`。上限
   改由 `config.yaml` 声明，门断言线上值。
5. **Hermes 运行期会探测非配置端点**：`api.deepseek.com:443`（每次 adapter 启动，供应商默认端点）与
   `models.dev`/`openrouter.ai`（模型元数据目录探测）。本阶段靠只读守门逐类拒绝、登记并 fail-closed
   归类；生产环境下这些是真实外联，bwrap 网络姿态未改（与 Pi 阶段一致）。守门在 Python `socket` 层
   生效，绕过 `socket` 的原生实现不在覆盖范围内（如实登记）。
6. **provider 5xx 不会让轮次失败**：Hermes 把错误文本当作 assistant 内容交付，轮次仍 `completed`，
   且 HTTP 层只观察到 1 次尝试。门因此以"声明上界 2 + 观测值"记录，并在超过上界时失败。

## 5. 验证命令与结果

```text
node --test scripts/server-round1/build-hermes-runtime-artifact.test.mjs          → 20 passed, 0 failed
python3 -m pytest -q plugins/agent-box-harnesses/tests/test_hermes_production_template.py
                                                                                  → 15 passed
python3 -m pytest -q tests/server/test_hermes_production_chain.py                 → 16 passed
python3 scripts/server-round1/hermes-production-chain-gate.py --json              → 退出码 0；HERMES_PRODUCTION_CHAIN_GATE_OK
python3 scripts/server-round1/hermes-production-chain-gate.py --artifact <built>  → 退出码 0；工件只读且清理后仍在
python3 scripts/server-round1/hermes-production-chain-gate.py --artifact <built> --keep
                                                                                  → 退出码 0；run.removed=false，报告保留路径
python3 -m py_compile <全部改动 py 文件> / node --check <全部改动 mjs>              → 通过
```

双构建 digest 一致：见 §1（构建器测试内断言两次构建的 digest/条目/字节/manifest 完全相同；本次人工
复核 `artifact` 与 `artifact2` manifest 逐字节相等）。

## 6. 范围与未完成项

- **本阶段只登记 HERMES_PRODUCTION_CHAIN_PREPARED**；Hermes 仍为 **MODEL_NOT_VERIFIED**，
  `workbench_model_verified_count = 0`。门用本地假端点与固定 nonce，不是模型能力证据。
- **模型调用 0、费用增量 ¥0**；未读任何真实凭据（假 token 由门自行生成并用后删除），未访问任何真实
  端点。累计额度不变（上限 ¥10）。
- **c4 仍无 Windows 平台证据**：按要求未运行 Windows r4、未占用 Windows 构建槽，直接驱动 WSL 内的
  release Worker（同一 ABW1 协议）。
- 未做（后续阶段）：Codex/OpenCode 的同级封装（OpenCode 由并行子代理推进）、以及四家真实模型门。
  Hermes 侧在真实模型验收前必须先解决 §4.2/§4.3（模型控制与产品模型 id）。
- 已知残余（进入真实模型门前必须处理）：
  1. **产品模型不可寻址 / 有效模型被静态折叠**（§2.2、§4.3）：白名单只有 `deepseek-flash`，而 Hermes
     会把它折叠为 `deepseek-chat`；必须先定产品模型 id 或提供显式映射；
  2. 模型控制缺口（上游 bridge 只认 `configOptions`，Hermes 0.19 只播发 ACP `models`）；
  3. Hermes 辅助探针的外联姿态（`api.deepseek.com` 默认端点、`models.dev`、`openrouter.ai`）与
     Python 守门不覆盖原生绕过；
  4. 工件摘要在 bootstrap 校验一次（既有 TOCTOU 窗口，与本阶段无关）；
  5. `rich` pin 偏差为环境既定事实，已显式声明（不是"已固定"）。
