# 098 — `providerModels.create/update` 带 provenance 直接 500（证据）

工单基线 `f6cbc113`；本单在 `a8b93f3`（097 收口后）上执行。
§1–§3 是**阶段 1（观测）**，§4 起属阶段 2（修）。
凡标 **实测** 的是本单一手跑出来的；**引用** 的给了出处。

## 1 实测：500 是真的，而且不止工单点名的两个方法

观测形态 = **穿过真实 wire**（`build_runtime()` → `create_app` → `TestClient` POST
`/wire/v1/<method>`，带 `Authorization: Bearer <runtime.token>`；`raise_server_exceptions=False`
好让 500 以 500 的面目出现，而不是被测试客户端重新抛成 Python 异常——那正是这族缺陷能藏住的原因）。
`baseUrl` 一律用 `http://127.0.0.1:9/v1`（本机 discard 端口），所以**没有任何 Provider 被访问**、
凭据 locator 未读、真实模型 **0 次**。

| 调用 | 结果（实测） |
| --- | --- |
| `providerModels.create` **不带** `provenance` | `http=200` ＋ `result.providerModel.id`（对照：不带就没事，与工单一致） |
| `providerModels.create` 带**合法** `provenance` | **`http=500 Internal Server Error`** |
| `providerModels.create` 带**未知字段** `{"unknown":"x"}` | **`http=500`**（工单 G3 期望它是类型化 `INVALID_PARAMS`） |
| `providerModels.create` 带**枚举外值** `{"authStyle":"telepathy"}` | **`http=500`** |
| `providerModels.update` 带 `provenance` | **`http=500`** |
| `providerModels.probeModels` **不带** `provenance` | `http=200`（`result.status="failed"`，本地端口不可达——类型化，正常） |
| `providerModels.probeModels` **带** `provenance` | **`http=500`** ← **工单没点名的第三个方法** |
| `providerModels.probeConnection`（带/不带都一样） | `http=200`（它的 `_provenance()` 调用点是**死码**，见 §2） |

**一处直接证伪**：`WireService._provenance({"provenance": {...}})` 在同进程里直接抛
`NameError: name '_PROVENANCE_COLUMNS' is not defined`（`traceback` 末行原文），
且 `hasattr(handlers, "_PROVENANCE_COLUMNS") is False` 而
`hasattr(WireService, "_PROVENANCE_COLUMNS") is True` ⇒ 名字**存在但作用域不对**，不是没定义。

## 2 作用域核对（第一手，行号已相对工单漂移）

| 事实 | 出处（本单实测行号） | 工单写的 |
| --- | --- | --- |
| `_PROVENANCE_ENUMS` / `_PROVENANCE_COLUMNS` 是**类属性** | `handlers.py:1315` / `:1320` | `:1328` / `:1333` |
| `_provenance()` 是 `@staticmethod`，**裸名**引用三者 | `handlers.py:1328`（`def`）、`:1333`、`:1336`、`:1341` | `:1341` 等 |
| 类名是 **`WireService`**，不是工单里的 `WireHandlers` | `handlers.py` 类体 | 工单 §Current state 笔误 |
| 行号整体漂移 **−13** | 097 删掉了 27 项 `CAPABILITY_IDS` 常量（`dc2076f`） | — |

漂移不影响结论：静态方法体内没有类作用域，这是 Python 语言事实；工单的定性完全成立。

**工单没写到的调用点全貌**（`grep -n "_provenance(params)"`，四处）：

| 调用点 | 形状里有没有 `provenance` | 后果 |
| --- | --- | --- |
| `provider_models_create` `:1187` | 有（`_PARAM_SHAPES` `:59`） | 带就 500 |
| `provider_models_probe_models` `:1263` | **有**（形状 `:90-92` 的可选键） | 带就 500 ← 第三个方法 |
| `provider_models_probe_connection` `:1271` | **没有**（形状 `:93-95` 只允许 `credentialId`） | 永远拿到 `None` ⇒ 走不到那三行，**今天无害的死码** |
| `provider_models_update` `:1282` | 有（`:64`） | 带就 500 |

⇒ 本单的射程是**三个可调用到的方法**；第四个调用点要不要顺手删**不在本单射程**（删它是改语义不是修 bug），登记成交回项。

