# P00 — 接管、保护基线、建立追踪

遵守[总方针](../master-plan.md)全部授权、保护区、资源与持续执行纪律。
输入：[产品决定](../../night-work-planning/product-decisions.md)；基线见[状态](../status.md)。

核对目标工作树与39291df、旧会话无并发写入，创建/恢复feature/agentbox-desktop-product。
cherry-pick本次文档发布提交；检查污染不重装依赖。原36R分支保持原检查点。
范围仅工作分支调度/证据文件与必要文档合入，不改产品。
生成evidence/P00.md：现有app/features/application/store/api/electron职责树，沿用执行报告，
只补缺失接缝事实；列必须保留/退役/合同待定及Windows构建位置。
建立产品功能矩阵，每行关联产品决定、实现入口、测试、真实验证或阻断。
先不跑9600项全量。记录git基线、保护路径、已有已知失败；完成即提交并进入P01。
验收：受保护文件未入索引，分支/工作树唯一归属，所有工单可解析且有前置。
若其他代理仍在写，只暂停写入冲突面；不要强杀它。

阶段终态：P00_GREEN 或 P00_PARTIAL。
PARTIAL必须拆出等待子项与下一可做项，不默认终止整个goal。
