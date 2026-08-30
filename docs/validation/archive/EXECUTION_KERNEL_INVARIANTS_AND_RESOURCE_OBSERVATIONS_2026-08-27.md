# 实施报告：Execution Kernel 不变量修复 + 最小结构化 ResourceObservation

日期 **2026-08-27**。分支 `spike/real-governed-binding`（dirty worktree，未做任何
Git 操作，未触碰无关改动）。本报告对应批次：Preview-grade Execution Kernel 第一批
补强（terminal/Dispatch 不变量 + 结构化 ResourceObservation + WorkBoard 诚实展示）。

设计输入：round-3/01、round-4/01、round-4/02、round-4/04、ADR-0006；裁决遵循任务
指令中的冻结边界（不新增 ResourceFact/Evidence/Binding/BindingSlot/Finish/
Continuation entity，不做 workflow/policy/trust/plugin SDK）。

---

## 1. 完成了哪些工作

### Phase 0 · Kernel 不变量

1. **terminal projection 单调**（`services.py::observe_projection`）
   - 新增 `InvalidProjectionTransition`（`errors.py`）。TERMINAL 之后：
     TERMINAL→ACTIVE、TERMINAL→UNKNOWN、TERMINAL outcome 变化一律拒绝；
     相同 terminal 语义重复 observation 幂等 no-op（无事件、无 version 写入）；
     陈旧 observation（observed_at 更早）照旧丢弃。
   - 测试：`tests/test_work_core_services.py::test_terminal_projection_is_monotonic_after_first_terminal_observation`。
2. **禁止 resume terminal Execution**（`services.py::resume_execution`）
   - 顺序改为：先判 `phase is TERMINAL` 直接 `ExecutionNotResumable`，再检查
     `resumable_now` 与 provider resume capability。provider 不再能通过在 terminal
     投影里填 `resumable_now=True` 打开恢复口子。
   - 修正三处 provider 的 terminal `resumable_now=True`：
     `plugins/agent-box-codex/.../provider.py`（app-server）、
     `plugins/agent-box-codex/.../tmux_provider.py`、
     `plugins/agent-box-pi/.../provider.py`。Native session 继续只能通过新
     Execution 的 continuation SessionRef INPUT 走 governed dispatch。
   - 反向测试改写：`tests/test_work_core_vertical_slice.py` 中"terminal 后 resume
     成功"断言改为 rejection 断言，并新增
     `test_same_session_continuation_uses_new_execution_with_sessionref_input`
     （新 Execution + 新 Dispatch + 旧 SessionRef 作为 frozen INPUT，Core/插件
     语义均未被改动迎合）。
3. **删除 legacy `request_dispatch()`**
   - 服务方法删除；`repository.create_dispatch()`（唯一的免冻结 dispatch 行构造
     路径）一并删除。全仓 `rg` 确认无残留调用点（docs 中的历史研究/计划文档按
     约定不改写）。未提供任何免输入替代入口。
   - `tests/test_work_core_input_dispatch.py::test_legacy_request_dispatch_no_longer_exists`
     钉死方法不存在，且空输入 dispatch 在 provider 数量检查处被拒、不落库。
4. **Dispatch idempotency 显式化**（`services.py::dispatch_execution` existing-key 分支）
   - `accepted`：同 execution、同 digest 返回现有 request/receipt，**不再次调用
     provider.start**；
   - `failed`：抛 `DispatchFailed`，附此前记录的有限错误（从 append-only 事件账本
     读取），不再静默构造 StartRequest；
   - `requested`（崩溃窗口）：抛新专用错误 `DispatchAmbiguous`，明示无法证明
     provider.start 是否已产生 side effect；本批不实现 recover/retry；
   - execution/digest 不一致仍 `DispatchRejected`。
   - 精确测试断言 `provider.started` 调用次数：
     `test_replay_of_accepted_dispatch_returns_receipt_without_restarting`、
     `test_replay_of_failed_dispatch_raises_recorded_error_without_restarting`、
     `test_replay_of_requested_dispatch_is_explicitly_ambiguous`、
     `test_replay_with_different_execution_or_digest_is_rejected`。

### ResourceObservation 最小模型 + 持久化 + API