## 3 实测：500 底下还压着第二个缺陷——**修了 NameError 也不会落库**

这是本阶段最该被记住的一条，因为它**只在第一个缺陷修好之后才可见**：

- `_provenance()` 返回的 dict 用的是**列名**（`handlers.py:1336` `for field, column in ...` → `:1346 provenance[column] = value`），
  即 `{"auth_style": …, "wire_api": …, "fields_source": …, "base_url": …}`；
- 调用方把它 `body.update(...)` 进 body（`:1187`、`:1282`）；
- 而服务层按 **wire 驼峰名**取（`model_configs/service.py:67`、`:89`：
  `base_url=body.get("baseUrl"), auth_style=body.get("authStyle"), wire_api=body.get("wireApi"), fields_source=body.get("fieldsSource")`）；
- 存储列确实存在且拼写一致（`storage/database.py:77` `auth_style TEXT`；
  `model_configs/repository.py:55`、`:85` 写四列；`service.py:203-205` 的 `project()` 读回并在四列全空时**不输出** `provenance` 键）。

⇒ **只把裸名改成类限定，会得到 `http=200` 但四列全 `NULL`、`project()` 里没有 `provenance` 键**——
静默丢数据，比 500 更难发现。工单 G2（"四列写入且 `project()` 读回一致"）正是唯一能咬住这一条的门；
本单的门必须**同时**钉住 200 与读回一致，缺一个都算没修。

修法因此定为：`_provenance()` **返回 wire 字段名**（驼峰），`_PROVENANCE_COLUMNS` 继续充当
"允许的字段集合 + 列名对照"的**校验**依据，但不再决定 body 的键。列名逐字不动（§必须保持不变）。

## 4 覆盖现状（工单"从未被 wire 测过"的核对）

| 断言 | 一手证据 |
| --- | --- |
| 没有任何用例向 `providerModels.*` 发送 `provenance` | `grep -rn "provenance" tests/ --include=*.py` 命中 12 个文件，**全是另一套词汇**：capability grant 的 `provenance="locked-policy"`、sidecar 的 `provenance={"commit": …}`、catalog 的 ownership provenance ⇒ 无一在 `providerModels` 调用参数里 |
| 没有任何用例触及那四个存储列 | `grep -rn "auth_style\|fields_source\|fieldsSource" tests/ --include=*.py` ⇒ **0 命中** |

⇒ 55 的 provenance 面**从 handler 到 store 一行测试都没有**；工单说的"只覆盖了 service/record 层"实际是
**连 service 层的 provenance 参数都没被测试走到**（`tests/` 里 `fieldsSource` 零命中）。这条比工单的判断更严重一档。

## 5 阶段 1 的两个结论（供阶段 2 起跳）

1. **改两处，不是一处**：作用域（裸名 → 类限定）**且**返回键（列名 → wire 字段名）。
   只做前者会拿到一个"全绿但什么都不存"的交付——本单明确拒绝这种收口。
2. **射程三个方法**：`create`、`update`、`probeModels`（工单只点名前两个）。
   门必须把 `probeModels` 带 provenance 的那条也钉住，否则第四个 500 留在原地。

## 6 账（阶段 1）

- 真实模型 **0 次 / ¥0**；`baseUrl` 是本机 discard 端口，未出站、未访问任何凭据。
- 临时数据根用 `tempfile.mkdtemp(prefix="obs098…")`，跑完 `shutil.rmtree` 并回读存在性 ⇒
  两次探测均打印 `CLEAN True`。
- 本阶段**未改任何源码或测试**（只有本证据文件与 `status.md` 的账行为新增）。

## 7 阶段 2 实施：两处一起改，外加一处错误族

### 7.1 作用域（工单点名的那一处）

`@staticmethod` → **`@classmethod`**，两处裸名改 `cls._PROVENANCE_*`。

选"类限定"而不是"提到模块级"的理由：这两个常量是 `WireService` 的**私有合同细节**
（枚举值就是 wire 词汇），提到模块级会让它们变成 `handlers` 模块的公开姓名，
而本文件里没有任何模块级常量是这个待遇；`@classmethod` 是四处调用点
（`self._provenance(params)`）**一字不改**就能走通的最小形状。

### 7.2 返回键（阶段 1 §3 抓到的第二缺陷）

