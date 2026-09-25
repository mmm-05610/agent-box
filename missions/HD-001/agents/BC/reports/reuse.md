# BC 复用账（初始，2026-09-23；模板=REUSE-TEMPLATE.md）

后端原则：本轮闭环**零新依赖、零新协议面**——候选比较在"复用现有实现 vs 适配 vs 自造"之间做，自造一律须中央批准 ID（PLAN Phase 0）。许可证列对纯仓内代码记 N/A(in-tree)。

| 能力/组件 | 候选项目+版本/commit | 源码路径/官方链接 | 许可证 | 检查/实验结果 | 结论 | 修改边界/拒绝原因 | 本地落点/升级方式 | owner |
|---|---|---|---|---|---|---|---|---|
| 前后端事件通道 | ①wire WS event-stream(仓内 92a2d2ba) ②REST SSE `/api/v1/sessions/{id}/events`(仓内) ③自造新推送层 | `server/transport/http/app.py:356` / app.py:328 | N/A(in-tree) | ①有签名 cursor 批量续传+session 隔离(envelope.py:70-114)；②依赖进程内 EventNotifier(notifier.py 全文 24 行)单进程唤醒；③无需求证据 | ①直接复用 | 拒绝③：重复实现第二套续传语义违反单实现钉；②仅留兼容不新增依赖 | FE 连接服务持 WS＋cursor；升级仅随 wire 版本协商 | BC/F1 |
| 断连回放与旧事件隔离 | ①CursorCodec 签名 cursor(仓内) ②客户端自记 seq | `server/wire/envelope.py:70-114`; handlers.py:2225-2233 | N/A | 服务端已强制 expected_session＋live/backward 互斥；②无法防跨会话串帧 | ①直接复用 | 拒绝②：安全性劣 | 无需落点 | BC/F1 |
| 停止/取消语义 | ①execution.lifecycle 三态机(E2b 已集成) ②REST cancel ③FE 本地标记 | `src/agent_box/execution/lifecycle.py`; app.py:407 | N/A | ①单实现钉 11P 绿(基线 commit 信息实测)；unknown 态如实投影(projection.py:76-83) | ①直接复用(wire runs.stop) | 拒绝③：违反"停止确认/unknown 如实显示" | 无 | BC/E |
| Harness 选择数据源 | ①`ProductService.readiness()` capability_claims ②枚举品牌常量 | `service/facade.py:46-77` | N/A | ①"答案来自 bootstrap 实际注册"注释即纪律；②违禁品牌分支(通用 harness 包边界) | ①直接复用 | 拒绝②：map.md 禁边 | FE 连接区二级列表消费 readiness.harnesses | BC/F1 |
| 独立会话执行目录 | ①`workspaces.open` 专用目录(现码) ②后端新增 ephemeral 语义 | `service/sessions/service.py:50-53`; handlers.py:2017+ | N/A | ①零后端改动可达章程要求；②扩 wire 面＝产品语义变化，须 C+用户窗 | ①适配复用(UI 归类由 FE 定) | ②暂拒：等 F1/F2 接缝表若证不够再呈 C | 待 C 契约记录 | BC/F2 |
| ACP/新对外协议 | ①现有 wire/1 ②外部 ACP 适配 | handlers.py:38 `wire/1` | N/A | PLAN 明言"不预设对外是 ACP、不强造新协议"；②无证据需求 | ①直接复用 | 拒绝本轮引入② | 若未来需要另案报 C | C 决策 |
| 思考/工具/审批事件形 | ①现有 13 wire kinds ②新增 kind | projection.py:24-37 | N/A | ①覆盖章程所需；单表钉在案(projection 模块注释) | ①直接复用 | 加 kind＝契约变化回 C | H/E 验证各 harness 实发面 | BC/H |

| Harness 接入批（Pi/Codex）实现形态 | ①复用单体既有模块 `plugins/agent-box-harnesses/src/agent_box_harnesses/{pi,codex}/`（native.py 方言表＋codex 侧 composition/launch/control/credentials/remote/app_server/interactive 全套，P-A② split 产物）＋`deploy/{pi,codex}/` 资产 ②新建独立包 `plugins/agent-box-harness-{pi,codex}/`（dsh 三包形制） ③从零自造 | 本会话亲读：pi/native.py（DIALECTS+NATIVE_TARGET，自述一手来源 deploy/pi/models.json）；codex/ 目录 15 模块实测在册；装载面 `agent_box_harnesses.registry.load_builtin_registry()`（8 家声明） | N/A(in-tree) | S-0006 同 SHA 独立复验一致；C-0025 第 2 项原则批准"二择一以复用为先" | ①优先复用（批面或仅注册核对/available 判定）；②仅当 H 三件套证单体面不足才申请 | 拒绝③：双份实现违单一实现钉与复用账传统（S-0006 论证采纳） | 形状候 H feasibility 定形后随批文补登落点 | BC/H |

>=2 候选且 >=1 源码亲读：以上各行满足（读码行号见 interface-facts.md；Harness 接入行=2026-09-23 接管会话新增，pi/native.py 亲读＋codex 子包目录实测）。新增可见后端组件登记：**暂无**——目标＝零新增；Pi/Codex 批复用为先则维持零新增。