5. **frozen value object**（新模块 `src/agent_box/work_core/resource_observations.py`）
   - `ResourceObservation` + 四个枚举
     （kind：PROJECTED/READ_BACK/CONSUMPTION_REPORTED；result：
     MATCH/MISMATCH/UNKNOWN/UNVERIFIABLE；observer_role：EXECUTION_PROVIDER/
     RESOURCE_PROVIDER/HOST_OBSERVER/EXTERNAL_AUTHORITY；coverage：
     COMPLETE/PARTIAL/UNKNOWN），构造期校验：contract_id 符合 `vendor.name@1`
     规则、ref 必须是 Ref、observer_id 非空 ≤64、observed_at 必须是 datetime、
     evidence_ref 必须是 ArtifactRef、detail ≤256、**COMPLETE/PARTIAL 必须在
     detail 中声明观察面**。未引入 confidence/assurance/method/valid_at/stage/
     integrity/trust score。secret value 不入库（无 value 字段；detail 有界）。
6. **append-only 表**（迁移 `007_resource_observations.sql`，编号经核实为下一个
   未占用编号）
   - `core_resource_observations`：internal id、execution_id FK、contract_id、
     Ref identity 五元组 + identity digest、kind/result/observer_role/observer_id/
     observed_at/coverage、evidence locator 四列、detail、`observation_digest
     UNIQUE`（幂等键）、recorded_at。SQL CHECK 约束枚举。
   - Repository 不提供任何 UPDATE/DELETE；重复 digest 幂等返回
     `(id, created=False)`；observation 必须精确命中该 Execution 的 frozen INPUT
     association（contract_id + 完整 Ref identity），任意 Ref 拒绝；多个观察者的
     冲突 observation 自然并存；terminal Execution 可追加迟到 observation 且不
     改变 phase/outcome/version；旧 resource-state 事件不回填。
7. **Repository/Service API**
   - Repository：`record_resource_observation` / `list_resource_observations` /
     `list_unobserved_inputs`（纯 anti-join 查询）。
   - Service：`record_resource_observations(execution_id, observations)`；
     `apply_observation(..., resource_observations=())` 复用同一校验/持久化路径
     （校验先于一切写入，失败即整批拒绝）。
   - legacy `resource_states=()` shim 原语义保留（非空 ≤256、fixed-INPUT 守卫、
     相同 state 去重），文档标记 deprecated（ADR-0008 §2.9），未升级为结构化
     observation，未删除。
   - Core 未引入 generic comparator、trust ranking、effective disposition、
     Git/MCP/credential 判断，observation 不自动改变 outcome。

### WorkBoard 最小展示

8. **Evidence/detail 视图重写**（`plugins/agent-box-workboard`）
   - `model.py`：删除硬编码 `coverage="coverage unavailable"`；新增
     `ObservationSummary` / `InputEvidenceSummary` 读模型，按 frozen input 分组
     全部结构化 observation 与最新 legacy state（含 `has_mismatch`、
     `consumption` 派生属性；只做展示派生，不写 Core、不加 UI schema）。
   - `render.py`：`evidence_lines()` 逐输入渲染 Frozen 状态 + 全部 observation：
     observer id 与 role 必须显示；EXECUTION_PROVIDER/RESOURCE_PROVIDER 一律
     "self-report" 标注、绝不显示为独立验证；HOST_OBSERVER/EXTERNAL_AUTHORITY
     渲染 "independent"；MISMATCH 加 ⚠ 显著标注；UNKNOWN/UNVERIFIABLE 可见；
     冲突 claim 按 ledger 序并排、不裁决；legacy state 渲染为
     "Legacy provider observation — confidence/coverage unknown"；无 observation
     显示 "No observation recorded." 与 `Consumption: UNKNOWN`。不渲染总可信
     分数、绿勾墙或 "all resources used"。
   - `app.py` Evidence detail 视图改用同一数据源。

### 最小真实观察 vertical slice

9. **tests/test_work_core_real_resource_observation.py**（真实 Git + 临时目录，
   无新生产 adapter）
   - 冻结 Git workspace Ref（真实 `GitWorktreeResourceProvider.make_ref`）；
   - run 后回读实际 HEAD/tree → `READ_BACK/MATCH`；
   - 故意提交 drift → 回读 `READ_BACK/MISMATCH`；
   - prompt：`PROJECTED/MATCH`（provider 自报）+ `CONSUMPTION_REPORTED/
     UNVERIFIABLE`；
   - 同一 workspace input 上 provider self-report MATCH 与 host read-back
     MISMATCH 两条并存、UI 不覆盖；
   - 一个从未被观察的 frozen input 由 `list_unobserved_inputs()` 返回；
   - terminal 后追加迟到 observation，outcome 零变化。

## 2. Backward compatibility

- **数据库**：007 为纯新增 CREATE TABLE，零回填、零改写既有表；旧库按
  `schema_versions` 正常升级。legacy dispatch 行（v006 归档/`legacy-unverifiable`
  态）读取路径未动——读取不崩，但不为历史行补新功能。
