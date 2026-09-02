# Hermes Agent — ACP viability dossier (harness id: hermes)

观察日期：2026-09-02 · 本机版本 v0.19.0 (2026.7.20) · upstream f15a38ee（local 7df3aa34 +1 carried commit）· Python 3.12.3 · git 安装于 `<user-home>/.local/lib/python3.12/site-packages`
来源分级/六类事实/UNKNOWN 语义遵守 `../SOURCE_POLICY.md`。证据 ID E-1…E-45 解析于 `EVIDENCE.md`。

**一句话结论：Hermes Agent 是本轮少见的"厂商官方原生 ACP 实现"——in-tree `acp_adapter/` 随官方分发、文档专页、专测 15 文件、活跃维护；但（截至 2026-09-02）尚未进入 ACP Registry（4 个 open PR 全部未合入，阻塞在官方 npm launcher 未发布）。协议覆盖面广（含 permissions/diff/plan/usage/model 切换/MCP/fork/list/resume），缺客户端侧 fs/terminal 代理与 cost 字段。双 spawn 判决 SAFE_WITHIN_EXISTING_RUNTIME。**

---

## 1. Identity

| 项 | 值 | source / class / observed / version / confidence / status |
|---|---|---|
| Agent | Hermes Agent（Nous Research "self-improving" agent） | E-4, E-24 / VENDOR_SOURCE / 2026-09-02 / 0.19.0 / HIGH / PROVEN |
| 本机可执行 | `<binary>`（= `<user-home>/.local/bin/hermes`，`#!/usr/bin/python3` launcher）；ACP 模式另有 `hermes-acp` console script 与 `python -m acp_adapter` | E-1, E-6, E-45 / VENDOR_SOURCE+CLI_OBSERVED / 2026-09-02 / 0.19.0 / HIGH / PROVEN |
| 版本探针 | `hermes --version`（多行 banner）· `hermes acp --version`（单行 `0.19.0`） | E-1, E-3 / CLI_OBSERVED / 2026-09-02 / 0.19.0 / HIGH / PROVEN |
| 上游 | github.com/NousResearch/hermes-agent · MIT · PyPI `hermes-agent` 已发布（0.19.0） | E-14, E-24 / VENDOR_SOURCE / 2026-09-02 / — / HIGH / PROVEN |
| 版本差 | 本机 0.19.0 落后上游最新 release v0.21.0 (v2026.8.31) 2 个 release；ACP 能力在 0.20.x 继续演进（configOptions、ACP 0.11 schema 适配） | E-12, E-21, E-24 / ISSUE_DISCUSSION+VENDOR_SOURCE / 2026-09-02 / — / HIGH / PROVEN |

## 2. OFFICIALITY_FACTS（六类事实逐项独立判定）

