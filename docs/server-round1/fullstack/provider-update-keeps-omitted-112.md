# 112 — `providerModels.update`：省略即保留、显式即改写（证据）

工单基线 `4ac8263`；本单在 `8cdbfcb`（103 收口后）上执行，A 线队列第 6 张（112/113 由调度者按 R-0032 投递）。
写面：`server/wire/handlers.py`、`server/model_configs/{service,repository}.py`、`tests/server/**`。

## 1 观测：工单说的那一半已经是对的，说错的是另一半

调度者的表述是"省略的字段会写空/写默认 ⇒ 静默改写"。在真 wire（进程内 TestClient + `alpha` 注册表，
`create` 一条带完整 provenance 的记录）上逐条量下来：

| # | 请求（`providerModels.update`） | 一手结果 | 判定 |
| --- | --- | --- | --- |
| 1 | **不带** `provenance`（其余四件原样重发） | 200，四列**逐字保留**原值 | ✅ "省略即保留"在 provenance 上**已经成立** |
| 2 | 带 `{"baseUrl": "https://changed.example"}`（只给一列） | 200，给的这列改了、**未给的三列保留** | ✅ 部分更新也已成立 |
| 3 | 带 `{baseUrl:null, authStyle:null, wireApi:null, fieldsSource:null}`（四列**显式 null**） | **200，值一字未动** | ❌ **这才是缺陷**：清空意图被吞——既不生效，也不拒绝 |
| 4 | 省略 `displayName` | 类型化 `INVALID_REQUEST: params shape is invalid: missing displayName` | ⚠️ 见 §2（合同层面） |
| 5 | 省略 `models` | 同上 `missing models` | ⚠️ 同上 |
| 6 | `models: []` | 类型化 `INVALID_REQUEST: Models must be non-empty and unique` | ✅ 不允许清空的字段，现状就是类型化拒绝 |
| 7 | `displayName: null` | 类型化 `INVALID_REQUEST: displayName must be a bounded string` | ✅ 同上 |
| 8 | service 层 `update(body={"displayName": …})`（省略其余） | **`KeyError: 'configuration'`**；补上后 `KeyError: 'models'` | ❌ 服务层**没有"省略"这个概念**：内部调用者走到这里就是未处理异常的形状 |
| 9 | 连续两次 update 用同一个 `expectedVersion` | 类型化 `CONFLICT_VERSION` | ✅ CAS 现状清楚，本单不得动 |

⇒ 两处把"显式 null"当成"没给"：`wire/handlers.py:1391`（`if value is None: continue`，还没到服务层就被丢掉）
与 `model_configs/repository.py:85-86`（`base_url=COALESCE(?,base_url)`，NULL 与"不给"在 SQL 上不可区分）。

**按 R-0032 ⑤ 的判据（选不让信息被吞掉的那一侧）**：`省略 ⇒ 保留`（已有，钉成门）＋
`显式 null ⇒ 真的清空`（本次修）＋ `不允许清空的字段 ⇒ 类型化拒绝`（已有，钉成门）。
不采用的第三种写法是"今天"：客户端以为清空了，而库里还是旧值。

## 2 工单的场景 4/5 在这棵树的合同上不可表达（如实登记，不改契约）

`_PARAM_SHAPES["providerModels.update"]` 的**必填集**含 `displayName/credentialId/configuration/models`
（`handlers.py:62-66`，已锁工件同形），所以"请求只给 `displayName`、不给 `models`"在**线上发不出来**：
它是类型化 `INVALID_REQUEST`（测量 #4/#5），不是静默改写。

⇒ 本单**不动参数形状**（工单 §Scope"明确不做：改 wire 参数形状"＋ G4"wire 形状零改动"）。
把必填集放宽＝合同变更＋重锁，属 **113 / settings 线**那一条链，交回调度者：
**同一门在两个可达层面各自钉死**——(a) 服务层：body 省略的键 ⇒ 取 `current` 的原值（这正好把场景的
"未给字段逐字不变"变成断言，且顺手消掉 #8 的未处理异常）；(b) 线面：provenance 的省略 vs 显式 null 两种意图可区分并各自生效。

## 3 修法（阶段 2）

* `handlers._provenance`：`value is None` **不再 continue**，而是把该键以 `None` 传下去（＝显式清空）。
  枚举/未知字段/非字符串的拒绝一字不动（098 的门仍绿）。
* `model_configs.service.update`：以 `body` 里**实际出现的键**为准——没出现的 `displayName/credentialId/
  configuration/models` 一律取 `current` 的原值（不再 `body[...]`）；provenance 四列按"给了就写（含 `None`）、
  没给就 `KEEP`"传给仓储。
