# 147 — wire 读路径的形状与收口：资产面五处兜底 `except` 会说谎＋漏路径，`profiles.list` 逐行重走模型解析（`AUD-B-037` ＋ 并入的 `AUD-B-040`）

**终态**：`ASSET_SURFACE_EXCEPT_TYPED_DONE`
**写面**（本单声明）：`src/agent_box/server/wire/**` · `src/agent_box/server/assets/**` · `tests/**` · `docs/server-round1/**` · status
**真实模型调用 0 / ¥0**（本地 SQLite ＋ 本地对象库 ＋ 假凭据；未访问任何真实凭据内容）。

---

## 1 一手复核（前提、以及一处对工单措辞的更正）

| 前提 | 一手（本树，改前） |
| --- | --- |
| 五处同款兜底 | **成立**：`grep -n "getattr(refusal" wire/handlers.py` 命中 10 行 = **5 处**（`assets_sync_catalog` / `assets_install_from_catalog` / `assets_publish_skill` / `assets_publish_mcp` / 第五处同族），每处两行 f-string |
| 形状 | `WireError("INVALID_REQUEST", f"{getattr(refusal,'code',type(refusal).__name__)}: {getattr(refusal,'message',refusal)}")` ⇒ 无 `.code` 的异常把**类名**当码、无 `.message` 的异常把 **`str(exc)`** 当文案 |
| ⑤ 会漏路径 | **实测**：`index.json` chmod 000 ⇒ `PermissionError` ⇒ 改前出站文案含绝对路径（门里那条反例把"含路径"当**必须成立**来断言，见 §3） |
| 域内码没登记 | `errors.py` 的 `_BY_CODE` 里**没有任何 `CATALOG_*`** ⇒ `family_for("CATALOG_INVALID")` 落默认 `UNAVAILABLE`，所以那五处是**硬写** `INVALID_REQUEST`，码被塞进散文 |
| 正确做法在同仓 | `errors.py::from_server_error`（族位＋`details.internalCode`）与 `sidecar_backend.py::_safe_code`（形状白名单，原文只进日志）⇒ 本单**合流**，不新造机制 |
| **工单措辞的一处不对** | Scope 写"其余异常一律 `UNAVAILABLE`／`INTERNAL`"——**锁定的家族集里没有 `INTERNAL`**（`len(FAMILIES)==12`，101 的门钉着）⇒ 服务端故障取 **`UNAVAILABLE`**，不新增家族。这条差异写进门里（`test_the_catalog_codes_are_registered_and_no_family_was_invented` 同时断言 12 与 `"INTERNAL" not in FAMILIES`） |

## 2 落地（两半）

### 2a 五处合成一条路（`AUD-B-037`）

`wire/handlers.py` 新增 `_asset_refusal(exc)`，五处 `raise _asset_refusal(refusal) from refusal`：

- **有域内码**（`code` 且形状匹配 `[A-Z][A-Z0-9_]{2,127}` —— `_safe_code` 同一手法）⇒
  `WireError(family_for(code), f"{code}: {message}", {"internalCode": code, "retryable": …})`。
  **文案逐字不变**（G4 要求的就是这条），只是码同时进了 `details.internalCode`。
  为此在 `errors.py::_BY_CODE` 登记四个 `CATALOG_*` → `INVALID_REQUEST`（①–④ 的家族不变，只是不再靠硬写）。
- **其余任何异常** ⇒ `UNAVAILABLE` ＋ `internalCode = 异常类型名` ＋ `retryable: True`；
  **原文只进服务端日志**（`logging.getLogger(__name__).warning`，与 `sidecar_backend.py` 同一形制），**不进出站 `message`**。

### 2b 读路径去重（并入的 `AUD-B-040`）

`_CallReader`：**一次 wire 调用内**按 digest memo（`read` / `parsed` / `index` / `record` 四层），
`profiles_list` 建一个传给 `_profile → _sendability → _profile_bindings`；模型查找从**线性 `next`** 换成**按 provider 建一次索引**。
默认参数 `read=None` ⇒ 其它调用点行为不变。摘要即不可变性论证，所以 memo 不削弱校验（门里有一条直接比字节）。

**一手测量（40 行、1 个 provider、2000 条模型；同一夹具两跑）**：

```
memo 生效   ：objects.read = 41 次 / 197,761 字节      ← 40 份各自 config ＋ 1 份 models
memo 打掉   ：objects.read = 80 次 / 7,678,390 字节    ← 正是 132/147 要治的 O(行数×体积)
```
（审阅者量到的是 285 KB 的 models 对象 ⇒ 11,410 KB；形状一致、字节随对象大小变，**判据是次数**，计时不进任何门。）

## 3 门（`tests/server/test_asset_surface_refusals_147.py`，**16 条**，全部真 wire `raise_server_exceptions=False`）

