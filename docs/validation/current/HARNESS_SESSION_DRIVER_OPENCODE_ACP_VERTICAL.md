# HARNESS_SESSION_DRIVER_OPENCODE_ACP_VERTICAL — 架构验证最终报告

- 日期：2026-09-02；分支 `feat/resource-routing-phase2`，HEAD `1a3c3083…`（无 commit）。
- 范围：有边界的最小正式实现与验证：HarnessSessionDriver SPI + ObservationHub +
  Permission 策略 + 通用 ACP Client Engine（独立 wheel）+ OpenCode ACP 第二模式试点。
- 未实施：MCP Resource；Codex/Claude/Hermes/Pi ACP；Work Core 任何修改；Gemini/Qwen/Grok 入 Registry。
- 未执行：真实模型请求；读取任何 credential 内容；git add/commit/push/merge/reset/clean/stash；broad stage；修改其他 worktree（含 `<other-worktree>` 主 worktree——本机 `import agent_box` 默认解析旧主 worktree 的 1.x 包，验证全部在独立 venv 进行）。
- 架构冻结确认：Profile 语义为「完整 Native Home 基底 + execution-time typed overlays」，本轮未实施该改造、未固化 full reconstruction 假设（ACP mode 只施加声明过的增量：XDG 四件套 + argv + 协议 prompt；测试 fixture 使用完整临时 native home 作为基底）。

## 1. Verdict：VALIDATED

核心假设 A–F 全部以代码与测试验证：

- **A（无污染建立通用 HarnessSessionDriver）**：SPI 在 `agent-box-harnesses/session/`（插件领域），Root/Work Core 零新增依赖；Root 词汇边界扫描测试锁定。
- **B（native/ACP 同一 canonical 边界）**：`driver.poll() -> ObservationHub -> canonical Observation` 双模式共用；parity fixture 测试覆盖。
- **C（OpenCode 双模式语义）**：native 默认、acp 可选、显式选择（无隐式 first）、capability truth、unavailable reason、失败不静默回退——全部实现并测试（`test_opencode_mode_selection.py`）。
- **D（ACP 引擎无品牌知识）**：`agent-box-acp` 全源码扫描零 vendor 词/方法/env 名（两层测试锁定：包内扫描 + harnesses 侧扫描）。
- **E（Runtime 双向字节 transport）**：现有 carrier 已提供 stdio 管道；精确缺口为无 typed 双工契约（RD-4 同源）→ 在 `agent_box.protocols.runtime` 新增最小、ACP 无关的 `ByteDuplexTransport` Protocol（`duplex.py`，仅类型契约，无 ACP 导入、无实现）；concrete pump（PipeDuplexTransport）在 agent-box-acp 内，Runtime 不 import ACP。
- **F（canonical Observation 表达力）**：session start/text/tool/permission/usage(若协议提供)/protocol diagnostic/terminal/cancellation/protocol failure 全部有明确映射或诚实 UNKNOWN/declared gap；未把 ACP JSON-RPC payload 暴露给 Web/Core（全部经 bounded `NativePayload` + warnings）。

## 2. 最终调用链

```
Registry facts（harnesses.toml：opencode 新增 launch_mode "acp"）
→ typed HarnessStartContext（显式 select_launch_mode，无隐式 first）
→ OpenCodeAdapter.plan()（模式敏感：acp 不注入 continuation argv、prompt 不进 argv）
→ LaunchPlan（continuation kind "driver_resume" 仅当 acp）
→ staging/lowering → assemble_runtime_composition → coordinator.start()
→ Runtime spawn `opencode acp`（Runtime 仍为唯一 spawn authority）
→ provider.attach_session_driver(dispatch)（显式；start 不自动 attach）
→ HarnessSessionDriver.bind(handle, options)（惰性拉入 agent-box-acp 引擎）
→ 引擎 initialize → resume→load→new 三级 rung（歧义即停，不静默回退）
→ driver.poll() → GenericAcpCodec/OpenCodeAcpCodec → ObservationHub（seq/replay/snapshot）
→ Host 看到 canonical Observation / PermissionView / FinishProposal（decision_owner="host"）
```

