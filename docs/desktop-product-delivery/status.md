# Desktop产品交付状态（执行工作树维护）

调度：ACTIVE_EXECUTOR_INCREMENT_AVAILABLE。本文件是产品工作树的执行事实；
发布源初始表不代表实时状态。消费文档更新时保留执行状态行，只合入规则/新订单。

## 执行快照（handoff-policy 每阶段必填）

- updated_at: 2026-09-14 00:55 (+08:00)
- 执行者: 前端产品 goal（本会话，desktop-product 队列唯一写入者）
- 工作树/分支: /home/maoqh/projects/agent-box-desktop-next-wsl-round1 @ feature/agentbox-desktop-product
- 代码检查点: ebb1233（P00）→ 8d4b3df（P01 代码）→ 文档 2e8a1c7（61c7ff7 导入）
- 已消费发布文档提交: 86d5a7b（P00–P06 全套）、61c7ff7（P07+handoff-policy+core-semantics/1）
- 当前阶段: P07 检查点 1 完成（语义合入+逐节映射+状态更新，见 evidence/P07.md）；
  P01 代码检查点已交，Windows 真机复跑待修复后执行
- 完成范围: P00_GREEN；P01 本地返修全部落地（见下）；P07 检查点 1
- 下一项: P01 产品侧 yield/偏移修复+Windows 驱动复跑；P07 检查点 2（contracts/wire-v1/
  单一候选 schema PROPOSED_WIRE + 正反 fixture + 隔离合同测试），与 P02–P05 串行穿插
- 阻断: P01 真机段——owner=前端执行者；解除条件=overlay 悬浮拦截主行/箭头点击的产品修复
  （offset 让开 caret + 对主行/箭头让位）+ 驱动改位置点击后重建复跑

- contract_semantics_version: core-semantics/1（APPROVED_SEMANTICS，2026-09-14）
- wire_version/schema_digest: 尚无（P07 检查点 2 产出后登记 PROPOSED_WIRE 摘要）
- 合同测试: 尚无（检查点 3）；覆盖缺口=core v1 §9 九组场景全部待建
- UI_READY: 部分侧栏（36R+P01 本地）真实通过；产品级 GREEN 未宣称
- CONTRACT_CLIENT_READY: 否（wire 未编制/未锁定）
- REAL_FLOW_VERIFIED: 否（无真实 Server/Harness 链路证据；36R 本地打开 PENDING 仍转 P05）

- frontend_implementation: IN_PROGRESS
- writer_lease: ACTIVE（未交接；接管者与时间留空待实际交接）

## 工单状态（实际进度）

| 工单 | 状态 | 前置 |
| --- | --- | --- |
| P00 接管与基线 | GREEN | 旧Desktop会话无并发写入（evidence/P00.md） |
| P01 36R收口 | IN_PROGRESS | 代码检查点 8d4b3df 已交；Windows 真机复跑待修复后执行 |
| P02 上层产品 | READY_AFTER_P01 | P01 |
| P03 用例状态与API | READY_AFTER_P02 | P02 |
| P04 宿主与遗留退役 | READY_AFTER_P03 | P03 |
| P05 正式合同接入 | SEMANTICS_AVAILABLE_WIRE_PENDING | core-semantics/1已批准；P07编制；真实服务证据另计 |
| P06 前端验收与交接 | IMPLEMENTATION_HANDOFF_GATE | 本端独立范围完成；真实全栈门由后续集成人负责 |
| P07 核心合同与状态交接 | 检查点1完成(2026-09-14) | 检查点2=wire-v1 编制；与P02–P05串行穿插 |

## P01 当前事实（本轮实跑）

- 本地：sidebar 全量 33 文件 241 测试通过；装配反例+3（本地A↔WSL B 交替唯一选择、
  搜索命中激活/清空不抢选择、B 的信息弹窗不移动 A 的选择）；三项目 typecheck exit 0；
  改动文件 eslint 0/0；层序账本 md5 57011a54… 逐字节不变；层序守卫 15/16，
  唯一失败=已知环境基线（IN_FLIGHT 含 agentbox，干净树无 src/agentbox/），未复制 POC。
- Windows（实跑）：dist 已重建（npm run build exit 0）；驱动新沙箱
  agentbox-wsl-round-p01-sandbox 首跑在"WSL 主行选择"步超时——悬浮revealed的
  actions overlay 拦截了主行/箭头中心点击（隐藏操作与主手势的几何冲突，产品侧真实缺陷，
  同时是驱动中心点点击的局限）。修复方向：overlay 右偏让开 caret+对主行/箭头 hover 让位
  （沿用 session-row KEBAB_YIELDS 模式），驱动主行/箭头改位置点击。修复后重建复跑一次。
- 旧失败证据保留：36R postfix 23 PASS/2 SKIP/1 PENDING（39291df）原样保留；本轮新增
  p01-sandbox 首跑失败日志不入 docs/validation 正式目录，待复跑通过后以新目录提交。

初始36R基线39291df，整体PARTIAL。38研究READY_FOR_DECISION，不是Harness生产依赖批准。
不继承旧GREEN，不因工单文件存在宣称功能已交付。
