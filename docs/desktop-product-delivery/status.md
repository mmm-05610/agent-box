# Desktop产品交付状态（执行工作树维护）

调度：ACTIVE_EXECUTOR_INCREMENT_AVAILABLE。本文件是产品工作树的执行事实；
发布源初始表不代表实时状态。消费文档更新时保留执行状态行，只合入规则/新订单。

## 执行快照（handoff-policy 每阶段必填）

- updated_at: 2026-09-14 01:40 (+08:00)
- 执行者: 前端产品 goal（本会话，desktop-product 队列唯一写入者）
- 工作树/分支: /home/maoqh/projects/agent-box-desktop-next-wsl-round1 @ feature/agentbox-desktop-product
- 代码检查点: ebb1233（P00）→ 8d4b3df / 47b5b47 / dbb902f（P01 代码与几何修复）→
  文档 2e8a1c7（61c7ff7 导入）→ 8cf78db（P07 检查点1）→ P01 证据收尾提交见 git log
- 已消费发布文档提交: 86d5a7b（P00–P06 全套）、61c7ff7（P07+handoff-policy+core-semantics/1）
- 当前阶段: P01_GREEN（真机 allOk=true）；P07 检查点1完成；下一项 P07 检查点2
  （wire-v1）+ P02 上层产品，串行穿插
- 完成范围: P00；P01 全部返修（唯一选择协调、名称宽度结构修复、驱动双布局断言、
  Windows 真机 27 PASS）；P07 检查点1（语义合入+逐节映射）
- 下一项: P07 检查点 2 —— contracts/wire-v1/ 单一候选 schema（PROPOSED_WIRE）+
  正反 fixture + 隔离合同测试；随后 P02A（app/shell 组合与服务可用性分离）
- 阻断: 无（本地 Windows 真实打开 PENDING 属 36R 遗留边界，按 P01 转移 P05）

- contract_semantics_version: core-semantics/1（APPROVED_SEMANTICS，2026-09-14）
- wire_version/schema_digest: 尚无（P07 检查点 2 产出后登记 PROPOSED_WIRE 摘要）
- 合同测试: 尚无（检查点 3）；覆盖缺口=core v1 §9 九组场景全部待建
- UI_READY: 侧栏工作区列表（36R+P01）真机全绿；产品级 GREEN 未宣称
- CONTRACT_CLIENT_READY: 否（wire 未编制/未锁定）
- REAL_FLOW_VERIFIED: 否（无真实 Server/Harness 链路证据；本地打开 PENDING 转 P05）

- frontend_implementation: IN_PROGRESS
- writer_lease: ACTIVE（未交接；接管者与时间留空待实际交接）

## 工单状态（实际进度）

调度维护：已消除P06“等用户体验才交接”的歧义；核心wire通过contracts/index规定的后端
wire-review.md通道自39阶段协调。执行者下个检查点消费这些规则，不覆盖本端已有进度。

| 工单 | 状态 | 前置 |
| --- | --- | --- |
| P00 接管与基线 | GREEN | 旧Desktop会话无并发写入（evidence/P00.md） |
| P01 36R收口 | GREEN | 真机 27 PASS/2 SKIP/1 PENDING（evidence/P01.md；本地打开 PENDING 转 P05） |
| P02 上层产品 | READY_AFTER_P01 | P01 已满足 |
| P03 用例状态与API | READY_AFTER_P02 | P02 |
| P04 宿主与遗留退役 | READY_AFTER_P03 | P03 |
| P05 正式合同接入 | SEMANTICS_AVAILABLE_WIRE_PENDING | core-semantics/1已批准；P07编制；真实服务证据另计 |
| P06 前端验收与交接 | IMPLEMENTATION_HANDOFF_GATE | 本端独立范围完成；真实全栈门由后续集成人负责 |
| P07 核心合同与状态交接 | 检查点1完成；检查点2=wire-v1 编制 | 与P02–P05串行穿插 |

## 测试与证据基线（本轮实跑）

- 本地：sidebar 全量 241 项通过（含 3 条 P01 装配反例）；三项目 typecheck exit 0；
  改动文件 eslint 0/0；层序账本 md5 57011a54… 逐字节不变；层序守卫 15/16，
  唯一失败=已知环境基线（IN_FLIGHT 含 agentbox，干净树无 src/agentbox/），未复制 POC。
- Windows：`docs/validation/windows-acceptance-round36r-p01/`（p01r7，exit=0，
  24 截图+log）；36R postfix 旧证据原样保留；r1–r6 迭代失败史见 evidence/P01.md §3。

初始36R基线39291df，整体PARTIAL。38研究READY_FOR_DECISION，不是Harness生产依赖批准。
不继承旧GREEN，不因工单文件存在宣称功能已交付。
