---
id: "147"
slug: asset-surface-except-leaks-and-mislabels
batch: b2
baseline: "9a3ba3e"
depends_on: []
write_paths: ["src/agent_box/server/wire/**", "src/agent_box/server/assets/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-runtime-round1/**", "release/**"]
ruling: R-0046
revisions: [{"at": "425541c", "what": "**并入 `AUD-B-040`（confirmed/low，审阅者第 95 轮）**：`profiles.list` **每行都重走一遍模型解析**（`117` 号 sendability）⇒ **同一个 provider 的 models 对象被逐行重读＋重算 SHA-256**：调用链＝`handlers.py:553-557`（逐行）→ `:559 _profile(row)` → `:571 item['sendability'] = self._sendability(row, item)` → `:681 _profile_bindings(row)`；`_profile_bindings` 内部（`:600-645`）依次 `self.objects.read(profile.config_object_digest)` → `self.model_configs.records.get(providerId)` → **`self.objects.read(provider.models_object_digest)`（`json.loads` 全量）** → 再 `next(...)` 线性找 model；`storage/objects.py:53-58` 的 `read()` ＝ `path.read_bytes()` ＋ **对整份内容重算 sha256** 校验摘要、**无任何按 digest 的缓存**。**实测（计数与字节两次复跑完全一致；计时随负载浮动 ⇒ 只判次数与字节）**：models 对象 285 KB（2000 条）、**只有 1 个 provider** ⇒ 行数 1→`read` 2 次/285 KB；10→20 次/2 852 KB；**40→80 次/11 410 KB** ⇒ **单次 `profiles.list` 就是一次 11 MB 量级的读**。**修法（都很小，审阅者给三条）**：① **一次 wire 调用内**按 digest memo `objects.read`（`_profile_bindings` 里 provider 与 models 两份都缓存；不可变性由摘要保证 ⇒ **缓存不削弱完整性**）；② 或在 `_sendability`/`profiles_list` 层把同 profile 的 provider 解析做一次共享（**按 providerId 建一次索引再查 modelId，去掉线性 `next`**）；③ **机检判据**：40 行 list 的 `objects.read` 次数上限 ＝ 40（各自 config）＋ provider 数（本夹具 **1+1=41，而不是 80**）。**并入依据＝审阅者建议**（『可与 `037` 并成一张「**wire 读路径的形状与收口**」小单（都在 `handlers.py` 的 profiles/资产面）』）。", "after_stage": 1, "ruling": "R-0046"}]
terminal: ["ASSET_SURFACE_EXCEPT_TYPED_DONE", "ASSET_SURFACE_EXCEPT_TYPED_PARTIAL"]
waive: []
parallel_units: ["five-call-sites", "message-hygiene", "read-memo", "gate"]
serialize_with: ["068", "069", "070", "072", "080", "081", "082", "083", "084", "085", "086", "087", "089", "097", "098", "099", "101", "103", "104", "105", "112", "113", "115", "117", "118", "119", "123", "124", "125", "128", "129", "132", "145"]
---

# Work Order 147 — wire **读路径的形状与收口**：资产面 5 处兜底 `except` 说谎＋漏路径 ＋ `profiles.list` **逐行重走模型解析**（`AUD-B-037` confirmed/medium ＋ `AUD-B-040` confirmed/low）

## Objective

**来源：后端审阅者 `AUD-B-037`（`confirmed` / **medium**）＋ ops 第 142 轮转单。**

审阅者实测：**五处同款**（`grep -n 'getattr\(refusal' handlers.py`）——`wire/handlers.py:832-833`（`assets_sync_catalog`）、
`:871-872`（`assets_install_from_catalog`）、`:916-917`（`assets_publish_skill`）、`:941-942`（`assets_publish_mcp`）、`:974-975`（`assets_…`）
——兜底 `except` 把**任意异常**写成 **`INVALID_REQUEST: <Python 类名>: <裸 strerror>`**：

- `getattr(exc, 'message', exc)` 对**不携带 `.message`** 的异常就是 `str(exc)`（f-string 隐式调用）⇒ **异常原文进出站 `message`**；
- ⇒ **服务端的权限/磁盘故障被说成『你的请求不合法』**（**语义错**：客户端会去改请求，而真正该做的是看服务端）；
- ⇒ 还把**服务端绝对路径与数据根路径**带回给客户端（**信息外泄**）；
- ⇒ 且**不带 `details.internalCode`**（`115` 号定的形状**没走**）。

