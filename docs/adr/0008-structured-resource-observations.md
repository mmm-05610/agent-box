# ADR-0008：结构化 Resource Observation 账本

Status: Current — retained as an active architectural decision.

> 文档导航：[总目录](../README.md)

- 状态：Accepted and implemented for Preview
- 日期：2026-08-27
- 范围：Execution 冻结输入的 post-run 结构化观察（ResourceObservation）的表示、持久化与展示边界
- 结论：**ResourceObservation 是 frozen value object，不是 Core entity。观察以 INSERT-only 账本行持久化在专用 append-only 表中；Core 只做结构校验、frozen-input 关联与追加/查询，不比较 claim、不排名观察者、不推导最终结论。**

## 1. 问题

冻结的 `(contract_id, Ref)` input association 回答"这次执行依据什么启动"，
但从不回答"run 结束后，这些被冻结的资源实际怎么样了"。现有观察通道是
`apply_observation(..., resource_states=())` 的自由字符串（≤256 字符 +
可选 ArtifactRef）：

1. 任何插件可以把 `consumed` 这类词写进 state，Core 无从辨伪（projected
   永远不能被升级为 consumed 的边界只存在于文档道德里）；
2. "谁说的"（provider 自报还是独立回读）没有结构位，Host UI 无法诚实
   渲染；
3. 冲突观察（provider 说 MATCH、host 回读说 MISMATCH）在事件流里自然共存，
   但没有任何视图能把它们并排陈列；
4. Host UI Evidence 页只能显示计数与硬编码的 `coverage unavailable`。

## 2. 决策

### 2.1 ResourceObservation 是 value object，不是 entity

```python
@dataclass(frozen=True)
class ResourceObservation:
    contract_id: str
    ref: Ref
    kind: ResourceObservationKind          # PROJECTED | READ_BACK | CONSUMPTION_REPORTED
    result: ResourceObservationResult      # MATCH | MISMATCH | UNKNOWN | UNVERIFIABLE
    observer_role: ResourceObserverRole    # EXECUTION_PROVIDER | RESOURCE_PROVIDER | HOST_OBSERVER | EXTERNAL_AUTHORITY
    observer_id: str
    observed_at: datetime
    coverage: ResourceObservationCoverage  # COMPLETE | PARTIAL | UNKNOWN
    evidence_ref: Ref | None = None        # 必须是 ArtifactRef
    detail: str | None = None
```

它没有业务生命周期、没有聚合根身份、没有 repository 之外的写路径，是既有
`resource_states` 观察通道的类型化重铸。ADR-0006 禁止的 ResourceFact、
Evidence、BindingSlot 等 entity 在这里依然不存在：一条 observation 不改变
Execution 的任何状态，不引入新的领域关系，只是"关于某个冻结输入的、被声明
的事实"的存储形态晋升。这与 `core_dispatches` 表（Dispatch receipt 的晋升）
地位完全对称。

### 2.2 为什么需要专门 append-only 表

两个现有持久位置被证明无法表达一条诚实观察：

- `core_execution_refs` 对同一 identity Ref 使用 `INSERT OR IGNORE`，同一
  资源在不同时刻的两次观察物理上只能存在一行；
- 观察若走 `CoreEvent`，必须穿过有界元数据合同（≤16 键 × ≤256 值）。一条
  完整观察需要 ~14 个字段，放不下；放宽全局上限会动摇所有事件生产者与
  消费者共享的不变量，代价比一张新表大得多。

因此迁移 `007_resource_observations.sql` 新增 `core_resource_observations`
INSERT-only 表：`(execution_id, contract_id, Ref identity, kind, result,
observer_role, observer_id, observed_at, coverage, evidence locator, detail)`
+ `observation_digest UNIQUE`（幂等键）+ `recorded_at`。表上没有
UPDATE/DELETE 路径，测试以 grep 断言这一点。

### 2.3 字段最小化依据

每个幸存字段都对应一个"不存就无法回答"的查询：谁断言的（observer_role +
observer_id）、断言什么主张（kind）、与冻结输入比较的结论（result）、观察面
大小（coverage）、何时观察（observed_at）、证据在哪（evidence_ref）、可读
说明（detail，COMPLETE/PARTIAL 时必填以划界观察面）。明确拒绝的字段：

- **confidence / assurance / trust score**：主观分数会诱发 UI 打勾剧场，
  且没有任何 ground truth 能惩罚乱填；
