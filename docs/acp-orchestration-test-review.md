# ACP 编排 + 双向通道 — 目标测试评审报告（TEST_REVIEW_READY，第四轮修订）

日期：2026-09-24 ｜ 工单：后端编排＋双向 ACP 通道目标测试（bc-native worktree）
交付物：`tests/acp_orchestration/**`（新增，53 个测试）＋ 本报告。**未改动任何产品实现、既有测试、共享配置或依赖锁；未 stage/commit/push；未启停既有服务；未读凭据、未调用模型。**

## 0c. 第四轮修订（对"正例没带凭据＋结束未被正向断言"评审的逐条回应）

1. **授权正例显式携带测试 bearer**：`ManagedChannel._ensure_open` 现在以
   `headers={"authorization": "Bearer " + server.token}` 连接（TestClient 无
   默认认证头，接缝实现后匿名正例会被 accept 前鉴权拒绝）。为证明这不只是
   改了调用参数，自证夹具同步升级：回声 relay **accept 前强制校验 bearer**
   （缺/错 → 4401），新增 `test_channel_client_carries_the_bearer_and_unsigned_attach_is_refused`
   （7 项自证全过）——正例用 `whoami` 让 relay 原样回显收到的请求头，断言其
   恰为客户端的 Bearer；反例证明缺/错凭据在 accept 前被 4401 拒、客户端清晰
   失败不挂起。主线未授权反例（`test_channel_ws_admission_requires_authorization`
   与未授权 release 401）继续独立覆盖，不受此改动影响。
2. **"执行已结束"改为正向终态断言**：删除旧的"排除几个成功字符串"式检查
   （`assert_run_record_ended_not_succeeded`）。新断言
   `assert_run_record_ended(server, execution_id, *, normal)`：
   - 终态必须**正向落入按场景选定的合法词表**（提案，唯一适配点仍是
     `executions.get`）：正常结束 `RUN_END_NORMAL = {"closed"}`，异常结束
     （Agent 崩溃/断连）`RUN_END_ABNORMAL = {"interrupted"}`；running、任意
     未知字符串、缺状态一律违规。
   - **endReason 必填**，且显式 release 场景精确断言
     `endReason == "released"`（结束原因须由记录自己写明，不由测试推断）。
   - 成功声称词表 `RUN_SUCCESS_CLAIM_STATES = {completed, succeeded, success,
     ok, done}` 仅作为双重保险保留——**区分不再靠禁用单词**：lifecycle 测试
     故意发出一个永不完成的在飞 prompt（`scenario:hang`）再显式 release，
     断言 ①运行记录进入 `closed`＋`released` 原因（通道运行可以正常结束），
     ②该在飞请求没有收到任何被伪造的 result 帧（结束没有被换算成任务成功），
     ③其余 execution 与基线完全相等。exit 测试则对 SIGKILL 的运行断言
     `normal=False`（终态 ∈ interrupted，不得粉饰成正常关闭）＋同样禁止伪造
     在飞请求的成功应答。
   - release 实效测试补上对 A 的运行记录的**正向终态断言**（先锁定
     `len(exec_a) == 1` 取得 `run_a_id`，不再只验"从在飞列表消失"）。

仅改测试与报告；夹具架构未动。

## 0b. 第三轮修订（对"Workcore 测试可能假通过"评审的逐条回应）

