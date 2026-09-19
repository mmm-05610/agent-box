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

见 `tests/server/test_provider_update_keeps_omitted_112.py`（G1 省略即保留 ×3 面、G2 显式清空生效 ×3、
G2b 不允许清空者仍类型化拒绝、G3 不退化（CAS/provenance 098/错误族 101）、G4 不越界（参数形状与 create 字面钉死）＋
两条进程内反例）。反例真跑结果见 §5。

## 5 反例、回归、费用、清理

（阶段 3/4 落地后补）
