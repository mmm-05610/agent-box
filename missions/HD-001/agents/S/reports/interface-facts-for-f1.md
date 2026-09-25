# S → F1 接口事实表（HD-001 Phase 0，S 侧初稿）

- base_sha: BE 92a2d2ba66fc59b4d2e89bf0cea661ff3d7c0f6f（worktrees/harness-desktop-001/s，实测 clean）
- 证据：本会话亲读下列文件（行号=该 SHA 实测）；引用者免重复核验，但结论冲突时以源码为准。
- owner_generation: 2 · 作者 S（Qoder+Qwen3.8-Flash）· 待与 F1"连接服务事实表"联署成接缝事实表（CC BC/FC）。
- **勘误（2026-09-23，S gen2 续接会话复核实测）**：wire 方法数为 **64**（`wire/handlers.py:443-509` `_handlers` 登记逐项计数），初稿"60"系计数口径遗漏；F1-0005/F1-0007 所记 64 为正确值。其余行号引用经复核成立。
- **补核（承 E-0004/E-0005，本会话实测入表）**：① 服务端 active 闸对"待审批"无漏判——`ACTIVE_TURN_STATES=("accepted","dispatching","running","capturing")`（`service/sessions/repository.py:22`），全 src 无 `awaiting*` 状态写入（grep 零命中），待审批期间 Turn 仍 `running` 必在闸内；② 但 wire 投影把 `capturing` 并入 `running`（`projection.py:79`）、live wire 态= `{queued,dispatched,running}`（`projection.py:73`），**FE 不能靠 execution.state 区分"运行中/待审批"**，预测层须扫描未 settled 的 approval 交互（含全部 runs+interactions，不只末 run）——该口径 F1-0005 §3 闸谓词已含，正式采纳；③ wire 事件流无"仅存末 run"截断：真相=逐 session 持久 `raw_events` + `history.snapshot` 分页（§8），末 run 问题只在 FE AgentSnapshot 侧（F1 域）。跨 Harness 全局"有无活 run"若需单一信号，由 S 在 facade 只读聚合（C-0024 分工登记；新增方法=契约变更须回 C，未批不实施）。

## 0. 形态总览

- 后端=独立 loopback HTTP Server（FastAPI/uvicorn，单 worker 不变量，无多 worker 开关）`server/__main__.py:41-59`。产品 pyproject name=pacthold；对外协议自名 **wire/1**（JSON-RPC 2.0 形），非 ACP。
- 双入口共存于同一 service：REST `/api/v1/*`（旧兼容面）与 `/wire/v1/{method}`（**64 个方法**（勘误，见页首），`wire/handlers.py:443-509`）。**建议新前端一律走 wire 面 + WS 事件流**；REST 面不再扩张。**键形两族不混（BC-0015 实测，S 双轮复核全中）**：REST 面请求/响应键=snake_case（`session_id/workspace_id/profile_id`，被 `tests/server/test_stage_a_server.py:120-125` 钉死；GET 回读即 `SELECT *` 列名 `repository.py:1135`），wire 面=session_record camel 投影（`projection.py:180-185`）——跨族取键必 KeyError。
- 文件地图（S 域）：`service/facade.py`（ProductService 门面，MB-S2a 已闭）、`service/sessions/{service,repository,queue}.py`（MB-S2c1 已闭，`server/sessions/*` 为 6 行同对象 shim）、`server/wire/*`（wire 方法表/投影/信封/错误）。旧 **S2c2（wire 物理包抽离 13 路径）批文已发未交付**，本基线 wire 仍在 `server/wire/`——不假设已合（旧账 `control/reports/BE-LOOP-001/goal/task-board.md:25` + approvals/MB-S2c2）。

## 1. 连接（发现/认证/存活）

