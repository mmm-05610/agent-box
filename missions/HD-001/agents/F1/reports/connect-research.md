# F1 连接服务研究（Phase 0）— 连接服务事实表 + Harness 切换闸核查 + statusbar 落点

基线：85cc3cd01497bb185be417a38dbeeeca4edb08e6（FE）+ 92a2d2ba66fc59b4d2e89bf0cea661ff3d7c0f6f（BE）。2026-09-23。回应 FC-0003 五项派件与 FC-0008 补充；BE 事实供与 S 联署接缝事实表，S 侧核对前标注〔待 S 核对〕。

## 1. 连接服务事实表（现状亲读）

### 1.1 谁持有 client
- **现状：client 持有在 `extensions/agent-sessions/src/model.ts`（`clients: Map<connId, AgentClient>`），这是错位**。连接器注册表在 `agent-connections`（仅 id/title 注册 + `connect(id)` 分发），而 client 实例生命周期、选择态、重连全在 sessions 包。PLAN Phase 2 "连接服务接走 sessions 中 client 持有/当前选择/重连" 指的就是这 78 行的解耦。
- `model.ts` 关键结构（实读）：`clients Map`、`subscriptions Map<connId, unsubscribe>`、`inFlight Map<connId, Promise>`（并发 connect 去重）、`state: AgentWorkspaceSnapshot { available, selectedConnectionId, connectingId, error, agent }`。`lifetime.add(client)` 使 client 生命周期绑定宿主 scope，scope 退出自动 dispose——迁移时保持该 ResourceScope 约定（AGENTS.md 服务注册绑定 scope 自动释放）。

### 1.2 selectConnection / reconnect 语义（迁移时必须保真）
- `selectConnection(id)`：校验注册存在 → publish 选择 → `connect(id)`（inFlight 去重，失败回填 error、清除 connectingId）→ publish。**选择成功前不抛错路径只存在于连接失败，选择态已置**（用户可见"已选中但连接中/失败"）。
- `reconnect(id)`：等待在途 → 主动退订并 dispose 旧 client → 重新 connect → publish。**旧实例身份随 dispose 终结，新实例是新 AgentClient**——断连后重连不复活旧实例；旧实例上未决 run 的 unknown 判定不迁移到新实例（client 内部状态各异，见 §2）。
- `selected()`：无选中或 client 已 dispose 时抛 'No connected Agent selected'——会话操作对未连接是硬失败，无静默降级。

### 1.3 断连后实例身份
- 连接实例（AgentClient，一次 connect 的产物）与连接器身份（AgentConnector id/title，注册表项）已区分：connector 是无状态工厂，client 是有状态实例。**迁移不引入新概念，只把这两者的持有从 sessions 移入 connections**。
- 断连后 client.isDisposed=false 但 snapshot.connection.status='error'（进程退出时）——实例仍可被 reconnect 复用为"再连接一次"的入口吗？现状 `reconnect` 一律 dispose 旧实例新建。保持现状。

### 1.4 capabilities 来源与伪造边界
- 每个连接器在初始 snapshot 自报 capabilities 七项（history/reasoning/tools/stop/interactions/models/modes，availability 四态）。Codex 在 `loadOptions` 失败时降级 models/modes='unavailable' 并写 diagnostic；Pi 在 loadOptions 对失败子请求以 allSettled 容忍为空。**能力缺失不伪造的现状机制 = 自报 + 显式降级 + diagnostic**，迁移沿用；后端 Harness 场景改由 `server.hello` 的 harnesses 与 profile capabilities 投影，FE 不再自报〔待 S 核对 hello 投影字段〕。

### 1.5 unknown 语义传递链（断连/停止）
- Codex：`exit`/`protocol-error` 帧 → 所有 running/stop-requested runs 置 unknown，pending/responding interactions 置 unknown，in-flight request 全部 reject；`stop` 失败回退 unknown。
- Pi：`transport_exit` → 该会话 activeRun 置 unknown、runFacts/activeMessages 清除（跨进程事实不泄漏）、pending/responding interactions 置 unknown；`agent_settled` 无已映射 stopReason → unknown + diagnostic；stop 失败 → unknown。
- UI 侧已如实呈现 unknown（conversation view.tsx L83）。迁移保持语义零回退（既有测试 agent-sessions.test.ts 等随包迁移，应用级集成门保留）。

## 2. Harness 切换闸核查（FC-0003 第 2 项 + C-0010 路由 BC 部分的 FE 侧）

**结论：闸谓词可纯由 AgentConnections 服务层快照计算：任一连接的任一 run ∈ {starting, running, stop-requested} 或任一 interaction ∈ {pending, responding} → 禁止切换 Harness。** 须扫描全部 runs（所有会话），不能只看当前会话最后一 run（FC-0008 判断正确，conversation 视图取最后一 run 仅为展示）。

