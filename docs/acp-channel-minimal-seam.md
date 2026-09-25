# 受管理 ACP 通道 — 最小接缝说明（HD003 实施轮）

依据：已审核目标测试 `tests/acp_orchestration/test_managed_acp_channel.py`（第四轮整改版）。
本文件是实现的唯一接缝口径；签名如与前端最终对齐有变，只改本文件与对应一处实现。

## 1. wire/1 方法（新增 3 个，方法总数 64 → 67）

| 方法 | params | result |
| --- | --- | --- |
| `acp.channel.open` | 必 {harnessId, projectId}，选 {requestId} | {connectionId, executionId, binding:{harnessId, projectId, cwd}} |
| `acp.channel.release` | 必 {connectionId}，选 {requestId} | 确认释放：{released: true, connectionId, executionId, sessionId, endReason}；未确认：{released: false, connectionId, executionId, sessionId, reason}（所有权记录与账本原样保留，可重试）；连接不存在 → NOT_FOUND |
| `executions.get` | 必 {requestId, executionId} | {executionId, state, endReason, sessionId, harnessType, terminalReason, stopRequestedAt} |

- `harnessId` 必须等于本 Server 的 native 身份（`native_execution_provider()` 的 harness/mode）；不符或身份缺失 → 拒且**零启动**。
- `projectId` 必须是已打开的 workspace 记录 id（`workspaces.records.get`）；未打开/不存在 → NOT_FOUND 族拒绝，**零启动**。env_kind 必须 local；权威 cwd = 记录 `normalized_path` 且经 `workspaces.local.validate` 稳定性校验。
- `open` 幂等：同一 (harnessId, projectId) 仍活跃时返回**同一** connectionId/executionId/binding，绝不换绑。
- 鉴权失败路径复用既有 wire 路由（401 → family `UNAUTHENTICATED`，`details.internalCode`=`AUTHENTICATION_REQUIRED`），无需新方法特判。

## 2. WS 通道：`/wire/v1/acp-channel/{connectionId}`

- accept 前顺序检查：非 loopback **Origin**（出现即校验，否则 4403 `LOOPBACK_POLICY_REJECTED`）→ bearer（`secrets.compare_digest`，缺/错 4401 `UNAUTHENTICATED`）→ connectionId 存在（不存在/已释放 4400）。独立注册、独立鉴权，不复用 `/wire/v1/event-stream` 的认证结论。与 event-stream 的差别是审定测试钉出来的：admission 测试只钉 Origin→4403（test_managed_acp_channel.py:639），而被审夹具 `ManagedChannel` 以相对 URL 挂接，Starlette 1.7 TestClient 的 WS 缺省 Host 为 `testserver`——若照搬 event-stream 的 Host 校验，全部正例在 accept 前即 4403（夹具自证首轮实测抓到，路由已改 Origin-only；event-stream 路由原样不动）。
- 建立连接**不发送任何 ACP 帧**；此后双向逐帧原样中继（文本行进出，不解析、不改写、不代答、不折叠 error）。Server 不追踪请求 id。
- 同一 connectionId 可多次挂接（重连广播、stdin 串行写入）；客户端断开 ≠ 释放：只摘除该挂接，不 kill、不取消、不重发。
- release / Agent 退出 → 向所有挂接的 socket 投递哨兵 → 服务端 close，如实结束通道；**绝不**为在飞请求伪造 result/error 应答。

## 3. Workcore 通道运行记录（复用既有账本与状态机）

- 一次通道运行 = 一条 `server_turns` 行：`SessionRecords.create_session` + `create_turn`（state `accepted`），因此 `executions.list`（order-64 盘点）天然可见，`executionId` = turn id。多轮 ACP 操作复用同一运行，不新增行。
- 结束只走既有终态转换：
  - **显式 release** → `finish_cancelled(turn_id, terminal_reason="released")`（对既有函数做**纯增量** kwarg，写法镜像 `complete_turn` 的 terminal_reason 列，缺省行为不变）→ state `cancelled`。**结账时机（整改轮）**：该行终态转换只在 transport 交回入口的 OS 确认回执之后写入；回执未确认/超时/被拒时，运行记录与所有权记录原样保留，wire 返回 `{released: false, …, reason}`，同一 release 可诚实重试。并发 release 由注册表的锁内 claim-pop 保证终态转换恰好一次。
  - **Agent 异常退出** → `fail_turn(turn_id, "ACP_AGENT_EXITED")` → state `failed`，真实原因存 `error_code`。
  - **Server 重启** → 既有 `seal_interrupted_turns`/恢复路径 → state `unknown`，同样映射为异常结束。