| 事实 | 证据 |
|---|---|
| 启动参数全量（92a2d2ba 实测 `__main__.py:9-25`）：`--data-root R`（必填）、`--port N`（默认 8732，host 固定 127.0.0.1）、`--sidecar-deployment D.json`（非秘密 harness 侧车部署文档）、`--plugin-root P`（部署文档 plugin-relative 源的机器本地根）、`--mount TOKEN=PATH`（可重复；挂载 token→本机路径，文档本身不带宿主路径）；**配对硬规则：`--sidecar-deployment` 缺 `--plugin-root` 启动即拒（:49-51）**；**无 `--worker` 旗标**（worker 路径属门脚本/env 传输面，BC-0009 勘误）；端口无自动分配，发现需要 data-root+port 两输入 | `server/__main__.py:9-25,49-51,59` |
| Bearer token 每实例一份：`<data-root>/secrets/http-token`（≥32 字符，自动创建，0600 保护），host 从受保护 bootstrap 文件读取 | `bootstrap/runtime.py:101-121`、`wire` 路由注释 `server/transport/http/app.py:152-156` |
| 所有 wire 方法（含 `server.hello`）都要认证；`GET /live` 免认证存活位 | `app.py:144-162` |
| Host/Origin 仅允许 127.0.0.1/localhost/[::1]，否则 403 LOOPBACK_POLICY_REJECTED（app.py:66,90）；**WS 通道同闸、以 close code 4403 拒绝**（app.py:364，S 续接轮补核 92a2d2ba）——F1 重连逻辑须把 4403 与网络断分治（4403=策略拒，重试无益） | `app.py:64-66,83-90,364` |
| `server.hello` 返回 `{serverId, protocolVersion:"wire/1", capabilities[], auth, harnesses[]}`；capabilities **由 dispatch 表自动派生**（手维护表曾落后 37 方法），supported=false 带 reason | `handlers.py:544-619` |
| serverId 每 data-root 稳定、跨重启复用 → 客户端可辨"同一 Server 回来了"vs"换了 Server" | `runtime.py:264-279` |
| `GET /api/v1/readiness`：blockers + `capabilities.execution` + 每 harness `{available, capability_claims, credential_registered, unavailable_reason?}`；available=execution 端口已装配 AND 凭证已登记 | `service/facade.py:46-77` |
| 事件通道两条：SSE `GET /api/v1/sessions/{id}/events?after=seq`（进程内 Condition 唤醒+keepalive）与 WS `/wire/v1/event-stream?sessionId&cursor`（EventFrame JSON） | `app.py:328-405` |

## 2. Harness 上下文（不解析品牌）

- `HarnessRegistry` 由 bootstrap 注册；descriptor 字段：`harness_type, credential_kind, model_control_id, credential_environment, configuration_validator, capability_claims(canonical 静态上限), control_options, security_locked_controls, wire_protocols(canonical→native 方言,未声明≠不兼容)` — `server/execution/__init__.py:58-128`。
- `server.hello.harnesses` 只发布 `{id, credentialKind?, modelControlId?}`（部署事实，非记录派生）— `handlers.py:567-582`。
- 投影层注释钉死"不在此解释任何 Harness 品牌；harness 作为不透明数据字段传递"— `wire/projection.py:14`。
- Session→Profile→Harness 绑定：send 时 profile 不同 → 409 CAPABILITY_UNSUPPORTED "switch the role first" — `service/sessions/repository.py:182-189`。

## 3. 项目/目录（工作区）

- environment kinds：`{local, wsl, ssh}` — `server/workspaces/service.py:105`；REST `connections/probe` 仅 wsl（`app.py:275-278`），wire 面 `workspaces.browse/open` 带 environment 参数。
- `workspace_record`：`{id, version, displayName, normalizedPath, environment{kind,host,user}, accessibility{readable,writable,executableForRole:null=unknown,reasons[]}, connection{state: connected|connecting}, archivedAt, createdAt, updatedAt}`；connected 仅当 connection_state==verified（`projection.py:103`；readable/writable 同门 `:117-121`，未验证附 `connection_state_unverified` reason），断连如实，不伪造 — `projection.py:91-124`。
- 重启后全部 workspace 标记 unverified（`runtime.py:241 mark_workspaces_unverified`）→ connection 回到 connecting，需重新验证。
- `workspaces.gitStatus` 经 connector 固定命令应答 — `handlers.py:1429`。分环境实情（同函数 docstring）：local 固定 porcelain、wsl 经 connector 固定命令；**ssh 尚未接线，应答 typed unavailable reason、六字段保持 null 不猜测、应答中不含任何路径**。FE 对 ssh 工作区的 gitStatus 需按 unavailable 呈现。

