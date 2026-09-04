# Unified Session 与 Harness Session Codec 设计（已被取代）

> 状态：SUPERSEDED — 仅保留为决策演进记录
>
> 当前 canonical 设计为
> [`EXECUTION_TREE_AND_CROSS_HARNESS_SESSION.md`](./EXECUTION_TREE_AND_CROSS_HARNESS_SESSION.md)。
> 新设计保留 Official Session、Native Original、Loss Report 和 Harness-owned
> translation 的有效部分，但取消“每轮重建完整目标原生 Session”的对称 Codec
> 假设：同 Harness 直接使用冻结的原生 checkpoint resume，只有跨 Harness 时才读取
> 公共历史；Session 同时升级为 branch-aware Execution Tree。
>
> 本文取代此前的 Leg、显式 handoff、摘要接续和“多个 Harness 各自维护一条
> 会话”的方案。本文中的 Session 始终指 Agent-Box 官方 Session。

## 1. 目标

Agent-Box Studio 中，一个 Session 表示一段连续的工作历史。Session 不绑定
Harness；用户可以逐轮选择 Codex、Claude Code、OpenCode、Hermes 或 Pi，后续
Harness 应当像继续同一个会话一样读取当前有效上下文。

连续性不能通过一段隐藏摘要或普通 prompt 冒充。实现方式是：

1. Agent-Box 定义唯一的官方 Session 格式；
2. 每个 Harness 插件拥有自己的 Session Codec；
3. Codec 在官方格式与该 Harness 的原生 Session 格式之间读写转译；
4. 每条官方记录同时保存公共语义和来源 Harness 的原始记录；
5. 执行前物化目标 Harness 的临时原生 Session View；
6. Harness 正常执行、resume 和 compact；
7. 执行产生的增量重新导入官方 Session。

```text
                         Agent-Box Official Session
                   完整历史 + 有效上下文 + 原生来源记录
                                      │
             ┌────────────────────────┼────────────────────────┐
             │                        │                        │
       Codex SessionCodec      Claude SessionCodec      OpenCode SessionCodec
             │                        │                        │
       Codex native view       Claude native view       OpenCode native view
```

## 2. 已确认的产品裁决

以下内容不是待实现者自行选择的建议，而是本设计的固定约束。

1. Session 高于 Harness，Harness 是逐轮执行参数。
2. 一个 Session 第一版严格串行，同一时刻只有一个写入执行。
3. 并行、分支与合并属于后续能力，本阶段不设计。
4. 普通跨 Harness 连续不使用摘要 handoff。
5. 官方 Session 保存完整公共语义以及来源 Harness 的原始内容。
6. 不持久化其他 Harness 的派生 Session 内容；派生内容按需生成。
7. 同源原生内容直接复用，异源内容从公共语义转译。
8. compact 改变全局有效上下文，但不删除完整历史。
9. 超出目标 Harness 上下文窗口时阻止执行，要求用户显式 compact。
10. 未识别的 Harness 或 Session 格式版本必须 fail closed。
11. 可接受的转译损失在执行前展示 Loss Report；关键损失直接阻止。
12. Harness 执行事件持续入账，但只有终态 Turn 才算完整提交。
13. Session Protocol 属于 Agent-Box；具体 Codec 属于 Harness 插件。
14. Studio 负责调度和展示，不包含厂商 Session 格式知识。
15. Work Core 不理解任何具体 Harness Session 格式。

## 3. 概念模型

### 3.1 Official Session

Official Session 是跨 Harness 的持久会话身份，也是 Studio 展示、审计、搜索和
继续执行的入口。

它包含两个不同视图：

- **完整历史账本**：append-only，保留所有记录、原生来源、compact 操作和失败；
- **有效上下文视图**：当前应该提供给下一个 Harness 的上下文，可被 compact
  checkpoint 缩短，但不会反向删除完整账本。

二者不能合并成一个可被覆盖的 transcript 文件。

### 3.2 Canonical Record

Canonical Record 是官方 Session 的最小可排序记录。它表达跨 Harness 可移植的
语义，而不是某一家 CLI 的 JSON 行。