- 不新建平行执行账本；不引入 closed/interrupted 到 Workcore 状态机。

## 4. 集中适配点（唯一处）：`agent_box.server.acp_channel.runs.channel_run_view`

| 台账事实 | executions.get.state | endReason |
| --- | --- | --- |
| 活跃（accepted/dispatching/running/capturing） | 原样（如 accepted） | None |
| completed | completed（成功声称只属于真正完成，通道运行不会到达） | terminal_reason |
| cancelled | **closed** | terminal_reason（release 时为 `released`）或 `TURN_CANCELLED` |
| failed / unknown | **interrupted** | terminal_reason 或 error_code（如 `ACP_AGENT_EXITED`、`SERVER_RESTART_INTERRUPTED`） |

测试侧词表（closed/interrupted）只存在于这张表；其余层只见台账原生状态。

## 5. 资源归属

- `AcpChannelRegistry`（Server 单例，挂在 `runtime.acp_channels`，组装后置注入，先例：`wire.native_execution_provider`）持有 (harnessId, projectId) → 连接、transport、挂接 socket 集合；release 只按所有权结束对应 transport 与其运行记录。**先证后销（整改轮）**：可询问的 transport 须交回确认回执，注册表才移除所有权记录、写终态并应答成功；未确认时一切原样保留（身份、账本、可重试性）。对无回执能力的通用 transport 维持原强制终结语义。
- `ServerRuntime.stop()` 调 `acp_channels.stop_all()`（若已组装）：释放全部连接，运行记录记 `cancelled`/`server-stop` 结束。
- **transport provider**：组装期注入的 `launch(harness_id, cwd) -> transport` 回调。**接线轮（2026-09-24）起，native 组装返回 `AccessEntryTransport`（`src/agent_box/server/acp_channel/access_entry.py`），不再直接 spawn adapter**：以 `node plugins/agent-box-harness/runtime/access-entry.mjs --native` 拉起插件透明入口（cwd=权威项目目录，env 剔除 `AGENTBOX_SIDECAR_ISOLATED`），先经控制面 `connect {harness, launch, directory}` 得到 `ok:true` 才算建立（`connect` 本身不经手任何 ACP 帧， Server 依旧不代做 initialize/session/new/prompt）；此后入口逐行原样双向转发。注册表契约（`start/send_line/terminate/pid` + `on_line/on_exit`）一字未动，`AcpChannelRegistry` 与 WS 中继不感知此层。
- **控制面/ACP 分离（入口桥的唯一解析点）**：入口 stdout 行中，JSON 可解析为对象、**无 `jsonrpc` 键**且带布尔 `ok` 或字符串 `event` 的，判为控制面（对 connect/close 的回复、`transport_end`/`stderr`/`transport_malformed`/`process_release_unconfirmed` 事件），在本桥消费、**永不中继给客户端**；未知 id 的 `ok:false` 只留作证据（`_fatal_refusal`），绝不冒名 Agent 应答。其余行（含一切自称 JSON-RPC 的）为 Agent 帧，字节原样中继。
- **结束与释放**：Harness 死亡 → 入口 `transport_end` 事件先于入口进程退出到达，`on_exit` 收到**原因字符串**（如 `adapter_exit`/`closed_by_caller`），故异常退出的台账 endReason 由 `ACP_AGENT_EXITED-<退出码>` 变为 `ACP_AGENT_EXITED-<原因串>`（`executions.get` 词表不变，中断语义不变）；入口进程自身死亡 → `on_exit(returncode)`。**客户端 release 与强制终止是两条路（整改轮）**：`request_release()` 向入口发 `{op:"close"}` 并等回执 ≤12s，成功声称只认 `ok:true ∧ result.released:true`（入口的 OS 级 ESRCH 确认）；明确 `released:false`、回执被拒、入口无回执退出均返回 `confirmed:false` 并缓存（不得重试语义），**close 超时不缓存**、pending 保留 - 重试可等到迟到的回执诚实确认，且慢而不答的入口进程绝不被顺手销毁（它是 Harness 进程树的唯一管理者）。确认前注册表不动账本、不移所有权、返回 `{released:false, reason}`；确认后才结账。`terminate()` 是崩溃/关停的强制路径：尽力问一次 close、留证，然后无条件收掉入口（stdin EOF → 入口 OS 确认自收）。关停 (`stop_all`) 对未确认通道走强收后按 `server-stop` 记真实终止，绝不冒充 `released`。
- **旧链不变**：`NativeHarnessPort` 的 worker-entry 启动引用保留原样（入口文件已退休，启动即如实失败），不为旧链兜底。

## 6. 包外依赖缺口（报主会话，不在本轮代改）

