# E Phase 0 接缝事实表 — execution 生命周期/资源接口（2026-09-23）

基线：BE 92a2d2ba（E 树亲读，行号均实测）。引用 C 报告 agents/C/reports/baseline-facts.md §3/§4 免重复环境核验。
用途：BC 汇合、H/S 接缝核对、C 记录 contract_version 前的事实底账。纯研究，零源码改动、零真实调用。

## 1. 组合根与构造

- port_factory 唯一定义处：`server/bootstrap/runtime.py:859`（组合根工厂内闭包）——按 `context["harness_type"]` 取 deployment、读冻结配置对象、解析 credential（Order 120 fail-typed `CREDENTIAL_NOT_AVAILABLE`，runtime.py:859 后段）、要求 `HARNESS_NATIVE_HOME_UNDECLARED` 显式声明。业务层不解释 deployment。
- 后端构造：`runtime.py:1230` `records, objects, approvals, port_factory=port_factory` → `SidecarExecutionBackend`（`server/execution/sidecar_backend.py:180+`）。

## 2. 中立机器单实现（E 写域核心）

- `NeutralRunTracker` 实例化一次：`sidecar_backend.py:222`；属性别名onto同一对象：`:223` `_active=…active_runs`、`:224` `_neutral_runs=…runs`、`:225` `_cancel_receipts`、`:226` `_lock`（身份由 `tests/server/test_e_modular_execution_lifecycle.py` AST/identity pin）。
- 后端仅剩单向薄委托：`submit` `:726-738`、`cancel_execution` `:707-713`、`observe_execution` `:715-724`、`_neutral_event` `:740-742`。无双机、无副本（B5 单写者 pin 扫两模块，见基线 commit 92a2d2ba 信息）。
- 三态 cancel：`execution/lifecycle.py:149-193`。关键语义：prior receipt 短路重放；无 target→`REFUSED_NO_ACTIVE_RUN` 记录；pre-port 窗→答 `UNKNOWN` 但**不记录**（P8 批准(i)，lifecycle.py:170-176）；port.cancel 异常→`UNKNOWN`；receipt 在持有 run.cancel_lock 时写入（防二次 abort dispatch 窗口）。
- 观察纯读：`lifecycle.py:195-228`，`NOT_KNOWN_TO_E`=有界知识非缺席证明；证据类 `DISPATCH_ACK/NATIVE_REPORT/TERMINAL_RECEIPT/CANCEL_CONFIRMATION/NONE`（`execution/contracts.py:65-73`）。
- submit 键声明先于 seam（lifecycle.py:99-107）：竞态双 submit 只建一个 port；factory 类型化拒绝→释放声明留键干净。
- 证据 append-only：`note_native_event` `lifecycle.py:230-238`。

## 3. 动词调用方（真实闭环实际路径）

- 业务路径（今晚闭环实际走的路）：wire→Work Core 队列→`_CoreSidecarProvider.start`（`sidecar_backend.py:136`）→`_start_run`（`:308+`）：port_factory 建 port→能力门 `_capability_gate`（副作用前唯一强制门）→`first_run_gate().acquire`（whole_db_store 时，键 `placement:profile`，`execution/first_run_lock.py:58-106`）→`port.open_execution`→`_Run` 注册进 `_active`（`:292-294`）→completion thread `_complete_then_retire`。`PlacementUnsupported/SandboxPortUnavailable/CapabilityGateRefusal` 均映射 `ExecutionStartRejected`（typed，零歧义，`:141-166`）。
- 中立路径接线现状：全仓 grep 后，server 侧唯一外部动词调用方是 `wire/handlers.py:2168` `self.execution.cancel_execution(execution_id)`（stop 动词）。**未发现任何 wire/service 调用方使用 `submit`/`observe_execution`** —— 中立 submit 目前是可用但未接线的平行入口；今晚闭环不需要新接。
- `DeliveryOutcome`（`execution/contracts.py:33-48`）：明示"naming-round skeleton；no consumer is wired in this batch"，grep 证实仅 `execution_contract.py:14,20` re-export，无消费者。交互响应（审批答复）不经过它。
- 停机：`stop()`（`sidecar_backend.py:748+`）对每个 active run 调 `cancel_execution`（有意丢弃答复），等 run.done 与 completion threads，STOP_DEADLINE_SECONDS=15。

## 4. 审批/交互路由

- backend 持 `approvals` 对象（构造注入，runtime.py:1230）与 `_approval_ports: dict[str, SidecarHarnessPort]`（`sidecar_backend.py:219`）——审批答复按 turn 找 port。具体 wire 消息名与 respond 流程属 S/F1/F3 域，E 不自定义；对 E 的要求仅是"真实审批/输入响应"流经同一 port 语义，无品牌分支。
- capabilities() 是 Work Core SPI 命名空间（`sidecar_backend.py:111-125`），与 Harness canonical abilities 严格隔离（`test_capability_namespace_boundary.py` pin）——连接器注册新 Harness 时不得在此投影。