| Gate | 覆盖 | 反例 |
| --- | --- | --- |
| G1 族位 | ⑤（`index.json` 000）与 ⑥（catalogs 根目录 0o500 ⇒ `staging.write_bytes` 失败）⇒ `UNAVAILABLE` | `test_counter_example_the_old_fallback_...`：把改前那两行 f-string 装回 ⇒ **必须**变回 `INVALID_REQUEST` |
| G2 内部码 | 两条都带 `details.internalCode`（⑤＝`PermissionError`） | 同一反例里断言"旧形状**没有** internalCode" |
| G3 无路径外泄 | 两条的 `message` 用正则 `(?:^\|[\s:'"])(/[A-Za-z0-9._/-]{2,})` 断言**不含绝对路径片段** | 同一反例断言"旧文案**含**路径"——如果哪天它不含了，这条反例就红，说明漏路径的判据在骗人 |
| G4 域内码不变 | `CATALOG_SOURCE_MISSING` 的文案**逐字**比对（`==`，不是 startswith）；`CATALOG_INVALID` 前缀比对；两处都**新增** `internalCode` | 文案漂移即红 |
| 结构 | `getattr(refusal` 命中数 **0**、`raise _asset_refusal(...)` 命中数 **5** | 有人再抄一份 ⇒ 计数变红 |
| **五处逐一真跑**（补做，19:39 UTC） | `test_all_five_sites_answer_a_server_fault_the_same_way`：对**五个**站点各自的存储调用注入同一个 `OSError(13, …, filename)`，逐点断言 `UNAVAILABLE` ＋ `internalCode` ＋ `message` 不含该绝对路径 ＋ `retryable: true`；先断言四个存储对象**都已装配**，否则门直接红（**空跑的门比没门更糟**） | 任一处仍是旧形状 ⇒ 该参数样本红 |
| G5b 读次数 | 40 行 ⇒ `objects.read ≤ 41` 且 `≥ 40`；且 40 行的 `sendability.state` 全是 `ready`（去重没把事实去掉） | `test_counter_example_bypassing_the_memo_...`：把 `read/parsed/index` 三层 memo 全打掉 ⇒ **≥ 80**，红得有理 |
| 完整性 | memo 的字节 == 冷读字节；`parsed/index` 内容与直接 `json.loads` 相同；**memo 不跨调用**（第二个 `_CallReader` 自己读一次 ⇒ 计数 2） | 任何一项不成立即红 |

## 4 与 123 并读（审阅者点名）

`123` 收的是**传输边界**（HTTP 边四道墙），`147` 收的是**wire 方法边界**（五个方法各写一份"我怎么解释这个异常"）。
合起来才是那条不变量的完整形状：**每个出站错误都带 JSON-RPC 体、且说的是真话**。
归批给 `132` 的形制：**"同一类故障在多处各拼一份 message"**＝五份真相＝本单要消灭的东西；
本单的做法不是改五条文案，而是**让五条走同一条路 ＋ 一条计数门钉住"不许再抄一份"**。

## 5 账

计数：定向 **16 passed / 6.55s**；
  **一条自我更正留在账上**：这条五站点门第一版把 `internalCode` 断成 `OSError`，五个样本一起红——原因是 CPython 会把 `OSError(13, …)` 自动提升成 `PermissionError`，**是我的期望错、不是产品错**；改成 `PermissionError` 后 16/16 绿。这类红恰恰证明门在量真东西（G3 的"路径不外泄"也是靠注入的真异常文案咬住的）。周边（117/125/098/103/asset_hubs/147）见 status.md 本单终态行。
`103` 的生成账按本单证据重算（`assets.syncCatalog` 等从 1 处驱动变多源）。真实模型调用 **0 / ¥0**。

DoD 六项：1 一手复现 ⑤/⑥ ＋ 核 ①–④（§1/§3）· 2 五处统一（§2a）· 3 message 卫生 ＋ 域内码保持（§2a/§3）·
4 门与反例（§3）· 4b 读路径去重（§2b，含 ≤41 的机检）· 5 账与证据。
**终态 `ASSET_SURFACE_EXCEPT_TYPED_DONE`**。交回一条：`INTERNAL` 家族不存在于锁定集合（§1 表末行），
若调度者认为服务端故障应当有自己的家族，那是**合同变更＋重锁**，不是本单能顺手做的。

## 补录（2026-09-20 09:1x）：memo 在 **300 行**下仍然成立（原门只量到 40）

`G5b` 的判据是"40 行 ⇒ `objects.read` ≤ 41"。今天把尺子拉到 300 行复算（一次性装配 ＋ 包住
`ObjectStore.read` 计数；临时根跑完即删）：**每次 `profiles.list` 调用对象读 = 1 次、被读字节数恒定 62 B，
不随行数增长**（1 / 100 / 300 行三档同值）。⇒ 147 并入 `AUD-B-040` 的那条修法在比原门大 7.5 倍的规模上不塌。

同一次测量顺手量到另一件**不属于本单射程**的事，已单独登记在 §待开单：
`profiles.list` **没有上限也没有分页**（响应 950 B → 87,568 B → 262,768 B，≈876 B/行、严格线性；
接受的参数形状只有 `{includeArchived}`）。加 `limit`/cursor 属合同增补（改锁件 ＋ 重锁），
不在"只跑不改"的 089、也不在已收口的 147 射程内。
