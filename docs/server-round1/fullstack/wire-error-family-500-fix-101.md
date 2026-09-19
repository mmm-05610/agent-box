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

## 7 阶段 2 实施：家族位、形状、映射，一次改在同一处

| 改点 | 内容 |
| --- | --- |
| `_artifact_store()` | 第一参 `ARTIFACT_STORE_UNAVAILABLE` → **`UNAVAILABLE`**，原内部码进 `details.internalCode`（与 `from_server_error` 的收敛语义逐字一致，`errors.py:121`） |
| `usage_aggregate` 的守卫 | 同形：`USAGE_AGGREGATOR_UNAVAILABLE` → `UNAVAILABLE` ＋ `internalCode` |
| `_PARAM_SHAPES["providerArtifacts.install"]` | 必填集补 **`digest`**（对齐权威工件，§3）；值本身仍经 `_bounded(..., 128)` 过一遍，不是裸取 |
| 三个 `provider_artifacts_*` | 各自 `try/except ArtifactStoreError` → `_artifact_error(exc)` |
| 新增 `_ARTIFACT_FAMILIES` ＋ `_artifact_error()` | 模块级：`*_VERSION_MISSING`/`*_SOURCE_MISSING` → `NOT_FOUND`；`*_VERSION_EXISTS` → `CONFLICT_REQUEST`（依 `errors.py` 里 `ENTERPRISE_STATE_CONFLICT → CONFLICT_REQUEST` 的先例）；其余（`DIGEST_MISMATCH`/`SOURCE_INVALID`/`FAMILY_INVALID`/`VERSION_INVALID`）→ `INVALID_REQUEST`；**一律带 `internalCode`** |

**没有新增家族**（`FAMILIES` 仍 12 项，有一条门专门钉这个数字），
**没有改 wire 形状**（`UNAVAILABLE` 与 `details` 都是既有信封里的东西；`install` 多收一个键是**合同本来就要的**）。

## 8 阶段 3：组合面核对的结论已经写在 §5，这里补"修完之后 wire 说什么真话"

装配点 `bootstrap/runtime.py` 属 runtime 线（§5），本单不动它。
于是修完之后，任何组合上这五个方法说的话是：

> `UNAVAILABLE` ＋ `details.internalCode = USAGE_AGGREGATOR_UNAVAILABLE | ARTIFACT_STORE_UNAVAILABLE`

——"这台服务没有这个面"，而不是"内部错误"。**这正是 097 交回的那件事的另一半**：
hello 说"方法存在"（真），wire 说"这个面没装配"（也真），两句话不再合成一个 500。

## 9 阶段 4：门（`tests/server/test_wire_error_family_101.py`，17 条）

| 用例（含参数化的五条） | 钉哪道门 |
| --- | --- |
| `test_a_composition_without_the_service_refuses_by_type[五个方法]` | **G1**：五个各一次，必须 `http=200` ＋ `code=UNAVAILABLE` ＋ `internalCode` 是那两个之一 |
| `test_the_internal_code_says_which_of_the_two_faces_is_absent` | 收敛不许把两条不同的真话合成一句模糊的话 |
| `test_no_wire_error_is_constructed_with_a_non_family_first_argument` | **G2**：文本级扫 `handlers.py` 全部字面 `WireError(` 第一参 ⇒ 非法集合为空；再把每个名字**真的构造**一遍 |
| `test_the_families_are_the_twelve_locked_ones` | 本单不扩词汇（扩词汇＝合同变更，属重锁） |
| `test_usage_aggregate_answers_with_real_numbers_once_injected`／`test_provider_artifacts_list_answers_once_the_store_is_injected` | **G1 的另一半**：注入真实现 ⇒ 真结果（不是"永不报错"式的假绿） |
| `test_rolling_back_to_an_uninstalled_version_is_not_found`／`test_a_digest_that_does_not_match_the_staged_tree_is_an_invalid_request` | §4 的两类用户错 ⇒ `NOT_FOUND`／`INVALID_REQUEST` ＋ 内部码 |
| `test_install_declares_the_digest_its_locked_contract_requires`／`test_a_request_without_the_digest_is_refused_by_type` | §3 的第二堵墙：形状含 `digest`，且缺它时是**类型化**拒绝而不是 `KeyError` |
| `test_an_already_installed_version_is_reported_as_a_state_conflict` | 映射表的第三族（在映射上断言，理由写在该用例 docstring：真装一版需要两侧算出同一个摘要，那属 57 的测试面） |
| `test_counter_example_the_internal_code_in_the_family_slot_is_back_to_a_500` | **反例 A**：进程内把守卫换回旧写法 ⇒ 同一请求回到 `http=500`，跑完 `monkeypatch.undo()` 并核实还原 |
| `test_counter_example_the_shape_without_digest_lets_the_keyerror_through` | **反例 B**：只换回旧形状 ⇒ `KeyError` 又变成 500（钉住"半修家族位不够"这件事） |