- **method / authority 独立列**：方法说明属于 detail 文本与插件文档；
  authority 语义已由 observer_role 承载（且 role 只是署名，不是担保）；
- **valid_at / stage / integrity**：事件已有 recorded_at；pre-start 拒绝已
  由 dispatch failed 表达；完整性 digest 已在 ArtifactRef.native_id；
- **predicate=observed 语法**：本批采用更直白的 kind/result 二轴
  （PROJECTED/READ_BACK/CONSUMPTION_REPORTED × MATCH/MISMATCH/UNKNOWN/
  UNVERIFIABLE），provider 无法通过构造任何 kind+result 组合把"投影"伪装成
  "回读验证"。

### 2.4 Core 与 Plugin 的责任边界

Core 只做四件事：结构校验（枚举、长度、ArtifactRef 形状、构造期规则）、
关联（observation 必须精确命中该 Execution 的 frozen INPUT association，
任意 Ref 拒绝）、append/list、未观察输入查询（`list_unobserved_inputs`
是纯 bookkeeping anti-join）。Core 不理解 Git HEAD、MCP call、credential
的具体语义；一切 read-back 方法、比较逻辑、coverage 声明、evidence artifact
生产都留在 ResourceProvider/Host。多个观察者对同一输入提交互相冲突的
observation 全部保留并排陈列，Core 不挑选最终真相，不自动改变 Execution
outcome。

### 2.5 observer role 不等于信任证明

`observer_role` 是观察者的**申报署名**，不是 Core 授予的信任等级。同进程
插件可以谎报 role——这在 in-process 信任模型下无法根治（与 ADR-0007 的
"插件是可信代码"立场一致）。Core 的义务是让谎言留下语法痕迹：Host UI
必须显示 observer role 与 observer id，provider 自报
（EXECUTION_PROVIDER / RESOURCE_PROVIDER）永远渲染为"self-report"，不得
显示为独立验证；EXTERNAL_AUTHORITY / HOST_OBSERVER 才可渲染 "independent"。

### 2.6 coverage 边界

`COMPLETE` 只表示"在 detail 声明的有限观察面内完整"（如 "tracked HEAD/tree
at finish"），不表示系统全局完整。因此 COMPLETE/PARTIAL 的 observation 在
构造期强制要求非空 detail 划界观察面；没有 detail 的 COMPLETE 连实例都造
不出来。

### 2.7 terminal 之后允许迟到 observation

观察账本与 projection 通道完全隔离：terminal Execution 仍可追加迟到的
observation（迟到 CI 结论、崩溃恢复补录、人工复核），追加不改变 phase、
outcome、Work lifecycle，也不写 execution version（有回归测试钉死）。

### 2.8 observation 不改变 outcome

Execution outcome 只能由 provider terminal projection 推动；observation 是
关于资源的账，outcome 是关于执行的账，两个账户没有写路径交叉。同样，
observation 也不是 Work completion 的输入——complete_work 仍是 Human 显式
动作。

### 2.9 legacy resource_states 兼容

`apply_observation(..., resource_states=())` 原语义逐字节保留（非空 ≤256
字符串、fixed-INPUT 守卫、相同 state 去重、可选 ArtifactRef）：现有插件与
测试不需要任何修改。legacy 字符串不会被自动升级为结构化 observation；读侧
（Host UI）将其渲染为 "Legacy provider observation — confidence/coverage
unknown"。该通道标记 deprecated，本批不删除。

## 3. Host UI 展示规则

Host UI 只做读模型与展示，不向 Core 加入 UI schema：

- 每个 frozen input 下列出全部 observation（ledger 序），observer role 与
  observer id 必须显示；
- provider 自报必须带 self-report 标注，不得显示为独立验证；
- MISMATCH 显著标注（⚠）；UNKNOWN / UNVERIFIABLE 必须可见；
- 冲突 claim 并排显示，不自动裁决；
- legacy resource state 显示为固定灰条文案；
- 不展示总可信度分数，不渲染全绿勾墙，不显示 "all resources used"；
- 无 observation 的 input 显示 "No observation recorded." 与
  `Consumption: UNKNOWN`，不留空白冒充通过。

## 4. 明确不做

本决策不引入：