- **【实测断点，2026-09-24 实施轮】`runtime/worker-entry.mjs` 已被插件整合线移除，且被声明为不再保留兼容层。**
  证据：`plugins/agent-box-harness/REMOVALS.md` §一（worker-entry → `access-entry.mjs` 五件事透明入口）、
  §"需要裁定的两件事" 之 2（明指 `bootstrap/runtime.py:531` 等包外消费者仍指向 worker-entry，
  "**整条产品链目前不可用**，本插件不为它们保留兼容层"）。
  影响：`tests/acp_orchestration/conftest.py` 的导入期断言（`WORKER_ENTRY.is_file()`）与
  `build_runtime_from_native_adapter` 的入口存在性检查（NATIVE_HARNESS_ARTIFACT_MISSING）双双失败，
  **全部通道目标测试无法收集/组装**。本轮 Server 新链自身不依赖 worker-entry（通道 transport 按
  §5 直接 spawn adapter 声明），但恢复该文件属插件线裁定、改钉测试夹具属削弱已审核断言，两者都越权。
  **待主会话裁定**：插件侧恢复/再定位入口，或批准 conftest 与 native 组装检查对齐新入口
  `access-entry.mjs`（其"建立连接不发任何 ACP 帧、原样转发"语义与 §2 一致）。
  **【接线轮已解除，2026-09-24】**：主会话补充指令批准对齐新入口。native 组装的存在性门改钉
  `runtime/access-entry.mjs`（缺失仍 `NATIVE_HARNESS_ARTIFACT_MISSING`），审定 conftest 的导入期
  断言同步改钉 `ACCESS_ENTRY`；新链通道经 §5 的 `AccessEntryTransport` 走插件入口，**不再有任何
  直接 spawn adapter 的旁路，也不恢复 worker-entry**。旧链（`ports` 夹具 → NativeHarnessPort →
  已退休 worker-entry）的失败按 §"旧链诊断不必修绿"处理，见 §8 接线轮归类。
- **Harness 插件透明 transport 入口已存在但尚未与 Server 接线**（`runtime/access-entry.mjs` +
  `access-transport.mjs`）：本轮 Server 侧以自带 transport provider 满足契约；生产插件侧接入是**剩余接缝**。
  **【接线轮已完成，2026-09-24】**：Server 新通道已接到该入口（§5）；插件侧关闭回收仍在插件线修复中
  （不属本单，若其缺陷致红如实记录，见 §8）。
- **前端句柄**：本轮按已审核测试的签名实现；FE 对齐若改命名，仅 §1 与本文件同步。
  **【接线轮复核，无漂移】**：已读 FE 生产实现 `fc-functional/plugins/connectors/acp/src/native.ts`
  与其钉测 `apps/desktop/renderer/agent-acp-wiring.test.ts`（FE 文件只读）。逐项对表一致：hello 需
  `capabilities` 声明 `acp.channel.open/acp.channel.release`（supported:true，本 Server 的 hello 由
  dispatch 表派生，三方法天然在列）+ `nativeExecution {mode:"native", harness, profileId}` 齐全才算
  offered；`acp.channel.open {harnessId, projectId}` → 读 `{connectionId, executionId,
  binding:{harnessId, projectId, cwd}}` 并复核 binding 与请求同对；WS 用 `ws://<origin>/wire/v1/
  acp-channel/<encodeURIComponent(connectionId)>` + `Authorization: Bearer <token>` 头（Node WebSocket，
  不发 Origin 头 → 与 §2 Origin-only 校验相容）；release 视 `NOT_FOUND` 为良性（台账已终结），其余拒绝
  如实上抛；同 pair 幂等重开复用单一 relay 挂接（§2 多挂接是允许上限，FE 自身只挂一条）。**FE 未改
  任何命名，§1 无需变动**。
- `sidecar.py:1328` 的 `permissionRoundTrip/permissionTimeoutMs` 在新通道无语义（超时不是决策）——新链不经过它；旧链保留。

## 7. wire 面簿记（协议变更的一部分）

方法数钉测试 64→67：`test_hello_capability_sync_097.py`、`test_wire_seq_numbering_spaces_128.py`、`test_hello_harnesses_105.py`、`test_wire_drive_coverage_103.py` + 覆盖台账文档与 `scripts/server-round1/wire_drive_coverage.py`、`test_wire_artifact_113.py` + 重生成 `docs/server-round1/fullstack/contract/wire-v1.server-inventory.json`、`test_harness_capability_integration.py`。新三方法的线上驱动证据：`tests/acp_orchestration/test_managed_acp_channel.py`。

