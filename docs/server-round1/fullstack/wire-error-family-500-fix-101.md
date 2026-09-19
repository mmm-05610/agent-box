# 101 — 五个合同方法必然 500（错误族被内部码顶位）（证据）

工单基线 `fc96194`；本单在 `d92ca1d`（105 收口后）上执行，A 线队列第 3 张。
§1–§4 属**阶段 1（观测）**。凡标 **实测** 为本单一手；**引用** 给出处。

## 1 实测：五个方法在默认组合上 100% 500（工单的事实成立）

形态：`build_runtime()`（默认组合）→ `create_app` → `TestClient(raise_server_exceptions=False)`
——**必须**关重抛，否则 500 会变成 Python 异常，正是这族缺陷能藏住的原因。参数按 `_PARAM_SHAPES` 给全。

| 方法 | 默认组合 | 注入**真实现**之后 |
| --- | --- | --- |
| `usage.aggregate` | **500** | **200** `result {'sessions': []}` |
| `usage.export` | **500** | **200** `result {'sessions': []}` |
| `providerArtifacts.list` | **500** | **200** `{'harness':'alpha','versions':[],'current':None}` |
| `providerArtifacts.install` | **500** | **仍 500**（`KeyError: 'digest'`，见 §3） |
| `providerArtifacts.rollback` | **500** | **仍 500**（`ArtifactStoreError`，见 §3） |

`usage_aggregator` / `artifact_store` 用真实现注入：`UsageAggregator(runtime.repository)`、
`ArtifactStore(root)`（构造签名 `inspect.signature` 一手读出）。
⇒ 三个方法是"只差家族位"，两个方法后面还有第二堵墙。**这五个不是同一件缺陷的五个副本。**

## 2 实测：家族位误用的完整账（一次扫全仓）

`WireError` 的第一参必须在 `FAMILIES`（`errors.py:13-26`，12 项闭集）里，否则 `__post_init__`
抛 `ValueError` ⇒ 500。扫描口径：`src/agent_box` ＋ `plugins` 全部 `.py`，正则同时吃单行与换行后的第一参。

| 第一参 | 命中 | 合法？ | 归属 |
| --- | --- | --- | --- |
| `INVALID_REQUEST` | 71 | 是 | — |
| `UNAVAILABLE` | 7 | 是 | — |
| `NOT_FOUND` | 3 | 是 | — |
| `OUTCOME_UNKNOWN` | 1 | 是 | — |
| `ARTIFACT_STORE_UNAVAILABLE` | **1 处** | **否** | **本单**（`handlers.py:1210-1216` 的 `_artifact_store()`，被 `providerArtifacts.list/install/rollback` **三个**方法共用） |
| `USAGE_AGGREGATOR_UNAVAILABLE` | **1 处** | **否** | **本单**（`usage_aggregate` 内联；`usage_export` 是 `return self.usage_aggregate(params)`，**共用同一条** ⇒ 顶住**两个**方法） |
| `INVALID_PARAMS` | 0 | — | **098 已修**（101 §Scope 把这两处划给 098，归属在此确认，本单不重做） |

⇒ **2 个字面点 ＝ 5 个合同方法**。工单的门若按"五个方法"计数，实现侧只有两处可改——
本单的报告因此按方法给结果、按点给改动。共 90 个字面构造点被扫，非法家族清零在本单之后成立。

## 3 实测：`providerArtifacts.install` 今天**两条路都堵死**，且漂移方向可判定

工单说这五个方法是"家族位"问题；`install` 不止。一手（真 store 已注入）：

| 客户端怎么发 | 结果 |
| --- | --- |
| **不带** `digest` | `KeyError: 'digest'` ⇒ **500**（`handlers.py` 的 `store.install(..., params["digest"])` 在形状没给这个键的情况下取它） |
| **带** `digest` | `INVALID_REQUEST`：`params shape is invalid: unexpected digest`（`_PARAM_SHAPES["providerArtifacts.install"]` 的必填集只有 `requestId/harness/version/sourceToken`，可选集 `set()`） |

