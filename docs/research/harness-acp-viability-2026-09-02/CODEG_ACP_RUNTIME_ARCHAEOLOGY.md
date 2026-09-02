# CODEG_ACP_RUNTIME_ARCHAEOLOGY — Codeg/Agent-Box Studio ACP 运行链路考古

- 审计日期：2026-09-02；全部为 `CODEG_LOCAL` 证据（本机源码只读审计）。
- 审计对象版本：Codeg `src-tauri/Cargo.toml:3` → `codeg 0.29.0`；`sacp = "11.0.0"`、`sacp-tokio = "11.0.0"`（`src-tauri/Cargo.toml:77-78`）、`kill_tree 0.2`（:115）、`sacp-tokio` 以 vendor 方式内嵌（:171）。
- 路径约定：`<agent-box-studio>/` = Codeg/Agent-Box Studio 仓库根（本机路径按 SOURCE_POLICY §5 脱敏）。
- 配套文档：`<agent-box-studio>/docs/codeg-architecture-audit.zh-CN.md`（架构综述，本文件只做 ACP 运行链路深挖）。

## 0. 一句话结论

Codeg 是一个**纯 ACP Client**：它对全部 15 个内置 Agent 统一说 ACP（stdio JSON-RPC），
把"每家协议差异"压缩进一个 launch-spec 层（registry + build_agent）和一个 event-render 层
（connection.rs 的 per-agent 分支），中间的 transport/序列化/请求分发全部复用
`sacp`/`sacp-tokio`。它没有 native driver 分叉——代价是 connection.rs 单文件 2 万行。

## 1. 完整链路（自上而下）

```text
前端发送 (acp-connections-context / conversation-detail-panel)
  → Tauri command acp_prompt 或 POST /api/acp_prompt
  → ConnectionManager::send_prompt_linked_with_message_id   manager.rs:869
  → AgentConnection.cmd_tx (mpsc, cap 32)                    connection.rs:2005
  → run_connection 命令循环（专用 8MiB 栈线程）               connection.rs:2039-2062
  → sacp dispatch → AcpAgent stdio（sacp-tokio）
      spawn:  AcpAgent::spawn_process                        vendor/sacp-tokio/src/acp_agent.rs:263
      stdin:  outgoing_sink（行缓冲 + '\n'）                  acp_agent.rs:551-574
      stdout: BufReader lines → sacp::Lines                  acp_agent.rs:536-549
      stderr: 独立排空 task + 1MiB 有界捕获                  acp_agent.rs:494-530
      exit:   monitor_child 与 protocol future 竞速          acp_agent.rs:576-586
  → Agent 回包/通知 → sacp dispatch → connection.rs Client handlers（session/update、
     request_permission、fs/*、terminal/*、elicitation/create、extMethod）
  → emit_with_state（写锁内 apply→seq+1→ring buffer）        web/event_bridge.rs:425-450
  → ConnectionEventStream broadcast(4096)                    acp/event_stream.rs:12
  → 桌面: Tauri app.emit("acp://event")；Web: per-connection WS attach（唯一 WS 路径）
                                                             event_bridge.rs:397-435
  → 前端 HYDRATE_FROM_SNAPSHOT + lastAppliedSeq 去重 + reducer
                                                             acp-connections-context.tsx:263-266
```

## 2. 逐问归属表