```python
@dataclass(frozen=True)
class CanonicalRecord:
    record_id: str
    session_id: str
    sequence: int
    turn_id: str
    event_type: str
    payload: CanonicalPayload
    origin: RecordOrigin
    native_original_ref: str | None
    created_at: str
```

`payload` 至少能够表达：

- 用户、助手和系统可见消息；
- tool call、tool result 及其对应关系；
- 文件修改和 workspace 事实引用；
- 附件与 Resource 引用；
- permission 请求与裁决；
- usage/cost（来源提供时）；
- error、cancel、interrupt 和 terminal 状态；
- compact 请求、结果和 checkpoint；
- Harness、Profile、Model、Execution 来源。

### 3.3 Native Original

Native Original 只保存产生该记录的 Harness 实际写出的内容。

```text
CanonicalRecord
├── canonical payload
├── origin_harness = claude-code
└── native_original_ref → Claude 实际产生的原生记录
```

不得为同一条记录长期保存 Codex、Claude、OpenCode 等多份派生格式。其他 Harness
需要读取该记录时，由目标 Codec 从 canonical payload 临时生成。

原始内容可以是：

- 精确 JSONL 行或行组；
- SQLite 中经事务读取的一组原始行；
- 二进制或厂商私有 envelope；
- 对受保护 blob/CAS 对象的引用。

原始内容不要求进入普通 API，也不要求可被其他 Harness 理解。

### 3.4 Native Execution Envelope

部分原生状态不属于任何单条消息，必须按一次 Harness 执行单独保存：

```python
@dataclass(frozen=True)
class NativeExecutionEnvelope:
    envelope_id: str
    session_id: str
    execution_id: str
    harness_type: str
    harness_version: str
    native_format_version: str
    profile_ref: str
    continuation_locator: str | None
    session_metadata_ref: str | None
    import_cursor: str | None
    content_digest: str
```

它可以承载 session metadata、原生 session 行、compact epoch、UUID 链入口、
continuation locator 和数据库 session metadata。它不是第二份 Profile，也不是
其他 Harness 的转译缓存。

### 3.5 Native Session View

Native Session View 是某次 Execution 使用的临时物化结果：

```python
@dataclass(frozen=True)
class NativeSessionView:
    execution_id: str
    harness_type: str
    root_ref: str
    input_watermark: int
    manifest_digest: str
    import_cursor: str
```

Harness 只接触自己的原生格式，不直接理解 Official Session。Session View 在执行
完成、失败或恢复后作废，不成为新的持久权威。

“临时”只描述派生视图的生命周期；来源 Harness 真正产生的增量已经以 Native
Original 和 Native Execution Envelope 的形式持久保存。

## 4. 权威边界

本设计不是含糊的“双向同步”，而是按职责划分权威：

| 数据 | 权威 |
|---|---|
| 跨 Harness 公共语义 | Official Session canonical ledger |
| 完整审计历史 | Official Session append-only ledger |
| 当前有效上下文 | 最新有效 CompactionCheckpoint + 后续记录 |
| 来源 Harness 私有字段 | Native Original |
| 单次执行的原生会话元数据 | Native Execution Envelope |
| Profile 配置、安装的 Skill、凭据引用 | Agent-Box Profile/native-home 体系 |
| 单次 Harness 可写运行目录 | Native Session View |
| 工作区文件事实 | Workspace/Resource authority |

Profile native home 不能复制为 Studio Session 的第二个持久 Profile。Session View
只能由冻结的 Profile/native-home、Official Session 和声明式运行输入组合产生。

## 5. 读写流水线

### 5.1 执行前

```text
1. 获取 session single-writer lease
2. 冻结 Official Session watermark
3. 冻结 Harness/Profile/Model/Runtime 选择
4. probe Codec 与 Harness/native format 版本
5. 计算当前有效上下文
6. 生成 Loss Report
7. 若存在 blocking loss 或上下文超窗：拒绝执行
8. 在 execution staging 中物化 Native Session View
9. Codec 对物化结果执行结构和 resume probe
10. 启动 Harness
```

物化每条历史记录时：

```text
record.origin_harness == target_harness
    → 在格式版本兼容时复用 native_original

record.origin_harness != target_harness
    → 从 canonical payload 生成目标 Harness 原生记录
```