两连接器逐项差异（实读证据）：
| 检查点 | Codex | Pi | 闸完备性 |
|---|---|---|---|
| runs 记账 | 按 turn id 累积于 snapshot.runs，跨会话保留，终态不删除 | 按 run id 累积，`updateRun` 只改非终态；单会话强制单 run（send 时 activeRuns 冲突即抛错） | 两者都保留全部 runs 历史，扫描全量不漏判 |
| 运行中判定 | turn/started→running；turn/completed→completed/cancelled/failed | agent_start→running；agent_settled→按 stopReason 映射或 unknown | 完备 |
| stop 后闸 | stop-requested 保持至 turn/completed 或 interrupt 失败置 unknown；stop-requested∈闸集合 | stop-requested 保持至 agent_settled 映射；starting 也可停且∈闸集合 | 完备；**stop-requested 必须计入闸**（不能因发出 stop 就放行切换） |
| 断连（进程退出） | exit 帧：全实例 runs running/stop-requested→unknown；interactions pending/responding→unknown | transport_exit：该会话 activeRun→unknown，runFacts 不跨进程泄漏；该会话 interactions→unknown | 断连即放行切换（unknown 非闸集合），符合"以服务事实判定" |
| 待审批判定 | serverRequest 建 approval/input interaction（带 sessionId/turnId）；serverRequest/resolved 或 turn/completed 才终结 | extension_ui_request 建 interaction；native 侧有超时 expiration（extension_ui_expired）；agent_settled/transport_exit 也终结 | 完备；Pi 有服务端过期，Codex 靠 turn 终结过期——**Codex 侧审批可能长期 pending 阻塞闸，这是正确方向（宁保守不放行）** |
| 已知弱点 | turn/completed 只把 pending（非 responding）interaction 过期为 expired；responding 卡死仅在 exit 清理 | transport_exit 只处理 activeRuns 里该会话的单个 run；理论上 runs 表中该会话其他 running run（历史脏数据）不会被清理 | 均为保守方向（多阻塞不放行），可接受；若 BC/S 侧提供更权威 busy/pending 信号〔C-0010 问 c〕则服务层闸优先用服务事实 |
| 跨 Harness 混排事件 | 直连进程模型：每 connector 实例独立进程与快照，天然无混排 | 同左 | FE 侧无混排风险；后端场景〔待 BC/S 确认 wire 事件模型无跨 Harness 混排〕 |

**补充事实（与后端 seam 直接相关）**：BE 侧 harness 不是连接属性而是 profile 属性——`server.hello` 返回 harnesses 列表，`sessions.createAndSend` 必填 `profileId`，`sessions.switchProfile` 在执行中被拒（execution_running）。因此"连接区域二级选 Harness"在服务端连接场景下的落法是：选 Harness → 从 `profiles.list` 过滤该 harness 的既有 profile → 以该 profileId 建会话。**不新增 Profile 管理能力**（只读消费既有列表）。开放问题（已发 S 联署）：后端是否有"每 harness 默认 profile"权威信号（sendability 或显式标记），若无，FE 取该 harness 第一个可发送 profile 的启发式需 C 认可。

## 3. 切换闸的执行点（依 C-0016 裁决 HD-001-C-006 Q2 三层模型修订，原提案并入第一层）
- **第一层 FE 本地预测**：闸谓词放 connections 服务层（迁移后的 client 持有者），`selectConnection` 谓词为真即拒绝（错误信息含运行中/待审批会话数）；同连接器内会话切换不受限（切换≠取消）。直连回归场景（codex/pi 本地进程）只有这一层。
- **第二层服务端拒绝**：后端连接场景下 Harness 切换经 `sessions.switchProfile`（执行中拒绝 execution_running）；UI 对服务端拒绝如实回退，不本地掩盖。
- **第三层服务端台账**：`executions.list`（handlers.py L1408-1427，实测：只读在途执行台账，超界为类型化拒绝）为最终 busy 事实源；FE 连接服务在切换前可查询比对本地预测。active 定义是否恰含 awaiting-approval 由 H/E 夹具复核（C-0016 第 1 条 Q2）。
- UI 层谓词仅置灰提示，权威在各层服务事实——与"以服务事实判定，不能凭页面是否打开猜"一致。

## 4. statusbar 注册结论（FC-0003 第 3 项；依 C-0016 第 6 条核可口径）
- **核实：workbench `addUI({kind:'component', slot:'statusbar'})` 即可承载连接状态，无需改 workbench 核心**（foundation-contracts L15-16 定义；workbench model.ts L26 校验；shell.tsx L143 footer 实际渲染 slot('statusbar')；组件经 Boundary 隔离）。
- **属主包注册口径（C-0016 第 6 条核可）**：connections 包注册连接状态组件；运行/待审批徽标由 sessions 包注册；workbench 仅渲染槽位。SessionBrowser 拆分口径：连接段（Connections 区块+Reconnect/Refresh+连接错误行）→ F1；会话段（Sessions 列表+New session）→ F2。
- "默认收起左下 statusbar"现状满足：无组件注册时 footer 仅显示占位点与"本地工作台"，不展开任何面板；连接状态组件注册后也只是一个 footer 内联组件，点击可展开连接/Harness 详情（详情浮层归 F1 状态包，不占右/下 region）。
- **Phase 2 拆分形态建议**（回应 FC-0008）：`plugins/connections/status` 为独立小包（状态组件 + 订阅连接服务），Phase 1 先整包落 `plugins/connections/service`（F0 布局），status 拆分在状态组件真实编写时执行，避免空壳。两包均只依赖 connections 契约域 Token，不 import 会话/对话包。