## 8. 测试运行证据（2026-09-24 实施轮，如实记录）

- **簿记门**：`test_hello_capability_sync_097 / test_wire_drive_coverage_103 / test_wire_seq_numbering_spaces_128 / test_wire_artifact_113(G1,G2,G3,G5) / test_harness_capability_integration` 全绿；inventory 重生成后 digest `20a9844388b5b241…`，`--check` 通过；驱动账 **67/67 有证据、豁免 0、缺口 0**（证据行合计 394，单源观察名单 43）。
- **受影响回归**：`tests/server` 全量 **1090 passed / 86 failed / 25 errors / 41 skipped**；Workcore 与组合协议 24 通过、capability+根契约 207 通过、`tests/integration` 69 通过。86+25 全部逐节归类为继承态，**本单未引入新失败**；Origin-only 修正后全量重跑，与首轮 **逐条比对 111 个 FAILED/ERROR id 集合完全一致**（0 新增、0 消失）：
  - (a) `worker-entry.mjs` 退休断点（§6）：≥60 节直接报 `FileNotFoundError: .../worker-entry.mjs`、`NATIVE_HARNESS_ARTIFACT_MISSING` 或由其派生的 `SIDECAR_CLOSED` / 队列轮次永不执行（`execution_… is None`）；
  - (b) 宿主准备缺口（先于本单存在）：release/debug Worker 二进制 ABSENT（`*_GATE_WORKER_MISSING`、gate cleanup 的 `KeyError 'run'`），`.venv` 缺 `jsonschema`/`yaml`（105 relock-shape、hermes 链节因此失败）；
  - (c) 旧链诊断在继承态即红：101 扫描命中的 `SERVER_NATIVE_IDENTITY_INVALID` 在 **HEAD 的 handlers.py:597 已存在**（`git show HEAD:` 验证）；`e_inc0` 扫的是本单未触碰的 `execution/sidecar_backend.py`；127 的 md5 偏差在 `dsh-production-chain-gate.py`（本单未改）；118 是新缺失项 `sidecar-entry` 未登记——退休所致。按工单"旧链诊断不再必须修绿、不顺手修"处理；
  - (d) 113 G4 对表 ×2 保持诚实红：`methodsOnlyInServer == [acp.channel.open, acp.channel.release, executions.get]`，待 settings 树 relock（先例："本单不改对方合同，点名交回"）。
