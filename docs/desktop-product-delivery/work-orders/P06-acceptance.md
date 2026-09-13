# P06 — 完整Desktop验收与交付

遵守[总方针](../master-plan.md)全部授权、保护区、资源与持续执行纪律。
输入：[产品决定](../../night-work-planning/product-decisions.md)；基线见[状态](../status.md)。

范围仅已实施功能的集成修复、定向及最终测试、构建与证据文档；不临时扩大产品。
最终功能矩阵逐条对照产品决定：已实现+真实验证/测试替身验证/不支持/合同缺失，禁止漏行。
目标树必须标明余留legacy依赖及原因，通用UI/用例无Hermes专属控制流；
允许品牌数据、许可和迁移兼容键，不做机械全仓字符串零命中验收。
运行三项目typecheck、最终完整Desktop Vitest、相关shared/tests-js、lint/层序守卫。
只重跑修复相关面；基线失败独立记录、不得删守卫；保持PARTIAL直到所需门满足。
Windows原应用验收：无Harness启动→打开目录/WSL同级项目→选择角色/调整默认与临时模型→
新草稿/既有草稿恢复→首次发送与流式/停止→重开历史→同Harness换角色；
最后几步需要真实后端与专门模型授权，未到则明确待验。
设置真实保存/失败/引用保护、退出回收、本机数据权威与远端投影清理都要各有证据。
一份最终报告：产品分支HEAD、功能矩阵、截图、完整启动/退出步骤、调用次数、残留、已知问题。
UI_READY不等于CONTRACT_CONNECTED，后者不等于REAL_FLOW_VERIFIED。
满足所有本次必需验收才AGENTBOX_DESKTOP_PRODUCT_GREEN；否则PARTIAL附精确缺口。
完成停在产品分支待用户验收，禁止自动merge/push。

阶段终态：P06_GREEN 或 P06_PARTIAL。
PARTIAL必须拆出等待子项与下一可做项，不默认终止整个goal。