## 4. 会话（列表/创建/多轮）

- `sessions.list{includeArchived, page{cursor,limit≤500}} → {items[session_record], nextCursor}`（目录作用域 HMAC cursor）— `handlers.py:1937-1971`。
- `sessions.createAndSend{requestId, workspaceId, profileId, message, overrides}`：一个事务内建 Session+接受意图+（无活动执行时）插入 Turn 并 dispatch；返回 `{outcome:accepted, session, executionId, configVersion}`；配置校验先于接受，被拒不留残痕 — `handlers.py:2017-2059`、`service/sessions/repository.py:131-253`。
- `sessions.send{requestId, sessionId, message, overrides}`：活动 turn 存在 → 自动入队 `{queued:true, queueItemId}`；`queue.get/queue.withdraw`（withdraw 有 withdrawn|too_late）— `handlers.py:2061-2148`。
- 幂等：requestId+digest 重放返回原回执、绝不二次 dispatch — `service/sessions/repository.py:148-152`、`service/sessions/service.py:58-77`；`sendOutcome.query{requestId}` 查意图结果 — `handlers.py:2112-2114`。
- `sessions.update`（displayName/pinned/workspaceId）、`sessions.archive`、`sessions.switchProfile` — `handlers.py:1973-2110`。
- **切换不等于取消/运行禁切换的服务事实已存在**：`switch_profile` 有活动 turn → `outcome:rejected, reason:"execution_running"` 并回真实旧 session；跨 harness 家族 → 409 PROFILE_HARNESS_MISMATCH（跨家族=新 Session 的 clone 规则）；目标 profile 忙 → TURN_CONCURRENCY_CONFLICT；共享库守卫 fail-closed — `service/sessions/repository.py:296-385`。待审批期间 turn 仍 live → 同样被拒。

## 5. 流式（事件帧词汇表）

- WIRE_EVENT_KINDS 13 种：`message.delta, message.final, usage.updated, thought.delta, plan.updated, mode.updated, tool.update, approval.requested, approval.settled, config.changed, execution.state, queue.updated, workspace.connection( reserved·无生产者)` — `projection.py:24-49`。
- EventFrame：`{eventId, sessionId, seq, cursor, emittedAt, event}`；**cursor 恒按 `raw_seq` 编码**（`codec.encode(session_id, raw_seq)`，`projection.py:222-228`——即使 `seq` 展示值回退 wire_seq，cursor 仍指持久 seq）；cursor=HMAC 签名不透明（跨会话伪造不可能；`w1o` 旧史 cursor 不能 resume live；换代→resync）— `projection.py:213-231`、`wire/envelope.py:59-114`。
- 执行状态机投影：内部 `accepted/dispatching/running/capturing/completed/failed/cancelled/unknown` → wire `queued/dispatched/running/completed/failed/stopped/unknown` + `stopping`（stop 已请求且仍 live）— `projection.py:73-84,197-254`。**"被请求停止/正在停/已停"三事实分离**是契约要求 — `projection.py:238-244`，判据原文：`cancel_requested ∧ state∈{queued,dispatched,running}` 才转 `stopping`；**终态执行收到迟到 cancel 保持终态不回退**（FE 不会见 completed→stopping）。reserved 事件 kind 有门钉：`tests/server/test_workspace_connection_reserved_145.py`（出现即红+手工写行反证管道活）。
- tool.update 携带 `{toolCallId, messageId, tool, state, summary?, resultExcerpt?}`；thought.delta 仅在服务确实提供时出现（思考如实=事件面天然满足）。

## 6. 交互（审批/输入响应）

