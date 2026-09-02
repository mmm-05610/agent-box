# OpenAI Codex CLI — ACP 可行性 Dossier（PRIMARY tier）

- 观察日期：2026-09-02（本机环境 WSL2 x64 Linux）
- 本机版本：**codex-cli 0.152.0**（npm global `<npm-global>/bin/codex`，包 `@openai/codex`）
- 来源政策：`<workspace>/docs/research/harness-acp-viability-2026-09-02/SOURCE_POLICY.md`（来源分级、六类事实分离、UNKNOWN 语义、脱敏全程遵守；未执行任何真实模型请求、未读取 credential 内容）
- 证据编号引用 `EVIDENCE.md`（E-1…E-28）；实验记录见 `../../experiments/acp_raw_client_test.py`、`../../research-notes/codex.md` 及 `<temp-home>/probe-out.txt`
- 上一轮 native 基线：`<workspace>/docs/research/harness-native-knowledge-2026-09-01/harnesses/codex/FACTS.md`（下称 native-FACTS，只读交叉引用，不重复取证）
- 脱敏：`<user-home>` / `<temp-home>` / `<workspace>` / `<agent-box-studio>` / `<binary>` / `<npm-global>`

---

## 1. Identity

| 字段 | 值 | 依据 |
| --- | --- | --- |
| Harness 本体 | OpenAI Codex CLI（`openai/codex`，Rust workspace `codex-rs/`） | native-FACTS A1/A2 |
| 许可 | Apache-2.0 | native-FACTS A4 |
| 本机验证版本 | codex-cli 0.152.0 | CLI_OBSERVED（E-1） |
| **ACP 实现载体** | **不是 Codex 本体，而是 ACP 适配器** `@agentclientprotocol/codex-acp`（TypeScript，bin `codex-acp`）v1.8.0 | E-4/E-6/E-22 |
| 适配器仓库 | https://github.com/agentclientprotocol/codex-acp（ACP 协议组织名下） | E-6 |
| 适配器维护方 | ACP 组织 pooled maintenance；registry manifest authors 列 **OpenAI / JetBrains s.r.o / Zed Industries**；近期 commit 作者为 JetBrains 员工（jetbrains.com 邮箱） | E-4/E-6 |
| 适配器活跃度 | 非常活跃：npm 32 个版本（0.0.38→1.8.0），1.8.0 发布 2026-09-01（观察前 1 天）；registry conformance matrix 每日探测 | E-5/E-22 |
| 适配器许可 | Apache-2.0 | E-4/E-6 |
| Zed 旧适配器 | `zed-industries/codex-acp`（Rust，Cargo v0.16.0，最后 commit 2026-07-22，880 stars）README 顶部声明 **开发已迁移到 agentclientprotocol/codex-acp**，新安装应使用 `@agentclientprotocol/codex-acp` | E-16 |
| 其他社区 wrapper | `cola-io/codex-acp`（Apache-2.0，142 stars，最后更新 2026-06-28）；另有 ≤9 stars 的小型 fork/网关项目若干 | E-28 |

### 六类事实逐项判定（SOURCE_POLICY §2）

