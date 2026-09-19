# 129 — `accounts.importAsset`：契约收 `requestId`，实现一次都没读（`AUD-B-012`）

**终态**：`IMPORT_ASSET_REQUEST_ID_DONE`（批末复算见 §6）
**写面**（本单声明）：`src/agent_box/server/wire/**` · `tests/**` · `docs/server-round1/**` · `docs/implementation/status.md`
**真实模型调用 0 / ¥0**：全部本地 SQLite ＋ `MemorySecretStore` ＋ 临时目录里的假登录态文件；**未访问任何真实凭据内容**（凭据只作 locator，见 §5）。

---

## 1 一手复现（先证明"退回旧实现"真的会那样，再动手）

审阅者的两条前提逐字复核（本树 `HEAD` 未改时）：

| 前提 | 一手核对 |
| --- | --- |
| 契约**要求** `requestId` | `wire/handlers.py:90` —— `"accounts.importAsset": ({"requestId", "accountId", "sourcePath"}, set())`，形状门在函数体之前把关 ⇒ 少发就 `INVALID_REQUEST` |
| 处理函数**没用**它 | `wire/handlers.py:1065-1112`（`accounts_import_asset` 全文）——`requestId` 只被形状门消费；函数体从 `accountId` 起算，**没有一处**读 `params["requestId"]`，也没有 `IdempotentRecords`（本文件当时**连这个类都没 import**） |
| `write_asset` 每次调用新铸 locator | `server/accounts/assets.py:176-191` —— 每次 `secret_store.import_file(...)` 返回新 locator，**内容与 key 都不参与命名** |
| 同族两法走了幂等层 | `accounts.create` → `server/accounts/records.py:24-46`（`scope="accounts.create"`，check+insert 同事务）；`accounts.bind` → `server/profiles/repository.py:218`（`bind_account(key=…, request_digest=…)`） |

**真 wire 反例（把旧函数装回派发表，跑两次同一请求）**——门里那条用例就是这么测的，实测数：

```
同一个 requestId、同一个 accountId、同一个文件，连发两次
→ write_asset 调用次数 = 2
→ 两个 locator：…7a0738b2… 与 …29d97ddb…（同一个 account_4b49d931…）
→ 两次都返回 result（第二次 hasAsset 仍 true）：错误码 = 零
```

⇒ "重试＝再执行一遍"当场成立；而**回执层面什么都看不出来**（两次字节几乎一样），所以这条只能靠**数副作用**咬——这也是本单门的核心设计（§4）。

---

## 2 修法：走同族那条路，不新造机制

`wire/handlers.py` 的 `accounts_import_asset` 尾部（读文件之后、写资产之前）接幂等层：

```python
key = _request_id(params["requestId"])
request_digest = digest({"accountId": …, "sourcePath": …, "size": size,
                         "sha256": hashlib.sha256(payload).hexdigest()})
scope = "accounts.importAsset"
idempotency = accounts.idempotency          # 就是 accounts.create 用的那个实例
prior = idempotency.get(scope, key, request_digest)
if prior is not None:
    return prior[1]                          # 回放＝把回执原样交回去
… write_asset / record_asset …
idempotency.save(scope, key, request_digest, 200, body)
```

三个口径写清楚：

1. **用 `accounts.idempotency` 而不是 new 一个 `IdempotentRecords`**：同族同一条路的字面意思——同一个实例、同一个 `server_idempotency` 表、同一套冲突语义。为此把本单顺手加在文件头的 import 撤掉了（派发面不需要认识这个类）。
2. **摘要含 `sha256(字节)`**：同族的摘要覆盖的是**请求体**；这里的请求体是一个**路径**，路径不变而文件内容变了＝**不是同一个请求**。于是"同 key 换内容"落到 `CONFLICT_REQUEST` 而不是悄悄覆盖（`R-0032 ⑤`：宁可报冲突，不要吃信息）。
3. **回放返回冻结回执**（和 `bind` 一致，不像 `create` 那样重新投影）：本方法的回执里带账号视图，回执就是那次请求的答案。差异登记在 §3 并给依据。

**必须保持不变的东西**：形状门、`_subscription_files_for` 的拒法、`write_asset`/`record_asset` 的语义、`create`/`bind` 一字未动（§4 里既有门全绿就是这条的证据）。

---

## 3 三法对照（本单要求"同族不许三套"，逐列一手）

| 方法 | 幂等键 | 摘要覆盖 | check/insert 位置 | 回放返回 | 冲突码 | 副作用是否在同一事务 |
| --- | --- | --- | --- | --- | --- | --- |
| `accounts.create` | `_request_id(requestId)` | `harness`, `accountIdentifier` | `accounts/records.py:29-46`（`database.transaction()` 内） | 回执里的 `account_id`，随后 handler **重新投影** ⇒ 反映当前状态 | `IDEMPOTENCY_CONFLICT` → `CONFLICT_REQUEST` | **是**（只插一行） |
| `accounts.bind` | 同上 | `profileId`, `accountId` | `profiles/repository.py:218`（同事务） | **冻结回执** | 同上 | **是**（一列 UPDATE） |
| `accounts.importAsset`（129 后） | 同上 | `accountId`, `sourcePath`, `size`, **`sha256(字节)`** | 跨两次：`get`（读事务）→ 写资产 → `save`（另一事务） | **冻结回执**（与 `bind` 同） | 同上（**这条是本单新增的可判定行为**） | **否**——见 §5 那条窗口 |

