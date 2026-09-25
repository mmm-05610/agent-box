# 任务卡 E — 执行组合枢纽（execution）

> 2026-09-22：先读 [GOAL-START.md](../GOAL-START.md)。已切换原生 goal，
> 允许中央批准后实施；下文旧沙箱路径、fake 启动与只准准备限制由该文件覆盖。

## 输入 SHA
共同基线 `b067c5718556c8efa93b054e6573ad3d186b3cf6`。Pi 线另列，不并入。

## 必读材料
`backend-coordinated-loop.md` §E；源码只读 `/source/src/agent_box/extensions/runtime_composition/`
与 `/source/src/agent_box/server/execution/`（含 `protocols.py`，**只读**）；`work_core/`（冻结，只读）；
`contracts/catalog.md`（`C-EXEC@v1`、`C-CORE@v1`）。研究现有组合机制，**不预设固定流水线、不另造 Work Core**。

## 职责
- 跨能力**准备依赖、交接、补偿、取消与清理**的协调；向 Core 提交事实，向 Server 提供可靠执行接口。
- 允许探索内部结构；下沉/上移/复用须与接收方逐条确认。
- 下层定义自身能力、约束、资源释放操作及结果；**E 不实现** bwrap 参数、原生 ACP 行为、文件删除策略或另一套进程管理。
- 上层业务策略留在 S。E 不越界理解下层实现，只经必要契约理解之。

## 不负责什么
不新建第二个 Work Core / 平行注册·状态·调度体系；不接管 H 的原生 ACP、P 的进程/沙箱；不定产品业务策略（属 S）。

## 精确写入清单
研究阶段：无产品写权，仅 `/reports /outbox /tests`。
实施阶段（APPROVED 后逐条）：`extensions/runtime_composition/` 内部实现、`server/execution/` 内部实现；
**排除**公开契约 `server/execution/protocols.py`、`extensions/api.py`、`work_core/`（单列，走契约发布流程）。

## 接口依赖
- 提供：`C-EXEC@v1`（可靠单次执行协调）给 S 消费；迁移期"接收方实现并验证后才切换旧路径"。
- 消费：`C-RUNTIME@v1`、`C-RES@v1`（P）、`C-HARNESS@v1`（H）的能力与资源释放操作。
- 契约固定版本引用，在途任务不漂移。

## 反例 / 攻击（方案必须逐一给出，且经这些攻击仍成立）
1. **下沉**：把某下层职责压进 E → E 长出第二套进程/资源生命周期，违反单一权威。
2. **下层替换**：替换 P 的某 runtime 实现 → E 若依赖其内部细节应暴露反例。
3. **上层替换**：替换 S 某产品模块 → E 不应因产品身份而变（实现不知调用者产品身份）。
4. **删除**：删某保留机制 → 说明其必要性；无必要性则不该保留。
5. **部分失败**：多能力准备中其一失败 → 补偿/清理是否完整、"未知 vs 确定拒绝"是否混淆、是否重复释放。

## 方案审批条件
方案列出**保留 / 下沉 / 上移 / 复用 Core 四类职责**并经**接收方确认**；对上述五类攻击无未解决的有效重大边界反例
（**不是全局最小性证明**）。满足后交 C。

## 首次实施任务如何获批（硬预留两次 Sol）
E 的方案核验与实施验收**必须用预留 Sol**（不受其他组并发申请侵占，预算实测 `BUD-*`）：
1. `REVIEW_REQUEST` milestone=`design-final` → C `sol-review` 走 **E 预留#1**（`budget.py` E-design-final）。
2. accept 后 C `approve execution <task> <paths>` → IMPLEMENTING；实施检查点 `milestone=impl-accept` → **E 预留#2**。
追加核验可从机动额度申请，不占用上述两 earmark 之外的语义。

## 输出与状态格式
`/outbox/msg.execution.N.json`；`/reports/` 落：现有组合机制研究、四类职责表、五攻击反例、接口差量。
状态按状态机；无效/驳回审阅 → 回 CENTRAL_REVIEW/RESEARCH（实测 `CTL-invalid-state`）。