`_PROVENANCE_COLUMNS = {field: column}` → **`_PROVENANCE_FIELDS = ("baseUrl", "authStyle", "wireApi", "fieldsSource")`**，
`_provenance()` 返回 **wire 字段名**键；列名的归属留在 `repository.py`（唯一真正拼 SQL 的地方）。

不改名会留下一个说谎的常量：它的值（列名）在改完之后没有任何读者，
而它的名字仍然承诺"这里做列映射"。`grep -rn "_PROVENANCE_COLUMNS"` 在改动前只命中
`handlers.py` 自身与该工单文本（`build/lib/**` 是构建产物副本）⇒ 重命名不牵动别处。
`_PROVENANCE_ENUMS` 的三个枚举值**逐字未动**（工单 §明确不做）。

### 7.3 错误族：`INVALID_PARAMS` 不是合法家族（实测）

改完作用域后复跑，两条**拒绝路径仍 500**：`WireError("INVALID_PARAMS", …)` 的第一参
不在 `FAMILIES` 12 项闭集里（`errors.py:13-26`）⇒ `__post_init__` 抛 `ValueError` ⇒ 500。
这正是 **101 的缺陷族**，而 101 的 §Scope 明写"098 射程的 `INVALID_PARAMS` 两处可并入或留给 098，
但要在报告里写明归属"⇒ **归属：本单已修**，两处改成 `INVALID_REQUEST`（与同文件其余
71 处校验拒绝同一族），消息文本逐字未动（`provenance carries unknown fields` /
`provenance.{field} is not a known value`）。

**全仓家族扫描**（`src/agent_box` ＋ `plugins`，正则同时吃单行与换行后的第一参，90 个字面构造点）：

| 第一参 | 计数 | 是否合法家族 | 归属 |
| --- | --- | --- | --- |
| `INVALID_REQUEST` | 71 | 合法 | — |
| `UNAVAILABLE` | 7 | 合法 | — |
| `NOT_FOUND` | 3 | 合法 | — |
| `OUTCOME_UNKNOWN` | 1 | 合法 | — |
| `INVALID_PARAMS` | 2 | **非法** | **本单已修（§7.3）** |
| `ARTIFACT_STORE_UNAVAILABLE` | 1 | **非法** | **101**（`handlers.py:1195`，经 `_artifact_store()` 一处顶住 `providerArtifacts.list/install/rollback` 三个方法） |
| `USAGE_AGGREGATOR_UNAVAILABLE` | 1 | **非法** | **101**（`handlers.py:1243`，顶住 `usage.aggregate`/`usage.export`） |

⇒ **本单射程内的非法家族清零**；剩下 2 个字面点＝101 点名的 5 个方法，一处不剩地带进 101。
（扫描器口径：只认字面字符串第一参，`WireError.from_server_error(...)` 不在此列——那条路本来就收敛到合法家族。）

## 8 阶段 3：门（`tests/server/test_provenance_wire_098.py`，11 条）

全部**穿过真实 wire**（`Wire.call` 直接看 HTTP 状态码与 JSON-RPC 信封），没有一条是"直调实现"。

### 8.1 用例 ↔ 门