复用 Native Original 不能绕过完整 Session 的结构校验。某些厂商格式包含父链、
文件头、索引或数据库约束，最终 View 必须由 Codec 作为整体封装并验证。

### 5.2 执行期间

```text
Harness 写 Native Session View
        │
        ├── SessionDriver/Observation 流 → canonical staging events
        │
        └── Codec 增量读取 → native original staging blobs
```

实时 Observation 用于 UI 和及时恢复；原生增量用于保存准确的来源事实。二者通过
Execution ID、Turn ID、stable record ID 和 import cursor 去重，不能各自独立追加
成两份记录。

执行中产生的 Turn 状态依次为：

```text
STARTED → STREAMING → COMPLETED | FAILED | INTERRUPTED | RECOVERY_REQUIRED
```

只有 terminal 状态能关闭 Turn。崩溃前已经持久化的事件仍可审计，但不得伪装为
已完成响应。

### 5.3 执行结束

```text
1. 停止接收新写入并冻结 View
2. Codec 从 import cursor 读取最终增量
3. 将 Observation 与原生增量关联
4. 校验 stable IDs、顺序、digest 和 terminal 状态
5. 原子提交 canonical records、native originals、execution envelope
6. 推进 Official Session watermark
7. 释放 single-writer lease
8. 清理临时 Native Session View
```

不能证明导入完整时进入 `RECOVERY_REQUIRED`，保留 View 和 journal，禁止下一次
写执行；只读查看仍然可用。

## 6. Stable Identity 与确定性转译

异源记录被转成目标格式时，目标格式可能要求 UUID、父子关系或数据库主键。
派生身份必须稳定，否则后续目标 Harness 产生的原生记录可能引用一个无法重建的
临时 ID。

规则：

1. 每条 Canonical Record 创建后 `record_id` 永不改变；
2. 能确定性生成的目标 ID，由 `(official_session_id, record_id,
   target_harness, native_schema_major)` 产生；
3. 相同输入必须生成相同原生身份；
4. 不得把随机时间、临时路径或执行 ID 用作历史记录身份；
5. 厂商强制运行时分配 ID 时，只保存最小 `NativeIdentityMap`，不保存派生内容；
6. Codec 升级不得无声明地改变既有 identity 算法。

`NativeIdentityMap` 是身份映射，不是其他 Harness 内容的副本。

## 7. Compact 语义

### 7.1 两层历史

compact 不覆盖或删除完整历史，而是追加一个 checkpoint：

```python
@dataclass(frozen=True)
class CompactionCheckpoint:
    checkpoint_id: str
    session_id: str
    source_harness: str
    source_execution_id: str
    replaces_through_sequence: int
    compacted_records: tuple[CanonicalRecord, ...]
    native_original_ref: str | None
    created_at: str
```

```text
完整历史账本：R1 R2 R3 COMPACT R4 R5
有效上下文：  [compact(R1..R3)] R4 R5
```

后续所有 Harness 默认读取有效上下文。审计、回看和重新处理仍能读取 R1..R3。

### 7.2 Compact 的执行者

第一版只支持用户显式发起 compact：

1. Studio 请求当前 Harness 的 Session Codec/Driver 执行原生 compact；
2. Harness 在 Native Session View 内完成自己的操作；
3. Codec 导入 compact 结果和原生证据；
4. Official Session 追加 CompactionCheckpoint；
5. checkpoint 提交后才改变全局有效上下文。

Studio 不自行调用模型生成隐藏摘要，也不把确定性截断伪装成 Harness compact。

如果有效上下文超过目标 Harness 的窗口，切换必须被阻止，并提示用户先显式
compact。不得静默裁剪、自动摘要或退化为普通 prompt。

多个 Harness 依次 compact 时形成 checkpoint 链。新 checkpoint 作用于当时的有效
上下文；旧 checkpoint 和被替代历史始终保留。

## 8. Loss Report

跨 Harness 物化前，目标 Codec 必须返回结构化 Loss Report：

```python
class LossSeverity(str, Enum):
    NON_SEMANTIC = "non_semantic"
    CONFIRMABLE = "confirmable"
    BLOCKING = "blocking"

@dataclass(frozen=True)
class TranslationLoss:
    record_id: str | None
    field: str
    severity: LossSeverity
    reason_code: str
    description: str

@dataclass(frozen=True)
class LossReport:
    source_watermark: int
    target_harness: str
    target_format_version: str
    losses: tuple[TranslationLoss, ...]
```

