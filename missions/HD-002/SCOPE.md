# 授权边界
**最新执行与用量覆盖：**I-NATIVE-AGENT-001 要求所选项目中的本机原生 Agent，经 Server/Execution/Harness；旧 bwrap/sidecar/SecretStore 投影链不再是 CP 前置。I-DEC-0001 取消旧次数上限/计数手续，C-0025 已登记唯一账本；模型选择、凭据保护与 C 单真实测试流协调仍适用。
## 主线
**执行路径限定：**I-NATIVE-AGENT-001：本阶段明确本机原生Agent启动；不强依赖bwrap，不扩Profile/Provider/SecretStore产品。旧隔离路径保留不删，不以安全失败为由静默降级。
**最新覆盖：**I-PROJECT-REQUIRED-001生效，必须有效项目；恢复本连接上次选择，首次/失效必须选。不做默认工作区。下文“独立会话”不再表示无项目执行。
阶段终点为 [CP-SESSION-001](SESSION-CHECKPOINT.md)：固定可启动前后端配对，先交用户验收Session闭环；Profile和后续增量不纳入。
**用户纠正（优先）：**[首次发送才创建会话](agents/I/outbox/I-SESSION-FIRST-SEND-001.md)。新对话只是未发送草稿，不入侧边栏；首条消息才创建并执行。不选项目使用Agent已设定默认工作区，不新增纯创建会话或独立目录分配作为前置。
选择后端连接→临时二级选择Harness→整机该Harness工作模式→独立或项目内会话→持续流式/工具/思考/产出/审批输入/停止/恢复。
不做会话级Harness选择、多Harness混排并行；活动run/待交互禁止切换，按权威事实；不偷偷取消。
前端外部业务插件、统一简洁UI、优先复用；右/下辅助区无功能不展开，交互不被强制放右栏。
Provider/Model切换、思考强度、Profile产品入口不进入此主线。保留现有原型可回退。

## Profile新增隔离授权
用户现在允许独立Profile插件施工，例外只适用于 PROFILE 自己两棵树的新插件目录及该包自包含测试/构建/文档。
BE: plugins/agent-box-profile-preset/**；FE: plugins/profile/**。名字是独立包施工命名，不自动占据现有profile协议或替换旧包。
普通存储格式/本包测试实现可由BC批准；不允许修改root pyproject/package.json/locks、shared contracts、Server/wire、Execution、现有Profile、home或主产品清单。
本包内部新契约可放本包公开exports，日后共享化由集成批处理；不得偷偷复制现有公共runtime、连接或执行实现。
Profile只保存逻辑预设，不含home/路径/机器/凭据；memory/provider等扩展由能力拥有者贡献。首批用明确test-only扩展验证机制，不创建假的生产memory/provider服务。
BC牵头、FC确认前端可选接口；一个PROFILE执行者可以串行维护两独立树，未来需要并行时再划FE/BE单写者。
Profile默认不安装进主产品，独立验证不冒充整机接入。旧数据迁移、当前启动链改造、公共Profile协议切换不在本批授权。
Provider/Model仅BACKLOG设计任务，用户与I讨论后才可扩为施工；必须无Profile也能独立工作。

## 测试、安全与预算继承
Codex Harness每次显式gpt-5.6-luna，Pi使用既有配置不修改。DeepSeek仅指定测试runner读取路径并注入，不打印/复制进Git/报告/提示词；endpoint/model要核实。
新中央gpt-6-sol是开发决策，不是Harness测试，不受luna的测试模型限制；独立review仍使用剩余10次gpt-5.6-sol上限。
真实调用先在旧唯一预算账本reserve，自动重试/工具循环实际请求计数不能忽略。无计数上界不盲跑，BC先提出最小可验证批。
所有写入自己树、显式暂存，不push，不覆盖main，不清理旧树，无全局安装/系统更改。不启停用户既有服务；本任务新服务须登记并仅清理其自身。
