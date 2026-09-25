# FE→BE backend-connected adapter 最小接缝（只读预案，HD002-2）

> 历史预案，仅其已核 wire/host 事实可复用。I-SESSION-FIRST-SEND-001 撤销 REST 纯建前置，I-PROJECT-REQUIRED-001 撤销独立目录与无项目默认工作区分支；当前 CP 范围及 FE 现态以 FC-0018、FC-0019 为准。不要据本报告旧顺序派工。

坐标：FE 候选 `8c676d20e2`（未发布 baseline2）；BE `60d868ef25`，依 C-0008/C-0009。此件是下一包输入，不是实施批文；未改执行者树、未读密钥或发请求。

## 当前链与真实缺口

FE 产品清单只启用 `ordessa.agent-codex`/`ordessa.agent-pi` 直接原生连接器；各自 `entry.ts` 把 `window.agentNative` 交给 `Client.connect`，`platform/native-bridge` 依 manifest 的 `native.js` 开一个受限实例。Pi native 从固定 `ORDESSA_AGENT_CWD` 起 RPC，Codex native 在固定 cwd 起 app-server，当前没有可接收 Server `workspaceId` 的 FE connector，也没有 Server URL/token/bootstrap 的产品入口。FE `AgentClient.newSession()` 无 target；F2 的可选 `workspaceId` 目前只是列表投影字段，不是执行 cwd 证据。

BE `POST /wire/v1/{method}` 与 `/wire/v1/event-stream` 均要求 Server 的 bearer token；其文件由 Server data-root 下 `secrets/http-token` 持有，不能传入 renderer、报告或产品配置。事件流按 `sessionId`+cursor；`history.snapshot` 回 frames/resumeCursor，websocket 后续帧是权威增量。当前 `window.agentNative` 是实例 IPC 传输，可考虑新增独立 backend connector/native transport 复用同一受限桥，而不让 renderer 持令牌；但 **Server 地址发现、token 取得授权、进程生命周期/连接选择** 尚无已批准 FE 契约，不能直接施工。

BE 最小业务面：`workspaces.list/browse/open` 返回经 Server 验证的 `{id,normalizedPath,environment,...}`；C-0008 的独立目录分配端点待 S/BC 实施并定正式方法名。`profiles.list` 返回普通 Profile 的 `harness` 与 `sendability.state`（`ready|blocked|unknown`）；C-0009 要求只消费与已选 Harness 匹配且真实 ready 的现有 ID，无 ready 则不可发送。`sessions.list` 投 `workspaceId`；`sessions.createAndSend` 必填真实 `workspaceId+profileId+message+overrides` 且立即派发，`sessions.send` 沿现有会话身份；纯建空会话目前只有兼容 REST `POST /api/v1/sessions`，wire 尚无同义方法。事件 `message.delta/final`、`execution.state`、`thought.delta`、`tool.update`、`approval.requested/settled` 等由 history+stream 投影；需给 FE 的 AgentSnapshot 严格状态映射（服务端 `queued/dispatched/running/stopping/stopped` 与 FE `starting/running/stop-requested/cancelled` 并非字符串同义）。`runs.stop`、`approvals.decide` 是已见的交互请求；通用 Pi input/editor 不可从这两个方法臆造可用。

## 拟定最小单写包顺序（待正式批准）

1. **BC/S**：依 C-0008 实施 Server 独立 workspace 分配，BC 发布正式 wire 方法/响应/反例与 backend SHA；同时明确普通 Profile 已就绪的测试环境路径（C-0009），不暴露令牌。没有这两项，FE 只能离线夹具测试。
2. **FC 指定 F1 connector 单写**：独立 `plugins/connectors/<backend>/**` 新插件与其自含测试；接入现有 `AgentConnections`，连接身份固定到某一 Server/Harness，令项目/独立入口用同一 Server workspaceId。新增 transport 必须在 Electron main/native 侧认证，需 **F0 单写** `apps/desktop/electron/preload.ts`/`platform/native-bridge/**` 或复用现有 bridge 的明确安全裁定；不能让 F1 偷改。产品启用项 `products/agent-desktop/extensions.json`/lock 由 FC 集成点单写。
3. **FC 指定 F2 session UI 单写**：项目选择用 `workspaces.list/browse/open` 的权威记录；独立入口用新分配端点；新建/发送需显式 target id 与 ready Profile id，恢复已有会话不重套 Profile。若改 `contracts/agent/src/agent.ts` 的 `AgentClient.newSession(target)`，由 FC 划唯一写者并说明直接原生连接器如何处理不支持 target；不能把 ID 当 cwd。`plugins/agent/sessions/**` 与 renderer 会话测试归 F2，`plugins/agent/conversation/**` 的共享段需 FC/F3 顺序裁定。
4. **FC 集成**：先离线端到端（假 Server 协议与真实本地 Server 可不发模型请求的 `workspaces/profiles/sessions.list`），后依预算单一真实流申请；核 session.workspaceId 与 Server workspace.normalizedPath/执行 cwd 事实一致、断线 cursor 恢复无重复、审批/停止语义忠于事件与 API，且未安装 Profile 独立插件。

## 需先冻结的契约问题

- Server 连接地址/token 怎样由授权本地桌面进程取得且不进入 renderer？是否复用既有 native bridge 或新建只读服务配置？没有来源就不能把 HTTP URL 写死或扫描 data-root。
- wire 是否新增纯 `sessions.create` 承接“先建空会话后发送”，还是审准兼容 REST；两者均要真实 ready Profile。FE 现 `newSession()` 立即创建空会话，直接映射 `createAndSend` 会改变用户行为。
- BE `approvals.decide` 仅审批语义；Pi 的 input/editor/choice 如何经 Server wire 表达与回送？若当前无通路，FE 要明确标注不可用并先报 BC。
- backend connector 选中一个 Harness/普通 Profile 的最小身份模型与切换闸（活动 run/待交互禁止），以及 `profiles.list` 变化后的 ready 失效规则；不把 Profile 管理 UI 搬入主线。

反例门：给 backend `workspaceId` 却仍由原生 connector 固定 cwd 执行；`sendability=unknown` 当 ready；无 token 授权时尝试 renderer fetch；WebSocket 重连忽略 cursor；把 `profiles.list` 的任意首项当默认；用空 message 调 `createAndSend` 假装空会话。这些均应被测试/门拒绝。

## C-0011 收口（后件为准）

BC-0011 源码核对：当前 wire 确无纯 `sessions.create`，REST `POST /api/v1/sessions` 是真实 workspace_id+profile_id 的空建；当前 wire/REST 均无通用 input/editor/choice 响应通路。C-0011 决定首版复用认证 REST 空建+Idempotency-Key，再接既有 send/history/stream，不为避免 REST 另造 wire 方法；通用输入能力标 unsupported，另由 BC 设计。测试专用 launcher 可显式给 Electron main loopback URL 与 token 文件定位并验权限/同实例握手，但**生产同实例 handoff 未证前不可称产品 ready**。本报告上述“需冻结”三项按此后件收口，剩余为 host-side 实作和生产 handoff 验证。
