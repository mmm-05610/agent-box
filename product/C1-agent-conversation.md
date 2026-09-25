# C1 — 通用 Agent 会话

2026-09-21，I。用户确认的首要能力：与已接入的 Agent 服务持续对话，并看见
工具调用、思考等过程。本文件是产品梳理，不是实施工单或功能验收。
源码依据：development-baseline.json 的 linux-native-dev-0；以下均为静态检查，
本轮未启动应用或运行测试。

## 用户路径与模块映射

路径：选择可用 Agent → 新建会话 → 发送 → 查看过程 → 追问 → 停止/回应授权 → 重开。
新建会话是否必须立即发送，是当前 API 与交互设计的区别，不能把草稿当已持久会话。

下表 D=desktop/apps/desktop，B=backend/src/agent_box，均指 integration-linux 下的树。

| 用户能力 | 当前代码证据 | 责任边界/待验证 |
| --- | --- | --- |
| 知道可用 Agent、选择会话配置 | B/server/wire/handlers.py 的 hello 输出 harnesses；D/src/app/composition/wiring/agentbox-main-chat.ts 读取 profileId/workspace | Server 提供能力与可发送状态；Desktop 展示选择，不按 Harness 名猜能力。完整选择体验待验 |
| 新会话及连续发送 | handlers.py 的 sessions.createAndSend、sessions.send、sendOutcome.query；D/src/application/session/wire-send.ts | 核心发送意图、稳定 requestId 和结果确认；Server 接受/排队，底层延续原生会话 |
| 文本/思考/工具按顺序显示 | D/src/application/session/wire-session-projection.ts 的 timeline、thought.delta、tool.update；D/src/features/chat/agentbox-chat-view.tsx 的 partsInServiceOrder | 核心维护可重放投影；只显示 Agent 实际发出的信息。实时与历史顺序一致尚需场景验证 |
| 工具详情与结果 | agentbox-chat-view.tsx 的 toolPart 映射名称、状态、summary/resultExcerpt，但 args 当前为 {} | 通用工具展示属于核心；丰富工具视图是扩展点。不能声称完整工具输入已展示 |
| 停止与授权 | D/src/application/session/wire-session-control.ts 的 requestAgentBoxStop、decideAgentBoxApproval；handlers.py 的 runs.stop、approvals.decide | Desktop 发请求并显示服务状态；Server/Runtime 决定实际停止与授权生效。不把点击成功当执行已停止 |
| 列表、历史重开与断线恢复 | wire-session-catalog.ts；wire-session-control.ts 的 hydrateAgentBoxHistory；projection 的 appliedEventIds/lastSeq/needsResync；agentbox-main-chat.ts 的历史与流接续 | 历史阅读、事件断线续接、原生执行恢复是三种能力，分别验收 |

## “薄核心”的具体含义

核心包括连接与能力状态、会话导航、输入/发送、通用转录、工具基础展示、
授权与执行状态、历史/事件恢复，以及这些能力的视图扩展点。
它需要知道 session/turn/toolCall 的身份与关联，不能只是无状态聊天框。
它不应知道某个 Harness 的文件布局、启动命令、凭据格式或沙箱创建方式。

当前 sessions.createAndSend 要求 workspaceId、profileId、overrides、message。
因此 Profile 可编辑管理页是功能模块，但“会话绑定哪个配置”的最小读取/选择
接口属于核心依赖。不能直接拔掉整个 Profile 域后期待现有发送仍能工作。
工作区同理：资源/Git 页面可选，执行上下文仍需明确。

Server 对外统一会话意图、事件与能力描述；Harness 适配负责原生差异；
Runtime 负责环境与进程；Work Core 守住执行状态、幂等及生命周期约束。
配置、资源、Git 通过 Server 服务与这条链协作，不能各自创造另一套会话。

## 扩展点（目标设计，不宣称已实现插件框架）

- 会话配置区：Profile/模型选择与状态，核心只消费标识、描述和可用性。
- 转录：先有通用工具卡；按已声明类型注册更丰富的文件 diff、命令结果等视图。
- 侧栏/面板：资源、Git、执行详情等可注册入口。
- 能力状态：不支持、未配置、不可达、正在恢复分别呈现，不能统一显示为“没连接”。

第一阶段使用内置模块与显式注册接口；动态第三方代码加载另作设计。
Skill/MCP/A2A 的语义尚未在本轮梳理，不将它们预先压成同一种对象。

## C1 验收场景（待执行）

1. 从已配置的可用 Agent 开始新会话，连续两轮能延续上下文。
2. 实际提供思考/工具事件的 Agent，其事件在正确会话/消息下按服务顺序呈现；
   不提供思考的 Agent 正常聊天，不产生虚构思考区域。
3. 工具运行、成功、拒绝、失败可区分，详情只展示实际收到且可展示的字段。
4. 有授权请求时可以作答并看到生效状态；没有授权能力时不展示无效操作。
5. 停止后以服务终态确认；发送结果不确定或连接断开时不重复触发执行。
6. 重开可以阅读历史；能否续聊按原生恢复能力与当前环境分别判断。
7. 失败/截断/恢复中可辨别，UI 不把连接成功等同于 Agent 可以执行。

## 对工作树划分的影响

建议第一条 Desktop 业务线命名 desktop-core，而不是仅 conversation：它拥有
会话交互、事件投影、基础工具视图和扩展接缝。Profile 线拥有配置编辑与后端
配置服务；Runtime 线拥有执行环境。三者共享 wire/组合根的改动需单写者协调。
当前仅明确责任，不创建工作树、不派功能实现、不修已发现缺陷。
下一张能力卡建议梳理“用户如何选定 Agent 及其工作环境”，再定 Profile 与
Runtime 的输入输出；它直接补齐 C1 的前置条件。