**被包的实现里既有类型化错误也有裸异常**（审阅者的分账，照抄）：`assets/catalog.py:103-140` 的 **`CatalogError(CATALOG_*)` 是登记过的域内码**
（①–④ 实测**都走这条、输出干净** ⇒ **这一层设计是对的**），但 `index.read_bytes()`（`catalog.py:120`）与
`staging.write_bytes`/`os.replace`（`:126-129`）抛的是 **`PermissionError`/`OSError`** ⇒ ⑤⑥ 两种故障走兜底、把原文漏出去。

**同仓已有的正确做法**（本单的落点，**别新造**）：`errors.py:136-145` 用 **`family_for(code)`** 定族位 ＋ **`details.internalCode`** 留原码；
`sidecar_backend.py:854-875` 的 **`_safe_code`** 用 `re.fullmatch(r'[A-Z][A-Z0-9_]{2,127}')` 做**形状白名单**、其余落 `EXECUTION_FAILED` 并把**原文只写进日志**。

**明确不做**：改 `CatalogError` 的域内码（那层是对的）；动 runtime 树；改 `wire` 的方法集与参数形状。

## Current state（一手，`AUD-B-037`）

| 事实 | 出处 |
| --- | --- |
| **五处同款兜底**（`getattr(refusal…`）把任意异常写成 `INVALID_REQUEST: <类名>: <裸 strerror>` | `AUD-B-037`（含五处行号） |
| `getattr(exc,'message',exc)` 对无 `.message` 的异常＝`str(exc)` ⇒ **原文进出站 `message`** | 同上 |
| ⇒ **语义错**（服务端故障被说成请求不合法）＋ **路径外泄**（含数据根）＋ **缺 `details.internalCode`** | 同上 |
| ①–④（客户端输入问题）**全部走 `CatalogError`、输出干净** ⇒ **这一层设计是对的** | 同上 |
| ⑤ `index.json` 权限 000 ⇒ `PermissionError`；⑥ `staging`/`os.replace` ⇒ `OSError` ⇒ 走兜底漏原文 | 同上 |
| 正确做法就在同仓：`errors.py:136-145`（`family_for` ＋ `details.internalCode`）／`sidecar_backend.py:854-875`（`_safe_code` 白名单＋原文只进日志） | 同上 |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 五处兜底 | **不再手工拼 message**——统一走 `WireError.from_server_error(...)` **同一条路**（`family_for(code)` ＋ `details.internalCode`） | 五处各拼一份＝五份真相 |
| `CatalogError` | **保留域内码**（①–④ 现在就是对的） | 别把对的改坏 |
| 其余异常 | 一律 **`UNAVAILABLE`／`INTERNAL`**（按语义）＋ **原文只进服务端日志** | 与 `_safe_code:867-871` 的**白名单形状**同手法 |
| message 卫生 | `message` **不得含 `str(exc)` 原文**（尤其 `OSError` 带 `filename` 的那些） | **路径外泄**是缺陷本体之一 |
| 门 | 造 ⑤/⑥ 两种故障：断言出站 `family ∈ {UNAVAILABLE, INTERNAL}`、**`details.internalCode` 存在**、`message` **不含以 `/` 起始的绝对路径片段**（正则） | `OF-14`：门要走真腿 |
| **读路径去重**（`AUD-B-040`） | **一次 wire 调用内**按 digest memo `objects.read`（provider 与 models 两份）＋**按 providerId 建一次索引**再查 modelId（去掉线性 `next`） | 40 行 list ⇒ 80 次 `read`/11.4 MB ＝ **O(行数 × models 体积)**、零复用；**不可变性由摘要保证 ⇒ 缓存不削弱完整性** |

**必须保持不变**：①–④ 的 `CatalogError` 域内码与其 message 文案；`wire` 方法集/参数形状；`115` 已定的 `details.internalCode` 形状。

**边界**：若你判断某处"必须回 `INVALID_REQUEST`"（例如它确实能判定是客户端请求问题）⇒ **只在能给出判据时**保留，并在账里写明判据；**不许**用兜底 `except` 把一切归到 `INVALID_REQUEST`。

## Requirements

### Requirement: 兜底 `except` 必须**说真话**且**不漏服务端内部事实**

#### Scenario: 服务端故障（正例，⑤/⑥）

**WHEN** `index.json` 读不了（权限）或 `staging` 写不了（磁盘）
**THEN** 出站 **`family ∈ {UNAVAILABLE, INTERNAL}`**、**`details.internalCode` 存在**、`message` **不含**绝对路径片段（可断言）