1. **ACP 官方 SDK 存在**：YES。本机随 hermes 安装的即官方 Python SDK `agent-client-protocol` 0.9.0（repo `agentclientprotocol/python-sdk`，模块 `acp`，schema ref v0.11.2，PROTOCOL_VERSION=1）；org 另有 TS/Rust/Kotlin/Java SDK。E-8, E-9 · ACP_SDK/ACP_ADAPTER_ORG · HIGH · PROVEN。*（SDK 存在不证明任何 harness 兼容——此处兼容性由第 5 类独立证明。）*
2. **ACP Registry manifest**：NO（2026-09-02）。registry.json 39 agents 无 hermes；agentclientprotocol/registry 有 4 个 open PR（#255/#436/#529/#546，2026-04→2026-08）+1 closed（#188），全部未合入；PR #529 注明剩余 CI blocker 是 `@nousresearch/hermes-agent` npm launcher 发布（npm 实测 404）。E-10, E-11, E-12, E-13 · REGISTRY_ENTRY+ISSUE_DISCUSSION · HIGH · PROVEN。
3. **第三方 hermes ACP wrapper**：存在但小而冗余。xnzone/hermes-agent-acp-bridge（Rust，hermes-ACP→OpenAI 兼容 HTTP，4★）、kwikiel/hermes-sdk（Python client over ACP，2★）、gad0n3/hermes-acp-launcher（0★）、1060392338/hermes-webui（2★）、0xNyk/hermes-buzz（20★）、agentic-control-plane/hermes-acp-plugin（2★）；另有 block/buzz 的 `buzz-acp` 被 hermes 官方文档收录为传输桥。均低活跃/低星；官方原生实现使第三方 wrapper 基本冗余。E-23, E-17 · PEER_PROJECT · MEDIUM · PARTIAL。
4. **agentclientprotocol 组织名下 hermes adapter**：NO。org 14 个仓库无一涉及 hermes。E-9 · ACP_ADAPTER_ORG · HIGH · PROVEN。
5. **NousResearch 官方原生支持 ACP**：**YES（实现级，非仅讨论）**。证据链：(a) 发行包 RECORD 含 22 条 `acp_adapter/*`；(b) console script `hermes-acp` + 子命令 `hermes acp` + extra `acp` 精确 pin SDK 0.9.0；(c) 官方文档站两个专页（user-guide 398 行 + developer-guide 181 行）；(d) `tests/acp/` 15 个测试文件；(e) `acp_adapter` 近 10 commit 跨 2026-06~08 持续修复/增强（含从 prime-agent port 的修复）；(f) 872 条 acp 相关 issue/PR（含 #14606 计划迁入 `hermes_agent/acp/`、#81067 ACP 0.11 configOptions、#97735 反向"ACP subprocess provider"）。E-4~E-7, E-14~E-21 · VENDOR_SOURCE+VENDOR_DOC · HIGH · PROVEN。
6. **Zed/Codeg 能否装跑**：
   - Zed：不在 Zed External Agents 文档清单、不在 Registry（故 `zed: acp registry` 一键装暂不可行）；但可通过 custom agent server `{command:"hermes", args:["acp"]}` 运行（hermes 官方文档给出配置示例）。E-22, E-17 · ZED_DOC+VENDOR_DOC · HIGH · PROVEN。
   - Codeg（Agent-Box Studio）：自定义 ACP agent 机制（npx/uvx/binary distribution + version_probe + supports_mcp 默认 true）可注册 binary 形态 `hermes acp` 或 uvx `hermes-agent[acp]`；hermes 侧接受 `session/new.mcpServers`（supports_mcp 契合）。本机源码判定，端到端 GUI 实跑未执行。E-43, E-40 · CODEG_LOCAL · HIGH · PROVEN(代码)/UNKNOWN(实跑)。

## 3. VERSION_PIN

- 建议钉住：**v0.19.0 + agent-client-protocol==0.9.0（hermes `[acp]` extra 原样）**——本机验证组合（--check OK + initialize 握手实测）。
- 上游最新 v0.21.0 (v2026.8.31)；ACP 行为 VERSION_SENSITIVE：0.20.x 起（#81067、#88630）将模型目录改为 `session/new.configOptions` + `session/set_config_option`（ACP 0.11 schema），0.19.0 则用 session modes 承载审批策略、`set_config_option` 仅回空表。升级即改变模型选择 UI 通路。E-12, E-21, E-35, E-36。
- 协议版本：初始化协商 `protocolVersion=1`（unstable 扩展经 `use_unstable_protocol=True` 开启）。E-8, E-27, E-32。

## 4. LAUNCH

| 项 | 值 | 证据 |
|---|---|---|
| argv | `hermes acp` ≡ `hermes-acp` ≡ `python -m acp_adapter`；flags `--version/--check/--setup/--setup-browser/--yes/--accept-hooks` | E-2, E-16 |
| 传输 | stdio JSON-RPC（ndjson）；**stdout 专用于协议帧**，日志全改道 stderr；stdout 必须是 pipe/socket/chardev（重定向到普通文件 → SDK `connect_write_pipe` 抛 ValueError） | E-16, E-17, E-31 |
| 进程内引导 | load `HERMES_HOME/.env` → stderr logging（ping/health 探活 -32601 噪声过滤）→ 构造 HermesACPAgent → `acp.run_agent(agent, use_unstable_protocol=True)`；先做 config.yaml 全局 MCP 发现（可用宿主 env `HERMES_ACP_SKIP_CONFIGURED_MCP=1` 跳过） | E-17, E-32, E-40 |
| HOME/启动器耦合 | git 安装的 launcher 依赖 HOME 推导 user site-packages：`HOME=<temp-home>` 单独改 → `ModuleNotFoundError`；**`HOME=<temp-home> + PYTHONPATH=<user-site>` 可行（实测）**；或注册为 Codeg `binary`/`uvx` 形态绕开 | E-28, E-43 |
| 状态隔离 | `HERMES_HOME=<temp-home>/.hermes` 即可整体重定向 home（实测自动引导骨架：skills/sessions/logs/memories/...）；进程级 per-task cwd 经 task-scoped override 绑定编辑器工作区 | E-29, E-17 |
| 首启动副作用 | `tools.lazy_deps` 会对 provider 可选依赖做 lazy 安装（实测日志 boto3/bedrock）→ 启动可能触网改动环境；Agent-Box 沙箱需预置或允许/禁止该路径（预跑 `--check` 不触发；触发点在真实 server 构建期） | E-30 |
| 缓冲 | ACP 传输 flush 由 SDK 控制，无需 PYTHONUNBUFFERED（仅 native `-z` 文本管道模式相关） | E-44 |
| bundle 体量 | 非单文件：需整棵 Python3.12 site-packages（数百依赖）或走 PyPI（`uvx --from 'hermes-agent[acp]' hermes-acp`，registry PR 采用的 fallback 形态） | E-45, E-13 |