- **通道目标测试 `tests/acp_orchestration/`：无法运行**——conftest 导入期 `assert WORKER_ENTRY.is_file()` 失败（§6 断点）。**未跑绿任何一条目标用例，联调未完成**；本单不以此冒充通过。
- **夹具自证（scratch，仓库测试树外，脚本已存 `docs/server-round1/artifacts/channel_selfcheck_002.py`，2026-09-24）**：复制审定 conftest 的生产组合，仅一处如实替代——stub 插件根满足退休 `worker-entry.mjs`/`SOURCE.json` 的**存在性**检查（这些字节在新链上从不被执行：通道 launch provider 直接 spawn `(NODE, PEER)`）。不恢复旧链兜底、不改仓库测试树。用真实 `bidirectional_acp_peer.mjs` 走真实 `build_runtime_from_native_adapter` + `create_app` 全链：**74/74 PASS**（hello 原生身份；open→connectionId+executionId+权威 cwd；外来 harnessId 零启动拒绝；缺/错 bearer 4401；非 loopback Origin 4403；initialize 与 session/new 帧原样中继并由 peer 应答（含扩展字段 `vendorExtensions`）；同 pid 重取不产生第二条运行；在飞账本恰一条 in-flight 行；在飞 run 视图非伪造终态；显式 release 确认 + 账本 `closed/released`；释放后 4400；释放后重开是新运行；detach≠release 运行保持 live；peer 死亡时中继如实关闭且 pre-death chunk 原样到达；异常退出账本 `interrupted` + 真实原因 `ACP_AGENT_EXITED-3`，在飞 prompt 未被伪造应答；**双通道并发**：同一 requestId=7 在两条通道各自应答、内容互不串线，各自权威 cwd 独立；peer 的 JSON-RPC **error 帧原样**中继（`data.vendorDetail` 保留）；`session/update` 的 `_meta` **扩展字段原样**到达；两条通道独立 release、各结各的运行记录；**peer 发起的反向请求**（`session/request_permission`，id=7777，options 含 `grant-*`/`reject-*`）原样到达客户端，客户端应答逆向穿过中继后在飞 prompt 如实收尾（`end_turn`），该通道照常 release；**多轮复用钉**：反向请求通道上再跑两轮 prompt，在飞账本仍恰为 1/1 行（多轮不新增逐轮 execution，通道与进程复用）；**资源归属钉**：全部通道终结、lifespan 停止后 `/proc` 扫描无任何 `bidirectional_acp_peer` 进程存活（release/退出真正释放所属进程资源）。**目标逐条对表补钉（+13，读对端 `HD003_LOG` 逐帧日志，与审定 conftest 同一约定）**：错 bearer 的 open → 401 `UNAUTHENTICATED`+`AUTHENTICATION_REQUIRED`（`:398`）；未打开项目 → `NOT_FOUND/WORKSPACE_NOT_FOUND`（`:410`）；三条拒绝后对端进程集合不变——零启动（两处 "starts nothing"）；建立通道后对端 recv 为空——Server 绝不代做 initialize/session/new/prompt（`:443`）；connectionId 与 native sessionId 分离（`:593`）；advertised 能力字段原样到达（`sessionCapabilities.resume`、`hd003_custom_capability`、`agentInfo.vendorExtensions`，R5 目标契约）；静默/detach 期间对端未收到任何伪造 `session/cancel`（`:605` 后半）；在飞 prompt Server 不应答（观察窗内确无帧），下行 `session/cancel` **通知**原样穿过中继、由对端自己结算为 `cancelled`（"不得伪造应答"正证）；未知 `sessionUpdate` 类型不被过滤（R5）；客户端所选 `optionId` 原样回传对端（对端 `permission-answer` 日志帧可核，非 kind 猜测，`:509`/reverse）；**双通道 twin 前提钉**：`HD003_FORCE_SESSION_ID` 强制两条通道 native sessionId 相同，同 JSON-RPC id 仍各答各的、内容零串线，各自独立 release（`test_dual_connections:26`）；**release 授权与结束钉**：错 bearer 的 release → 401 `UNAUTHENTICATED` 且该通道随后仍完整真实往返（`:670` 拒绝不伤通道）；`peer-start` 日志钉 Agent 于 **open 时刻**即在权威项目 cwd 拉起（进程启动边界不推迟到首帧，`:712` "started the Agent at open time"）；故意留未完成的在飞任务后显式 release → `endReason` 精确等于 `"released"`，且终结窗口内该在飞 id 从未出现任何应答帧（`:737-757` 正向断言："通道运行正常结束"≠"内部任务全部成功"）；**接缝 §2 双挂接钉**（此前唯一无实证的成文承诺）：同一 connectionId 两个并存挂接——一侧发帧、**两侧都收到**应答广播，对端 recv 日志钉 stdin **恰好写一次**（串行不重复），任一挂接所发帧全体挂接可见，双挂接通道 release 一次即终结其唯一运行；**崩溃后复开钉**：异常终结（interrupted）后同一 (harness,project) 对立即重开得**新** connectionId/executionId 且真实完整往返（注册表退出清理不留僵尸占用）；**未知 id 诚实错误钉**：release 未知 connectionId → `NOT_FOUND`（"no live managed channel carries that connectionId"）、`executions.get` 从未存在的 id → `NOT_FOUND/TURN_NOT_FOUND`——绝不被编造成成功应答或虚构记录。**同对并发 open 钉（连接资源归属 race，+8）**：四轮 barrier 同时双发 `acp.channel.open`（同 (pi,project) 对）——两侧结果**完全一致**收敛（同 connectionId/executionId/binding）、在飞账本对该对恰新增一条、观察窗内该对存活 peer 进程恰一、每轮 release 后无残留 race peer。**如实观察**：wire 路由对 `runtime.wire.dispatch` 为事件循环内同步直调（`transport/http/app.py:178`），单个 loop 上两次 open 不可能同时进入 `acquire`——四轮 wire 级 `race-window-hit` 均为 False，注册表 `superseded` 败者分支经 HTTP 面属**不可达防御路径**（此为组合事实陈述，非本单修复项）。故以**双线程直接并发调用生产 `runtime.acp_channels.acquire`**（生产注册表/生产 launch provider/生产账本；launch 回调仅记录返回 transport 的 pid 并加宽窗口，不改任何归属逻辑）实证该分支：前提钉 Popen 真实拉起 **两个 OS 进程**（败者可能在 node 落第一行日志前即被终止，故以 pid 而非日志行为实据）；败者与胜者 `public_result()` 完全一致；两进程恰一存活（败者被终止、无孤儿）；共享账本在飞行仍**恰一条**（败者行以 `superseded` 真实终结、非平行账本）；幸存通道照常 `released` 终结。**整帧原样与精确多轮记账钉（+11，逐条对位目标 `test_managed_acp_channel.py:456-536/:605-623/:707-759/:783-814`，本单已通读该文件全部 814 行，签名敏感面无剩余未映射段）**：对端 `dir=send` 的**每一帧**（含 `session/new` 应答、`session/request_permission` 反向请求、error 帧）在客户端**整帧相等**到达（非子串、非类型换算）；客户端所发每一帧整帧相等、数量一致到达对端（串行 8/8）；同通道先后 5 个 prompt + 1 次反向权限往返 + 2 秒静默——对端进程集合不变、`peer-start` 恰 1 行、`session/new` 恰 1、recv `session/prompt` 恰 5，静默期无任何伪造 `session/cancel`；**twin-options** 双同 kind 选项中客户端精确选 `pick-2-`：对端 `permission-answer` 事件**恰一条**且帧与客户端应答帧**完整相等**；error 帧整帧相等到达（非重建）；SIGKILL 外部击杀 Agent：中继如实关闭（无半开通道）、在飞 prompt 无任何伪造成功应答、运行记录 `interrupted`+真实原因（自杀 exit(3) 之外的独立代码路径钉）。归类说明：`test_channel_passthrough.py`/`test_project_binding.py` 模块 docstring 自我声明为旧链 envelope/`_forward` 诊断（"不作为目标通过标准"），其 R5 目标契约面已由上述原样钉在新链自证；`test_channel_client_selftest`/`test_fixture_selfcheck` 是测试侧客户端与对端夹具的自测，不涉 Server 面。
- **自证抓到的真实缺陷（已修）**：relay 路由照搬 event-stream 的 Host 校验会使被审 `ManagedChannel`（相对 URL，Starlette 1.7 WS 缺省 Host 为 `testserver`）全部正例 accept 前 4403。审定契约只钉 Origin→4403，故 `app.py` 的 `/wire/v1/acp-channel` admission 改为 Origin-only（Bearer+connectionId 校验不变；event-stream 路由未动）。此缺陷在仓库测试树被 §6 断点挡住期间不可能被测出——这正是自证存在的意义。
- **静态对表（套件被挡期间的签名敏感面全量核对）**：审定测试资产的每一处签名敏感点与实现逐一对照——`acp.channel.open`/`acp.channel.release`/`executions.get` 方法名与参数形状、`connectionId`/`executionId`/`binding.cwd` 字段拼写、WS 路径 `/wire/v1/acp-channel/{connectionId}`、终态词表 `closed`/`interrupted`+`endReason`、`"released"` 精确串、在飞账本行键 `executionId`、peer 日志命名 `<base>.<pid>.<peerId>` 与 `peer-start.cwd` 进程启动边界——全部一致；其中多数现已被 74 项自证正向跑绿。**发现新契约矛盾（点名交回，主会话裁定项⑥）**：`test_managed_acp_channel.py:280`（`open_session` 内）断言 `agentInfo.vendor == "hd003"`，而审定夹具 `fixtures/bidirectional_acp_peer.mjs:64` 的 `agentInfo` 只有 `name:"hd003-peer"`、`version`、`vendorExtensions:{hd003:true}`，**无 `vendor` 字段**——两份审定测试资产互相矛盾。原样中继不可能诚实满足该断言（Server 造字段恰恰违反透传契约；本单不代改测试与夹具）。`open_session` 被 11 处调用，断点解除后这些用例会全部卡在这一行，须先裁定：修夹具一行（`agentInfo` 加 `vendor:"hd003"`）或改断言为 `name`/`vendorExtensions`。
- **Harness 新入口复核（2026-09-24 第九轮，只读，无漂移）**：`runtime/access-entry.mjs` 五件事语义（establish 不发任何 ACP 帧、逐行原样双向转发含 peer 自发起请求与 error 帧、close 须 OS 确认 pid 死亡才报 `released`、一进程一连接、`permissionRoundTrip`/旧信封明确缺席）与 §2/§5 所述逐项一致；Server 侧 `transport.terminate()` 为 terminate→wait→kill→wait 的确认式终结（`transport.py:73-93`），与入口"OS has stopped answering for that pid"语义同向；入口"一进程一连接"约束与 §2 多挂接不冲突（多挂接是同通道的多个 WS 挂接，stdin 串行恰写一次已由自证钉）。生产侧未接线现状不变（主会话裁定项③）。**→ 该项已被下文接线轮完成，此处保留为历史。**