- `approval.requested` 帧六字段**挂在 `event.approval` 键下**（非内联）：`{approvalId, sessionId, executionId, version, operation{title, detail[], tool?}, expiresAt}`；operation 缺省时由 request 现场兜底组装（title→request.title/tool/"Approval required"，detail=标量键值对）— `projection.py:308-336`。`approval.settled → outcome: allowed|denied|expired|invalidated`（**未知 decision 一律投影为 invalidated**，不猜）— `projection.py:337-346`。
- `approvals.decide{requestId, approvalId, expectedVersion, decision: allow|deny, scope: once|bounded{until:"session_end", environmentId?}}`：同事务先落权威决定（首决定获胜；重复=already_recorded；矛盾=拒；执行已终态=invalidated），后 `execution.decide_approval` — 传输失败可致执行失败但**永远不会执行未记录的决定** — `handlers.py:2180-2210`、`server/approvals/records.py:70-132`。

## 7. 停止

- `runs.stop{requestId, sessionId, executionId}` → `already_finished | stop_requested | unconfirmed(reason: STOP_NOT_CONFIRMED | EXECUTION_CAPABILITY_UNAVAILABLE)`；"没确认停下就不说 stopped" — `handlers.py:2152-2178`。
- 停止级联委派子 turn（父停带走活着的子孙，递归有界）— `service/sessions/service.py:292-307`。
- CancelOutcome 三态 `confirmed_stopped / refused_no_active_run / unknown` 永不互压 — `execution/contracts.py:23-30`；`TurnExecutionPort = accept/submit/cancel_execution/observe_execution`（实现在 E 域 sidecar，S 只依赖契约）— `execution/contracts.py:140-153`。

## 8. 恢复（断连/重启）

- `history.snapshot{sessionId, cursor(live-resume) XOR page.cursor(older), page.limit}` → `{outcome:snapshot, frames[], resumeCursor, olderCursor?}`；游标越界 → `resync_required`（不静默丢事件）；初始/回翻在**同一 SQLite 快照**里 join head，关闭订阅窗口 — `handlers.py:2214-2265`。
- 事件真相=持久表；WS 断线按 cursor 续读 `raw_events` — `handlers.py:2267-2282`。
- Server 重启：活动 turn 封为 `unknown + SERVER_RESTART_INTERRUPTED`，session→`recovery_required`，profile→`recovery_pending`（其 send 被 409 PROFILE_RECOVERY_REQUIRED 拒绝，直到人工/恢复结算）——**永不盲目重派** — `service/sessions/repository.py:652-683`、`runtime.py:242`、`projection.py:156-160`。
- 取消收尾保留 native checkpoint 引用（有审计则续用同一原生会话，无审计列保持原样=诚实的"未观测"）— `service/sessions/repository.py:1012-1058`。

## 9. 可复用入口（F1/F2/F3 直接可用，零新增）

1. 连接状态：`server.hello`+`readiness`+`workspaces.list` 轮询；WS/SSE 每会话事件流。
2. 二级选择 Harness：`server.hello.harnesses`（部署事实）+ readiness per-harness available（凭证登记与否）——**能力缺失已有不伪造语义**。
3. 会话列表/历史：`sessions.list` / `history.snapshot` 分页。
4. 运行/待审批判定（切换禁令的服务事实）：会话有无 live turn（history 尾帧 execution.state / queue.get）。
5. 审批 UI：`approval.requested/settled` + `approvals.decide`。
6. 停止：`runs.stop` 三态答案直接映射"确认/unknown 如实显示"。
7. 断连恢复：cursor + `resync_required` 协议。

## 10. 最小缺口（须裁决/确有不足）