处理规则：

| 等级 | 示例 | 行为 |
|---|---|---|
| `NON_SEMANTIC` | 厂商 UI 字段、缓存字段 | 自动继续并记账 |
| `CONFIRMABLE` | 私有 reasoning、不可移植控制事件 | 展示后由用户确认 |
| `BLOCKING` | 用户正文、必要工具结果、因果关系无法表达 | 禁止执行 |

用户确认只针对当前冻结 watermark、目标 Harness 和 Codec 版本。历史或版本发生变化
后必须重新评估，不能永久豁免。

## 9. Session Codec SPI

Codec 是 Harness 插件的一部分；Agent-Box Protocol Pack 只定义通用类型和 SPI。

```python
class HarnessSessionCodec(Protocol):
    harness_type: str

    def probe(self, request: CodecProbeRequest) -> CodecProbeResult:
        """确认 Harness、native format 和能力版本；未知版本 fail closed。"""

    def analyze(self, request: MaterializationRequest) -> LossReport:
        """在任何写入前分析可表达性、窗口和损失。"""

    def materialize(self, request: MaterializationRequest) -> NativeSessionView:
        """把冻结的有效上下文写成完整、可验证的目标原生 Session View。"""

    def read_incremental(self, request: ImportRequest) -> NativeImportBatch:
        """从游标读取 Harness 实际产生的新增/变更原生记录。"""

    def decode(self, batch: NativeImportBatch) -> tuple[CanonicalRecordDraft, ...]:
        """把来源原生记录转换成官方公共语义。"""

    def validate(self, view: NativeSessionView) -> NativeValidationResult:
        """验证整体结构、父链、数据库约束、locator 和 digest。"""

    def compact(self, request: NativeCompactRequest) -> NativeCompactResult:
        """通过 Harness 原生能力执行 compact；不支持时明确返回 unavailable。"""
```

SPI 刻意不提供笼统的 `import_events(path)`。写入目标格式必须通过有冻结输入、
staging root、版本和校验结果的 `materialize()` 完成。

## 10. 模块职责

### 10.1 `agent_box.protocols.session`

只定义：

- Official Session 的公共数据结构；
- record/turn/checkpoint/watermark 语义；
- Native Original/Execution Envelope Ref；
- Loss Report；
- Session Codec SPI；
- typed failures 和 capability vocabulary。

它不包含 Codex、Claude、OpenCode、Hermes 或 Pi 的字段名和路径。

### 10.2 `agent-box-harnesses`

每家 Harness 实现：

- native format probe；
- decode；
- materialize；
- stable identity；
- 整体结构校验；
- incremental cursor；
- native compact/resume 能力；
- 版本兼容矩阵和 Loss Report。

厂商 SQLite、JSONL、UUID 链、rollout、session locator 等知识只能存在于这里。

### 10.3 Session Store 插件

负责：

- append-only ledger；
- effective-context checkpoint；
- native blob/envelope 受保护存储；
- watermark、幂等键和 single-writer lease；
- staging journal、恢复、保留和删除；
- exact read 和审计导出。

它不理解具体 Harness 格式。

### 10.4 Agent-Box Studio

负责：

- 创建和打开 Official Session；
- 逐轮选择 Harness/Profile/Model/Runtime；
- 编排 prepare、materialize、execute、import、commit；
- 展示实时 Turn、Harness 来源、Loss Report 和恢复状态；
- 接受用户显式 compact 请求；
- 通过统一接口调用 Session Store 与 Codec。

Studio 不解析厂商 session 文件，不直接写厂商 SQLite，也不保存第二份 Profile home。

### 10.5 Work Core 与 Runtime

- Work Core 继续负责 Work/Execution/Binding/Dispatch/Finish，不理解 Session 内容；
- Runtime 负责进程、沙箱、terminal 和 byte transport，不理解转写语义；
- Official Session、Profile、Workspace 等通过 Ref 进入上层编排；
- 不为本功能增加厂商专用 Work Core 字段。

## 11. 存储形态

物理实现可以使用 SQLite metadata + 受保护 blob/CAS，但逻辑结构必须满足：