- **插件**：`apply_observation(..., resource_states=())` 语义逐字节保留；三个
  in-tree 插件（codex/pi/tmux）与 preview-resources、workboard 的全部既有测试
  不经修改通过（唯一插件 diff 是三处 terminal `resumable_now=True` → `False`，
  这是 Core 不变量所要求的正名，不是协议变更）。extensions/、registry、
  resource_contracts/ 零 diff。
- **脚本**：`scripts/preview_demo/*` 继续走 legacy resource_states 通道，无需
  改动。
- **新 API 全部为增量**：`resource_observations` 参数有默认值；
  `record_resource_observations` / `list_resource_observations` /
  `list_unobserved_inputs` 为新增方法，不影响现有调用面。

## 3. 测试结果

定向顺序执行，最后全量：

| 范围 | 结果 |
|---|---|
| 定向（vertical_slice / services / input_dispatch / resource_observation / repository / contracts） | 30+ passed（修改后） |
| 新增 `tests/test_work_core_resource_observations.py`（构造校验、frozen 匹配、non-input 拒绝、多同 contract input、ArtifactRef、append-only grep、幂等 digest、多 observer 冲突并存、unknown/unverifiable、complete/partial detail 要求、terminal 后追加不改 outcome、legacy 兼容） | 10 passed |
| 新增 `tests/test_work_core_real_resource_observation.py`（真实 Git read-back MATCH/MISMATCH vertical slice） | 1 passed |
| 主套件 `tests/` | **261 passed, 1 skipped** |
| plugins：codex 9 / pi 39 / preview-resources 2 / tmux 7 / workboard 33（含新增 `test_evidence_view.py` 6 项：MATCH、MISMATCH、self-report、UNKNOWN、UNVERIFIABLE、conflict、legacy、无 observation） | **90 passed** |

无环境性失败，无跳过伪造；skipped 项为既有的与本批无关用例。

## 4. 尚未实现（显式清单，均为任务冻结边界内）

- Work optional 化；
- Plugin SDK / doctor / scaffold / conformance kit；
- LangGraph / Temporal / GitHub Actions adapter；
- workflow / node / edge / routing / retry / scheduler / policy engine；
- `DispatchAmbiguous` 之后的 recover/retry 通道（仅显式报错）；
- requested-selector provenance、Finish ledger、continuation lineage 字段、
  Scope/Case、generic reconciliation/comparator、trust ranking、signed
  attestation、plugin sandbox、marketplace；
- resource-observed 新 EventType（表即事实账本，现有读取路径够用，未证明需要
  事件通知）；
- `EXECUTION_RESUMED` 审计事件与 resume 动作留痕（round-4/04 附加建议，超出
  本批裁决范围，未做）；
- legacy `resource_states` 通道的删除（仅 deprecated 标记）。

## 5. 结论

**READY FOR PLUGIN SDK IMPLEMENTATION**

依据：本批收口后，插件契约所依赖的 Kernel 不变量全部成立且被测试钉死——
terminal 历史密封、terminal 不可 resume、dispatch 唯一 governed 入口、幂等重放
行为显式可断言；插件观察面获得类型化 ResourceObservation 通道（含
unknown/unverifiable 与 conflict 并存语义），legacy 通道兼容未破坏；WorkBoard
能诚实渲染 frozen input 与 post-run observation。ADR-0008 与 ADR-0006 附录已
记录协议边界。未发现需要阻塞 SDK 立项的缺口。

---

## 6. 收尾批次 — 2026-08-28

同一分支（dirty worktree，未做任何 Git 操作，未触碰无关改动）上的三项 Core
收尾修复。上一批 §1.2 的"禁止 resume terminal Execution"在本批进一步收敛为
"Core 根本不提供 same-Execution resume"；上一批把三个 Provider 的 terminal
`resumable_now=True` 机械改为 `False`，本批按真实 native continuity 证据重新
正名。语义澄清：**terminal Execution 永不 reopen，但其 native SessionRef 仍可
作为新 Execution 的 continuation input；`resumable_now` 只是 continuation
advisory，不是 reopen 许可。**

### 6.1 same-Execution resume 清理

- 删除 `ExecutionService.resume_execution(...)` 与错误类型
  `ExecutionNotResumable`（其唯一生产用途就是该入口）。全仓检索确认无残留
  调用点。
