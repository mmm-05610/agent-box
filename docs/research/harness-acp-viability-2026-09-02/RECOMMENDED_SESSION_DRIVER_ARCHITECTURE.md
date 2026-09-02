# RECOMMENDED_SESSION_DRIVER_ARCHITECTURE — 建议的 Agent-Box SessionDriver 边界

观察日期 2026-09-02。证据输入：任务书建议边界 + Codeg 考古 + 五家 dossier + 协议矩阵。

## 1. 建议边界（在任务书草案基础上的修订）

```text
HarnessStartContext / private LaunchPlan        （现状不动：Harnesses 插件私有）
        ↓  launch_mode 扩展为协议选择：{"native-exec","native-app-server","acp","document"}
HarnessSessionDriver                            （接口；Harnesses 插件拥有）
├── NativeJsonlDriver      （codex exec --json / claude stream-json / opencode run / pi --mode json）
├── NativeRpcDriver        （codex app-server / pi --mode rpc —— 未来升级基底）
├── AcpSessionDriver       （vendor-native acp 子命令：opencode acp / hermes acp / 未来 gemini --acp…）
└── DocumentDriver         （hermes -z 文档型输出等）
        ↓
canonical Agent-Box Observation                 （现状不动：adapters/observation.py）
        ↓
ObservationHub                                  （新增：seq + ring buffer + snapshot/replay + 指标）
        ↓
Agent-Box Host API                              （Root；只见 Observation，不见 ACP 类型）
        ↓
GUI
```

## 2. 逐项判断（任务书重点问题）

### 2.1 HarnessSessionDriver 属于 Harnesses 插件还是 Root protocol pack？

**Harnesses 插件**。理由：
- 现有 `HarnessStartContext`/`LaunchPlan` 已是插件私有、刻意不入 Work Core
  （start_context.py:1-8、launch_plan.py:1-9）；driver 是 launch 意图的执行面，同属一域。
- Root protocol pack 只应认识 `HarnessCommandSpec`（argv/env/stdio）——那是唯一 lowering
  终点。driver 的产物（进程句柄 + 观测流）比 argv 大，但**不比 Observation 大**。
- 第三方 Harness 注册自己的 SessionDriver 的入口在 Harnesses 插件的 Registry
  （candidate-acp.toml 就是这个注册件的雏形），Root 无需为每家改协议包。

### 2.2 ACP 类型是否应泄露到 Root/Host API？

**否**。Host API 只接受 canonical `Observation`/`FinishProposal`
（observation.py:80-150）。理由：
- ACP wire 类型是 VERSION_SENSITIVE（schema v1.21.0 每小时 cron 自动升版；
  v2 alpha 破坏性整理；SDK 三家版本互不同步——协议矩阵 R-4/R-7）。
- Codeg 反例：其 `AcpEvent` 直接成为前端契约，导致 sacp 11.0.0 升级被锁死
  （plan_update、subagents 因 schema 不能表达而永久不可用）。
- 保留 NativePayload（bounded opaque）作为 `_meta`/扩展的受控通道。

### 2.3 Runtime 应看到什么？

**transport bytes/frame，不是 ACP session**。Runtime 的合同是 sandbox/process/stdio；
`session/update` 的语义归 driver。ACP session id（=各家 native id）作为
`session_locator` 字符串进入 Observation，Runtime 不解释。这保住：
- "Runtime Coordinator 是唯一 execution target creation authority"（spawn 仍是 Runtime，
  driver 只是要 Runtime spawn 它的 argv）；
- replay/START_AMBIGUOUS 语义不受协议影响。

### 2.4 Adapter 应提供 codec、session driver，还是完整 ACP agent wrapper？

**codec + driver 分离，不做 agent wrapper**：
- codec（Decoder）：native 行 → Observation。已有五家，保留。
- AcpSessionDriver：AcpClient（实现 initialize/new/prompt/cancel/permission）+ 每家
  codec（session/update → Observation；`_meta` → NativePayload）。**不要**做成 Codeg 式
  "把 ACP client、render、特判、绑定塞一个 2 万行文件"的完整 wrapper。
- 每家差异全部压进 registry 声明（candidate 字段）+ codec，驱动代码共享。

### 2.5 permission response 如何从 Host 回到 ACP responder？

三层：
1. driver 收 `session/request_permission` → 发布 canonical
   `Observation(PERMISSION_REQUEST, tool_name, native=bounded(options/_meta))`；
