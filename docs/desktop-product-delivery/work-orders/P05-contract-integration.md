# P05 — 合同到达即逐能力接入

遵守[总方针](../master-plan.md)全部授权、保护区、资源与持续执行纪律。
输入：[产品决定](../../night-work-planning/product-decisions.md)；基线见[状态](../status.md)。

2026-09-14增量：core-semantics/1已批准，按P07完成wire候选与客户端合同测试；
本端不再整体WAITING_CONTRACT。生产接线待index登记WIRE_LOCKED_FOR_IMPLEMENTATION，
真实Server未完成时继续本端独立任务，不伪造联调证据。
范围：Desktop api/types/application/composition/
窄Electron生命周期及测试；后端仓只读，不改Server/Core/插件。
先核后端发布事实与合同，功能不可用登记服务缺口；不以更换HTTP路径猜测接口。
推荐纵向顺序：服务ready→Workspace/WSL→角色/模型→首发Session→流式/停止/恢复→
同Harness角色切换→其余已批准设置能力。具体前置由合同决定。
每能力验：成功、typed错误、超时未知、能力缺失、重复/迟到；确认权威数据在本机。
现有真实业务数据/凭据/付费模型调用未获本单授权；无模型真实链先验完。
真实模型门待专门授权的隔离角色、凭据来源与预算到达，再执行限定调用，不直接读取用户auth文件。
不支持的高级能力保留诚实状态；不用legacy回落和mock补绿。
每合同版本/能力一检查点，记录实际服务版本、用户路径、证据级别；剩余合同晚到继续消费。
若到最终所有独立工作耗尽仍缺合同，只列最小缺口PARTIAL，不能自造后端绕过。
本端实现和候选合同测试完成但服务未到时，可以将客户端范围标READY并列外部等待，
交接按handoff-policy；不要求前端必须先通过跨端联调才允许后端接手联调。

阶段终态：P05_GREEN 或 P05_PARTIAL。
PARTIAL必须拆出等待子项与下一可做项，不默认终止整个goal。
