# 开发组织入口

2026-09-21，I。以用户纠正为准：先组织工作树，不再借整理任务延伸修 bug。

## 唯一开发基线

版本身份只以 [development-baseline.json](development-baseline.json) 为准。
这是带已知缺陷的源码起点，可用于派生工作树；不是运行验收或发布。
LNX-002 本轮收口，原执行者结束写入。独立审阅可另行并行，不阻塞组织。
后续改变集成分支时发布新编号清单，不能悄悄修改 dev-0 的 SHA。

## 现存树的职责

| 入口 | 当前角色 | 后续处理 |
| --- | --- | --- |
| worktrees/integration-linux/backend、desktop | 两仓唯一集成入口 | 接收有任务范围与证据的业务增量；一次一个写者 |
| backend-service-env-provider、backend-runtime-round1 | 已吸收源线，退出活跃开发 | 四源祖先关系已由 I 验证；目录/脏内容仍保留 |
| desktop-chat-wsl-round1、desktop-settings-round1 | 已吸收源线，退出活跃开发 | 不再往旧分支追加功能 |
| scheduling-legacy-server-round1 | 退休调度历史 | 只读；不恢复队列 |
| repos/backend、repos/desktop | Git 主目录与历史/发布入口 | 不作为新业务执行目录，不改 publishing main |
| legacy-*、Studio 各树 | 历史/待评估 | 去向见 LNX-001 + LNX-003；未授权删除 |

角色退出不等于物理删除。工件与未提交成果仍需保全，清理磁盘另立具体范围。

## 下一阶段业务划分（待任务卡落地后创建，无空转执行者）

| 业务线/建议目录 | 用户可验收结果 | 主要责任 | 接口依赖 |
| --- | --- | --- | --- |
| runtime / worktrees/runtime/backend | Linux 环境可创建、执行、取消、清理与恢复，错误可诊断 | 本地 execution/sidecar、沙箱、工件与启动链 | 向其他线提供稳定服务启动/连接约定 |
| configuration / worktrees/configuration/{backend,desktop} | 用户配置模型/凭据/Profile，重开仍生效 | SecretStore、credential/provider/profile 及设置入口 | 与 runtime 先约定秘密解析接口和失败语义 |
| conversation / worktrees/conversation/desktop | 状态、回复、工具结果与错误在界面正确呈现 | chat/转录/工具展示 | 消费固定 wire，后端变更请求交接口协调 |

新业务分支建议 work/<business>/linux-0，从基线清单中的精确 SHA 创建。
目前尚未创建上述业务树，尚未派发功能任务。优先启动 runtime 与 configuration；
conversation 按可独立验收范围安排，避免共享 renderer 路径同时写入。

公共 wire 生成源与副本、数据库迁移序号、bootstrap、共享 i18n 索引归集成协调。
业务线在任务卡列出所需公共改动；协调者指定单写者和顺序，其他线不得并写。
跨仓库的同一业务用一张任务卡绑定两个 SHA；不按模型数量创建工作树。

## 人员与信息

I：唯一用户接口，定范围、取舍与验收版本。
DeepSeek：关键路径执行/集成；Qwen：独立且有限的实现、测试和证据整理；
Sol：对固定候选 diff 按需审阅。模型只是资源，具体写者由任务卡指名。
任务卡必须包含输入 SHA、写入范围、共享文件约定、验收场景、已知缺陷、输出 SHA。
执行者只更新本任务报告；I 更新决策与基线；通知只发任务 ID、状态、报告路径。
工作完成、阻塞或需取舍时上报，不恢复常驻轮询。

## 将已知缺陷归位

- runtime：工具/工件准备、启动生命周期、故障映射/取消回归、真实 harness 终态验证。
- configuration：Linux 持久秘密存储、默认组合、配置/秘密重启恢复。
- conversation：状态呈现与远程 PNG 缺陷（远程项可后置）。
- 独立审阅：合并保真、两次 runtime 修复、测试守卫及生成入口。

每个增量都可以给用户固定版本验收；已知缺陷不阻止派生开发树，
但必须在验收版本里显式列出。releases/current 不因源码基线建立而晋升。