## 5. ACP coverage（逐项；0.19.0 实现为准）

图例：状态词 ∈ SUPPORTED/PARTIAL/NOT_SUPPORTED/UNKNOWN/VERSION_SENSITIVE。**本轮不存在"无 ACP 实现"情形——实现为官方原生**；未标注实测的行均以 VENDOR_SOURCE（file:line）+ VENDOR_DOC 双源判定。

| ACP 能力 | 状态 | 依据 |
|---|---|---|
| initialize / capabilities | **SUPPORTED（实测 E-27）** | protocolVersion=1；agentInfo hermes-agent/0.19.0；loadSession=true；promptCaps.image=true；sessionCaps fork/list/resume；authMethods（E-25） |
| authenticate | SUPPORTED | provider 匹配 + terminal setup（`hermes-setup`）；无凭据时实测仅 1 条 terminal auth（E-26, E-27） |
| session/new | SUPPORTED | cwd 绑定、mcpServers 注册、config_options 接受（E-33, E-40, E-36） |
| session/load | SUPPORTED | loadSession=true；SessionDB state.db 持久化（source="acp"）+ 跨进程 restore（E-25, E-33, E-18） |
| session/resume | SUPPORTED | SessionResumeCapabilities（E-25, E-18） |
| session/list | SUPPORTED | SessionListCapabilities + list_sessions 实现（E-25, E-33） |
| session/fork | SUPPORTED | 深拷贝历史、独立 session id/cwd（E-18, E-33） |
| prompt | SUPPORTED | 文本+图片；slash 命令拦截；运行中 prompt 排队（E-37, E-36） |
| streaming text | SUPPORTED | stream_delta_callback → agent message chunk（E-37） |
| thinking | SUPPORTED | reasoning_callback → AgentThoughtChunk；本地状态噪声被有意置 None（E-37, E-18 注：0.19.0 起即走 reasoning delta） |
| tool call / tool update | SUPPORTED | ToolCallStart/Complete、kind 映射、FIFO per-name id、title/raw_input、结果润色块（E-37, E-39） |
| file edits diff | SUPPORTED | write_file/patch → `tool_diff_content(path,old_text,new_text)`（E-38） |
| usage（tokens/上下文） | SUPPORTED | PromptResponse.usage（in/out/total/thought/cached_read）+ 原生 usage_update（size/used）供 Zed 上下文环（E-37） |
| usage cost（$） | **NOT_SUPPORTED（ACP 面上）** | ACP usage 无 cost 字段；成本仅在 native `-z --usage-file`（estimated_cost_usd）——ACP 会话无 per-turn 成本外泄（E-37 + native FACTS §H） |
| permission（终端命令） | SUPPORTED | allow_once/allow_session/allow_always/deny；超时/失败默认 deny；allow_always 写永久 allowlist（E-17, E-38） |
| permission（编辑审批） | SUPPORTED | EditProposal diff 审批 + 会话级 auto-approve 策略 + 敏感路径永不自动批（E-38） |
| question/clarify | **NOT_SUPPORTED** | clarify 不在 hermes-acp toolset（E-39） |
| plan approval（todo→plan） | SUPPORTED | todo 结果 → AgentPlanUpdate（pending/in_progress/completed，cancelled 保留为终端态）（E-37） |
| cancel | SUPPORTED | cancel_event + agent.interrupt() → stop_reason="cancelled"（E-18, E-37） |
| steer / queue | PARTIAL | 经 slash `/steer` `/queue`（available_commands 下发，文本形态）；无原生 ACP steer 方法；中断后 /steer 支持纠偏回放（E-37） |
| terminal/*（客户端代理） | **NOT_SUPPORTED** | 不调用 client 的 terminal_create 等；终端执行在 agent 进程内自有工具完成（E-41） |
| fs/read_text_file、fs/write_text_file（客户端代理） | **NOT_SUPPORTED** | 同上；clientCapabilities.fs 被忽略（E-41） |
| session modes | SUPPORTED | default/accept_edits/dont_ask ↔ edit approval policy（E-35） |
| config options | PARTIAL / VERSION_SENSITIVE | 0.19.0 只回空 config_options（模型选择走 set_model + modes）；0.20.x 起 advertise model select（E-36, E-12, E-21） |
| session/set_model | SUPPORTED | `provider:model` ID、切换重建 agent、按会话生效（E-36, E-17） |
| available commands（slash） | SUPPORTED | 9 条 advertise + 本地拦截不触模型（E-37） |
| MCP servers | SUPPORTED | 全局 config.yaml + session/new mcpServers per-session；`HERMES_ACP_SKIP_CONFIGURED_MCP=1` 宿主开关（E-40, E-17） |
| images（输入） | SUPPORTED | PromptCapabilities.image=true → OpenAI content parts（E-25, E-37） |
| embedded resource / audio 输入块 | PARTIAL / UNKNOWN | 资源块有转换路径（resource→parts）；developer 文档自述 "non-text prompt blocks are currently ignored for request text extraction"；audio 块未验证（E-18, E-37） |
| subagents | SUPPORTED | delegate_task 在 hermes-acp toolset，kind=execute，结果润色渲染（E-39） |
| session locator / lineage | SUPPORTED（扩展） | `_meta.hermes.sessionProvenance`（压缩链/根会话/深度），向后兼容（E-34） |
| stop_reason | SUPPORTED | end_turn / cancelled / refusal（E-37） |
| process exit | PARTIAL | 崩溃 sys.exit(1)、Ctrl-C 优雅退出（源码）；被宿主 SIGKILL 后会话由 state.db 恢复（E-32, E-33）；未做 kill 实测 |
| unstable protocol | SUPPORTED | `use_unstable_protocol=True`（E-32） |

OPEN_QUESTIONS（UNKNOWN 项汇总）：lazy_deps 安装是否落盘（E-30）；stop_reason 完整枚举；0.19.0 上 audio/资源块端到端行为；Codeg 端到端实跑。

## 6. Fidelity（vs native 接口基线，native 基准见 harness-native-knowledge-2026-09-01/FACTS.md）

- **保真**：流式文本、reasoning/thinking、工具起止与 diff、todo→plan、token usage、审批（3 级 allow + deny）、模型切换、resume/fork/list、MCP、skills、memory、subagent——native chat 的核心体验在 ACP 上有显式事件/方法映射（E-37~E-40）。
- **损失**：
  1. **cost 缺失**：native `--usage-file` 有 estimated_cost_usd/cost_status/cost_source；ACP 面只有 token 计数与上下文占用 → Agent-Box 若以成本记账为 P0，ACP 模式需旁路（读 state.db / 沿用 -z）。
  2. **clarify / messaging / audio / cron 工具被 curated 掉**（hermes-acp toolset 有意收窄为编辑器工作流）。
  3. **非文本 prompt 块**（除图片）文本抽取被忽略（官方自述 limitation）。
  4. **/steer /queue 为 slash 文本约定**，非协议级 steer 方法；queue 以"回放为普通 prompt"实现。
  5. 0.19.0 无 configOptions 模型选择通路（Zed 1.15 模型选择器体验在 0.20.x 才完整）。
  6. 审批粒度比 CLI 简化（官方自述 "ACP approval options are simpler than the CLI flow"）。