## 3. HarnessSessionDriver SPI 位置与职责

- 位置：`plugins/agent-box-harnesses/src/agent_box_harnesses/session/spi.py`（Harnesses 领域，具名 SPI + 注册表 `SESSION_DRIVERS[(harness_type, mode)]`）。
- 职责覆盖（任务书清单逐项）：descriptor/identity；四态 capabilities（SUPPORTED/UNSUPPORTED/UNAVAILABLE/NOT_IMPLEMENTED）；bind 到 Runtime 已启动 transport；增量消息解码→canonical Observation；permission response；cancel；close/cleanup；terminal state；session locator；diagnostics。
- SPI 禁令落实：不构造 Profile、不选 credential、不解析 Registry TOML、不 spawn、不写 execution staging、不改全局环境、不调用 Finish（`HarnessSessionDriver` 无 `finish_proposal`，测试锁定）；不假装未实现能力成功（capability 声明与实现一致）。
- 失败分类：slot 在 launch 家族（`LaunchStageError` 子类）但独立 `SESSION_DRIVER` stage；十个 typed 失败类各配 code（无异常字符串 routing）。

## 4. Native Driver 如何保留

- `session/native.py::NativeSessionDriver`：post-exit 有界 drain + staged documents 语义原样搬进同一 SPI 边界（decoder/terminals 复用既有 adapter），`provider.observe/finish` 在无 driver 时走原路径（全部既有测试保持通过）；driver 绑定时 finish 仍由同一 adapter 产出 FinishProposal。
- 五家居于默认 native（default_session_mode="exec"），本轮唯一新增第二模式为 opencode/acp。

## 5. agent-box-acp 是普通 wheel 还是 API v2 plugin：普通 wheel

证据（无独立 discovery/lifecycle/contribution ownership 需求）：
- 它是纯库：无 entry points、无 PluginDescriptor/Registration、无 catalog contribution、无持久化或生命周期钩子；被 harnesses 插件惰性引用（`_acp_engine_available()`/惰性 import）。
- 引用方向单向：harnesses → acp；Root wheel 零依赖（root-only venv 验证不可导入）；轮询发现/doctor 不需要它注册任何东西。
- 因此**未添加 API v2 entry point**（任务书：仅当确有通用贡献缺口才加；未发现缺口）。`PLUGIN_API_VERSION` 保持 2。

## 6. 是否新增 Runtime duplex transport protocol：是（最小、ACP 无关）

- 精确缺口：`TerminalRunHandle.transport` 是裸 carrier（Popen-like），无 typed 读/写契约；既有 `_collect_output` 仅 post-exit drain（RD-4 同源）。
- 新增 `src/agent_box/protocols/runtime/duplex.py`：`ByteDuplexTransport`（write/read_line/close/closed 四方法 Protocol），零实现、零 ACP 概念、`runtime/__init__` 导出；concrete pump（线程泵+有界行队列+stderr 有界排空）在 agent-box-acp 的 `PipeDuplexTransport`，Runtime 不 import ACP（结构等价、互不依赖，文档注明）。
- 未重写现有 Runtime Composition；coordinator/assembler/sandbox 语义零改动。

## 7. OpenCode native/ACP mode 选择语义