1. **身份锁定代替数量侥幸**：生命周期测试在建立通道后**立即锁定**该通道的 execution 身份（`in_flight` 差集中的唯一 id）与进程身份（pid 集合）；3 prompt＋1 权限往返后断言两个**集合逐元素不变**（同一 `run_id` 仍 in-flight、同一批 pid、每个 pid 恰好一条 `peer-start`）。删除 `starts == len(by_pid)` 这类"三进程各启动一次也算过"的比较。
2. **release/退出的精确收尾**：release 必须返回确认（`release()` 断言 result）；释放后 A **不得再完成任何 ACP 往返**（任何异常/无应答算失败，成功应答即违规），B 以**真实 prompt 往返**验证（不再只看 PID 存活）；ledger 断言精确到 `run_id` 离开 in-flight 且其余 execution 集合与基线完全相等。新增 `test_unexpected_agent_exit_ends_the_run_record_not_as_success`：SIGKILL 对端进程 → 该 run 离开 in-flight、在飞 prompt 不得被代答成成功、运行记录状态不得 ∈ {completed, succeeded, success, ok, done}（`assert_run_record_ended_not_succeeded` 统一钉住"结束≠全部成功"）。
3. **Workcore 记录入口核实**：删除直读 `server_turns` 的 SQL 便利路径。in-flight 身份读取改用产品自己的执行台账接缝 `executions.list`（wire → `execution/inventory.py` order-64 inventory）；单条运行记录的终态读取集中在新提案常量 `CHANNEL_RUN_GET_METHOD = "executions.get"`（不存在即 TARGET MISSING），这是运行记录终态词表的唯一适配点——不为测试方便杜撰表结构。
4. **新 ACP WebSocket 授权正反例**（独立于旧 event-stream 的结论）：`test_channel_ws_admission_requires_authorization`——既有 connectionId 上：错误 token → 4401、缺 token → 4401、非 loopback Origin → 4403（accept 前拒绝），正例为持牌客户端完整 initialize/session-new 往返；release 侧再钉"未授权客户端不能释放"（401 后 A 仍可真实往返）。
5. **release 实效验证**：并入第 2 条——确认应答、A 不可用、B 可往返、其余 execution 不受影响四者同时成立才算过。

夹具保持上一轮形态（reader 线程/queue 收帧、真实超时、`channels` 清理、selftest 6 项），未重做架构。

## 0a. 第二轮修订（对"测试实现暂未通过"评审的逐条回应）

1. **WebSocket 上下文**：`ManagedChannel._ensure_open` 现在保存 `websocket_connect()` 返回的 context manager 并显式 `__enter__`，reader 线程只使用进入后的连接；`close()` 显式 `__exit__`，测试级 `channels` fixture 统一清理（可重复调用）。
2. **收帧不丢＋真实超时**：入站帧由 daemon reader 线程泵入 `queue.Queue`，每一帧先存入 `_seen` 再对任何调用方可见——`collect()/answer()/drained()` 全部非破坏性；所有等待走 `queue.get(timeout=…)`，不再依赖阻塞 `receive_text` 的隐式行为；超时耗尽以"no answer to request id N"清晰失败。
3. **双通道隔离改按归属判定**：新增 `peer_rows_by_pid`（对端日志文件名 `<base>.<pid>.<peerId>` 即归属证据），隔离断言只看**每条对端进程自己的日志**，不再按消息里的 `params.cwd` 筛（session/prompt 本无该字段，旧写法可能漏判串线）；且两条通道**同时使用相同 JSON-RPC 请求 id（1/2/…）**，应答必须各回各家（`test_two_channels_relay_identical_request_ids_without_crossing`）。未导入的 `peer_pids` 等引用已清除。
4. **精确性**：错误比较删除 `int()` 换算——现在断言 `type(code) is int and code == -32603`，并把**收到的完整 JSON 帧与对端日志中 `dir=send` 的原始帧做整帧字典相等**；`_meta` 与未知 `sessionUpdate` 同样以整帧相等覆盖（对端发出的每一个通知帧必须原样出现在客户端收帧里），并保留指名失败信息。
5. **测试客户端自证**：新增 `test_channel_client_selftest.py`（6 项，全部通过、不依赖产品接缝，用自带回声 WS 应用）：上下文进入、多请求复用、收帧保留/非破坏、真实超时不卡死、relay 断开清晰呈现、close 幂等、缺 relay 时快速 TARGET MISSING 而非挂起。主线报 TARGET MISSING 时可确定是接缝缺失而非夹具错误。
6. **Workcore 边界（新契约）**：新增 `test_one_channel_run_is_one_workcore_execution`——建立通道→建会话→连续 3 个 prompt＋1 次权限往返→显式 release；断言 execution 台账数**不随 prompt 增长**（一次通道运行=一次 execution）、`peer-start`/`session/new` 各只 1 次（不重启服务、不重建会话）、release 只结束运行记录不新增/复制 execution；**不对任何成功状态作断言**（关闭不等于内部任务全部成功）。仅此一条生命周期测试，未扩展成逐轮执行管理。