## 7. Reliability

- 实测：`hermes acp --check` exit 0；隔离环境 initialize 握手 1 秒级响应、协议字段完整（E-3, E-27）。
- 工程质量信号：FIFO tool-id 防并行错配；审批回调线程隔离 + 用后还原（两处 GHSA 修复注释）；ping/health 噪声过滤；压缩链防丢持久化保护；15 个专测文件。E-37, E-38, E-32, E-19。
- 风险信号：启动期 lazy_deps 触网（E-30）；stdout 必须为管道（宿主用文件重定向会崩，E-31）；git 安装的 HOME→site-packages 耦合（E-28）；pinned SDK 0.9.0 与上游 ACP 0.11 schema 演进存在窗口（E-12, E-21）；无 registry 分发渠道 → 宿主需手动注册（E-10, E-13）。

## 8. Security / credential boundary

- 凭据源（名称级，未读内容）：`<HERMES_HOME>/.env`（KEY=VALUE，entry 启动即加载）→ provider env（OPENROUTER_API_KEY/OPENAI_API_KEY/... 经 runtime resolver）；`<HERMES_HOME>/auth.json`（OAuth 状态）；`hermes auth` 凭据池；Bitwarden/1Password 注入 .env。E-32, E-26, native FACTS §E。
- ACP 本身不做 auth store：仅广告/校验已配置 provider + terminal setup 引导（E-26）；源码自述威胁模型 "ACP is stdio-only, local-trust"（E-25 authenticate 注释）。
- 隔离实测：`HERMES_HOME=<temp-home>/.hermes` + 空 env → home 骨架生成、authMethods 仅 terminal setup、无任何 provider 承诺（E-29, E-27）→ **temp-HOME 隔离可行性 PROVEN**。
- 审批安全：默认 deny（超时/桥失败）；编辑审批对 `.git`/`.ssh`/敏感文件永不自动批准；`approvals.deny` 在 yolo 之前生效（native 基线）。E-38。
- 提示级风险（官方文档自曝）：headless 桥（如 buzz-acp）可程序化应答 permission → 变成无人值守执行；宿主集成时 Agent-Box 必须真实呈现/记录 permission 请求。E-17。

