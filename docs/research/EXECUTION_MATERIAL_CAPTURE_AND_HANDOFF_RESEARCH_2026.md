# Execution Material Capture and Handoff

日期：2026-08-28

## Executive verdict

这个问题最准确的名字不是“输出目录管理”，也不只是“Artifact 管理”，而是：

> **Execution Material Capture, Versioning, and Handoff**
> **执行材料产出的捕获、版本固化与跨 Execution 交接**

它回答四个问题：

1. 一次 Execution 实际产生或改变了哪些可复用材料；
2. 如何把这些材料固定为不可变、可验证、可解析的 Ref；
3. 如何保留它们与本次 Execution、输入材料及工作区变化之间的来源关系；
4. 下一次 Execution 如何通过 Binding Contract 消费它们，而不依赖上一次运行现场。

当前 Agent-Box Core 已经有 `Execution -> OUTPUT Ref` 的关系，也能在 observation 中追加 output refs。缺少的主要不是新 Core ontology，而是 Core 外围的材料捕获、Artifact Authority、工作区快照与 finalize 协调能力。

## 这不是什么

- 不是 stdout/stderr、transcript 或 trace 管理；这些是 native execution records。
- 不是 Evidence 的同义词；Evidence 证明事实，Material 是可被后续工作消费的内容。
- 不是要求 Harness 把所有内容写入统一的 `outputs/` 目录。
- 不是把工作区中每一个文件都注册成独立 ArtifactRef。
- 不是 workflow engine 的 output parameter 系统。
- 不是要求 Core 理解 Git diff、文件格式、构建产物或模型输出。

## 必须区分的五类结果

| 类别 | 例子 | 主要用途 | 推荐 Ref |
|---|---|---|---|
| Provider-native record | Codex thread/turn、CI run、terminal transcript | 恢复、观察、审计 | SessionRef / RunRef / ArtifactRef |
| Workspace material state | 修改后的源码树 | 后续继续编码、Review、CI | WorkspaceRef（exact commit/tree） |
| Workspace change set | added/modified/deleted、before/after blob | 解释本次改变了什么 | ArtifactRef（ChangeSet manifest） |
| Standalone material | 设计文档、review JSON、测试报告、二进制包 | 作为下一 Execution 的明确输入 | ArtifactRef |
| Evidence | actual HEAD、artifact digest、投影/消费观察 | 证明 Binding 与实际发生事实 | EvidenceRef 或 observation 附带 ArtifactRef |

同一个内容有时既是材料又能承载证据，但二者的关系语义不能合并。例如 `review.json` 可以是下一次修复的输入材料；其 digest 校验记录才是 Evidence。

## 成熟系统提供了哪些可借鉴机制

### 1. Git：完整工作区状态与变化的事实 authority

Git 的 tree/blob/commit 模型最适合代码工作区：tree 是完整目录状态，两个 tree 可以精确比较，raw diff 能表达 added/modified/deleted 以及前后 blob identity。`git write-tree` 会把 index 固化为 tree object；Git 官方也明确说明 `diff-index`/`diff-tree` 用于比较 tree、index 和工作树。

可借鉴：

- 完整状态与变化集分开表达；
- 修改文件不是“一个可变文件 Ref”，而是 before blob 和 after blob；
- rename 可以作为 diff inference，而不是必须成为权威事实；
- 工作区输出优先固定为 final tree/commit，不必把每个文件都复制进 Artifact Store。