## 9. 接线轮正式证据（2026-09-24 第二轮，主会话补充指令授权）

- **新链已按 §5 接上插件 `access-entry.mjs`**（`src/agent_box/server/acp_channel/access_entry.py`，组装点唯一改动 `bootstrap/runtime.py` 的 `launch_channel_transport`；`AcpChannelRegistry`/WS 路由/handlers 未动）。worker-entry 未恢复、直接 spawn 旁路已删除。
- **正式目标套件首跑即钉链**（本仓库内此前因 §6 断点**从未可运行**）：`tests/acp_orchestration/test_managed_acp_channel.py` **16/16 绿**，`SKIPPED_TOTAL=0`，无 xfail。
- **经批准的审定测试资产修正（仅此两处，全部行为断言保留）**：① conftest 导入期与组装门改钉 `ACCESS_ENTRY`（`worker-entry` 引用退休失效）；② `open_session` 的 `agentInfo.vendor` 断言（§8 裁定项⑥资产互矛盾）改为**精确等值比较对端实际发出的 `agentInfo`**（`PEER_AGENT_INFO`，与 `fixtures/bidirectional_acp_peer.mjs:64` 逐字段相等）——透传契约下 Server 不造字段，等值比较是"initialize 结果原样到达"的最强可表达形式。另在两处 pid 读数前加**有界 `wait_until`**（`connect` 于进程 spawn 时即应答，对端首行日志晚于 node 启动 ~100ms；此为证据可见性等待，非断言削弱，晚到/缺席仍红）。
- **目录全量 `tests/acp_orchestration/`：35 passed / 18 failed / 0 skipped**（含夹具自证与客户端自测全绿）。18 红**全部为旧链诊断**，根因同一：`worker-entry.mjs` 在 HEAD 与磁盘均不存在（插件退休，REMOVALS.md；本单不恢复、不兜底）——经 `ports` 夹具（NativeHarnessPort→`SIDECAR_CLOSED`）14 节：passthrough×8、disconnect_and_release×3、reverse_request×3；经旧聊天信封逐轮 `server.settled`（轮态 `failed`）4 节：dual_connections×1、project_binding×2、access_authorization×1。按"旧链不必修绿"如实记录。
- **受影响回归 `tests/server` 逐 id 对表**：接线后全量 **1095 passed / 81 failed / 25 errors / 41 skipped**；与本单 src 改动前基线（1090P/86F/25E/41S，111 个 FAILED/ERROR id）**逐条比对：0 新增、106 条继承红 id 集合完全一致、5 条转绿**——均为 `test_native_bootstrap_identity_hd002.py` 中被旧组装门（`NATIVE_HARNESS_ARTIFACT_MISSING`，worker-entry 缺失）挡住的用例，组装对齐 `access-entry` 后诚实通过（目标复跑 6/7，余 1 条 `test_native_first_send_completes_with_reviewed_fake_acp_peer` 为继承态旧链轮次红，仍在 106 集合内）。
- **如实记录的语义差（旁路→入口链）**：`transport.pid` 现为**入口进程** pid（Harness pid 由入口持有并经 `close` 回执报告）；异常退出 endReason 从 `ACP_AGENT_EXITED-<退出码>` 变为 `ACP_AGENT_EXITED-<原因串>`（如 `adapter_exit`；`closed/interrupted` 词表与台账状态不变，release 路径 endReason 仍精确 `"released"`，因 terminate 先行吞掉 `closed_by_caller` 事件）；对端**非 JSON 的坏行**不再原样中继给 WS 客户端（入口判为 `transport_malformed` 控制面事件，桥保留证据不中继）——JSON-RPC 帧（含 error/通知/扩展字段）仍字节原样。
- **插件关闭回收现状**：其修复在插件线进行中；本仓库全部 release/崩溃路径对受控对端已跑绿（含 `released` 精确 endReason 与 OS 回收断言），暂未记录到由其缺陷导致的红；若复跑出现（如 `release_report.released:false`），按指令点名记录、不代改。
- **前端接缝**：见 §6 第三条接线轮复核——FE 生产实现与钉测逐项一致，§1/§2 无需改名。
- **剩余接缝（未完成联调，如实报告）**：真实 Harness 品牌的生产组装（入口 provenance 校验 + 真实 adapter 命令 + 凭据环境）在本链上仅以受控对端验证过，不属本单授权范围；113 G4 settings 树 relock ×2、宿主准备缺口（worker 二进制 ABSENT、`.venv` 缺 jsonschema/yaml）维持 §8 归类不变。