| # | 问题 | 归属 | file:line |
|---|---|---|---|
| 1 | 谁 spawn | `sacp_tokio::AcpAgent::spawn_process`（tokio::process::Command，stdin/stdout/stderr 全 piped）；由 `ConnectTo::connect_to` 调用；launch spec 由 Codeg `build_agent` 构造、`ConnectionManager::spawn_agent` 发起 | acp_agent.rs:263-331,472-482；connection.rs:1462；manager.rs:439 |
| 2 | 谁读 stdout | sacp-tokio `connect_to`：`BufReader(child_stdout).lines()` 喂给 `sacp::Lines`，逐行（newline-delimited JSON） | acp_agent.rs:536-549,578-581 |
| 3 | 谁写 stdin | `futures::sink::unfold` 包 `child_stdin`，每行补 `\n` 写入 | acp_agent.rs:551-574 |
| 4 | 谁排空 stderr | 专用 tokio task 持续读 stderr（不阻塞协议），有界捕获最后 1 MiB 供错误消息；另有 Codeg 侧 `StderrTail` 环形缓冲（`with_debug` 回调按行回调）供"turn 空转诊断" | acp_agent.rs:494-530,414-427；connection.rs:1953-1957,1430-1459 |
| 5 | 谁拥有连接生命周期 | `ConnectionManager`：`AgentConnection` 在 spawn **之前**插入 map（防 fast-fail 泄漏）；`ConnectionCleanupGuard`（RAII）保证线程退出即摘除条目；每连接独占 8 MiB 栈线程（debug 帧过大，tokio worker 栈会 abort） | connection.rs:2019-2037,2049-2062,1882 |
| 6 | 谁处理 JSON-RPC | `sacp` crate（crates.io，Symposium）做 framing/dispatch；Codeg 实现 Client 侧 handlers（`on_receive_request`/`MatchDispatch`），responder 类型覆盖 permission/fs/terminal/elicitation/extMethod | connection.rs:25-30,4630-4830 |
| 7 | 谁做 Harness 特判 | 三处：a) `build_agent`（per-agent launch 变换）；b) `registry.rs` 内置表（pin 版本+巨量 per-agent 行为注释）；c) connection.rs 内 `AgentType::` 分支（initialize 兼容、goal/steering 通道选择、错误字符串归因）。详见 §3 | connection.rs:1462-1699 等 |
| 8 | 谁分配 seq | `emit_with_state`：持 SessionState **写锁**内 `apply_event → event_seq += 1 → 推入 RecentEventsBuffer`，再广播。gate 谓词与 seq 分配同锁，保证"接受"与"编号"原子 | event_bridge.rs:425-450 |
| 9 | 谁处理 slow subscriber | per-connection `broadcast::channel(4096)`：溢出即 `RecvError::Lagged` → 订阅者发 `replay_lagged` 提示 → 客户端重 attach；进程级 `InternalEventBus` 同容量 4096，`lagged_count` 计数；lifecycle worker 邮箱满时 **阻塞发送不丢事件**（`worker_queue_full_count`） | event_stream.rs:8-12；internal_bus.rs:29-32,67-77,111-120 |
| 10 | 谁负责 replay/snapshot | attach 在 SessionState **读锁**内完成"snapshot + 可选 replay + subscribe"三步（锁跨 subscribe 消除竞态）；`RecentEventsBuffer`（≤128 条且 ≤128KiB，单事件 >64KiB 拒存）内走批量 replay，cursor 过旧返回 None → 全量 snapshot；指标区分 replay/snapshot_fallback/snapshot_cold | event_stream.rs:32-53,18-30,117-166；internal_bus.rs:92-110；session_state.rs:368-383,618-621 |
| 11 | 谁处理 permission responder | `PermissionQueue`：responders + showing + waiting FIFO 同一把锁（修 #442：codex-acp 并发发多条 request_permission，N 卡塌缩成最后一张 → responder 永久 park）；锁序强制 `PermissionQueue → SessionState`；turn 结束/teardown 时 `drain_permissions` 以 `Cancelled` outcome 回复所有 parked responder | connection.rs:2167-2330,8756-8778,2288-2291 |
| 12 | 谁处理 cancel | `ConnectionCommand::Cancel`：发 `session/cancel`（CancelNotification）→ 释放该 session 的 terminal runtimes → **不等 agent**，drain permissions 并立即 emit `TurnComplete{stop_reason:"cancelled"}` → 级联取消 delegation/questions/plan approvals → 后台排空 prompt response（防 sacp "receiver dropped" 日志） | connection.rs:8743-8836 |
| 13 | 谁处理 process exit | sacp-tokio `monitor_child` 与 protocol future `tokio::select!` 竞速（child 提前退出 → 带截断 stderr 的错误）；`ChildGuard::drop` → `kill_tree`（SIGTERM，不等待）→ detached reaper 持有 child 直到真正 reaped（pin 住 pid 防复用误杀）；Codeg 侧 `on_spawn/on_exit` 维护 `child_pid: AtomicU32`（仅 reap 才清零），宿主进程退出前用 pid 同步 `kill_tree` 兜底；连接结束按序 `StatusChanged{Disconnected}` | acp_agent.rs:334-411,433-463,576-586；connection.rs:1947-1973,2119-2145 |

## 3. Harness 特判明细（Codeg 如何用一条协议伺候 15 家）

### 3.1 Launch 层（registry.rs + build_agent）