- Registry：`harnesses.toml` opencode 段新增 launch mode `acp`（argv `["opencode","acp"]`，stdio）；`exec` 保持默认。
- Adapter：`session_mode_drivers={"exec":"native","acp":"acp"}`、`default_session_mode="exec"`、`optional_session_modes=("acp",)`；continuation 与 prompt 模式敏感（acp 下 continuation 记 `driver_resume` 且 argv 空、prompt 走协议不进 argv，plan warnings 明示）。
- `provider.start_mode(request, mode)`：显式且必须已声明（缺失→`PLAN_REJECTED:LAUNCH_MODE_UNDECLARED`）；`select_launch_mode` 移除隐式 first 回退。
- 失败不静默回退：`attach_session_driver` 失败即抛 typed 错误、handle 不挂 driver、native 路径不变；ACP driver 内部 rung（resume→load→new）仅在显式拒绝时前进，歧义（响应丢失）立即停止并映射 `SESSION_START_AMBIGUOUS`；新一轮 Dispatch 才允许换模式。
- capability truth：`session_mode_truth()` 逐 mode 四态+原因；`diagnostics()` 暴露 `session_modes`（真实二进制探测结果与引擎可用性如实呈现）。

## 8. ACP engine vendor-name source scan 结果

- `agent-box-acp` 全源扫描：零命中 `codex|claude|opencode|hermes|gemini|qwen|grok|cursor|kimi|deepseek|codebuddy|openclaw|antigravity|qoder`；零 `if harness==/agent_type==` 开关；零 vendor 方法名（`thread/goal`、`_session/goal`、`item/commandExecution` 等）；零 vendor env 名（CODEX/CLAUDE/OPENCODE_/HERMES/PI_/OPENAI/ANTHROPIC）。
- `session/` 包扫描：无 subprocess/os.environ/Popen/socket 导入，无 vendor env 与 credential 文件名。
- `adapters/` 纯净性维持：唯一 subprocess 探针在 `opencode/acp.py`（opencode 子包，非 adapters 包）。
- 锁定测试：`plugins/agent-box-acp/tests/test_no_vendor_names.py` + `plugins/agent-box-harnesses/tests/test_session_vendor_scan.py`。

## 9. ObservationHub seq/buffer/replay/snapshot 语义

`session/hub.py`（按 Codeg 语义借鉴、非复制 2 万行模型）：
- seq 单调，且在同一个同步边界（同一把非重入锁）内分配+写日志；并发 200 push 唯一性测试通过。
- 有界内存：条数（默认 128）与字节（默认 64KiB）双上限；单事件超字节预算拒绝并记录 `EVENT_TOO_LARGE_REJECTED`（不无限增长）。
- 慢消费者：cursor 在窗口内→有界 replay；落后窗口→显式 resync（snapshot + `OBSERVATION_GAP_RESYNC`），不假装无缝隙。
- terminal observation 只能产生一次（重复拒绝+诊断）；同一 permission request 只能完成一次（register 与 result 双守卫）。
- 事件日志不含 credential：push 时 secret 形状扫描 fail-closed（文本与 native 载体）。
- opaque payload：沿用 `bounded_native`（大小/深度/键数上限 + schema 标签）；AC 默认不进公开 API（供 Host/codec 内部与诊断）。

## 10. Permission timeout/cancel/FIFO 语义

- 协议无超时（研究结论）→ 宿主义务由策略层落实：`session/permission.py` 提供 `PermissionPolicy`（默认 FailClosed）与 timeout 决策。
- driver 持 FIFO queue：队头展示、队头应答；引擎层与 driver 层双重 FIFO（乱序应答拒绝+诊断）；回答过一次的 request 再次应答返回 False（迟到响应安全）。
- 超时路径：策略记录 `ACP_PERMISSION_TIMEOUT` → 向协议端回复 cancelled → canonical PERMISSION_RESULT + LIFECYCLE 诊断 → 若 turn 在飞则 `TERMINAL(INTERRUPTED)` + end_turn —— 与 explicit Finish 边界一致（driver 从不 Finish）。
- 验证：synthetic peer 覆盖批准/拒绝/超时/cancel/duplicate/迟到响应/FIFO（driver 级 + engine 级 + 真实子进程级）。
- Host policy 异常 fail closed：默认策略拒绝一切（CANCEL），无人值守不自动 allow。