## 10. 释放结果传播整改轮（2026-09-24 第三轮，主会话整改令）

- **缺陷（主会话复现）**：入口对 `close` 回执 `released:false` 时，旧实现仍把释放报成成功——transport 层 `terminate()` 只存 `release_report` 不判定，且无条件销毁入口、烧掉重试；registry 层 `release()` 在触到 transport **之前**就移除所有权、结清账本并固定返回 `released:true`。
- **整改（两层各归其位，§1/§3/§5 已同步）**：`AccessEntryTransport.request_release()` 成为客户端释放的唯一口径——成功声称只认入口 OS 确认回执（`ok:true ∧ released:true`）；明确 false/被拒/无回执退出为缓存的诚实失败，close 超时**不缓存且保留 pending**（迟到的回执可经重试确认），未确认时绝不销毁入口（Harness 进程树的唯一管理者）；`terminate()` 收缩为崩溃/关停强制路径。`AcpChannelRegistry.release()` 改为**先证后销**：确认前所有权记录与运行记录分毫不动、wire 如实返回 `{released:false, …, reason}`；确认后才在锁内 claim-pop，恰好一次的 `finish_cancelled(terminal_reason)`；晚到者得 NOT_FOUND。`stop_all` 对未确认通道走强收后按 `server-stop` 记真实终止，不冒充 `released`。handlers 未改（registry 结论原样透传）。
- **反例钉测（3 项，注入风格与主会话复现一致：包裹活 transport、仅脚本化 request_release，脚本用尽即委托真实链路）**：① `test_a_refused_release_never_becomes_a_success_answer`——插件明确 false：wire `released:false`+reason、账本无终态无 endReason、运行仍在飞、入口未被销毁（通道仍可真实 prompt 往返）、同 pair 重取得仍同 connectionId、重试至真实确认后 `released:true` + closed/`released` 单次结账、第三次 NOT_FOUND；② `test_an_unanswered_close_is_not_release_success_and_retry_confirms`——close 超时按失败返回、账本不动，重试第一次把 close 真正问出口并诚实确认（含 OS 回收后 pid 消亡断言）；③ `test_concurrent_releases_settle_the_run_record_exactly_once`——双线程 barrier 同放，`end_run_released` 计数包装**恰好一次**，各自应答至多为真实确认或 NOT_FOUND，绝无重复结账。
- **正式复跑**：`test_managed_acp_channel.py` **19/19 绿（16 原有 + 3 反例），0 skip**；`tests/acp_orchestration/` 全量 **38 passed / 18 failed / 0 skipped**（18 红仍全部为 §9 归类的旧链 worker-entry 诊断，行为与整改前一致）；`tests/server` 全量逐 id 对表 **0 新增红、106 继承红集合一致、5 转绿**（与接线轮同一批），本轮两层改动未波及其他。
- **未做的事（守令）**：未动插件任何文件（`access-entry.mjs` 只读引用其回执语义）；"入口进程已退出"未被用作"Harness 已回收"的证明——`entry-exited-without-receipt` 明确归为未确认失败；未扩其他范围。