* `model_configs.repository.update`：四个 provenance 形参默认值从 `None` 改成哨兵 `KEEP`，
  只对本次真正要写的列生成 `SET` 片段——`COALESCE(?,col)` 消失。其余四列仍无条件写（语义未变）。

**必须不变**：`create` 一字不改（provenance 为 null 时写入 NULL，与列默认值同形，测量见门 §4"create 中性"）；
CAS/`expectedVersion`/幂等 `requestId`/错误族全不变。

## 4 门（阶段 3）

`tests/server/test_provider_update_keeps_omitted_112.py`：**24 条**（`24 passed in 38.11s`）。

| 组 | 钉什么 | 反例方向 |
| --- | --- | --- |
| G1 ×4 | 省略 ⇒ 保留：不带 `provenance`／只给一列／给 `{}`；**服务层**只给 `displayName` 时其余逐字保留（`version+1`） | 保留写成清空即红 |
| G2 ×5 | 显式 `null` ⇒ **真的清空**（四列全清 ⇒ 读回 `provenance: null`；单列清 ⇒ 只动那一列）；**同一请求里既清又改又留**；清空要看得到（`providerModels.list` 另一次调用读回，不是回显） | 把 null 当省略 ⇒ 红（旧码正是红在这里） |
| G2b ×3 | 不允许清空者仍说话：`displayName:null` ⇒ `INVALID_REQUEST`；`models:[]` ⇒ `INVALID_REQUEST`；`configuration:[]` ⇒ 合法清空（三者区别被钉住，不是"一律拒绝"也不是"一律接受"） | 一律静默 ⇒ 红 |
| G3 ×4 | 不退化：旧 `expectedVersion` ⇒ `CONFLICT_VERSION` 且 `error.current` 带原值；同 `requestId` 重放不双加版本；枚举外/超长仍类型化；**`create` 对本次改动中性**（混合 null 的投影与改前一字不差） | 动到 CAS/幂等/098/101 ⇒ 红 |
| G4 ×5 | 不越界：`_PARAM_SHAPES["providerModels.update"]` 的必填/可选集**字面钉死**；省略任一必填字段仍是点名该字段的类型化拒绝（＝"部分更新在线上发不出来"这条事实的门） | 悄悄放宽必填集（＝改合同＋重锁，属 113）⇒ 红 |
| 反例 ×3 | ① 进程内把 `if value is None: continue` 装回 `_provenance` ⇒ 同一请求 200 而旧值原样躺着（**把缺陷复现一遍，不是描述一遍**）；② 仓储四个形参的默认值必须 `is KEEP` 且源码里不再出现 `COALESCE`；③ `KEEP is not None`（若哨兵被并成 `None`，G1/G2 会塌成一条而其余门全绿） | — |

### 对旧码真跑（`/tmp` 源码副本 ＋ `PYTHONPATH` 前置，不编辑工作树）

把 `wire/handlers.py`、`model_configs/service.py`、`model_configs/repository.py` 三个文件退回 `0f7b865`
（＝修复前）后跑同一个门文件：**9 failed / 15 passed**。

红的是：`test_the_service_keeps_every_field_its_body_omits`（旧码 `KeyError: 'configuration'`）、
`test_an_explicit_null_clears_only_the_field_it_names[三个参数化]`、
`test_clearing_all_four_reads_back_as_unknown_not_as_a_guessed_default`、
`test_keep_and_clear_happen_in_the_same_request`、
`test_replaying_one_request_id_does_not_bump_the_version_twice`（版本没双加，红在后半：清空被吞）、
`test_a_none_default_in_the_repository_would_make_clear_and_keep_identical`（旧默认 `None`）。

绿的 15 条**按性质分两类，都必须写清**：
① 语义未变的那一半（G1 的"省略即保留"三条、G2b 的三条拒绝、G3 的 CAS/幂等/枚举/create 中性、G4 的五条形状）
——它们绿**正是本单的前提修正**：那部分缺陷不存在；
② 反例 ① 那条**故意**在旧码上绿（它断言的就是缺陷行为）；
③ 一条要如实标注：`test_the_keep_sentinel_is_not_none` 在这次退码跑里红是**脚手架造成的假红**——
旧模块根本没有 `KEEP`，为了让门文件能 import，我在临时注入里放了一个没有 `__repr__` 的替身，
所以红的断言是 `repr` 而非 `KEEP is not None`。它不改变结论（同组另一条真红已足够），但不写清就成了冒充证据。

## 5 回归、费用、清理

* 定向回归（工单 §Validation 第一条）：`pytest tests/server -k "provider or update or provenance"` ⇒
  **68 passed / 682 deselected**，0 失败。