2. Host 策略层决定（人工 UI / 无人值守策略 / 超时）。**协议无超时**（协议矩阵 R-3），
   超时与 fail-closed 必须是 Host 策略；headless 默认不得自动 allow（Hermes 官方威胁
   模型自述：程序化应答=无人值守执行）；
3. driver 把决定转成 `RequestPermissionOutcome{Selected(optionId)|Cancelled}` 回 responder。
   超时路径等价于 `session/cancel` 联动 → TurnComplete(cancelled)——直接复用 Codeg 已
   验证的语义（connection.rs:8743-8778）。
   并发 permission 必须 FIFO 排队（Codeg #442 教训：并发塌缩会让 responder 永久 park）。

### 2.6 ObservationHub 是否借鉴 Codeg 的 seq/replay/snapshot？

**借鉴语义，不搬实现**：
- seq 只在"接受"临界区内分配（apply → seq+1 → 入 ring buffer 原子，event_bridge.rs:425-450）；
- attach 三步同锁：snapshot → optional replay → subscribe（event_stream.rs:43-53）；
- ring buffer 双上限（条数+字节）+ 单事件上限 + gap 检测回退 snapshot（event_stream.rs:18-30,117-166）；
- lag 指标（lagged/evict/replay/snapshot_fallback/cold）用于容量调优（internal_bus.rs:84-121）。
- 差异：Agent-Box 的 ObservationHub 服务多消费者（GUI + Work Core 证据链），
  且必须持久化事件日志以补协议 durable replay 缺失——Codeg 没有这一层（它靠
  transcript parser 重读），Agent-Box 的 Finish/Evidence 语义需要它。

### 2.7 ACP event 是否直接等于 Agent-Box Observation？

**不是**。映射是 codec 的职责且必须显式：
- `session/update` 变体 → MESSAGE/TOOL_REQUEST/TOOL_RESULT/USAGE/…（见 fidelity 矩阵）；
- stopReason → TerminalCondition（TURN_COMPLETED/FAILED/…），**process exit 仍单独映射
  PROCESS_EXIT**，Finish 由 Host 决定（FinishProposal 语义不变）；
- 不可映射项（claude result 9 字段、codex --output-schema、opencode question.asked）
  必须产生 `warnings`（降级可见），而不是静默丢弃；
- `unknown_event` 语义保留：UNKNOWN kind + bounded native + warning
  （observation.py:191-196）——对 ACP 同样适用（未知 update 变体/`_meta` 键）。

### 2.8 如何保持 explicit Finish？

- driver 只产出 terminal Observation + FinishProposal（现状边界，observation.py:1-7）；
- ACP `session/prompt` 的 stopReason 只是证据之一；child exit/断连永远只是
  PROCESS_EXIT/INTERRUPTED 观测；
- Usage/结构化输出缺口（fidelity P0）在 ACP 路径上以 warnings 显式标注，
  Host 可据此拒绝 ACP 路径完成 Finish 所需的证据等级 → 这正是 Option D 里
  codex/claude/pi 保留 native 主路的机制化理由。

### 2.9 如何避免中央巨型 Harness switch？

- Registry 声明承载差异：launch spec、capability 白名单（广告矩阵）、`_meta` 词汇表、
  missing capability 警告——candidate-acp.toml 的字段即为此设计；
- driver/codec 按 Harness 注册（entry point），核心只有一个 HarnessSessionDriver 接口；
- 反面教材：Codeg connection.rs 的 2 万行 + registry.rs 注释墙（考古 §5.2）——注释墙
  的**内容**值得学（per-version wire 行为记录），**位置**不值得学（应进知识库/测试，
  不应成为运行时分支的宿主）。

### 2.10 如何保证第三方 Harness 可注册自己的 SessionDriver？

Registry schema 增加可选 `session_driver` 段（launch_kind/protocol/command/codec id/
capability 白名单/missing_capabilities/native_fallback），第三方以现有插件入口注册；
Agent-Box 校验器对 capability 声明做 conformance 测试（fake ACP peer / fixture 回放），
声明与实测不符即拒绝注册——防止"Registry 列出 ≠ 实际可用"（identity 矩阵结论 2）
在本生态内复发。

## 3. 明确不做

- 不把 ACP SDK 类型引入 Root/Host API（2.2）；
- 不实现 ACP server（Agent-Box 作为 Codeg/Zed 的外部 agent 是另一条路线，
  见 Codeg 审计 §11/§12，本轮不展开）；
- 不在 Runtime 里解析 ACP 帧（2.3）；
- 不用 ACP `session/load` 全量重放替代 Agent-Box 事件日志（2.6）。