- G1 `workspace.connection` 事件**预留无生产者**（结构性：事件表按 session 绑定，会话级流载不了无会话事实）；连接区状态目前只能轮询。合同层裁决已在旧账挂账 — `projection.py:40-49`。
- G2 Server 发现要 data-root+port 两输入且无端口握手文件；Electron 侧 spawn/attach 约定需契约（不改 wire 语义的最小方案归 C 裁决）。
- G3 `credential_registered` 只在 REST readiness，`server.hello` 不携带 → 客户端需两源合拼（可接受，或统一进 hello，须契约决定）。
- G4 "会话是否运行/待审批"无单一即时 wire 查询方法（可从持久事实推出）；若 F1/F2 需要服务端权威快照方法，属新增契约→回 C。
- G5 Profile/Model/Provider 面巨大（profiles.*/providerModels.*/config.*）且**本轮章程冻结**：前端隐藏入口即可，后端零新增零迁移（CHARTER「不做」）。
- G6 REST/wire 双入口长期并存的一致性靠同对象 shim 维持；S2c2 未合不引入（BC 只读查证）。
- G7 `runs[].stoppable` 契约扩展候选（FC-0013 §1 已入 Phase 2 契约清单候 C）**服务端现状预研**（base 92a2d2ba 实测，仅备裁决输入、非实施承诺）：① wire 面现**无任何 stoppable/cancel_supported 字段**（handlers/projection 全文 grep 零命中）；② 服务端已持有的可停止性事实只有两条门：turn 态是否终态（`runs_stop` 前置判定 handlers.py:2156-2165）与执行端口是否装配（`self.execution is None → EXECUTION_CAPABILITY_UNAVAILABLE` handlers.py:2166，同一事实在能力门 handlers.py:609-612）；③ **无"该 Harness 原生是否可取消"的服务端声明**——三态答案只在调用时产生（STOP_NOT_CONFIRMED 只在 stop 后出现），故服务端此刻写不出诚实的 per-run 静态 stoppable=true/false；④ 若要派生字段，`executions.list` 已有先例钩子：inventory.list_executions 接收 execution_port 并按运行查 `pid_for`（inventory.py:40,71），同形状可派生 `非终态 AND 端口装配` 的保守谓词——但这仍是**调用时事实的快照化**，语义须 C 定（true=可停 还是 true=可尝试停）。
- G8 Phase 2 契约清单另两项预核（base 92a2d2ba 实测，备 C-012 契约批）：**`AgentSessionInfo+workspaceId?/pinned?` 与 `newSession workspace 形参`均为 FE 侧镜像既有 wire 事实，零 BE 改动**——`session_record` 已发 `workspaceId`（projection.py:184）与 `pinned`（:187），`sessions.createAndSend` 已收 `workspaceId` 形参（handlers.py:2017-2059，见 §4）。S 对该两项无契约动作。

## 11. 纪律登记

- 不预设对外协议、不强造新协议（PLAN）：本表证明 wire/1 已覆盖章程闭环场景，S 侧无新协议提案。
- 本表全部离线源码事实；零真实调用、零密钥读取、零预算消费。
- **核验脚注（2026-09-23，CP1 预候整备自查轮）**：§1-§10 全部行号引用已在 base 92a2d2ba 逐条亲核闭环（过程账见 reuse.md 补录三~十）；累计三处精确化、一处新实情（gitStatus ssh 未接线）、一处勘误（裸 `repository.py:` 已消歧为 `service/sessions/repository.py`×6）。本表可作 wire/1 权威接口清单供集成 checkpoint 与 BC/F 系列引用；若基线前进，行号须重钉。
- **转正注记（2026-09-23 01:41，C-0040/HD-001-C-017）**：wire/1 已于 B-HARNESS-PI-001 checkpoint 正式转正（checkpoint.json `contract_version_formalized` 实测在盘）。PI 批差量（h 树 67049283）零触碰 server/wire 面，本表全部行号在 contract 意义上继续有效；executor 分支并入集成树时基线号将前进，届时按上条重钉。**〔后注 09-23 08:25 实测〕**集成基线已两度前进至 `60d868ef`（pi+codex 两批 FF 合入）；S 亲核两批差量对 `server/**` 零触碰（grep 0 命中，harnesses.toml 改动行全为注释）⇒ **本表全部 wire 面行号跨基线存活，无需重钉**；引用者注意 harness 脚本面新增 codex 同构件（不影响本表任何行）。