**差异只有一处，且有依据**：资产字节要先进 `SecretStore` 才有回执可存，而 `write_asset` 不在本单写面（`accounts/assets.py`），
所以幂等记录与副作用写做不到同事务。这条**如实记成残留**并交回（§5），不假装闭合；`save` 自己会在事务内再 check 一次并返回胜者回执，
所以**两个并发首次请求不会都拿到"我写的那份"**——真正的残留只是"第二份资产字节可能已经落进存储"。

---

## 4 门（`tests/server/test_import_asset_request_id_129.py`，10 条，全走真 wire `raise_server_exceptions=False`）

| Gate | 覆盖用例 | 咬法 | 反例 |
| --- | --- | --- | --- |
| G1 回放 | `test_a_retry_of_one_import_replays_and_writes_the_asset_once` · `test_a_replayed_import_leaves_exactly_one_idempotency_row_and_one_asset` | **数 `write_asset` 调用次数**＝1；两次响应字节相同；账号的 locator 仍是第一次那个；`server_idempotency` 该 scope 只有 1 行、locator 集合大小 1 | 见下条反例用例 |
| G1 反例 | `test_counter_example_the_pre_129_handler_writes_twice_and_moves_the_locator` | 把 §1 那个旧函数装回**派发表**（不是 class——`handlers` 在构造时捕获绑定方法，这点与 123 同课）⇒ 实测 `write_asset` 2 次、两个不同 locator、**零错误码**；`undo` 后核实装回来的是真实现 | —— |
| G1 边界 | `test_a_different_key_for_the_same_bytes_is_a_new_request_not_a_replay` | 换 key 同内容 ⇒ 2 次写、locator 不同（幂等是**按请求**不是按内容；与 `create` 两个 key 建两个账号同口径） | —— |
| G2 冲突 | `test_the_same_key_with_a_changed_file_is_a_conflict_request` · `test_one_key_cannot_import_into_two_different_accounts` | 同 key 换文件 ⇒ `CONFLICT_REQUEST` + `internalCode=IDEMPOTENCY_CONFLICT`，且账号引用**没被移动**；同 key 换 `accountId` ⇒ 冲突且只写了一次 | —— |
| G2 同族一致 | `test_the_conflict_family_matches_the_sibling_that_uses_the_same_layer` | `accounts.create` 的同 key 换体给出**同一族、同一内部码**——对照表里那一格是测出来的，不是抄的 | —— |
| G3 对照表 | `test_the_report_carries_the_three_method_comparison` | 本报告在场且三法逐字出现＋`回放`/`CONFLICT_REQUEST` 在场（对文档的门偏弱，但"回头再写"正是 097 的落点） | 报告缺失/漏一行即红 |
| G4 不回归 | `test_a_retry_of_accounts_create_still_makes_exactly_one_account` · `test_a_request_without_the_key_is_refused_by_the_shape_before_any_write` | `create` 的既有回放语义**被钉住**（一条账号、同 id）；形状声明与"零副作用"同时成立（缺 key ⇒ `INVALID_REQUEST` 且 `write_asset` 一次没跑） | —— |
| 既有面 | `tests/server/test_accounts.py` 的 56 号 wire 面**一字未改**并在全量里绿 | —— | —— |

---

## 5 残留与交回（带证据，不静默）

1. **检查与写入之间的那个窗口**：`get` 之后、`save` 之前，资产字节已经落进 `SecretStore`。
   两个并发的同 key 首次请求 ⇒ 至多一份回执胜出（`save` 在事务内再 check），但**可能留下第二份没人指向的资产字节**。
   闭合它需要把 `write_asset` 挪进与幂等 insert 同一个事务——那是 `src/agent_box/server/accounts/assets.py` / `records.py` 的地盘，**不在本单写面**。
   ⇒ 登记成本树 §待开单的候选（能给 `accounts/**` 写面的一条单：把资产写与回执写做成一个事务，或用 locator 内容寻址让第二次天然等价）。
2. **回放仍要能读到源文件**：摘要含 `sha256(字节)`，所以重试时文件被删/移 ⇒ 先到的是形状与文件检查（`INVALID_REQUEST`），而不是回放。
   这条不是缺陷（比"默默回一份旧回执但没人知道文件已经不在了"更诚实），但**前端要按"重发可能吃到 INVALID_REQUEST"来写文案** ⇒ 记进 §3 的口径。
3. **回执是冻结的**：重放导入的回执反映**当时**的账号视图（若其间账号被 `bind`/被验证过，回放不会反映新状态）。与 `bind` 同口径，§3 已列。
4. **`write_asset` 的命名时机未改**：本单**没有**去改"每次调用新铸 locator"（在 `assets.py`，写面外）。
   §3 的口径改成"同一逻辑请求只执行一次"⇒ 新铸不再可达；**跨 key 的同内容仍是两个 locator**，这是既有语义（`test_a_different_key_for_the_same_bytes…` 把它钉成事实）。
   若调度者要的是"内容寻址、同内容同 locator"，那是**另一条决定**（会牵动 reclaim 的摘要比对），本单按交回处理。

---

## 6 计数与终态

```
定向：python3 -m pytest tests/server/test_import_asset_request_id_129.py -q → 10 passed（含报告那条）
批末全量：见 status.md 本单终态行（含"Worker 工件在/不在"一行，QA-007）
```

DoD 五项：1 一手复现（§1，含真 wire 反例的实测数）· 2 接幂等路径（§2，与同族同一实例/同一表）·
3 locator 铸造时机（§5.4：**未改**，交回并附一手证据——本单把"同一请求铸两个 locator"变成不可达）·
4 门含反例与冲突语义（§4）· 5 三法对照表＋账（§3、§6、status 终态行）。

**终态 `IMPORT_ASSET_REQUEST_ID_DONE`**，剩余＝§5 那四条已登记的交回项（不属本单写面）。