| 用例 | 钉哪道门 | 断言的形状 |
| --- | --- | --- |
| `test_legal_provenance_is_accepted_and_read_back` | G1＋G2 | 200 且 `providerModel.provenance ==` 请求的四字段 |
| `test_the_record_is_read_back_from_the_database_not_echoed_from_the_request` | **G2 的真正牙齿** | 换一次**独立调用**（`providerModels.list`）再读，只有一条记录、值一致 |
| `test_update_writes_the_given_field_and_keeps_the_absent_ones` | G1＋G2（update 腿） | 只给 `fieldsSource` ⇒ 其余三个**保持**（COALESCE 语义），四个一起读回 |
| `test_a_record_created_without_provenance_stays_without_provenance` | G4（不变项） | 不带 ⇒ `provenance is None`（"缺席即未知"没有被换成默认值） |
| `test_unknown_provenance_field_is_a_typed_refusal_not_a_500` | G3 反例 1 | `http=200` ＋ `error.code=INVALID_REQUEST` ＋ 消息含 `unknown fields` |
| `test_value_outside_the_enum_is_a_typed_refusal_naming_the_field` | G3 反例 2 | 同上，且消息点名 `provenance.authStyle` |
| `test_a_provenance_that_is_not_an_object_is_refused_without_500` | G3 加一条 | `provenance: ["api_key"]` ⇒ 类型化，不是 500 |
| `test_probe_models_with_provenance_does_not_500` | 第三个方法（工单未点名） | 200 ＋ `result.status ∈ {failed, unreachable}`（`baseUrl` 是本机 discard 端口，**未出站**） |
| `test_the_handler_speaks_wire_field_names_to_the_service` | 第二缺陷单独钉 | `_provenance()` 的返回键 ⊆ wire 字段名，且与四个列名**交集为空** |
| `test_counter_example_the_scope_bug_returns_the_500` | 反例 A | 进程内换回"裸名 `@staticmethod`" ⇒ 同一请求 `http=500`；`monkeypatch.undo()` 后**再发同一请求必须 200**（把 500 归给缺陷而不是载荷） |
| `test_counter_example_the_half_fix_stores_nothing` | 反例 B | 进程内只把返回键换成列名 ⇒ `http=200` 而 `provenance is None`，**并断言"如果不是 None，说明读回门没起作用"** |

### 8.2 反例不止在文件里，整个门对**旧源码**跑了一遍

不是"我改了代码所以门是绿的"，是把门拿去咬三种源码（每次都是全文件 11 条）：

| 源码 | 结果 | 读法 |
| --- | --- | --- |
| **旧代码**（`git show HEAD~1` 的 `handlers.py`，NameError 版） | **10 failed / 1 passed** | 唯一绿的是 `…without_provenance_stays_without_provenance`——它测的本来就是没坏的那条路（G4 不变项），**它该在旧代码上也绿**，否则它守的不是不变量 |
| **"只修作用域"的半修法**（工单 §Scope 提的那一行改法：类限定，键仍是列名、族仍是 `INVALID_PARAMS`） | **8 failed / 3 passed** | 红的是三条接受/读回 ＋ 三条拒绝族 ＋ 单独钉第二缺陷那条；绿的三条正好是"半修法确实修好了的部分"（不带 provenance 的路、`probeModels` 不再 500、反例 A 自身） ⇒ **工单原本设想的修法会在这套门前失败 8 条**，而它自己看起来是"201 了，做完了" |
| 本单最终源码 | **11 passed in 5.59s** | — |

两次"咬旧码"的跑法都**没有动工作树**：把 `src/agent_box` 整棵复制到 `/tmp` 下，只替换副本里的
`handlers.py`（旧版用 `git show HEAD~1:` 取；半修版在副本上做 4 处定点替换并逐处 `assert count == 1`），
`PYTHONPATH` 把副本排在最前；跑完 `rm -rf` 并核实两个目录都不存在（`CLEAN True`）。
工作树在这两次跑的前后都是同一份（`git status --short` 只剩待提交的门文件）。

## 9 阶段 4：真机复跑、与已锁工件对一遍、计数与账

### 9.1 真监听复跑（不是 `TestClient`）

形态：`build_runtime(临时根)` → `create_app` → `uvicorn.Server` 在守护线程里真 bind
`127.0.0.1` 随机端口（先 `socket.bind(("127.0.0.1",0))` 取空port再释放）→ `urllib` 真发
`POST /wire/v1/<method>`。`lifespan="on"`（数据根与迁移由 app 生命周期建立）。

| 请求 | http | 读回 |
| --- | --- | --- |
| `providerModels.create` 带四个合法 provenance | **200** | `{'baseUrl': 'https://api.deepseek.com', 'authStyle': 'api_key', 'wireApi': 'chat_completions', 'fieldsSource': 'manual'}` |
| 紧接着另开一次 `providerModels.list` | 200 | `[{同样四字段}]` ⇒ **落库确认**（不是同一响应的回声） |
| `create` 带未知字段 | 200 | `INVALID_REQUEST` ＋ `provenance carries unknown fields` |
| `create` 带枚举外值 `{"wireApi":"teleport"}` | 200 | `INVALID_REQUEST` ＋ `provenance.wireApi is not a known value` |
| `update` 只带 `{"fieldsSource":"preset"}` | 200 | 四字段齐全，`fieldsSource` 变 `preset`、其余三个保持 |
| `create` 不带 provenance | 200 | `provenance: None` |
| `probeModels` 带 provenance（`baseUrl` 指本机 discard 端口） | 200 | `{'status': 'failed', 'code': 'PROBE_UNREACHABLE', 'models': []}` ⇒ 类型化，未出站 |
| `server.hello`（顺带确认 097 的成果没被本单碰坏） | 200 | — |