## 0. 第一轮修订（方向与精确比较）

1. **方向修正**：目标验收主线已从"给旧 envelope 补字段"转移到 **`test_managed_acp_channel.py`** —— 客户端经过 Server 的受管理通道，与受控 ACP 对端双向原样通信，按主会话定稿接缝契约逐条立测。旧 envelope 的六个测试模块**保留为旧链路诊断**（测的是现有投影/信封边界的失真点，供实施新通道时对照），不再作为目标通过标准，其补字段建议从实施主线撤下、降为附录 A。
2. **optionId 与错误比较**：客户端选择 optionId 的测试现在真正传入所选 ID —— 对端提供**两个同 kind（allow_once）、不同 optionId（`pick-1-*`/`pick-2-*`）**的选项，客户端显式选 `pick-2-*`，断言精确比较返回 ID 不被替换；错误断言全部改为**数值 code 精确（-32603）、message 全等、结构化 data 相等**，无任何子串检查。

## 1. 定稿接缝契约 → 目标测试映射

契约原文各条在 `test_managed_acp_channel.py` 中的落点（16 个测试 = 14 目标缺失失败 + 2 现状通过；失败均以 `TARGET MISSING:` 开头清晰报告，无 skip/xfail。测试客户端本身另由 `test_channel_client_selftest.py` 7 项自证通过，含 bearer 携带与未授权 attach 被拒）。其中"客户端 ACP 帧透传"的全部断言均为**整帧字典相等**（与对端日志 `dir=send`/`dir=recv` 原始帧比较），无类型换算、无子串检查：