## 5. 与 S 的接缝协作状态（依 C-0016 更新）
- **联署已完成（F1-0007 + S-0004 双向确认，2026-09-24）**：S 的 interface-facts-for-f1.md 与本报告对照逐点一致，两表合并为 F1×S 接缝事实表，随 BC 汇合 PROPOSAL 提 C。要点：G3 两源合拼（hello ∪ readiness）；闸第三层=executions.list 不触发 G4 新契约；~~方法计数以 S 实测 60 为准~~ **勘误（S-0004 第 2 条）：wire 方法数=64（handlers.py:443-509 逐项实测，F1 原计数正确，F1-0007 第 5 条作废）**，其中闭环必需域 19 方法、其余 45 为冻结面（G5）零触碰；独立会话 workspaces.open 方案连接侧无阻塞，方案 A 已因 F1/F2/S 三方联署转正式裁决（C-008 第 2 条）；S 确认清理面仅有 workspaces.archive 留痕、无物理删除、目录根路径为调用方入参（Phase 2 FE 侧参数+C 裁）。
- **移交 C 裁决开放项**：OD-1 每 harness 默认 profile 取首个可发送（零新契约提案）；OD-2 服务端发现的 Electron 侧约定（S G2）；OD-3 workspace.connection 保持不消费、状态轮询自测。
- **OD-1/OD-3 已裁**（C-0019 第 2 条：首个可发送 profile+diagnostic；轮询自测不消费 reserved 事件）。**OD-2 F1 侧确认已发**（F1-0009 reply_to BC-0006）：采纳零新契约推荐，Phase 2 钉死建议=token 经 native-bridge 注入不入日志、后端为单一 `server` connector 经 hello∪readiness 提供二级选择、与直连 adapter 并列注册。
- **闸口径三方定稿**（BC-0006 收编声明 + E-0005 + S-0005）：FE 预测层=全部 runs（starting/running/stop-requested）+全部未 settled approval 交互（pending/responding）；服务端 active 四态（accepted/dispatching/running/capturing）与 wire 投影 {queued,dispatched,running}+stopping 由第二/三层兜底，executions.list 台账为最终事实。
- **服务端连接器的 newSession 设计约束（BC-0014 触发，本包后续批次备忘）**：wire/1 无纯创建方法——sessions 族仅 list/update/archive/createAndSend/send/switchProfile（handlers.py:496-501），而 `createAndSend` 必带首条消息且 accepted 即 `_dispatch`（:2018/:2038-2041，会派发执行）。故后端 connector 实现 `AgentClient.newSession()` 时不能走 wire createAndSend（用户点"新建会话"不应立即起跑模型）；候选方案：(a) 复用既有 REST 兼容层 `POST /api/v1/sessions`（纯创建，创建与派发天然分离，app.py:309-313，非新增后端接口）；(b) 会话延迟到首条消息实体化（newSession 返回本地占位，首次 send 时 createAndSend）。倾向 (a)，随 server connector 批文报 C 定。
- BC-0014 勘误与 H 批 R1 seeding 无 FE 侧影响；窗口纪律持续。
- FE 不在本包解决项目目录权威（C-0010 已路由；C-0016 Q1 已裁：消费 workspaces.list/browse/open 零新接口）。

## 6. 迁移最小方案（Phase 2 预案，待批文精确路径后实施）
1. `plugins/connections/service`：承接 agent-connections 注册表 + agent-sessions 的 clients/selection/reconnect/inFlight（§1.2 语义保真）；`AgentConnectionsToken` 身份不变；新增闸谓词导出（§2）。
2. `plugins/agent/sessions`（F2 域）：AgentSessions 门面改委托 connections 服务，删除自有 clients Map；会话语义不变。
3. `plugins/connectors/codex|pi`：现两适配器整包迁移，注册方式不变（`connections.forScope(...).add`）；直连回归保留。
4. `plugins/connections/status`：新增状态组件（statusbar 注册），数据源仅 connections 服务快照；后端 connector（ordessa 实现）待 C 批准后按同一 AgentConnector 契约新增，不把品牌塞 host。
5. 测试随包迁移 + 应用级集成门保留；迁移验证口径与 F0 build-scheme 对齐（dist 可比对、全绿门）。