## 11. Native vs ACP fidelity delta

`test_native_acp_parity.py` fixture 对比（离线）：
- 保留等价：streaming text/thinking、tool call 生命周期、permission request、session locator（==native session id）、terminal 状态（TURN_COMPLETED）、resume/fork/list、images。
- 有损：question/elicitation（opencode ACP 无映射，turn 停滞风险=声明 gap）；plan/todo 更新；undo/share；subagent 内部流；config options 仅 model/effort/mode。
- 诚实缺失（不伪造）：usage/cost 仅在协议携带时产出 USAGE（fixture 断言无 usage 事件时 USAGE 不出现；携带时正确映射含 cost_usd）；native decoder 将 tool part 保持 message-embedded（既有选择），ACP codec 提升为 TOOL_REQUEST（delta 在测试中显式断言）。
- FinishProposal：两种模式同一 adapter 边界，driver 无 finish_proposal（测试锁定）。

## 12. synthetic ACP vertical 结果

- agent-box-acp：40 测试全绿（framing 边界、engine 协议行为、内存 peer、**真实子进程 fake agent vertical 11 项**：normal/permission/malformed/unknown-method/oversized/early-exit/silent/stderr 排空/EOF 检测/清理）。
- harnesses：`test_opencode_acp_vertical.py` 6 项全绿，含**完整形式链**（组装→coordinator→真实子进程 fake ACP agent→driver bind→initialize→prompt 协议→流式观测→permission→cancel→close→进程退出 0→FinishProposal）。

## 13. 官方 OpenCode ACP probe 结果（真机）

- 本机真实 `opencode`（1.18.21）`acp --version` 探测：**PASS**（隔离 temp XDG/HOME，无凭据读取）。
- 真实 initialize 握手：**PASS**（记录协议学发现：`protocolVersion` 传输字面量是**数字 1**，字符串 `"1"` 被 opencode 以 -32602 拒绝；能力声明为 mapping 形状——引擎已归一化两者并锁定测试）。结果：protocolVersion=1、loadSession=true、sessionCapabilities{fork,resume,list,close}、promptCapabilities{embeddedContext,image}。
- 未发任何 prompt；未读任何 credential；仅隔离环境握手。
- （若环境不可用时测试会 SKIP+原因；当前环境实际通过。）

## 14. failure taxonomy

- launch 阶段（既有，未改）：PLAN_REJECTED / MATERIALIZATION_FAILED / START_REJECTED / START_AMBIGUOUS。
- 新 SESSION_DRIVER 阶段（`SessionDriverError`，`LaunchStageError` 家族同构、stage 独立）十个 typed 类：DRIVER_UNAVAILABLE、PROTOCOL_INITIALIZE_FAILED、PROTOCOL_VERSION_INCOMPATIBLE、SESSION_START_REJECTED、SESSION_START_AMBIGUOUS、TRANSPORT_CLOSED、MALFORMED_PROTOCOL_MESSAGE、PERMISSION_TIMEOUT、CANCEL_FAILED、CLEANUP_FAILED。
- 分层清晰：模式未声明→PLAN；引擎映射到 SESSION_DRIVER；启动歧义保留 START_AMBIGUOUS 语义（response loss=target may exist，重试禁止）。`test_failure_taxonomy.py` 全绿（含十个 code→class 映射与引擎错误映射表）。

## 15. clean-wheel / install / discovery / doctor

- 10 wheel 构建成功（新增 `agent_box_acp-2.0.0a1`）。
- **Root-only clean venv**：root import ✓；`PLUGIN_API_VERSION=2` ✓；`agent_box_acp` 与 `agent_box_harnesses` 不可导入（正确）；plugins list 无 harness；doctor JSON 降级正确（execution_providers=false）无 traceback。
- **Preview clean venv（10 wheels，含 acp）**：12 entry points 全 READY；opencode diagnostics `session_modes`：exec=available，**acp=available（探测 1.18.21）**；doctor 全绿。
- **Preview 无 acp wheel**：opencode 插件仍 **READY**（未被标 FAILED），acp mode **unavailable**（"agent-box-acp engine is not installed"）——可选依赖缺失不破坏插件。
- 前端：Vitest 6✓、oxlint 0 错误、vite build ✓（`_static` 产物与提交一致，npm 造成的 lockfile 改动已精确还原）。