| 契约条目 | 测试 | 现状 |
|---|---|---|
| 发现与项目列表属编排控制面，不依赖 ACP 通道 | `test_discovery_and_project_list_work_without_any_acp_channel`：hello→nativeExecution、workspaces.open/list 全部成功后对端**零事件** | **通过**（今天即成立） |
| 未授权零启动 | `test_unauthenticated_channel_request_is_refused_and_starts_nothing`：错误 token → 401 `UNAUTHENTICATED`(internalCode `AUTHENTICATION_REQUIRED`)＋对端零帧 | **通过** |
| 建立通道必须显式 harnessId+projectId；Server 校验授权与项目、解析权威 cwd 后返回绑定＋双向通道 | `test_channel_open_returns_binding_with_the_authoritative_cwd`（binding.cwd 必须等于 Server 解析后的权威路径） | 目标缺失 |
| 未打开/未授权项目不得取得通道 | `test_unbound_project_gets_no_channel_and_starts_nothing`：未 open 的项目必须被拒且零启动（与 token 拒绝是独立路径） | 目标缺失 |
| 建立不代替客户端 initialize、不创建原生会话、不发送 prompt | `test_establishing_a_channel_performs_no_initialize_no_session_no_prompt`：建立后对端 recv 帧（按 pid 日志归组）中禁止出现 initialize/session/new/session/load/session/prompt | 目标缺失 |
| 客户端 ACP 帧双向原样透传（请求/通知/result/error/`_meta`/未知 sessionUpdate） | `test_client_frames_relay_verbatim_both_directions`（对端发出的**每一个**通知帧必须整帧原样出现在客户端收帧中，含 `hd003_extension` 与 update 级 `_meta`；session/new 应答与对端发出帧整帧相等）、`test_native_error_identity_survives_the_relay_exact`（整帧相等＋`type(code) is int`＋message/data 精确） | 目标缺失 |
| 反向请求＋客户端自选 optionId 不被替换 | `test_client_answered_permission_carries_the_chosen_option_id`：反向请求原样到达，客户端自己回 JSON-RPC 响应选 `pick-2-*`，对端**收到的帧与客户端发出的帧整帧相等** | 目标缺失 |
| 绑定不可悄悄更换；其他项目取得其他绑定通道 | `test_a_channel_binding_never_moves_and_each_project_gets_its_own`（双项目双通道、同参重取得绑定不变） | 目标缺失 |
| 双通道同用相同 JSON-RPC 请求 id 不串线 | `test_two_channels_relay_identical_request_ids_without_crossing`：两通道同用 id 1/2/3；A 的 prompt 按**对端进程日志归属**判定只到 A 的 peer，B 无同 id 应答且日志无该流量 | 目标缺失 |
| 连接 ID ≠ 原生 session ID | `test_connection_id_is_separate_from_the_native_session_id` | 目标缺失 |
| 前端切换展示不构成释放指令（不自动取消/重启/重发） | `test_stopping_to_view_is_not_a_release`：静默 2s 后按 pid 日志集合比对无重启、无 session/cancel、session/new 计数不增、通道仍可继续 | 目标缺失 |
| 显式 release 才按所有权释放，且被确认 | `test_explicit_release_acks_and_only_the_owned_channel_stops`：release 返回确认；锁定 `run_a_id` 后正向断言 A 的运行记录进入合法结束终态（closed＋endReason）；释放后 A 不得再有任何完整往返；B 以真实 prompt 往返验证可用；其余 execution 集合与基线完全相等；未授权 release 尝试 → 401 且 A 仍完全可用 | 目标缺失 |
| 新 ACP WS 的授权正反例（独立于旧 event-stream） | `test_channel_ws_admission_requires_authorization`：既有连接上错 token/缺 token → 4401、非 loopback Origin → 4403（accept 前），持牌客户端完整往返为正例 | 目标缺失 |
| 一次通道运行=一次 Workcore execution；**建立后锁定 execution 身份＋进程身份**，多轮操作两集合不变；关闭/被杀只结束运行记录、不推断任务成功 | `test_one_channel_run_is_one_workcore_execution`（`executions.list` 差集锁定唯一 run_id；pid 集合与每 pid 恰好一条 peer-start 前后不变；**故意留永不完成的在飞 prompt** 再 release → 正向断言终态 ∈ {closed} 且 `endReason=="released"`，该在飞请求无伪造 result 帧）＋`test_unexpected_agent_exit_ends_the_run_record_not_as_success`（SIGKILL：run 离席、在飞请求无伪造成功应答、终态**正向 ∈ interrupted 词表并携 endReason**） | 目标缺失 |

**待与前端对齐的最小签名**（集中在该文件顶部常量一处，对齐后只改这一处）：
`acp.channel.open {harnessId, projectId} → {connectionId, binding{harnessId, cwd}}`；`acp.channel.release {connectionId} → 确认`；双向帧通道 `WS /wire/v1/acp-channel/{connectionId}`（原样 JSON-RPC 帧，Server 不解析不改写；复用 bearer 认证边界，accept 前鉴权——测试客户端已显式携带凭据，未授权不能接入既有连接）；运行记录终态 `executions.get {requestId, executionId} → {state, endReason}`（提案，唯一适配点 `channel_run_record`/`assert_run_record_ended`；终态词表：正常结束 `closed`、异常结束 `interrupted`，两者必须携 `endReason`，成功声称词不属于通道运行台账）。in-flight execution 身份读取不设新接缝——直接用产品现有 `executions.list`。方法名/路径/字段均为提案，不是杜撰产品协议。

## 2. 现有链路（旧链路诊断所测对象）

被测的真实生产链路（native 模式）：