跑完 `server.should_exit` → 删临时根 → `TEMP_ROOT_ABSENT True`。
**真实模型 0 次**：全程只有本机回环与 discard 端口，凭据 locator 未访问。

工单 §Validation 那条"对**试用 Server** 发一条带 provenance 的 create"：此刻机器上有两个在跑的
`python3` 服务（`127.0.0.1:18790`/`18791`，`ss -ltnp` 一手）与一个 `node`（`18796`）。
**本单没有向它们发写请求**，两条理由：① 那是用户的数据根，往里加一条 Provider 记录是可感知的副作用，
不在"执行者可自行决定"的范围（章程 §8／主树 README §4）；② 在跑的实例是本单修复**之前**构建的，
对它复现只会再量一次 500，证明的是部署落后、不是代码缺陷。⇒ 登记为**要人拍**（见 §10），
本单的"真机"腿用上面这份真监听顶。

### 9.2 与已锁工件 `wire-v1.schema.json` 对了一遍（这一步把两处漂移量了出来）

本树的 `Wire.call` 在 `AGENT_BOX_WIRE_SCHEMA` 存在时会用生成的工件校验 params 与 result
（`tests/server/test_wire_v1.py:118-127`）。拿它跑本单的 11 条门 ⇒ **9 passed / 2 failed**，
两条失败**都不是本单代码的错**，而是工件与服务端不一致：

| 事实 | 工件（`docs/server-round1/fullstack/generated/wire-v1.schema.json`，git 跟踪，212,653 B，`$protocolVersion="wire/1"`） | 服务端 |
| --- | --- | --- |
| `providerModels.create#params` 允许 `provenance` | **是**（keys 含 `provenance`，`additionalProperties: false`） | 是 ⇒ 一致 |
| `providerModels.update#params` 允许 `provenance` | **否**（`Additional properties are not allowed ('provenance' was unexpected)`） | **是**（`handlers.py:61-65`） ⇒ **漂移** |
| `providerModels.probeModels#params` 允许 `provenance` | **否**（keys 只有 `baseUrl/credentialId/requestId`） | **是**（`handlers.py:90-92`） ⇒ **漂移** |
| 覆盖广度 | **33** 个方法有 `#params`/`#result` | 派发表 **64** ⇒ 31 个方法无条目 |

⇒ 一句话后果：**一个严格按已锁工件做校验的客户端，根本没法给 `update` 送"来源标注"**——
前端 P28 要走的正是 `update` 这条腿。本单把服务端修好了，合同面还差一次重锁；
这属 **102（合同面漂移）** 的射程，本单不改工件（`docs/**/generated/**` 的再锁是合同动作，且 102 点名它）。

反向的收获有两条，都是独立第三证人：
① `providerModels.create#result` 里 `provenance` 子对象的键就是 **`baseUrl/authStyle/wireApi/fieldsSource`**
（驼峰）＋ 三个枚举逐字一致 ⇒ §7.2"handler 该说 wire 字段名"不是我的偏好，是已锁合同本来就这么写的；
② `WireError.code` 的 `enum` 就是那 12 项家族 ⇒ §7.3 的 `INVALID_PARAMS` 从来不是合法码。

## 10 交回与要人拍的

* **给 101**：本单射程内的非法家族清零；全仓 90 个字面 `WireError(` 构造点扫完只剩两处，
  都是 101 点名的：`handlers.py:1195` `ARTIFACT_STORE_UNAVAILABLE`（在 `_artifact_store()` 里一处，
  顶住 `providerArtifacts.list/install/rollback` **三个**方法）与 `handlers.py:1243`
  `USAGE_AGGREGATOR_UNAVAILABLE`（一处顶住 `usage.aggregate`/`usage.export` **两个**方法）
  ⇒ **2 个字面点＝5 个方法**，101 的门按方法数比、别按点数比。
  101 §Scope 划给 098 的那两处（`INVALID_PARAMS`）**已在本单 §7.3 修掉**，101 不用重复做。