* 全套件计数见本单终态行（G5 无声明，按 DoD 第 3 项入账）。
* 真实模型 **0 次 / ¥0**；清理：`/tmp/o112` 退码副本已删并核实不存在。

## 6 顺带量到的一条（交回，不在本单射程）

两个探测方法对 `provenance` 的处理**不对称**，本轮为跑"探针不受 null 改动影响"这条检查而第一手量到：

| 方法 | 请求带 `provenance` | 结果 |
| --- | --- | --- |
| `providerModels.probeModels` | 全 null / 混合 null | **接受**（校验通过，照常探测；`http://127.0.0.1:1` ⇒ 类型化 `PROBE_UNREACHABLE`） |
| 同上 | 未知键 `nope` | 类型化 `INVALID_REQUEST: provenance carries unknown fields`（本单改的分支之外，行为未变） |
| `providerModels.probeConnection` | **任何**形态的 `provenance` | `INVALID_REQUEST: params shape is invalid: unexpected provenance` |

⇒ `handlers.py:1323` 里 `probe_connection` 那句 `self._provenance(params)` **永远看到 `None`**——这不是推断：
形状门在 handler 之前就把带 `provenance` 的请求拒了。这正是 098 终态行未做项 ③ 记下的那个"死调用点"，
现在有了可复跑的实测。**本单不删它**：删＝改语义（要么让 `probeConnection` 接受 provenance，要么明确它不接受），
两个方向都该由调度者拍。登记见本树 `status.md` §待开单同族条目（098 §9.2 / 113 的 `--compare` 也各指到同一处合同漂移）。

## 7 修订 v2（`6c09534`）要的第二半：逐字段登记"可空性 ⇒ 处置"

调度者按阶段 1 的实测改了这张单（原文前提是反的），并裁定："省略即保留"只是一半，
另一半是**显式清空不许被吞**；逐字段的可空性以**合同/工件**为准。登记如下——
"合同"那一列全部是 `wire-v1.schema.registered-c4255b31.json` 里 `providerModels.update#params.properties` 的现物，
由门 `test_the_nullability_table_is_read_from_the_contract_and_not_typed_in` 每次核对（重锁改可空性 ⇒ 门红，而不是散文过期）。

| 字段 | 合同可空？ | 显式给 `null` 的实测处置 | 省略该字段的实测处置 | 钉它的门 |
| --- | --- | --- | --- | --- |
| `credentialId` | **是**（`anyOf [string, null]`） | **真的解绑**：绑定态 → null ⇒ 读回 `credentialId: null`、版本 +1；服务层省略该键 ⇒ 绑定**保持** | 线面：`INVALID_REQUEST: … missing credentialId`（必填集含它） | `test_the_contract_nullable_column_really_unbinds` |
| `displayName` | 否（`string`） | 类型化拒绝：`displayName must be a bounded string` | 点名拒绝 | `test_the_three_non_nullable_columns_refuse_null_by_name`、`test_display_name_still_refuses_null_rather_than_keeping_quietly` |
| `configuration` | 否（`array`；`[]` 合法） | 类型化拒绝：`configuration must be a list of control assignments`；而 `[]` 是**合法清空**（读回空列表，provenance 不受牵连） | 点名拒绝 | 同上 ＋ `test_configuration_may_be_emptied_on_purpose` |
| `models` | 否（`array`，**合同无 `minItems`** ⇒ 空数组合规） | 类型化拒绝：`models must be a list` | 点名拒绝 | 上表那条 ＋ `test_an_empty_list_the_contract_allows_is_still_a_typed_refusal` |
| `provenance` 四列 | **合同里根本没有 `provenance` 这一键**（113 的 `--compare` 点名的两条漂移：`update` 与 `probeModels`） | 以 Server 侧为准：省略 ⇒ 保留；显式 `null` ⇒ **真的清空**（单列/全列都分辨得出） | 四列整体省略 ⇒ 全保留；只给一列 ⇒ 未给的三列保留 | G1×4 ＋ G2×5 |

**一处如实登记的偏差（不是缺陷，也不是"已对齐"）**：`models: []` 合同允许、Server 拒绝。
按 R-0032 ⑤"选不让信息被吞的那侧"，Server 的做法是**说话**（类型化 `Models must be non-empty and unique`）而不是静默——
所以本单不动它，只把它钉成一条会随合同变化的门（合同哪天加了 `minItems`，那条门会红并要求重看）。

**门数变化**：24 ⇒ **28**（新增 4 条：可空列真的解绑、三个非空列点名拒绝、可空性表与工件核对、`models:[]` 偏差）。
`28 passed in 9.89s`。这是 `checkpoint/b2-2` **之后**的补做：tag 不移动（README §3.2 禁止覆盖），
本节的账以"更正行"形式附在 112 终态行之后。