```
wire/1 sessions.createAndSend|sessions.send
  → ServerRuntime(execution=SidecarExecutionBackend)
  → _capability_gate：LocalEnvironmentProvider.validate(project)   ← 授权/项目复核（先于任何启动）
  → port_factory (bootstrap/runtime.py:546-577)
      NativeHarnessPort(NativeProcessLauncher(node worker-entry.mjs --native, cwd=project))
  → SidecarEnvelope（NDJSON op 信封，Server 自铸 "sc-<uuid>" 关联 id）
      register → start → create(session/new{cwd=directory}) / open(session/load)
      prompt / abort / close / permission_decision
  → plugins/agent-box-harness/runtime/worker-entry.mjs（校验 provenance，加载 bridge acp-registration）
  → bridge acp-client 启动 adapter 命令（本次由测试夹具 fake peer 充当真实 ACP Agent）
      子进程 cwd = worker cwd = launcher cwd = 选定项目
上行事件：acp_notification → SidecarHarnessPort._forward（白名单投影）
  → on_event(execution_id, kind, payload) → records.append_turn_event → notifier
  → history.snapshot / SSE / WS event-stream
反向权限：session/request_permission → worker `permission_request` 事件
  → port approval.requested → approvals.decide(wire) → op permission_decision
  → worker permissionOption（按 kind 词表选回 optionId）→ bridge → 对端
认证边界：loopback Host/Origin 中间件(403) + bearer runtime.token(401)；
  WS /wire/v1/event-stream 预 accept 关闭码 4401/4403/4400。
```

关键事实：**当前通道不是双向透传**，而是 Server↔插件之间的自定义 op 信封——请求 id 重铸、上行通知按 `_forward` 白名单投影、JSON-RPC 错误经 `upstreamCauseCode` 改写、权限往返经 approvals 子系统按 kind 词表换算 optionId。这解释了为什么目标验收必须走新通道，而旧链路测试只能作诊断。

## 3. 旧工单 9 项需求 → 现在的双层落点

| # | 需求 | 目标验收落点 | 旧链路诊断落点（保留） |
|---|------|------|------|
| ① | 合法项目 cwd 传到启动边界 | 通道契约 §1 行 3（binding 携权威 cwd）＋旧链路 `session/new.cwd`/adapter cwd 正钉 | test_project_binding（3 过） |
| ② | 未授权连接被拒 | 通道契约 §1 行 2 | test_access_authorization（5 过） |
| ③ | 双连接、相同 JSON-RPC id 不串线 | `test_two_channels_relay_identical_request_ids_without_crossing`（双通道同用 id 1/2/3，按对端进程日志归属判线）＋`test_a_channel_binding_never_moves…` | test_dual_connections（1 过：反向 id 7777 各落自家） |
| ④ | 请求/通知/result/error 双向 | `test_client_frames_relay_verbatim_both_directions`、`test_native_error_identity_survives_the_relay_exact`（整帧相等） | test_channel_passthrough（3 过/5 诊断失败） |
| ⑤ | 未知扩展不被白名单过滤 | `…relay_verbatim_both_directions`（`hd003_extension`/`_meta` 以整帧相等覆盖） | 同上（sessionUpdate/_meta/能力声明 3 项） |
| ⑥ | 反向请求＋客户端答复完整往返、Server 不代答 | `…chosen_option_id`（对端收到的帧与客户端发出的帧整帧相等） | test_reverse_request（2 过/1 诊断失败） |
| ⑦ | 断连不得判为成功或取消 | （通道语义下由 relay 断连事件承担，签名对齐后补钉；测试客户端侧已由 selftest 钉住"relay ended 清晰失败"） | test_disconnect_and_release（现状过） |
| ⑧ | 释放只处理自己拥有的资源 | `test_explicit_release_releases_only_the_owned_channel`＋`test_one_channel_run_is_one_workcore_execution`（release 结束运行记录、不推断任务成功） | port 级 stop 隔离（现状过） |
| ⑨ | 不因重连自动重发/建替代会话 | `test_stopping_to_view_is_not_a_release`（不重启/不重发） | 死亡后零帧增长钉桩（现状过） |

夹具自身可信性：test_fixture_selfcheck 6 项（成功、error-only、权限往返、hold+cancel、die 断连、stdin 清理）先于一切产品接线通过；test_channel_client_selftest 7 项自证通道测试客户端本身（上下文进入、**bearer 凭据确实随连接送达 relay＋缺/错凭据 accept 前被 4401 拒**、收帧保留、真实超时、断开呈现、close 幂等、缺 relay 快速失败），使主线的 TARGET MISSING 可归因于接缝而非夹具（也排除了"正例因自己没带凭据被拒"这一混淆）。