## 5. 资源接口

- `ExecutionRequest`（`execution/contracts.py:98-113`）：execution_key 由调用方在自己记账后发键；`resource_bindings` 为 `NeutralBinding(contract_id, object_digest, mount_token)` 不透明引用；`correlation` 原样透传不解释（IFR-04 归 sidecar/C-HARNESS）。
- lifecycle 把 binding 展开为 context 交 port_factory（`lifecycle.py:108-126`）；实际解析/挂载在 sidecar 通道与 `server/execution/delegation.py`、`resource_contracts/`（H 域交界）。`_BoundResources` 注册为 Work Core resource provider（`sidecar_backend.py:~212`）。

## 6. 与 H/S 接缝结论（给汇合）

- H（BE-HARNESS）：per-harness 原生语义全在 `SidecarHarnessPort`（`sidecar.py:1204`）+ Node sidecar + plugins/agent-box-harness*。E 域对 H 只承诺 opaque port 契约（`cancel_lock/cancel_confirmed/port` 属性 + `open/close/cancel/pid`）；H 新增连接器不得在 lifecycle/backend 加分支。
- S（BE-SERVICE）：切换≠取消、"运行或待审批时禁切 Harness"的判定应由 S 用 `observe_execution`/run 事实组装——E 不再造第二状态机；若 S 需要按 session 聚合观察，那是 service/facade 域。F1+S 接缝事实表与本表 §3 对齐即可，无 execution 层新接口需求（除非汇合提出，先报 C）。
- Work Core 冻结前提：本域未发现必须改 Work Core 才能闭环的阻塞；`_CoreSidecarProvider` 已是既成 SPI 实现。

## 7. 最小缺口预判（待汇合裁定，非批文）

1. stop 错误三态已具备；真实闭环剩余风险在 wire→S 的"unknown 是否如实上屏"，属 F3/S 呈现域。
2. 中立 submit 未接线且业务 submit 路径健康——不建议为"抽离"而接线（避免第二入口语义分叉）；汇合若裁定要接，需 C 批精确路径。
3. `first_run_gate` 的 300s 有界等待是唯一已知并发串行点；Pi/Codex 双家并行首跑共用库场景由 S2a/Order 80 已覆盖，无需 E 改动。

## 8. CP4 进程级夹具复验预设计（E 预研，零写入零预算；供 C 批文直接引用）

承 BC-0006 §6/收编声明："active 恰含 awaiting-approval" 的进程级复验挂 CP4（Pi/Codex 批后）。最小复验面：

1. 场景 A（闸必拦）：真实 Harness 会话触发审批请求且不答复 → Turn 稳定停于 `running`（无 awaiting* 态，见 §E-0005 复核）→ 调 `switch_profile` 预期被拒并回旧链接（repository.py:326-331/358-366）；`executions.list` 台账该 run 仍列 active。
2. 场景 B（放行）：答复审批（`approvals.decide`）使 run 进入终态后，`switch_profile` 应成功——证明闸非永久粘滞。
3. 场景 C（停止≠取消误判检查）：待审批中发 stop → `stop_requested_at` 置位投影为 `stopping`（projection.py:204-205），仍属 active；禁止把" stopping"当已切允许。
4. 断言仅用公开 wire 面 + 只读 SQL 对账，不新增接口、不改 execution 包；若复验暴露缺口，按 E-0003 建议 3 只在 wire/S 侧补真。
- 成本口径：场景 A/B 各需 1 次真实审批触发（计入 C 预算闸门），场景 C 可用夹具内审批不答复实现，零额外模型请求。
- §6 品牌中立实证补记（2026-09-23 待命轮，E-0006 后）：`grep -rin "codex|dsh|kilo|qwen|\bpi\b" src/agent_box/execution/` 零命中——执行包全文无品牌拼写，opaque key 契约中立性有机器可复核证据；H 的 harness-{pi,codex} 批预计零触碰 E 域的判断由此加固（若批后复验出现例外，以事实回本件更正）。

### §8 附注（09:3x）：预设计在上游新基线上的有效性

@60d868ef 实测 `git diff 92a2d2ba..60d868ef -- src/agent_box/` 为空（见 reuse.md 补记）——§8 三场景断言所依赖的
repository/wire 面与 92a2d2ba 逐字节同形，夹具复验设计**无需随两批修订**，可直接被 B-JOINT-001/R2 批文引用
（C-0052 前置序：R2 VERIFIED→联调；挂点 baseline0）。BC-0023 §2.1 判过标准（FE 可见帧+raw_events 回放一致）
与 §8 场景 A/B 的 approval 事件断言使用同一公开面，零新增接口维持。