## 16. 全量测试结果

| 套件 | 结果 |
| --- | --- |
| agent-box-acp | 40 passed |
| agent-box-harnesses | 235 passed, 3 skipped（依赖真 bwrap 的既有 skip，与 ACP 无关） |
| root | 144 passed |
| runtime-local / sandbox-bwrap / terminal-session / skills / git / artifacts | 6 / 12 / 3 / 8 / 4 / 2 passed |
| web | 14 passed, 2 skipped |
| frontend Vitest / oxlint / vite build | 6 ✓ / 0 errors / ✓ |
| compileall | ✓（root + acp + harnesses src） |
| git diff --check | CLEAN |

## 17. Work Core / schema / migrations diff

**零修改**。Work Core ontology、Binding/Freeze/Dispatch/Finalization 语义、schema、migrations 均未触碰；Root 侧仅 `protocols/runtime/duplex.py`（新增最小类型契约）与 `runtime/__init__.py`（导出），均 ACP 无关；`PLUGIN_API_VERSION` 保持 2；registry schema/TOML 的策略性变更仅限 harnesses 插件（opencode 新增 acp launch mode）。

## 18. 是否读取 credential 或执行模型请求

**均未执行**。真实二进制只跑 `--version`/`--help`/isolated initialize 握手（无 prompt、无凭据、temp XDG/HOME）；fake agent 纯脚本；所有测试 offline/合成。

## 19. 剩余风险与 UNKNOWN

- opencode ACP 真实 prompt 流的事件变体拼写未在真机上验证（手写假 agent 覆盖主路径；真实流式需凭据环境，标记 UNKNOWN，见下轮）。
- `session/load` 全量回放语义未真机验证（Codeg/研究结论沿用）。
- ACP 面 question/plan 缺口（turn 停滞风险）为声明 gap，Host 必须自行处理。
- wrapper 型 ACP（Codex/Claude/Pi）不在本轮范围，其双层清理风险仍属未来工作。
- `opencode acp` 进程内 HTTP server（loopback）在真实沙箱内的网络语义未测（合成链路已覆盖行为面）。
- Hub 事件日志的持久化上层（序列化/检索）未实施（本轮为内存有界验证；放开时按 RD 记录）。

## 20. 是否建议继续 Hermes ACP Optional

**建议暂缓到下一轮且低优先**：Hermes 原生 `hermes acp` 已证明可用（vendor in-tree + 单进程 + Registry 缺席），但成本记账 P0 走 native `-z`；先让"第二 launch mode + SessionDriver"模式经过一轮 OpenCode 生产评估，再按同一 SPI 复用放行 Hermes（预计工作量小：codec + 注册 + fixture）。

## 两个独立结论

**A. READY TO KEEP `agent-box-acp` AS A SEPARATE REUSABLE ENGINE** —— 全无品牌知识（扫描锁定）、独立 wheel 构建/安装/导入验证、40 测试含真实子进程 vertical、Root 零依赖；作为普通库（非 v2 plugin）定位成立，证据充分。

**B. READY TO ADMIT OPENCODE ACP AS AN OPTIONAL PRODUCTION MODE** —— 形式链全通：显式模式选择、capability truth、失败不静默回退、真实二进制握手通过、canonical 边界与 Finish 语义一致、保真缺口显式声明。唯一前置人审项：真实凭据会话下的流式事件变体验证（当前被"不读凭据/不发模型请求"边界排除）与 question 缺口的产品处置。