## 4. 实跑命令与退出码（2026-09-24 重跑）

环境：`uv` 建的 gitignored `.venv`（Python 3.12，本地 plugin editable 安装），node（/usr/bin/node）。

```
.venv/bin/python -m pytest -q tests/acp_orchestration/test_fixture_selfcheck.py      # rc=0  6 passed
.venv/bin/python -m pytest -q tests/acp_orchestration/test_channel_client_selftest.py # rc=0  7 passed   （测试客户端自证，含 bearer 携带/未授权拒绝）
.venv/bin/python -m pytest -q tests/acp_orchestration/test_project_binding.py        # rc=0  3 passed
.venv/bin/python -m pytest -q tests/acp_orchestration/test_access_authorization.py   # rc=0  5 passed
.venv/bin/python -m pytest -q tests/acp_orchestration/test_channel_passthrough.py    # rc=1  5 failed, 3 passed   （旧链路诊断）
.venv/bin/python -m pytest -q tests/acp_orchestration/test_dual_connections.py       # rc=0  1 passed
.venv/bin/python -m pytest -q tests/acp_orchestration/test_reverse_request.py        # rc=1  1 failed, 2 passed   （旧链路诊断）
.venv/bin/python -m pytest -q tests/acp_orchestration/test_disconnect_and_release.py # rc=0  4 passed
.venv/bin/python -m pytest -q tests/acp_orchestration/test_managed_acp_channel.py    # rc=1  14 failed, 2 passed  （目标验收主线，1.6s 快速失败）
.venv/bin/python -m pytest -q tests/acp_orchestration                                # rc=1  20 failed, 33 passed (22.2s, SKIPPED_TOTAL=0, 无孤儿进程)
```

整体 rc=1 是**目标契约测试按设计失败**（禁止用 skip/xfail 冒充通过），不是接线故障。`ps` 复核确认无存活 worker/peer 进程。

## 5. 目标验收失败清单（14 项，均为 TARGET MISSING）

`test_managed_acp_channel.py` 的 14 个失败全部源于同一事实：**定稿契约要求的生产接缝尚不存在** —— wire/1 无任何通道方法（`acp.channel.open is not a wire/1 method`）、无 `executions.get` 运行记录读取、无原样 ACP 帧 relay、无 release 确认语义、无 connectionId 概念（实测失败明细：13 条止于 `acp.channel.open` 探测、1 条为未授权项目拒绝路径的同因报告）。每条契约目的地的断言原文见 §1 表；失败均快速返回（模块全跑 1.6s），由 `test_channel_client_selftest.py` 保证不是夹具自身故障——包括不是"客户端没带凭据被 relay 拒绝"这一混淆（自证第 7 项已钉住凭据确实送达）。

## 6. 旧链路诊断失败清单（6 项）与根因

这些失败**不再是待验收目标**，而是新通道实施时必须覆盖的失真证据（file:line 为现场核对）：

