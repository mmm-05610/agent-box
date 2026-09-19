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