⇒ **不存在任何一种请求能让这个方法成功**。工单 §Current state 没写这件事。

**漂移在哪一侧，有权威可判**（不是本树说了算）：前端**权威工件**
`contracts/wire-v1/generated/wire-v1.schema.json`（`sha256:1a3604ee9d…`，102/105 都引用过同一份）里

```
providerArtifacts.install#params  required=[requestId, harness, version, sourceToken, digest]
```

⇒ **合同早就要求 `digest`**；是服务端的 `_PARAM_SHAPES` 落后。补上它属于**对齐既有合同**，
不需要重锁（与 105 的区别在这里说清：105 是往合同里加没有的键 ⇒ 必须重锁；101 是把合同已有的键补进服务端 ⇒ 不需要）。

## 4 实测：第二堵墙的第二层——`ArtifactStoreError` 没人接

`provider_artifacts_list/install/rollback` 三个方法体里：`try:` **无**、`ServerError` 捕获 **无**、
`ArtifactStoreError` 捕获 **无**（`inspect.getsource` 逐方法核过）。而
`ArtifactStoreError(RuntimeError)`（`execution/artifact_store.py:35`）**不是** `ServerError`
⇒ 走不到 `WireError.from_server_error`。实测两类真实失败：

| 场景 | 抛出 | 现在的 HTTP |
| --- | --- | --- |
| digest 与实际暂存树不符 | `ArtifactStoreError: ARTIFACT_DIGEST_MISMATCH: staged tree digest … does not match the declared …` | **500** |
| 回滚到没装过的版本 | `ArtifactStoreError: ARTIFACT_VERSION_MISSING: alpha/1.2.3 is not installed` | **500** |

⇒ 这两条都是**用户可犯的错**（拼错摘要、回滚一个不存在的版本），必须是类型化拒绝。
本单把它们映射到既有家族（`NOT_FOUND` / `INVALID_REQUEST`）并把内部码放进 `details.internalCode`，
**不新增家族、不新增 wire 词汇**。

## 5 组合面核对（工单 §Scope 第 3 行要的那一件）

`grep -rn "usage_aggregator\|artifact_store" src/agent_box --include=*.py`（排除 `wire/handlers.py`）
⇒ **零命中**；两个实现被 import 的地方**只有各自的测试文件**：

```
artifact_store   -> tests/server/test_artifact_store.py（两处）
usage_aggregate  -> tests/server/test_usage_aggregate.py（一处）
```

⇒ 答案是**零个组合注入它们**——工单 §Scope 问"哪些组合注入了、哪些没有"，实测更硬：
**没有组合**。`bootstrap/runtime.py` 连这两个模块都不 import（`WireService` 的两个参数停在默认 `None`）。
这是 099 的形状（"实现齐、线没接"）放大到整条面：实现有、自己的测试也过（53/57 的门是绿的），
但从 wire 到实现之间**没有一次装配**。

**本单不做装配**：装配点在 `server/bootstrap/runtime.py`，R-0023 之后属 **runtime 线**，
本树章程明写"不写 `bootstrap/**`"。⇒ 登记为交回（§6），并说明本单修完之后 wire 会说什么真话：
"这台服务没有这个面"（类型化 `UNAVAILABLE`），而不是"内部错误 500"。

## 6 阶段 1 的修法落点（阶段 2 起跳）

1. 两处家族位 → `UNAVAILABLE`，内部码进 `details.internalCode`（与 `from_server_error` 的收敛语义一致）；
2. `_PARAM_SHAPES["providerArtifacts.install"]` 必填集补 `digest`（对齐权威工件，§3）；
3. 三个 `provider_artifacts_*` 加 `ArtifactStoreError` → 类型化映射（§4），家族只用既有 12 项；
4. 门**驱动真实 wire**覆盖五个方法：无服务 ⇒ 类型化 `UNAVAILABLE`；有服务 ⇒ 真结果；
   两类用户错误 ⇒ 类型化；反例 = 退回旧实现必须红。
5. 装配（`bootstrap`）与"这台服务该不该提供这两个面"是**产品/组合裁决** ⇒ 交回，不在本单射程。