- ResourceFact / Evidence / Binding 实体或 BindingSlot；
- generic comparator、reconciliation engine、effective final disposition；
- trust ranking、confidence 分数、signed attestation；
- 对 observation 表的 update/delete/withdraw API（更正 = 追加新行）；
- resource-observed 新 EventType（表本身是事实账本；现有读取路径无需事件
  通知）；
- 旧 resource-state 事件回填（事后猜测 predicate/issuer 是 fabrication；
  读侧以 legacy 灰条诚实呈现）；
- Provider 提交 MATCH 的复杂禁令（provider 可以自报 MATCH，但 UI 必须显示
  其 observer role，不能升级为独立验证）；
- Git/MCP/credential 的任何具体判断进入 Core。

## 5. 当前代码依据

- [services.py](../../src/agent_box/work_core/services.py)：
  `apply_observation(..., resource_observations=())` 与
  `record_resource_observations()` 先整批校验，再统一走 repository 的单事务
  批量追加路径；
  `resource_states` shim 原语义保留。
- [repository.py](../../src/agent_box/work_core/repository.py)：
  `record_resource_observations`（单事务批量原子追加）/
  `record_resource_observation`（单条薄包装）/
  `list_resource_observations` / `list_unobserved_inputs`；frozen-input
  关联守卫；`observation_digest` 幂等。
- [resource_observations.py](../../src/agent_box/work_core/resource_observations.py)：
  frozen value object 与四个受控枚举、构造期校验。
- [007_resource_observations.sql](../../src/agent_box/migrations/007_resource_observations.sql)
  与
  [008_resource_observation_evidence_metadata.sql](../../src/agent_box/migrations/008_resource_observation_evidence_metadata.sql)：
  append-only 表、CHECK 约束与 evidence metadata 列。
- Web Host：[HostApplication](../../plugins/agent-box-web/src/agent_box_web/application/facade.py)
  展示当前的输入与 evidence summary；具体呈现仍属于 Host。

## 6. 实施更新 — 2026-08-28：evidence metadata 与批量原子性

### 6.1 evidence_ref.metadata 完整持久化（migration 008）

007 只保存 evidence locator（type/provider/native_id/uri），读取时 metadata
被重建为 `{}`，破坏 ArtifactRef round-trip。008 新增列
`evidence_meta_json TEXT NOT NULL DEFAULT '{}'`：

- repository 写入 evidence_ref 时保存规范化 metadata JSON；
- `list_resource_observations()` 重建完整、相等的 ArtifactRef（含 metadata），
  已由 `test_evidence_ref_metadata_round_trips_completely` 钉死；
- 007 历史行的 metadata 从未被记录，读取保持 `{}`，不伪造补齐；
- `observation_digest` 仅在 evidence metadata **非空**时向 digest payload
  增加 `metadata` 字段：空 metadata 的 digest 与 007 时代算法逐字节一致
  （`test_empty_evidence_metadata_keeps_legacy_digest_algorithm` 用旧算法
  golden 值钉死），历史行不重算；metadata 不同的 evidence Ref 产生不同
  digest 并并存（`test_evidence_metadata_differences_produce_different_digests`）。

### 6.2 批量追加的原子性边界

三层语义必须区分清楚，不得夸大：

1. **validation-before-write**：`record_resource_observations()` 与
   `apply_observation(..., resource_observations=...)` 在任何写入前对整批
   做结构/frozen-INPUT 校验，任一条不合法即整批拒绝、零写入；
2. **typed ResourceObservation 批量原子**：repository
   `record_resource_observations(execution_id, observations, *, recorded_at=None)`
   在一个 write lock + 一个 SQLite 事务内完成整批 frozen-INPUT 复核与整批
   INSERT；任意一条失败（含事务中途失败）整批 rollback
   （`test_repository_batch_append_rolls_back_on_late_invalid_entry` 与
   `test_repository_batch_append_rolls_back_mid_transaction` 钉死）；批内
   重复 digest 仍是幂等 no-op。单条 `record_resource_observation()` 是该
   批量方法的薄包装；
3. **apply_observation 整包未承诺单事务**：projection 更新、native/output
   refs、legacy resource_states 与 typed 批次当前分段提交，本 ADR 不声称
   "整个 observation bundle 原子"；typed 子批次之上已由第 2 层保证。

表仍然没有 UPDATE/DELETE 路径；重复 digest 幂等；terminal Execution 可追加
迟到 observation 且不改 phase/outcome/version——均维持 §2 原语义。