## 11. 释放整改第二落点（2026-09-24，主会话第二次复现令）

- **缺陷 1（真实重试被缓存烧掉）**：`request_release` 把失败回执与成功同样缓存，主会话实测第二次不再向入口发 close。整改：**只缓存确认成功**（`_release_confirmed`）；明确失败（false/被拒/无回执）不落缓存，下一次显式重试把**新的 close** 真正问出口；close 超时仍保留原 pending（重试等待同一个请求，迟到回执可确认，绝不叠发第二个 close）。§10 的注册表先证后销语义不变。
- **真实路径钉测（不替换被测方法）**：`tests/acp_orchestration/fixtures/fake_access_entry.mjs`（仅 tests/ 资产的受控假入口，插件未动）+ `tests/acp_orchestration/test_release_retry_honesty.py` 直接驱动生产 `AccessEntryTransport.request_release`：① false→重试**实发第二个 close**（入口侧计数证据）→true→第三次不再询问（成功缓存）；② 超时→重试等待原 pending，close 计数恒为 1，迟到回执诚实确认。
- **缺陷 2（前端把失败形状当成功）**：后端未确认释放是**成功 RPC 携带** `{released:false, …, reason}`，FE `native.ts` 旧代码只 `await rpc` 不查返回值、且在调用前就销毁 relay。整改（主会话明令同步前端）：relay 销毁移至**确认之后**；`released !== true` 抛出携带后端原因的失败，进入既有失败诊断（`releaseFailures`/`retryReleases`）与重试流程；NOT_FOUND 宽容路径不变。跨层受控测试补在 `apps/desktop/renderer/agent-acp-wiring.test.ts`：fake 以**与后端逐字段同形**的 `released:false` 应答 → 主机只见 typed diagnostic、通道双侧存活 → 重试得 `released:true` 才清账（FE 套件 10/10，含新增 1 项；原主链路一处"确认后关 relay"的时序即时断言改为有界轮询，断言强度不变）。