```text
sessions/<session_id>/
├── ledger                     # append-only canonical/event metadata
├── checkpoints                # compact/effective-context checkpoints
├── native-originals/          # 加密或受保护的来源原始 blob
├── execution-envelopes/       # session-level native metadata
├── identity-maps/             # 仅在无法确定生成原生 ID 时存在
├── transactions/              # prepare/import/commit/recovery journal
└── views/<execution_id>/      # 临时，可恢复后清理
```

这不是对具体文件名的强制；实现可以把 ledger 和 metadata 放入数据库。无论如何，
必须保留相同的权威和生命周期边界。

## 12. 安全边界

Native Original 可能包含 prompt、工具输出、宿主路径和厂商私有数据，因此：

1. 默认不通过普通前端、日志、诊断或 Transcript API 返回；
2. 与 Session 使用相同或更严格的访问控制；
3. 支持时必须加密 at rest；
4. canonical payload 在进入公开读模型前执行结构化过滤；
5. 不通过修改 Native Original 实现脱敏，否则会破坏原生恢复；
6. credential value 不进入 canonical、Loss Report、Evidence 或普通 envelope；
7. 删除 Session 时同时删除 native blobs、identity map、checkpoint 和恢复工件；
8. 临时 Native Session View 使用 execution-scoped 权限并在确定终态后清理。

如果某 Harness 把 credential 混入不可分割的 session 文件，Codec 必须将该格式标记
为不支持原生持久化，不能以“无损”为理由扩大秘密存储范围。

## 13. 版本与格式漂移

Codec admission key 至少包含：

```text
harness_type
harness_version_range
native_format_version
codec_version
native_schema_major
```

规则：

- 未知 Harness 版本：拒绝；
- 未知 native format：拒绝；
- writer 未经过 fixture/真实 CLI resume 验证：只能 decode，不能 materialize；
- SQLite writer 未证明 schema、约束、WAL 和官方 reopen：禁止写；
- Codec 升级改变稳定身份或公共语义：必须显式迁移；
- 禁止“宽松解析 + 尽力写入”作为 READY 路径；
- 禁止失败后静默退化成 prompt handoff。

每个 Harness 独立达到 write admission，不要求五家同时宣称相同成熟度。

## 14. 事务与恢复

官方 Session 的一次写执行必须具有明确提交点：

```text
PREPARING
→ VIEW_MATERIALIZED
→ RUNNING
→ IMPORT_STAGED
→ CANONICAL_VALIDATED
→ COMMITTED
```

失败状态：

```text
ROLLED_BACK
RECOVERY_REQUIRED
```

约束：

- Official Session watermark 只在 canonical、native original 和 execution envelope
  均持久后推进；
- 同一 execution 的重复导入通过 idempotency key 去重；
- import cursor 只能在批次提交后推进；
- 进程退出不等于 Turn 成功；
- View 删除失败不能回滚已经提交的 Session，只产生可清理诊断；
- 无法确认是否提交时返回明确 ambiguous/recovery 状态；
- 新执行在 recovery 完成前不得获得 writer lease。

## 15. UI 语义

用户仍然只看到一条连续 Session：

- Composer 中选择“下一轮由哪个 Harness 执行”；
- 每个 Turn 显示 Harness/Profile/Model 来源；
- 正常切换不出现 handoff 模式选择；
- 有可确认损失时，发送前展示 Loss Report；
- 超窗时提示用户显式 compact；
- incomplete/recovery-required Turn 不显示为普通完成；
- compact 后默认展示有效上下文，并允许展开完整历史；
- native original 不作为普通消息详情暴露。

Tab、URL 和 Session 身份只依赖 Official Session ID，不包含 Harness。

## 16. 非目标

本阶段明确不做：

- 同一 Session 内并行 Harness 写入；
- Session 分支、合并和冲突解决；
- 自动 LLM 摘要或隐藏 handoff；
- 超窗时自动 compact；
- 把多个 Profile home 复制成 Session authority；
- 让 Studio 直接解析或修改厂商原生格式；
- 将派生的五家 native 格式全部长期缓存；
- 未经版本验证直接写厂商 SQLite/JSONL；
- 把 Session 语义塞进 Work Core ontology；
- MCP Resource 或其他 Resource Routing 能力。