| Agent | 分发方式 | 精确命令 | registry.rs |
|---|---|---|---|
| Claude Code | Npx | `npx @agentclientprotocol/claude-agent-acp@0.69.0`（cmd `claude-agent-acp`，node≥22） | :582-590 |
| Codex | Npx | `npx @agentclientprotocol/codex-acp@1.7.0`（cmd `codex-acp`，node≥20；适配器依赖 `@openai/codex ^0.148.0` 并驱动 `codex app-server`） | :783-790 |
| Gemini | Npx | `npx @google/gemini-cli@0.57.0 --acp --skip-trust` | :790-803 |
| OpenCode | Binary | GitHub release v1.18.25 六平台二进制，`opencode acp`；**sha256: None**（未 pin digest） | :827-873 |
| Hermes | Npx | 社区桥 `hermes-agent@0.20.6`（wyrtensi/hermes-agent-npm）：postinstall 克隆官方 repo 到 pin tag（40-hex SHA 校验）+ 隔离 venv + `uv sync --locked --extra all`；`hermes acp`（**官方原生 ACP 模式**） | :879-922 |
| Pi | Npx | `npx pi-acp@0.0.33`（社区 adapter，spawn `pi --mode rpc`；pi 本体 npm `@earendil-works/pi-coding-agent`；env `PI_ACP_PI_COMMAND` 可 BYO；`PI_ACP_ENABLE_EMBEDDED_CONTEXT=true`） | :984-1009 |
| Grok(xAI) | Npx | `npx @xai-official/grok@1.0.5 grok agent stdio`（官方 ACP 子命令；root 级 `--no-auto-update`/`--permission-mode` 必须插在子命令**前**，build_agent connection.rs:1566-1572） | :1011-1060 |

其他特判：Pi 启动前检查 trust.json 不被自动播种（防 `.pi/extensions` 顶层代码以用户权限执行，
connection.rs:1489-1515）；Codex 注入 `APP_SERVER_LOGS`（仅 CODEG_ACP_DEBUG）与
`apply_codex_env_policy`/`DISABLE_MCP_CONFIG_FILTERING`（防 codex-acp 过滤掉注入的 MCP，
connection.rs:1517-1539）；OpenClaw env→CLI flag 翻译（connection.rs:1576-1601）；Hermes
启动前对齐 `~/.hermes/.env` base-URL（connection.rs:1934-1939）；Hermes 需要 `with_current_dir`
因为其本地 backend 用 `os.getcwd()` 而非 ACP session cwd（acp_agent.rs:176-186）。

### 3.2 协议能力差异层（Codeg 用注释维护的"活协议差异库"）

- **adapter vs vendor CLI 分离**：只有 Claude/Codex 是第三方 adapter（`acp_adapter_relation`
  返回 native_cmd `claude`/`codex` + shared_config_dir `~/.claude`/`~/.codex`，装 adapter 无需二次登录）；
  其余都是 vendor 自带 ACP（registry.rs:314-357）。
- **resume→load→new 三级回退**：`send_resume_session`（connection.rs:3838）→ 失败落
  `session/load`（:5488）→ 再失败 `session/new`；Grok 1.0.0 起广告 `sessionCapabilities.resume`
  所以直接走第一级；`session/load` 会做 history replay（Codeg 排空丢弃）(:7532-7570 附近、
  registry.rs:1030-1040 Grok 注释)。
- **扩展方法**：`_session/steering`（claude-agent-acp ≥0.65.0 才有 `promptRequired` opt-in，
  registry.rs:385-400；codex-acp 1.3.0 tarball 验证无 opt-in 故不用 push 通道）；
  `_session/goal`（claude 重写为 "/goal clear" 文本注入 steering；codex 走 app-server
  `thread/goal/set|clear` 真停机，故 `goal_control_is_out_of_band(codex)=true`，registry.rs:411-427）；
  `_meta.jetbrains.air` typed session-failure（connection.rs:3703-3758）。
- **capability 协商实战**：elicitation.form 只对 codex/deepseek 广告（connection.rs:3691-3702）；
  `nativeSubagentSessions` **拒绝广告**——`agent-client-protocol-schema 0.11.7` 的
  `SessionUpdate` 是内部 tagged enum 且**无 catch-all arm**，`subagent_spawned` 等通知会反序列化
  失败 → 子 session 输出从 timeline 消失（silent no-op 实证，connection.rs:3738-3751）；
  `plan_update` 同因不可用（sacp 11.0.0 无 `clientCapabilities.plan`，registry.rs:660-663）。
- **版本漂移防御**：Kimi 0.37.0-0.38.0 曾把 stdio MCP 拼写改坏导致 `session/new` 全挂
  （registry.rs:944-975）；codex-acp 1.2.0 未在 release notes 里宣布两处 wire 变更
  （registry.rs:700-705）；对策=pin 精确版本+tarball diff+live 验证。
- **错误归因**：Claude 的 `getOrCreateSession` 把 "process exited with code N" 等字符串
  归因为 session 丢失而非崩溃（connection.rs:7532-7570）；Grok agent-switch 与
  `is_grok_incompatible_agent_switch`（connection.rs:2781）。

### 3.3 Session/Conversation 绑定（replay 安全）