#### Scenario: 40 行 list 的读次数有上界（正例，`AUD-B-040`）

**WHEN** 用 40 行 profile 夹具（单 provider、2000 条模型）跑一次 `profiles.list`
**THEN** `objects.read` 次数 **≤ 41**（40 各自 config ＋ provider 数），**不是 80**（可机检；**判次数与字节，不判计时**）

#### Scenario: 缓存不削弱完整性（正例，`AUD-B-040`）

**WHEN** 同一 digest 被 memo 后再次读
**THEN** 返回内容与**未缓存时逐字相同**（摘要校验仍成立；**不可变性由摘要保证**）

#### Scenario: 客户端输入问题（正例，①–④，必须不变）

**WHEN** 客户端给缺源/非法 slug
**THEN** 仍回 **`CatalogError` 的域内码**（`CATALOG_SOURCE_MISSING`／`CATALOG_INVALID: …`），**文案逐字不变**

#### Scenario: 反例（门要能咬）

**WHEN** 把兜底改回 `INVALID_REQUEST: {type(exc).__name__}: {exc}`（或把 `details.internalCode` 去掉）
**THEN** 本单的门**必须红**

## Stages

- [ ] 1. 观测：一手复现 ⑤/⑥（权限 000 与 staging 写失败）＋ 记下出站原文（**含路径**）＋ 核 ①–④ 仍走 `CatalogError`（提交）
- [ ] 2. 五处统一走 `WireError.from_server_error(...)`（`family_for` ＋ `details.internalCode`）（提交）
- [ ] 3. message 卫生（原文只进日志）＋ ①–④ 域内码保持（提交）
- [ ] 4. 门与反例（⑤/⑥ 正例 ＋ ①–④ 保持 ＋ 改回兜底必须红）（提交）
- [ ] 4b. **（并入 `AUD-B-040`）**读路径去重：一次调用内按 digest memo ＋ 按 providerId 建索引（去线性 `next`）（提交）
- [ ] 5. 账与证据（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 族位正确 | ⑤/⑥ ⇒ `family ∈ {UNAVAILABLE, INTERNAL}` | 仍 `INVALID_REQUEST` ⇒ 门红 | fail (typed) |
| G2 内部码在 | `details.internalCode` 存在且为原码 | 缺该键 ⇒ 门红 | fail (typed) |
| G3 无路径外泄 | `message` 不含以 `/` 起始的绝对路径片段（正则） | 含 `server_…`/数据根路径 ⇒ 门红 | fail (typed) |
| G4 域内码不变 | ①–④ 仍回 `CatalogError` 码、文案逐字不变 | 漂移 ⇒ 门红 | fail (typed) |
| G5b **读次数上界**（`AUD-B-040`） | 40 行 list ⇒ `objects.read` ≤ **41**（非 80）；且同 digest memo 后内容逐字相同 | 仍 80 次 ⇒ 门红 | fail (typed) |
| G5 真链 | 门经真 wire 方法入口驱动（非直调 `from_server_error`） | 直调 ⇒ 门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 一手复现 ⑤/⑥ ＋ 核 ①–④ · 2. 五处统一走同一条路 · 3. message 卫生 ＋ 域内码保持 · 4. 门与反例 · 4b. **读路径去重（`AUD-B-040`：40 行 ≤ 41 次读）** · 5. 账与证据。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`ASSET_SURFACE_EXCEPT_TYPED_DONE`
- 否则：`ASSET_SURFACE_EXCEPT_TYPED_PARTIAL` + 精确剩余

## Notes for the executor

- **与 `123` 并读（审阅者点名）**：`123` 是**传输边界**（HTTP 边四道墙）的同类收口，**本条是 wire 方法边界**的收口 ⇒ 两者合起来才把"**每个出站错误都带 JSON-RPC 体且不说谎**"这条不变量做完整。
- **归批（`132` 亚型）**：**「同一类故障在多处各拼一份 message」**（五处同款）——与 `115`（家族闭合）、`031/034/035`（多条路径同一不变式）**同族**；收口时点名。
- **`AUD-B-038`（rejected，记账）已确认你的邻单 `140` 真的生效**（审阅者复跑：父根 `inputTokens 100/total 110` ⇒ **`9100/9610`**、`turnsReported 1 ⇒ 2`）⇒ **别去重开 `022`**。
- **前提待验**（`OF-02`）：引自 `AUD-B-037`（含五处行号与两种故障）；第一步自己复核。