## 17. 实施顺序

### Phase 0：事实与准入

- 为五家收集 sanitized native fixtures；
- 明确官方 resume/compact 命令和版本；
- 区分 decode-only 与 read-write READY；
- 对每家建立 native round-trip、reopen 和 format drift 测试。

### Phase 1：Session Protocol 与 Store

- Canonical Record/Turn/Checkpoint/Envelope/Ref；
- append-only ledger 与 effective-context projection；
- single-writer lease、watermark、事务和恢复；
- native blob 安全存储。

### Phase 2：单 Harness 闭环

先选择原生格式最容易验证的一家：

```text
native → decode → official → materialize → official CLI resume
       → execute → incremental import → commit
```

此阶段必须证明无切换时的同 Harness 完整往返和 compact。

### Phase 3：双 Harness 连续性

- A 产生历史；
- B 从 canonical materialize 并继续；
- 切回 A；
- A 的原生记录复用，B 的记录经 A Codec 转译；
- 验证稳定 ID、工具关系、文件事实和 Loss Report。

### Phase 4：五家准入

每家独立通过 admission gate 后启用。没有 write 证据的一家保持 decode-only，UI
不得把它显示为可跨 Harness continue。

### Phase 5：Studio 换联

- Session ID 与 Harness 解耦；
- 逐轮 Harness 选择；
- unified transcript read model；
- Loss Report、compact、恢复状态；
- 旧 Codeg conversation 只读导入与显式迁移。

## 18. 验收标准

### 18.1 通用不变量

1. Session identity 与 Harness identity 完全解耦；
2. 同一 Session 并发第二写入者被拒绝；
3. ledger append-only，compact 不删除完整历史；
4. canonical 与 native original 在一个事务中提交；
5. 其他 Harness 的派生内容不进入持久 store；
6. 相同冻结输入产生相同 stable native identities；
7. 未知版本和 blocking loss 均 fail closed；
8. 普通切换不使用摘要或隐藏 prompt handoff；
9. native secret 不出现在公开 API、日志或诊断；
10. crash recovery 不产生重复记录或伪 completed Turn。

### 18.2 同 Harness

- 从未发生 Harness 切换的 Session 可以恢复原生语义和原始字段；
- Harness 官方 CLI 能 reopen/resume 物化结果；
- 原生 compact 能生成全局 checkpoint；
- execute→import→materialize 多轮后原产字段不漂移；
- 所谓“无损”由原始 blob、digest 和真实 CLI reopen 证明，而不是 JSON 对象相等。

### 18.3 跨 Harness

- Codex→Claude→Codex 等序列表现为同一连续 Session；
- 公共文本、工具关系、文件事实、顺序和 terminal 状态保持；
- 各来源 Harness 的 Native Original 始终保留；
- 可确认损失在执行前展示，blocking loss 无法绕过；
- 切回 Harness 时，其原产记录被复用，异源记录被确定性转译；
- 不宣称异源厂商私有字段无损。

## 19. “无损”的准确含义

本设计只允许以下表述：

- **全程同 Harness**：在已准入版本内，公共语义和该 Harness 原生字段可无损恢复；
- **发生过 Harness 切换**：每家自己产生的原始记录保持无损，跨 Harness 公共核心
  语义按 Codec 能力迁移；
- **异源私有状态**：不保证目标 Harness 能理解，由 Native Original 保留供审计或
  将来回到来源 Harness；
- **compact**：有效上下文有损变化，但完整历史账本无损保留。

不能使用“任意 Harness 之间字节级无损”“文本级 100% 等于原生 resume”或“转换器
可互相灾备”描述这套系统。

## 20. 最终架构判定

该模型能够实现用户感知上的跨 Harness 连续 Session，同时保留每家原生格式的
优势。它不是多个原生 Session 的 UI 聚合，也不是摘要 handoff；它是以 Official
Session 为公共语义权威、以来源 Native Original 为私有事实权威、通过 Harness-owned
Codec 生成执行视图的会话虚拟化层。

开始产品实现前仍需逐 Harness 完成 write admission。某家只能读取 native session，
不代表它已经具备跨 Harness continue 写入能力；该限制必须由 capability truth 和 UI
如实呈现。