| # | 事实 | 判定 | 证据与说明 |
| --- | --- | --- | --- |
| 1 | ACP 有官方 SDK | **YES** | 协议组织 repo 顶栏：TS `@agentclientprotocol/sdk`（npm latest 1.4.0）、Python `python-sdk`、Rust `agent-client-protocol` + `agent-client-protocol-schema`、Kotlin `acp-kotlin`、Java `java-sdk`；当前 stable protocolVersion=1（E-3/E-22）。与任何 Harness 无关 |
| 2 | Codex 在 ACP Registry 有 manifest | **YES（间接）** | Registry 条目 id=`codex-acp`、name="Codex"、version 1.8.0、distribution `npx @agentclientprotocol/codex-acp@1.8.0`（E-4）。被列出的是 **adapter**，不是 codex 本身；codex 本体无 ACP 模式 |
| 3 | 存在第三方 ACP wrapper | **YES** | 主 wrapper 即 agentclientprotocol/codex-acp（E-6）；Zed 旧版 zed-industries/codex-acp 已声明迁移（E-16）；cola-io/codex-acp 等次级实现（E-28） |
| 4 | ACP 官方组织维护 codex adapter | **YES** | adapter 仓库就在 `agentclientprotocol` org 下，且 registry manifest 标注 OpenAI/JetBrains/Zed 联合维护（E-4/E-6）。注意：按 SOURCE_POLICY，这只证明 **adapter 行为**，不等于厂商原生支持 |
| 5 | OpenAI 官方原生支持 ACP | **NO** | 0.152.0 全套 `--help` 无 acp/adapter flag（E-1）；npm 包文本文件 acp 命中 0，原生二进制 strings 无 `agent client protocol`/`ACP` 协议痕迹（唯一命中是 GOST 密码模式 `acpkm` 与随机字节串）（E-2）；GitHub code search `repo:openai/codex` 中 `acp`/`agent-client-protocol` 0 命中（E-19）；feature request issue #30052（2026-06-25 提出内建 ACP）至今 open、无维护者回应、无分支/PR（E-18）。Codex 的程序化接口是自有 app-server JSON-RPC，非 ACP |
| 6 | Zed/Codeg 能安装并运行 Codex | **YES（均经 adapter）** | Zed External Agents 文档将 Codex 列为 Common External Agent，安装途径为 "Install Codex from the ACP Registry"，Codex 自管认证与计费（E-17）。Codeg `<agent-box-studio>/src-tauri/src/acp/registry.rs:308-360` 明确注释：**"neither `claude` nor `codex` speaks ACP"**，故安装独立 adapter 包 `codex-acp`；Codeg 预装并 pin `@agentclientprotocol/codex-acp@1.7.0`（npx 分发，node_required 20.0.0）（E-20）；模型目录来自 adapter 包内嵌套的 `@openai/codex`（`require.resolve('@openai/codex/bin/codex.js')`），**不是 PATH 上的 codex**（E-21） |

## 2. Launch

- **启动命令（官方推荐）**：`npx -y @agentclientprotocol/codex-acp`（或全局安装后 `codex-acp`）；启动参数无（Codeg 条目 args=[]，E-20）。
- **launch_kind**：`subprocess_stdio_jsonrpc_agent_wrapper` —— ACP 侧为 **newline-delimited JSON**（非 Content-Length 头，E-15；与 gemini 原生路径同款帧格式）；adapter 再以 JSON-RPC（去 `jsonrpc` 字段、NDJSON）驱动 codex `app-server`。
- **谁 spawn 谁**（E-7/E-10/E-15）：
  1. ACP client（如 Zed/Codeg/Agent-Box）spawn adapter：`node …/@agentclientprotocol/codex-acp/dist/index.js`；
  2. adapter 启动时立即 spawn 一个 codex app-server（**每 adapter 进程恰一个**，`startCodexConnection` 在接受任何 ACP 连接前调用）；
  3. 无 `CODEX_PATH` 时：`node <resolved @openai/codex/bin/codex.js> app-server`（即 npm 依赖内嵌 codex，多一层 node）；有 `CODEX_PATH` 时：直接 spawn 该二进制 `app-server`（win32 走 shell:true）。
- **本机实测进程树**（synthetic probe，E-10）：`node(adapter) → node(codex.js shim) → codex(app-server native) → git → git → git-remote-http`。codex app-server 在无任何 prompt 的 initialize/session/new 阶段即 spawn 了 git 子进程（用途未确认，疑似插件目录/更新检查，见 Security）。
- **运行时选项（env，E-6/E-7）**：`CODEX_PATH`（指定 codex 可执行）、`CODEX_CONFIG`（JSON，合并进 session config）、`MODEL_PROVIDER`、`DEFAULT_AUTH_REQUEST`（JSON）、`INITIAL_AGENT_MODE`（read-only/agent/agent-full-access）、`NO_BROWSER`、`APP_SERVER_LOGS`、`CODEX_API_KEY`/`OPENAI_API_KEY`。
- **Node 版本**：package.json **无 engines 字段**；上游 CI 用 node 24；Codeg 保留 20.0.0 floor；本机 v22.23.2 实测通过（E-24）。
- **spawn 单次性**：adapter 每进程只 spawn 一次 app-server（E-7 index.ts:91-97）；ACP 连接 abort 不会重启 codex。两个 adapter 实例 = 两个独立 app-server（不共享 native daemon）。

## 3. Configuration and isolation