## 9. Process topology verdict

**单进程 agent + 线程池执行 + 子进程工具**：
`host ──stdio ndjson──> hermes acp (python 进程；asyncio 主循环持 ACP 连接；AIAgent.run 在 ThreadPoolExecutor worker；审批回调经 thread-local/contextvar 隔离)` → 子进程：config/session MCP servers；browser 工具另起 node/Chromium。无守护进程、无第二 ACP 跳板。E-32, E-38, E-40, E-18。

### 双 spawn 判决：**SAFE_WITHIN_EXISTING_RUNTIME**

理由：
1. **无需 wrapper**——ACP 实现是厂商 in-tree 的，Agent-Box 只需 spawn `hermes acp`（或 Codeg binary/uvx 形态）并讲 ACP；不存在"自建适配层"的维护面。
2. 启动+握手在隔离 HOME 下实测通过（E-27）；`--check` 提供廉价预检（E-3）。
3. 隔离边界清晰且被源码/实测双重支持：HERMES_HOME 重定向 + PYTHONPATH 解耦 HOME（E-28, E-29）。
4. 附加条件（不升级判决）：spawn 时 (a) stdout 保持管道；(b) 预置/禁用 lazy_deps 触网面；(c) 以 `hermes-acp --check` 或 initialize 探活代替文本探测。若 Agent-Box 选用 0.20+ 版本，configOptions 行为变化需回归（VERSION_SENSITIVE）。

## 10. Admission decision：**ACP_OPTIONAL**

- ACP 实现官方、覆盖广、可靠性工程到位 → 达到可接入门槛，不是 ACP_REJECTED。
- 不判 ACP_PRIMARY 的原因：(a) 不在 Registry，宿主分发/发现需手动；(b) Agent-Box P0（成本记账、-z 无头批处理、usage-file 契约）已由 native `-z` 路径满足且有既有 adapter 投资（E-42）；(c) cost 在 ACP 面缺失；(d) 0.19.0 pinned 旧 schema。
- 定位：native `-z` 保持主路由；ACP 作为第二 launch mode 面向交互式/编辑器型宿主（steer、permission、diff、plan、resume UI 增益），并随上游 0.20+/registry 合入再评估升 ACP_PRIMARY。

## 11. COMPLEXITY（自建 wrapper 成本评估——虽不适用，按要求给出）

- 若"假设无实现"：hermes 可被稳定管道驱动（stdio ndjson 由官方 SDK 承担；`-z` 文本管道亦稳），PYTHONUNBUFFERED 非必需（E-44），site-packages bundle 需整树挂载或改走 PyPI/uvx（E-45, E-13）→ 自建 wrapper 成本本就低，而实际为零（官方实现）。
- 接入 Agent-Box 的真实工作量：candidate launch mode 声明 + ACP client 侧接线（Codeg 已内建 ACP 栈，E-43）+ lazy_deps 预热策略 + cost 旁路。

## 12. CONFIDENCE

- 总体：**HIGH**（官方源码 file:line + 官方文档专页 + 本机实测握手三源交叉）。
- 例外：registry 合入时间线（MEDIUM，仅 PR 状态可证）；第三方 wrapper 质量未逐仓审计（MEDIUM）；lazy_deps 落盘行为（MEDIUM/PARTIAL）；Codeg GUI 实跑（代码级 PROVEN，运行级 UNKNOWN）。