`send_prompt_linked`（manager.rs:869）在 prompt_lock 临界区内解析 conversation 行并用
`bind_external_id` 落库（codeg#500）：reconnect 丢失 id 或 `session/load` 失败落 `session/new`
时，新 session 的历史**不会**覆盖旧行，而是分裂到新 conversation（manager.rs:1117-1160）；
绑定被拒时回滚未宣告的新建行。SessionStarted 有 per-session dedup signal（connection.rs:1917-1921）。

## 4. Codeg 中值得复用的设计（对 Agent-Box）

1. **attach 三步原子性**（snapshot→replay→subscribe 同锁，event_stream.rs:43-53）——
   ObservationHub 若要 seq/replay，这是最小正确实现，直接可抄语义。
2. **seq 只在写锁内分配**（event_bridge.rs:425-450）——"接受+编号+落缓冲"原子，
   gate 谓词同锁的设计避免了 veto 后 seq 空洞。
3. **RecentEventsBuffer 双上限 + 单事件上限 + gap 检测回退 snapshot**（event_stream.rs:18-30,
   117-166）——简单且自愈；指标（replay/snapshot_fallback/cold）直接可用于容量调优。
4. **PermissionQueue 单锁 FIFO**（connection.rs:2248-2330）——并发 permission 请求的
   "N 卡塌缩"是真实事故（#442，codex-acp 触发）；Agent-Box 的 permission responder 设计
   必须一开始就按多请求排队做。
5. **kill_tree + pid pin + reap 才清零**（acp_agent.rs:334-411 + connection.rs:1947-1973）——
   "SIGTERM 不等死、detached reaper 持 child 防 pid 复用误杀、宿主退出同步兜底"三件套
   是双 spawn 清理的正确姿势。
6. **空 env 值 = env_remove 约定**（acp_agent.rs:274-291）——从 child 环境里确定性剥离
   泄漏 credential 的轻量机制。
7. **stderr 永远排空 + 有界捕获**（acp_agent.rs:494-530）——不阻塞协议、错误消息可用、
   内存有上界。
8. **per-agent launch spec 与行为注释同址**（registry.rs）——版本 pin、tarball diff 记录、
   live 验证结论写在一起，是"中央巨型 switch"的可维护替代形态。
9. **config fingerprint 检测 stale session**（connection.rs:2012-2017）。
10. **连接独占大栈线程**（connection.rs:2039-2060）——提醒：深度递归 dispatch 会爆
    tokio worker 栈。

## 5. 不应复制的部分

1. **没有 Evidence / Work / Execution 边界**：Codeg 的"完成"就是 conversation/task status +
   `TurnComplete`，process exit ≠ Finish 的不变量不存在（audit doc §9-10）。Agent-Box 的
   explicit Finish 必须保留在 ACP 观测流之上。
2. **单文件 2 万行 connection.rs**：dispatch/render/特判/绑定全在一个文件，是 ACP-only
   路线的熵增终点。Agent-Box 应把 driver/codec/render 分层，避免复制这个形状。
3. **session/load 历史靠"排空丢弃"**：replay 只用于 UI 恢复，没有 durable 事件存储；
   conversation 正文来自各 agent transcript parser——Agent-Box 不应把 ACP event 当
   canonical 记录。
4. **PATH 优先于 pin**（launch 偏好用户自装 adapter，registry.rs:393-398）——便利性与
   版本漂移的折中；Agent-Box 的 immutable bundle 策略不应让步。
5. **Binary 分发未 pin digest**（opencode sha256: None，registry.rs:849-868）——供应链缺口，
   Agent-Box 需 digest pin。
6. **直接读写宿主 native home**（`~/.hermes/.env` 对齐、`~/.codex/config.toml` 依赖）——
   Codeg 是单用户桌面应用可以这样做；Agent-Box 沙箱/Profile 边界不允许。

## 6. 对"Agent-Box 是否 ACP-primary"的考古输入

- Codeg 证明：**一条 ACP stdio 通道 + launch-spec 层 + render 层**可以覆盖 15 家 Agent 的
  日常会话（streaming/permission/terminal/fs/mode/config/resume），工程上成立。
- Codeg 同样暴露：协议差异没有被消灭，只是从"每家一个 native driver"转移为
  "一个 registry 的 per-agent 注释墙 + connection.rs 的 AgentType 分支"；且 SDK/schema
  滞后（无 catch-all）会**静默吞能力**（subagents、plan_update）。
- Codeg 的恢复模型是"重启进程 + resume/load/new + parser 重读历史"，与 Agent-Box 的
  Work/Execution/Binding/Finish 语义正交——采纳 ACP 不等于采纳 Codeg 的状态模型。