- **CODEX_HOME 透传**：adapter 源码中 **无一处设置或读取 CODEX_HOME**（grep 仅命中类型注释，E-7）；spawn 用 `env ?? process.env` 原样透传。因此 **是否隔离完全由调用方 env 决定**：设置 `CODEX_HOME=<guest>` 即隔离，不设置则 codex 读宿主 `<user-home>/.codex`（Codeg 即后者，见 E-20 "shared_config_dir: ~/.codex" 注释——有意共享以免二次登录）。
- **本机隔离验证**（E-11）：以 `CODEX_HOME=<temp-home>/temp-codex-home` 启动 adapter 并只发 initialize+session/new：temp home 被填入 `goals_1.sqlite* / logs_2.sqlite* / memories_1.sqlite / installation_id / .tmp` 等（与 native-FACTS F 一致的启动产物）；宿主 `<user-home>/.codex` 各条目 mtime 均早于实验窗口（5-8 月），**未被触碰**（首次 diff 的"新增"条目经 mtime 核实为前次快照 head -20 截断伪差）。
- **config 面**：config.toml / profiles / AGENTS.md / skills / mcp_servers / hooks / plugins 等 native 资源仍由 codex 本体按 native-FACTS D/G 语义从 CODEX_HOME 读取——ACP 路径**不改变**这些加载规则；session 级可再叠加 `CODEX_CONFIG` JSON 与 ACP `session/setConfigOption`。`-p` profile、`--ephemeral`、`--output-schema`、`--skip-git-repo-check`、`-c` 任意 override 等命令行面 **不经 ACP 暴露**（ UNKNOWN→未在 adapter 源码中出现；`CODEX_CONFIG` 只覆盖 thread config 结构体字段）。
- **认证**：adapter 在 initialize 返回 authMethods（本机隔离实测只出现 `api-key`；`NO_BROWSER=1` 时隐藏 ChatGPT 登录项，E-6/E-8）。三种方式：ChatGPT 浏览器登录、`CODEX_API_KEY`/`OPENAI_API_KEY`、client 侧自定义 gateway capability。

## 4. ACP coverage

状态词按 SOURCE_POLICY §6。基线：adapter 1.8.0 源码 + registry conformance matrix 2026-09-01（codex-acp 1.7.0 行：init ok，capabilities `agent`，`loadSession, session/list, session/resume`，E-5）+ 本机 initialize 实测（E-8/E-26）。