* **给 102**：§9.2 的三条工件漂移（`update#params` 与 `probeModels#params` 缺 `provenance`、
  33/64 覆盖广度）。其中第一条会**让已修好的服务端在守合同的客户端面前仍然不可用**。
* **给 105**：`server.hello#result` 根对象是 `additionalProperties: false` ⇒ 新增 `harnesses` 键
  **必须**重锁这份工件（本树就有工件，路径见 §9.2）。同时 097 §9 那条"本树没有生成物"已在
  097 的证据里就地更正。
* **给 103**：`provider_models_probe_connection`（`handlers.py:1271`）调 `self._provenance(params)`
  而它自己的参数形状不允许 `provenance` ⇒ 那是一个**永远拿到 `None` 的死调用点**。
  删它是改语义（本单不做），103 的"每个登记方法至少被真 wire 驱动一次"门会自然把它照出来。
* **要人拍（阻塞登记）**：工单 §Validation 的"对试用 Server 发一条带 provenance 的 create"这一腿
  ——需要**先从本树重建部署在跑的实例**（否则量到的还是旧码的 500），并且会往用户的数据根里
  留一条 Provider 记录。二者都不是执行者可自决的动作。本单的真机腿已用**同一份代码的真监听**顶上（§9.1），
  部署后复跑这条只要一次 `create` 即可判。
* **工单文本与实不符的四小处（不改契约，交回调度者记）**：
  ① 类名是 `WireService`，不是 `WireHandlers`；② §Current state 的行号整体 **+13 漂移**（097 删了 27 项常量），
  实际是 `:1315/:1320/:1328`；③ §Validation 的"期望 201"——本传输没有 201，成功是
  `http=200` ＋ JSON-RPC `result`（404/500 才是裸 HTTP 码）；④ G3 写的"类型化 `INVALID_PARAMS`"
  指的是一个**不存在的家族**（12 项闭集里没有它），字面执行会永远修不好——本单按**意图**（类型化拒绝、不是 500）
  实现为 `INVALID_REQUEST`，这正是 101 的缺陷族。

## 11 计数与账

| 项 | 结果 |
| --- | --- |
| 门文件（最终源码） | `11 passed in 5.59s` |
| `python3 -m pytest tests/server -q` | **672 passed in 444.11s**（0 失败 0 跳过） |
| `python3 -m pytest tests/ -q` | **972 passed in 358.34s**（0 失败 0 跳过） |
| 计数算术 | **672 = 661（097 收口）＋ 本单 11**；**972 = 961（097 收口）＋ 本单 11** ⇒ 两条都恰好只长了本单新增的份数，一条未掉 |
| `validate_order.py --strict` | 30 OK / 31 FAIL，FAIL 恰为 37…67 的 v1 历史单（非本单引入）；068–105 全 OK 含本单 |
| `git diff --check` | 干净 |

两遍全套件是在 `fb31cf5` 上跑的（`== HEAD ==` 由脚本一并打回，见输出末行）；此后本单只剩
**门文件的模块 docstring 加了一段散文**（记 §9.2 的工件漂移），跑 `test_provenance_wire_098 +
test_hello_capability_sync_097 + test_wire_v1` ⇒ **55 passed**（11＋7＋37）覆盖这个差量。
计数不重跑全套件来"归属"那一行散文，与 097 §8.5 的取舍一致：**差量是注释、且差量本身有定向跑**。

费用：**真实模型调用 0 次 / ¥0**。本单四个阶段全部是本地 SQLite ＋ 本机回环，
`baseUrl` 只用过 `127.0.0.1:9`（discard）与 `api.deepseek.com` 这个**从未被解析也从未被连接**的字符串
（它只作为一次 `create` 的**字段值**落进本地数据根）。凭据 locator **未访问**，没有任何凭据内容进过日志或证据。
清理：三次临时数据根（`obs098-`、`fix098-`、`real098-`）跑后逐一核实缺席；
两次"咬旧码"用的 `/tmp/098-oldcode`、`/tmp/098-scopeonly` 跑完 `rm -rf` 并核实（`CLEAN True`）。