来源：[git-write-tree](https://git-scm.com/docs/git-write-tree.html)、[git-diff-index](https://git-scm.com/docs/git-diff-index)、[Git low-level operations](https://git-scm.com/docs/user-manual)。

### 2. Bazel Remote Execution API：ActionResult + CAS

Bazel REAPI 把输入根、输出文件/目录和内容寻址存储连接起来。`ActionResult` 描述一次 action 的输出，文件和目录内容由 digest 在 CAS 中寻址；`Command.output_paths` 提前声明应取回的路径，未声明内容可能被丢弃。

可借鉴：

- Ref 应指向内容，而不是只指向某台机器上的临时路径；
- result manifest 与实际 blob/tree 分离；
- 下游无需知道上游运行目录，只需 digest 和 materialization contract；
- store 的 retention/availability 是 Ref 真正可用的一部分。

不能照搬：Agent/Harness 的开放式编辑不能总在 Dispatch 前完整声明输出路径，因此 Agent-Box 必须同时支持 declared capture 与 post-run workspace discovery。

来源：[Bazel Remote Execution API protobuf](https://github.com/bazelbuild/remote-apis/blob/main/build/bazel/remote/execution/v2/remote_execution.proto)。

### 3. Dagger：把 File/Directory 当作可传递的材料对象

Dagger 的 `File` 和 `Directory` 是实际文件系统状态而非路径字符串；Directory 有 digest、changes、export 等操作。数据只有在显式 export 时才写回 host。其文档也强调，显式传入文件系统输入可以减少 ambient filesystem 隐式依赖。

可借鉴：

- 下一次 Execution 消费的是一个 material object/Ref，不是“去上一次目录里找”；
- materialize/export 是单独动作，不属于 identity 本身；
- directory state 可以整体传递，也可以在需要时取单个 file；
- 变化查询是派生视图，不必取代完整状态 identity。

注意：Dagger digest 官方不保证跨 Engine 版本稳定，因此 Agent-Box 不能把第三方产品的所有 digest 都无条件当作永久 content identity。

来源：[Dagger Directory](https://docs.dagger.io/extending/types/directory/)、[Dagger File](https://docs.dagger.io/extending/types/file/)。

### 4. Argo Workflows：output artifact → later input artifact

Argo 支持输出 artifact、artifact repository、`from` 引用前序 artifact，以及 artifact driver/plugin。它清楚展示了“运行产生材料，存储系统保存，后续运行再 materialize”的完整链路。

可借鉴：

- capture、store、resolve/materialize 和 workflow wiring 是不同责任；
- Artifact Provider 可以插件化支持本地 CAS、S3、GitHub Actions 等 authority；
- retention/GC 需要显式策略。

不能照搬：Argo 的 artifact wiring 属于 workflow topology；Agent-Box 只记录 OUTPUT Ref，并由 Host/Workflow 决定是否把它放进下一次 Binding。

来源：[Argo artifact repository](https://argo-workflows.readthedocs.io/en/latest/configure-artifact-repository/)、[Argo artifact fields](https://argo-workflows.readthedocs.io/en/latest/fields/)、[Argo artifact plugins](https://argo-workflows.readthedocs.io/en/latest/artifact-plugin/)。

### 5. GitHub Actions：外部 run 产生的可下载、带 digest artifact

GitHub Actions artifact API 提供 artifact ID、大小、过期时间、SHA-256 digest 和关联 workflow run/head SHA；upload/download actions 会在下载时校验 digest。

可借鉴：

- 外部系统原生 artifact identity 可以直接成为 Agent-Box Ref；
- digest、run identity、head SHA 和 retention 是不同事实；
- ArtifactRef 必须能表达 external locator，不要求所有内容迁入 Agent-Box 自有存储。

来源：[GitHub Actions Artifacts REST API](https://docs.github.com/en/rest/actions/artifacts)、[Store and share data with workflow artifacts](https://docs.github.com/en/actions/tutorials/store-and-share-data)。

### 6. W&B Artifacts：Execution 与材料之间的 input/output lineage

W&B 明确把 artifact 标记为 run input 或 output，并通过 lineage graph 展示多个 run 之间的材料流转。这与 Agent-Box 的 `INPUT` / `OUTPUT` Ref relation 很接近。

可借鉴：

- Artifact identity 与“本次作为 INPUT/OUTPUT 使用”的关系分离；
- 同一 artifact 可被多个 execution 使用；
- lineage 来自关系账本，不应塞进 ArtifactRef metadata；
- alias 可以方便人类选择，但 Binding freeze 时必须解析为 exact version/digest。

不能照搬：W&B 的 Run、Artifact Collection、Registry 和 DAG 主要服务 ML lifecycle；Agent-Box 不需要复制这些产品实体。

来源：[W&B Artifacts overview](https://docs.wandb.ai/models/artifacts)、[W&B artifact lineage](https://docs.wandb.ai/models/artifacts/explore-and-traverse-an-artifact-graph)。

## 横向比较

| 系统 | 最强部分 | 对任意 Harness 编辑工作区 | 下游交接 | 精确 identity | 不适合直接照搬的部分 |
|---|---|---:|---:|---:|---|
| Git | tree/blob/commit、diff | 强 | 强 | 强 | 非 Git 文件、外部报告、retention |
| Bazel REAPI | ActionResult + CAS | 弱，偏声明式 action | 强 | 强 | 要预声明 output paths，build/action 语义过重 |
| Dagger | 可传递 File/Directory object | 中 | 强 | 中到强 | digest 跨版本稳定性、DAG runtime |
| Argo | artifact capture/store/wiring | 中 | 强 | 取决于 repository | workflow topology 与 Kubernetes 重量 |
| GitHub Actions | CI artifact authority | 弱 | 强 | 强 | 只覆盖 CI domain，不捕获本地交互编辑 |
| W&B | run/artifact lineage | 中 | 强 | 强 | ML/registry 产品语义过重 |

结论：不存在一个产品能完整解决 Agent-Box 的问题。最合适的是组合这些已验证模式，而不是引入一个新的中央 artifact/workflow 产品。

## 建议的 Agent-Box 形态

### 1. Core 保持很薄

Core 只需要继续承担：

- `Execution --OUTPUT--> Ref` 的 append-only 事实；
- OUTPUT Ref 与 Execution provenance 的持久关系；
- frozen INPUT 与下一次 Execution 的 Binding；
- terminal 后仍允许追加后置观察/材料事实时的明确规则；
- finalize 写入的一致性边界。

Core 不需要新增 `File`、`Change`、`ArtifactVersion`、`LineageEdge` 或 `OutputDirectory` 实体。

### 2. Core 外围增加三个小责任

#### Material Collector（Plugin）

Provider/domain-specific 地发现材料：

- Git collector：base tree → final tree + ChangeSet；
- Harness collector：结构化回答、session export、native result；
- CI collector：report/artifact IDs；
- declared path collector：用户或 Contract 明确指定的文件/目录。

#### Artifact Authority（Resource Provider）

负责：

- import bytes/tree/manifest；
- 返回不可变 ArtifactRef；
- verify digest/availability；
- resolve/materialize 给下游 Execution；
- retention/GC。

它可以先是项目本地 CAS，之后再增加 GitHub/S3/OCI adapters。

#### Finalization Coordinator（Host/Execution plugin seam）

在 Provider 发出正式完成信号后：

1. 停止新的责任内交互；
2. 收集 Provider-native outputs；
3. 调用当前 Binding 中相关资源的 collectors；
4. 固化 WorkspaceRef、ChangeSet 和 standalone artifacts；
5. 记录 output refs 与 observations；
6. 最后密封 Execution terminal。

这是 orchestration of finalization，不是 workflow progression，也不应成为通用 scheduler。

## ArtifactRef 应该是什么

ArtifactRef 只表达**不可变材料 identity + authority locator**：

```python
Ref(
    type=RefType.ARTIFACT,
    provider="agent-box-artifacts",
    native_id="sha256:<content-or-manifest-digest>",
    uri="artifact://sha256/<digest>",
    metadata={
        "name": "review.json",
        "media_type": "application/json",
        "size": "1842",
    },
)
```

它不应该塞入：

- producer Execution 的全部 provenance；Core relation 已表达；
- 下游如何使用它；由 Binding Contract 表达；
- materialized local path；这是本次 projection 的 runtime fact；
- mutable alias 作为 exact identity；alias 必须在 freeze 前 resolve；
- 大型 manifest payload；应由 Ref 指向内容寻址 manifest。

同一个 ArtifactRef 可以在不同 Binding 中按不同 Contract 消费：作为 prompt fragment、review subject、test report 或普通文件。Ref 回答“是哪份材料”，Contract 回答“这次怎样解释和投影”。

## Workspace 编辑应如何记录

一次编码 Execution 不应产生上百个松散 output refs。推荐输出：

1. `WorkspaceRef(final tree/commit)`：下一次继续工作的完整输入；
2. `ArtifactRef(ChangeSet manifest)`：记录 base/final tree、added/modified/deleted、before/after blobs、diff digest；
3. 少量显式 `ArtifactRef`：只给确实具有独立消费价值的设计文档、测试报告、构建包等。

新文件、编辑文件和删除文件都由 tree delta 捕获。rename 默认是 delete+add；可以记录 Git similarity inference，但不能把启发式结果冒充绝对事实。

## 最小 Preview 切片

为了跑通 Demo，不需要先建设通用 artifact platform：

1. 实现本地 content-addressed Artifact Provider；
2. 实现 Git WorkspaceOutputCollector；
3. 定义一个 versioned ChangeSet manifest；
4. 让 finalize 原子或可恢复地记录 final WorkspaceRef、ChangeSet ArtifactRef 和少量 declared artifacts；
5. 让 WorkBoard 显示“产生了什么”，并能把任一 output ref 加入下一 Execution 的 Binding draft；
6. 用真实 vertical slice 验证：E1 修改文件并生成报告 → E1 OUTPUT refs → E2 Binding 消费 final workspace + report → projection 后 digest 一致。

## 需要特别警惕

- **捕获成功不等于 Harness 有意产出。** 工作区变化可能包含缓存、临时文件或用户并发修改；collector 必须声明 coverage 和 authority。
- **可见不等于消费。** E2 materialize 了 ArtifactRef，不代表 Harness 读取了它。
- **路径不是 identity。** `file:///tmp/result.json` 只能是 locator，不能独立证明内容。
- **digest 不自动等于永久可取回。** retention 和 storage availability 必须可观察。
- **不要自动把所有文件变成 output。** 完整 WorkspaceRef + ChangeSet 通常比 Ref 爆炸更准确。
- **不要让 Artifact Store 变成新的 Work/Workflow authority。** 它只拥有材料 identity、保存与解析。

## Final recommendation

正式采用名称：

> **Execution Material Capture and Handoff**
> 中文：**执行材料捕获与跨执行交接**

其中“版本固化”是必需能力，但不必放进短名称。

落地时采用：

- Git：代码工作区的 exact material authority；
- 小型 CAS Artifact Provider：独立文件、目录和 manifest 的 authority；
- Core OUTPUT Ref relation：provenance ledger；
- Binding Contract + projector：下一 Execution 的消费协议；
- Host/plugin Finalization Coordinator：把一次真实 Execution 的运行现场转换成稳定输出材料。

这补的是 Agent-Box 在 Dispatch/Execution 之后缺失的另一半闭环：

```text
requested input
  → exact Ref
  → frozen Binding
  → accepted Dispatch
  → native execution
  → captured material outputs
  → verified OUTPUT Refs
  → next Execution Binding
```

它增强 Agent-Box 的跨系统 Execution 边界，不会把 Core 变成文件管理器、构建系统或 workflow engine。