| ACP 能力 | 状态 | 证据/说明 |
| --- | --- | --- |
| initialize / capabilities | **SUPPORTED（实测）** | 本机返回 protocolVersion 1；agentCapabilities: auth.logout、providers、loadSession、promptCapabilities{embeddedContext, image}、sessionCapabilities{resume, list, close, delete, fork, additionalDirectories, subagents}、mcpCapabilities{http:true, acp:false, sse:false}；_meta{steering, goal v1, jetbrains air}（E-8） |
| authenticate / logout / providers | **SUPPORTED** | adapter 方法表 + authMethods 实测（E-7/E-8） |
| session/new | **SUPPORTED（实测 auth 门）** | 无凭据时干净返回 JSON-RPC error -32000 "Authentication required"，无模型请求（E-9） |
| session/load（load） | **SUPPORTED** | loadSession=true + session/load 方法 + 从 Codex 历史重建子代理树（E-7/E-14） |
| resume | **SUPPORTED** | sessionCapabilities.resume + session/resume（E-5/E-7/E-8） |
| fork | **SUPPORTED** | session/fork → app-server `thread/fork`（带 lastTurnId），fork 后 unsubscribe（E-7） |
| session/list、session/delete、session/close | **SUPPORTED** | index.ts 方法表（E-7）；registry matrix 已验证 list（E-5） |
| prompt | **SUPPORTED** | session/prompt（E-7） |
| streaming text | **SUPPORTED** | agent_message_chunk（E-7） |
| thinking | **SUPPORTED** | agent_thought_chunk ← app-server reasoning delta（item/reasoning/*）（E-7/E-25） |
| tool call / tool update | **SUPPORTED** | tool_call / tool_call_update；commandExecution、mcpToolCall、web_search、image generation 等映射（E-6/E-7） |
| file edits diff | **PARTIAL** | 文件变更经 tool_call（rawInput）呈现 + 可选 file-change-report 扩展（capability 协商后 per-turn 报告，E-14）；ACP 标准层无原生 unified-diff 载荷；Codeg 注释记录 `agentFileChangeReport` 自 1.4.0 未变（E-20） |
| usage（token） | **SUPPORTED（有损）** | PromptResponse usage: totalTokens/inputTokens/cachedReadTokens/outputTokens/thoughtTokens（E-12）；**cache_write_input_tokens 未映射**（native exec --json 有此字段，native-FACTS H2）；**cost 无**（见下） |
| usage cost | **NOT_SUPPORTED** | ACP usage 类型无 cost 字段；Codex 侧亦不产生成本数据（E-12 + native-FACTS） |
| permission | **SUPPORTED** | 标准 `session/request_permission` + `_meta.permission` 呈现扩展；adapter 保留原始 Codex 决策值（accept/acceptForSession/decline/cancel/amend）（E-14） |
| question（elicitation） | **SUPPORTED** | `client/elicitation.create|complete`：MCP OAuth 与 Codex 表单 elicitations 均桥接（E-7；Codeg 侧同证 E-20） |
| plan | **PARTIAL** | plan_update / item/plan/delta 会话更新已实现（E-7）；"plan 审批门"无独立 ACP 方法——依赖 mode 切换（plan mode 属 AgentMode kind，E-13），显式 plan approval 交互 UNKNOWN |
| cancel | **SUPPORTED** | session/cancel 通知（E-7） |
| steer | **SUPPORTED（扩展，非 core v1）** | `_session/steering` 自定义方法 + _meta.steer声明；串行化 per-session（E-7）；Codeg 记录无 `promptRequired` opt-in（E-20） |
| terminal | **PARTIAL** | 命令执行输出经 tool_call_update（TerminalOutputMode 可配）；**未使用** ACP client 端 terminal capability（源码无 terminal/create 等，E-7 grep 0 命中） |
| filesystem（client fs 代理） | **NOT_SUPPORTED** | adapter 不调用 ACP `fs/read_text_file`/`fs/write_text_file`（grep 0 命中）；文件 IO 由 codex 本体完成（仅 fs/changed 通知被映射）（E-7） |
| mode（set_mode） | **SUPPORTED** | AgentMode: read-only / standard / full_access / plan / auto_review，各映射 approvalPolicy+sandboxPolicy；session/setMode（E-13） |
| config options | **SUPPORTED** | session/setConfigOption + env `CODEX_CONFIG`/`MODEL_PROVIDER`/`INITIAL_AGENT_MODE`（E-6/E-7/E-13） |
| MCP（client 侧 server） | **SUPPORTED** | stdio command + HTTP transport（http:true, sse:false, acp:false，实测声明）（E-8） |
| images | **SUPPORTED** | promptCapabilities.image=true；image block 输入 + 纯文本模型守卫（E-8 + 源码 2680 行） |
| subagents | **SUPPORTED（draft）** | 双边协商 `subagents:{}`（或 `_meta.jetbrains.air.capabilities` 兜底）；subagent_spawned / subagent_state_update；限制：不支持定向 child cancel/close，orphan/超时回退 `failed` 与 draft 规则有差（E-14） |
| session locator | **SUPPORTED** | ACP sessionId **就是 codex threadId**（fork/load 均返回 thread.id，E-27）→ 可直接对接 native `codex exec resume <id>` |
| native errors | **PARTIAL** | app-server error/warning 事件映射；sessionFailure 经 `_meta.jetbrains.air`；quota_exhausted 映射（E-7）；标准层错误语义未全量对齐（UNKNOWN 部分） |
| process exit | **PARTIAL** | codex exit → 连接 dispose（E-7）；实测 adapter 在 client stdin 关闭后 ≤2s kill codex 并 exit 0（E-9/E-10）；adapter 自身被 SIGKILL 时 child 是否残留 UNKNOWN（spawn 未设 pdeathsig，依赖 EPIPE 退出假设） |

## 5. Fidelity（vs native app-server / exec --json，基准 native-FACTS C.5/H）

**ACP 路径有损项**：

1. **usage 细节**：native `turn.completed.usage` 有 `cache_write_input_tokens`；ACP PromptResponse usage 不含该字段（E-12 vs native-FACTS H2）。
2. **app-server 专有面丢失/仅扩展桥接**：`thread/rollback|revert|search|archive`、`review/start`、`skills/list`、`plugin/*`、`project/*`、`hooks/list`、`account/usage/read`、`fs/*`、`command/exec`（持久终端）、`windowsSandbox/*`、`experimentalApi` 能力门方法 —— adapter 类型里全部存在（E-25）但**不经 ACP 暴露**（部分经 `_session/goal`、`_session/steering`、file-change-report 等 extension 桥接）。
3. **审批决策语义**：native 支持 `acceptWithExecpolicyAmendment`、权限 grant 的 `scope:"session"|"turn"`；ACP 侧收敛为 optionId 选择 + `_meta.permission` 展示层，语义保留但表达受限（E-14）。
4. **exec 便利面不可达**：`--output-schema`（结构化终局）、`-o` 终局消息文件、`--ephemeral`、`--skip-git-repo-check`、`-p` profile、`-c` 任意键 override、`--thread-source` —— ACP 路径均无对应（源码无引用；UNKNOWN→按未暴露计）。
5. **沙箱/审批初始策略**：native 可逐次 `-s … -a …` 任意组合；ACP 仅 5 个预设 mode + additionalDirectories + setConfigOption（E-13）；`CODEX_CONFIG` 可补部分字段但为 env 级而非 per-turn。
6. **事件粒度**：native app-server 的 `item/reasoning/summaryTextDelta`（摘要分段）在 ACP 侧折叠为 thought chunk 流；`rawResponse*`、`moderationMetadata`、`model/rerouted` 等诊断事件无 ACP 载体（E-25）。
7. **保持等价**：thread resume/fork/list（sessionId=threadId，与 native rollout resume 同一 id 空间）、web_search 事件、todo/plan、MCP server 配置（CODEX_HOME config.toml 层）、AGENTS.md/skills/rules/hooks/plugins 加载（全部由 codex 本体从同一 CODEX_HOME 读取）。

**结论**：ACP 路径覆盖交互主链（prompt/stream/thought/tool/permission/plan/cancel/mode/subagents），**观察型 fidelity 低于 native app-server，远低于两者合集**；适合"会话式宿主"场景，不适合需要结构化终局/审计级 usage/rollback 的 harness 流水线。

## 6. Reliability

- **生命周期（实测）**：client 关 stdin → adapter 结束 codex stdin → 2s 未退出则 kill → adapter exit 0；无孤儿进程残留（E-9/E-10）。
- **单 app-server 假设**：每 adapter 进程 1 个 app-server（与 native daemon 的 per-user singleton 不同，天然无单例冲突）（E-7）。
- **版本耦合**：adapter 依赖 `@openai/codex ^0.152.0`（npm semver 浮动）且有 "update codex to 0.152.0" 的固定升级 commit——adapter 与 codex 双方都是高频发布，**必须 pin**（E-6/E-22）。adapter 1.8.0 发布于 codex 0.152.0 发布次日，跟进速度快但耦合窗口小。
- **Node 版本**：无 engines 声明 → 版本契约靠下游（Codeg 自行保留 20.0.0 floor；CI 24；实测 22 可用）（E-20/E-24）。
- **conformance 外证**：ACP org registry 每日自动探测 32 个 agent，codex-acp 1.7.0 行 init ok（E-5）。
- **Registry npx 启动**：`npx -y` 语义 = 首次 spawn 时自动从 npm 下载（supply-chain 与网络依赖，见 Security）；Codeg 以预装 tarball 规避（E-20）。
- ** UNKNOWN 项**：adapter SIGKILL 后 codex 是否必死（无 pdeathsig）；codex app-server 启动期 git 子进程的确切用途；长时间运行下的重连/重试语义（connection 断开后无自动恢复路径）。

## 7. Security

- **credential 边界**：adapter 本体不读不写任何 credential 文件；凭据由 codex 本体按 native-FACTS E 语义处理（auth.json/keyring/env）。**adapter 透传全部 env**（含 `CODEX_API_KEY`/`OPENAI_API_KEY`/`DEFAULT_AUTH_REQUEST`），调用方 env 即凭据注入面。本轮未读取任何 credential 内容（仅 ls 文件名/mtime，E-11）。
- **隔离可行性**：`CODEX_HOME` 指向 guest 目录即可完成 state 隔离（实测 E-11）；宿主 HOME 无需交给被测进程。bwrap 场景：wrapper 与 child 同树、无需嵌套安装，可行（见 §8）。
- **npx 供应链**：`npx -y @agentclientprotocol/codex-acp` 在 spawn 时可能自动解析下载任意 latest 版本 + 内嵌 `@openai/codex` 平台包 —— Agent-Box 若采用必须改为**预装 + 精确 pin**（Codeg 模式，E-20）。
- **日志边界**：设置 `APP_SERVER_LOGS` 后，adapter 将 **全部 wire 流量（含 prompt 明文、app-server [IN]/[OUT]）写入 app-server.log**（E-23）—— guest 内日志目录需按敏感产物处理。
- **网络行为**：无凭据、无 prompt 的 initialize+session/new 阶段即观察到 codex app-server spawn `git → git-remote-http`（外呼网络）（E-10）；"pre-prompt 无网络"假设不成立，网络策略需覆盖启动期。
- **Windows 细节**：`CODEX_PATH` spawn 在 win32 走 `shell:true`（引号注入面小但存在）（E-7）。

## 8. Process topology verdict（双 spawn 判决）

**判定：`SAFE_WITHIN_EXISTING_RUNTIME`**（附 3 条前置条件；详见下）。

理由：
1. wrapper（node）与 child（codex app-server）**同一 process tree**、无 daemon 化、无 setsid/脱管（实测 pstree 单父链，E-10）；Agent-Box 现有进程组 kill / bwrap 布局（本机可见的 native 运行即 bwrap 包裹 codex）可直接包裹 adapter。
2. **单次 spawn**：adapter 每进程恰 spawn 一次 app-server；ACP 协议内没有会触发二次 spawn 的路径（session/fork 是 app-server 内 thread fork，非进程 fork）（E-7）。
3. **replay 不重复 spawn**：同一次 execution 内无自动重启逻辑；重放由调用方重新 spawn 新 adapter 实例，旧行程已退出（实测 exit 0）。
4. **crash 残留**：优雅路径（stdin 关闭/abort/exit）有 2s kill 兜底；非优雅路径（adapter SIGKILL）残留 UNKNOWN——但 codex 的 stdout 管道随 adapter 死亡断开，EPIPE 退出高度可能，且 bwrap `--unshare-pid` + 进程组 kill 可兜底（现有 native 运行时已具备这两项）。
5. **npm 自动下载**：唯一实质风险——`npx -y` 可能在 execution 内拉网。前置条件：(a) 预装并 pin `@agentclientprotocol/codex-acp@<exact>`；(b) 以 `CODEX_PATH` pin codex 本体（或接受包内嵌 `@openai/codex` 的 semver 浮动并审查 lockfile）；(c) kill 以进程组/bwrap 单元为单位而非仅 wrapper pid。

## 9. Admission decision

**`NATIVE_PRIMARY`**（ACP 可行、生态位良好，但不作为 Agent-Box 的 Codex 主路径）。

- 原生路径（app-server JSON-RPC / exec --json）已由 Agent-Box native adapter 实现，fidelity 更高（usage 含 cache_write、结构化终局、profile/ephemeral/output-schema、daemon/steer 全集）（native-FACTS C.5/H/J）。
- ACP 路径价值 = 互操作（Zed/JetBrains 同款入口、sessionId=threadId 与 native 续接互通、registry conformance 背书、OpenAI/JetBrains/Zed 联合维护降低弃养风险），适合作为**可选对外通道**（将来如需把 Agent-Box 会话暴露给 Zed 类编辑器，或反向消费 Zed 生态，才升级 `ACP_OPTIONAL`）。
- 版本 pin 建议：`@agentclientprotocol/codex-acp@1.8.0`（2026-09-01 latest；Codeg 仍 pin 1.7.0，升级时注意 session/fork 与 subagents 均为 1.7.0 后新面）+ `@openai/codex` 精确 pin `0.152.0` + node ≥20（建议 22/24）。
- 复杂度评估见 candidate TOML `known_risks`；主风险 = 双组件版本漂移、npx 供应链、SIGKILL 残留 UNKNOWN。

## OPEN_QUESTIONS（UNKNOWN 汇总）

1. adapter 被 SIGKILL 后 codex app-server 的退出行为（无 pdeathsig；EPIPE 假设未验证）。
2. codex app-server 启动期 git 子进程用途（插件目录/更新检查？）与可否禁用。
3. plan 审批（plan approval gate）是否存在独立 ACP 交互（现只有 plan 展示 + mode 切换）。
4. ACP 侧长会话的连接恢复语义（app-server 断开后 session/load 可重建，但 adapter 无自动重连）。
5. `CODEX_CONFIG` 可覆盖的 thread config 字段全集（结构体大，未逐一核对）。
6. Codeg pin 1.7.0 → 1.8.0 升级时的行为差异（仅源码 diff 级判断，未在 Codeg 内实测）。