1. `test_upward_error_carries_the_native_error_identity` — 对端 `-32603 + data {vendorDetail:"keep-me"}` 变成 `SidecarError("SIDECAR_OP_FAILED")`，message 也被改写（本轮已改精确比较：实测 `assert 'SIDECAR_OP_FAILED' == -32603`）。根因：`worker-entry.mjs:80-93` `upstreamCauseCode` 只接受产品形状字符串 code。
2. `test_cancelled_stop_reason_flows_through` — 取消后 `{stopReason:"cancelled"}` 被替换为 `{done:true}`。根因：bridge 有意「被取消 generation 不存应答」（`bridge/src/acp-service.js:1277,1339`）＋ `worker-entry.mjs:321,368` 兜底。是否构成透传契约例外仍需插件负责会话裁决（§9）。
3. `test_unknown_update_kind_flows_through` — `hd003_extension` 无声消失。根因：`sidecar.py:1627-1685` `_forward` elif 白名单。
4. `test_message_meta_flows_through` — update 级 `_meta` 丢失。根因：`sidecar.py:1650` 仅发 `{"text": …}`。
5. `test_advertised_extension_capability_flows_through` — peer 能力声明在任何 port 级事实不可见。根因：`worker-entry.mjs:344-347`＋`sidecar.py:1368-1370`。
6. `test_client_chosen_option_id_is_not_replaced_by_a_kind_guess` — 本轮重写：对端提供两个同 kind（allow_once）、不同 ID 的选项，客户端经 `decide_approval(…, {"kind":"once","optionId":"pick-2-…"})` 显式传入所选 ID（旧信封 scope 原样透传），实测失败于 **`the middle layer answered 'pick-1-…' instead of the client-chosen 'pick-2-…'`** —— 中间层按 kind 词表取第一个匹配的"猜选项"行为被精确钉住。根因：`worker-entry.mjs:416-431` `permissionOption`。

## 7. 所需实施范围（按定稿契约改写）

| 范围 | 组件 | 对应目标 |
|------|------|----------|
| Server 受管理 ACP 通道：`acp.channel.open/release`（校验授权与项目、解析权威 cwd、返回绑定＋connectionId；建立时代办插件启动/连接但**不**代做 ACP 操作） | Server wire/handlers＋execution 边界 | §1 行 3/4/5 |
| 原样双向帧 relay（客户端↔对端，Server 不解析、不重铸 id、不投影、不改写错误），承载于 per-connection 通道 | Server transport（WS） | §1 行 6/7 |
| 绑定不可变＋连接 ID 与原生 session ID 分离＋显式 release 所有权与**确认应答**；新 ACP WS 自身复用 bearer/loopback 授权边界（未授权不能接入既有 connectionId、不能 release） | Server 通道注册表＋WS accept 前鉴权 | §1 行 8/9/10/11/12 |
| 通道运行级 execution 台账：一次通道运行=一次 Workcore execution（身份可锁定），多轮 ACP 操作不新增 execution/不重启服务；关闭或进程退出**正向记入合法终态**（正常 `closed` / 异常 `interrupted`，均携 `endReason`），且不得由结束推断内部任务成功；in-flight 读取复用产品 `executions.list`，终态读取提案 `executions.get → {state, endReason}`（唯一适配点已留）；不新造记录入口、不直读表 | Server execution/ledger 边界 | §1 行 13/14 |
| 插件按 Server 解析的 cwd 提供 transport/启动对端，ACP 语义留插件内 | `plugins/agent-box-harness`（**只读，归另一会话**） | 全链 |
| 产品旧 envelope/投影层修补 | **不再是本组实施主线**（附录 A 降为旧链路修复选项） | — |

## 8. 待前端对齐项

最小签名（§1 末）需与前端确认后固化：通道建立/释放方法名与字段、双向帧的 WS 路径与帧约定（原样 JSON-RPC）、connectionId 的续用（重取得 vs 新连接）。测试侧接缝敏感代码已集中一处，对齐后单点修改。

## 9. 协议未决项

取消 stopReason 的「有意丢弃」（诊断 §6.2）若在新通道契约下仍作为竞态防护保留，需要主会话与插件负责方明确裁决；目标测试暂按透传契约钉桩。

## 附录 A：旧 envelope 补字段建议（已撤下主线，仅供旧链路修复参考）

- S1 `_forward` 未识别 sessionUpdate/`_meta` 经 `on_event` 原样携带（Server `sidecar.py`）。
- S2 envelope 失败响应附 `nativeError:{code,data}`（插件 worker-entry，只读方）。
- S3 `permission_decision` 允许精确 optionId（插件 worker-entry，只读方）。
- S4 取消应答保留或裁决（插件/bridge）。
- S5 `started` 事件纳入 native 能力声明原文（Server＋worker）。

以上与定稿方向（Server 受管理纯 ACP 通道）重叠处应被新通道取代，不作为并行实施方案。