**整份门拿去咬 `90a11cb` 的 `handlers.py`**（`/tmp` 副本、`PYTHONPATH` 排前、工作树未动、跑完核实缺席）
⇒ **13 failed / 4 passed**。四条绿的各自都有理由，不是漏网：
`FAMILIES==12`（本单没改词汇，旧码也满足）；两条"注入后能用"（旧码注入后**确实**能用——
它们测的正是"家族位不是唯一的一堵墙"里的可修部分）；反例 A 本身（它断言"换回旧写法就 500"，与源码版本无关）。

**真监听复跑**（uvicorn 真 bind `127.0.0.1:34253` ＋ `urllib` 真发，DoD 的"真实环境五方法各一次"）：

| 方法 | 无服务（生产今天的形状） | 注入两个真实现 |
| --- | --- | --- |
| `usage.aggregate` | 200 `UNAVAILABLE`＋`USAGE_AGGREGATOR_UNAVAILABLE` | **200 `result {"sessions": []}`** |
| `usage.export` | 200 同上 | **200 `result {"sessions": []}`** |
| `providerArtifacts.list` | 200 `UNAVAILABLE`＋`ARTIFACT_STORE_UNAVAILABLE` | **200 `result {harness, versions: [], current: null}`** |
| `providerArtifacts.install` | 200 `UNAVAILABLE`＋… | 200 `INVALID_REQUEST`＋`ARTIFACT_DIGEST_MISMATCH` |
| `providerArtifacts.rollback` | 200 `UNAVAILABLE`＋… | 200 `NOT_FOUND`＋`ARTIFACT_VERSION_MISSING` |

⇒ **没有任何一条是 500**；三种结局（类型化不可用、真结果、类型化用户错）都在真 HTTP 上各走了一遍。
顺带核实 097/098/105 没被碰坏：`server.hello` 仍 200、`capabilities` 64、`harnesses: []`。

## 10 账与清理

真实模型调用 **0 次 / ¥0**：全程本地 SQLite ＋ 本地临时目录里的假 artifact store，
`digest` 是字面假摘要，凭据 locator **未访问**。
清理：三次临时根（`obs101-`/`obs101b-`/`obs101c-`）、`real101-`、`/tmp/101-oldcode` 逐一核实缺席；
两条反例都是进程内 monkeypatch，跑完核实还原，工作树无残留。
计数见终态行。

## 11 交回

* **给装配线（runtime 线）**：`bootstrap/runtime.py` 从不 import `UsageAggregator`/`ArtifactStore`（§5），
  所以本单修完之后这五个方法在**任何**组合上都是类型化 `UNAVAILABLE`。
  要不要给真实部署装上面是**产品裁决**（53/57 交付的是"面"还是"这台机器上的这个面"）。
  本树的写权不含 `bootstrap/**`（R-0023），故交回而不是顺手接。
* **给 103（元门）**：`providerArtifacts.install` 在 098/本轮之前**不存在任何可成功的请求**
  （两条路各自 500），却在合同与 hello 里都算一个方法——这类"登记齐全但从没通过一次"的面正是 103 要一网打尽的形状。
* **给 102**：本单**没有**触碰任何工件；`digest` 那个键是**服务端形状落后于既有权威**（§3），
  102 做工件同步时应能看到服务端与权威在这一条上已一致。
