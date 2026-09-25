# C1-001 — 梳理会话能力，跑通 Desktop → Pi 第一个闭环

**已被用户调整优先级（D-0026）：立即读取 C1-001-frontend-first.md 并 ACK。**
本文件下文保留为历史范围；后端实现/真实闭环优先要求暂停，当前以新任务为准。

签发：I，2026-09-21。执行者：用户启动的 mcode / DeepSeek 会话。
状态 ISSUED，待接收。用户要求先梳理，然后尝试通过我们的前端接入真实 Pi，
跑通第一个闭环，再增补其他功能。不是恢复旧任务或修复全量失败。

## 先读与输出位置

先读根 README/AGENTS、control/README、development-layout.md、
development-baseline.json、product/C1-agent-conversation.md、environments.md，
以及候选树适用规则。LNX-002 报告按相关性阅读；旧工单只作历史证据。
只维护 control/reports/C1-001/ 下的 status.md、capability-map.md、plan.md、
implementation.md、verification.md、handoff.md。不要改 I 的决策或 dev-0 清单。
不用 incremental-work-order skill，不开背景调度或再派代理。

## A：先做有限梳理，不做全库考古

沿“选择已配置 Agent→新会话→发送→流式/工具/思考→继续追问”的路径，
列用户能力、已有入口、Desktop/Server/Work Core/Harness/Runtime 归属、缺口。
确认实际使用的是 Ordessa agentbox 产品链，不误走 legacy Hermes gateway。
说明 profileId/workspaceId 的必要性、原生 session 身份及后续恢复边界。
先落盘 capability-map.md 与 plan.md，写清本轮必需改动与后置项，然后直接进入 B，
不因“方案等待批准”空停；仅遇真实缺少授权/凭据/架构取舍时报告 I。

## B：隔离执行树与权限

从 dev-0 固定 SHA 创建两个任务树，分支均为 work/pi-loop-0：
- worktrees/pi-loop/backend：b067c5718556c8efa93b054e6573ad3d186b3cf6。
- worktrees/pi-loop/desktop：80872f556c001b42217d43bf5f73ab08029bfcb9。
先检查路径/分支是否已存在；不得覆盖他人工作。你是这两树唯一写者。
允许任务树内最小必要功能修改、本地提交、项目依赖安装、隔离测试和启动本任务
自己的服务/桌面实例。不要修改 integration-linux、旧树、main，不 push、不删除
历史树、不迁移用户库。新数据根/测试工作区建于任务专用临时目录并记入报告。
保持 Work Core 中立，复用既有 Pi 接入；不重写 Harness 或把 Pi 内部知识放进 GUI。
协议若必须改，从源码生成并同步两侧；限定本轮新增能力，不重构全部 64 方法。

## C：最小真实闭环

1. 查明 Pi 现有适配、执行工件、依赖与部署生成方式；使用锁定版本，记录来源。
   修闭环所需缺环，不顺带做动态插件市场、通用配置重构或后端 main 整支吸收。
2. 用新建隔离环境运行 Server/local runtime/Pi，桌面通过真实产品传输连接。
   允许一次性准备非秘密 profile/workspace/deployment 记录，必须给可复现入口。
   不能用模拟响应冒充真实 Pi；模拟先用于排查，结果分账。
3. 必须从实际 Desktop 界面发送至少两轮消息，第二轮验证上下文延续，并核对
   相同原生会话身份（若适配支持取得该身份）。只跑 HTTP 或 Pi CLI 不算 GUI 闭环。
4. 在隔离测试工作区准备无秘密文件，让 Pi 做一次明确的只读工具操作，验证
   工具状态/结果在 UI 可见。仅展示 Pi 实际提供的思考/摘要；不提供则记不支持。
5. 明确错误/缺配置的可见状态。历史浏览、进程重启后的原生恢复、live cancel
   等本轮可记录现状，不为追求“大而全”扩大首个闭环。

## 模型与凭据

用户请求真实 Pi 闭环，授权本任务必要的有限真实请求；仅使用已有明确归属该用户、
配置用于试验的账户。先用 2–3 次短请求验证，失败先查本地原因，不无限重试或
跑基准/批量任务，记录调用次数和实际可获得的用量，不编造费用。
凭据仅由应用通过已登记且仍有效的 locator 或用户交互登录消费；代理不 cat/read
内容、不输出、不写报告/命令行/提交，不复制旧用户凭据库或搜遍 home 找密钥。
不沿用迁移前凭据路径为“必然可用”：只检查存在性/可用配置事实。
若 Linux SecretStore 是阻碍，可为这次开发试用使用明确标注的进程内注入入口，
仍须通过已有受控应用通道消费获授权 locator，禁止硬编码或明文落盘；这不证明
持久配置已完成。若缺可用账户/locator，记录具体所需输入交 I，继续离线准备；
不得用编造响应宣布真实闭环完成。

## 验证与交接

只修直接阻断此路径的缺陷，已知无关红项分类后置。测试对应改动，不要求全套
旧测试变绿。保留准确失败与 skip，禁止替换关键断言制造通过。
可以用现有 GUI 自动化；若环境无法操控桌面，完成启动和预检查，把具体两轮
操作交给 I 安排用户验收，状态写 READY_FOR_USER_TRIAL，不能写已 GUI 验证。

handoff.md 给固定两仓 SHA、协议摘要、依赖身份、一条明确启动命令、服务/桌面
入口、测试数据位置、两轮试用步骤、工具操作、当前限制与停止命令。
测试完成后仅停止自己创建并确认身份的进程；若留给用户试用，登记 PID/端口/
数据根/日志与停止方式，保持版本固定。日志/截图不含秘密。

最终状态：VERIFIED_PI_GUI_LOOP（仅在真实 GUI 链有证据时）、
READY_FOR_USER_TRIAL、或 PARTIAL/BLOCKED（注明具体条件）。三者都不代表用户已接受。
报告发 I，I 决定后续合入与模块划分；任务完成即结束，不自行补下一层功能。