- `terminal + resumable_now=True` 为合法 projection；terminal guard 继续密封
  phase/outcome/Execution 历史。同一 terminal/outcome 下 freshness 与
  continuation advisory 可按 observed_at 规则更新，不改写 outcome，且不改写
  `ended_at`（write-once，本批显式修复并钉死——原实现会把 advisory 更新误当
  新 terminal 周期刷新 ended_at）。
- In-tree Provider terminal advisory 依据：
  - `codex-app-server`：线程以 `ephemeral: False` 创建、`thread_id` 经
    app-server 确认 → `True`；
  - `codex-tmux-interactive`：SessionStart hook 是否记录到 codex session id
    → `True`/`False`；
  - Pi tmux：terminal 时是否实际定位到 session JSONL → `True`/`False`；
  - unknown/unreachable projection → `None`（无法判断不伪造）。
- WorkBoard/TUI 全仓检索确认从未渲染 `resumable_now`，无 "Resume this
  Execution" 文案，本项无需改动；约定：未来渲染必须用
  "Native continuation available" 类表述。
- 新增/改写测试：`test_core_exposes_no_same_execution_resume_entrypoint`、
  `test_terminal_with_resumable_now_true_is_a_legal_projection`（advisory
  True→False 不改 outcome/ended_at，terminal→active/outcome 改写仍被拒）；
  vertical slice 三个测试从 "resume 被拒" 改为 "resume 入口不存在"，continuation
  流程断言（E2 frozen INPUT 复用 E1 SessionRef、E1 永远 terminal）不变。

### 6.2 evidence_ref.metadata 持久化（migration 008）

- 新增 `008_resource_observation_evidence_metadata.sql`（编号经核实未占用）：
  `core_resource_observations` 增加 `evidence_meta_json TEXT NOT NULL
  DEFAULT '{}'`。007 表结构未改动。
- repository 写入保存规范化 metadata JSON；`list_resource_observations()`
  重建完整相等 ArtifactRef（含 metadata）。007 历史行读取保持 `{}`，不伪造。
- `observation_digest` 仅在 evidence metadata 非空时附加 `metadata` 字段：
  空 metadata digest 与旧算法逐字节一致（golden 值测试钉死），历史行不重算；
  metadata 不同 → digest 不同 → 并存。
- 新增测试：round-trip 相等、digest 区分、legacy digest golden、v007→v008
  升级（旧行 `evidence_meta_json == '{}'`，不回填）。

### 6.3 ResourceObservation 批量追加原子化

- 新增 repository `record_resource_observations(execution_id, observations, *,
  recorded_at=None)`：一个 write lock + 一个 SQLite 事务，整批 frozen-INPUT
  校验先于一切写入，整批 INSERT，任一失败整批 rollback，批内重复 digest 幂等
  no-op，返回每条 `(row_id, created)`。单条 `record_resource_observation()`
  成为薄包装（兼容不变）。
- `ExecutionService.record_resource_observations()` 与
  `apply_observation(..., resource_observations=())` 均改调批量方法。
  `apply_observation` 的语义边界（写入 ADR-0008 §6.2）：整批校验先于一切写入；
  typed 子批次单事务原子；**projection + refs + legacy resource_states +
  typed 的整个 bundle 仍未承诺跨所有部分单事务**，本批未扩大事务架构。
- 新增测试：repository 级 frozen-association 整批拒绝、注入中途失败的真回滚
  （第一条不残留）、批内重复 digest 幂等、service 级零部分写入、空批 no-op。

### 6.4 测试结果

| 范围 | 结果 |
|---|---|
| 定向 work_core（work_core / resource_observations ×2 / services / vertical_slice / repository / input_dispatch / contracts / responsibility / real ×2 / cli） | 72 passed |
| 主套件 `tests/` | **272 passed, 1 skipped**（skip 为既有 bwrap/claude 环境门控用例，与本批无关） |
| plugins：codex 9 / pi 39 / preview-resources 2 / tmux 7 / workboard 33 | **90 passed** |

无环境性失败；未伪造任何通过。

### 6.5 未解决且明确不属于本批

- `apply_observation` 整 bundle（projection+refs+legacy+typed）跨部分单事务；
- accepted Dispatch 重放时重新 resolve inputs 的问题（任务明令不顺手修改）；
- `resumable_now` 字段向 SessionRef/provider derived observation 的迁移
  （ADR-0001 兼容期保留）；
- legacy `resource_states` 通道删除（仍仅 deprecated 标记）。

### 6.6 结论

**READY FOR PLUGIN SDK IMPLEMENTATION**（维持；本批消除了 resume 语义尾巴、
evidence round-trip 缺口与批量原子性缺口，未引入新的 Core 实体或状态机改动。）
