---
id: "124"
slug: provider-model-write-whitelist
batch: b2
baseline: "bd5d328"
depends_on: []
write_paths: ["src/agent_box/server/wire/handlers.py", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-runtime-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "release/**"]
ruling: R-0013
terminal: ["PROVIDER_MODEL_WRITE_WHITELIST_DONE", "PROVIDER_MODEL_WRITE_WHITELIST_PARTIAL"]
waive: []
parallel_units: ["whitelist", "enum-and-normalization"]
serialize_with: ["068", "069", "070", "072", "080", "081", "082", "083", "084", "085", "086", "087", "089", "097", "098", "099", "101", "103", "104", "105", "112", "113", "115", "117", "118", "119", "123", "125"]
---

# Work Order 124 — `providerModels.create/update` 的写面：白名单 ＋ `wireApi` 扩到 canonical 四值（含旧两值归一）（`092` 交回的 ①）

## Objective

**来源：`092` 的收口交回（runtime 线 `status.md`，终态 `PROVIDER_REGISTRY_PARTIAL` 的"精确剩余 ①"）＋ ops 第 118 轮转单。**

`092` 的 **runtime 侧已 DONE 且带反例**（canonical 协议词汇、描述符 `wire_protocols` 逐家声明、派生与冻结、账），
但它**如实交回**：验收所必需的**写面**还差一件——`providerModels.create/update` 的参数**白名单**没跟上 canonical 词汇：
- `harness` 应该**可选**；
- `protocols[]` / `endpoints{}` / `models[].{protocols,capabilities}` 这些**新形状**要进白名单；
- `wireApi` 的枚举要从**旧两值**扩到 **canonical 四值**，并且**旧两值要能归一**（不能再被拒）；
- 连带 `098` 的 `wireApi="chat_completions"` **回声断言**要同步（否则会出现"产品接受、测试不认识"或反之）。

**本单要的是**：写面与 `092` 立下的 canonical 词汇**对齐**，且**旧值不被打破**。

**明确不做**：改 canonical 词汇本身（**单一真相在 runtime 线的 `execution/protocols.py`**，本单只**引用**它，不复制、不改写）；改 `providerModels` 的读写语义与仓储；改 098 的**断言强度**（同步措辞可以，放松不行）。

## Current state（一手，ops 逐行核过 A 树 `bd5d328`）

| 事实 | 出处 |
| --- | --- |
| `wireApi` 的写面枚举**只有两值**：`{"chat_completions", "responses"}` | `src/agent_box/server/wire/handlers.py:1388` |
| 两个写入口在这两处 | `provider_models_create` `:1237`、`provider_models_update` `:1342` |
| canonical 词汇＋逐家声明由 `092` 的 runtime 半边立下（描述符 `wire_protocols`：codex `{chat,responses}`、claude `{anthropic}`、pi `{openai-completions}` …） | `092` 的阶段 4/4b（runtime 树 `8e6fa44`/`56af017`）；**单一真相＝`execution/protocols.py`**（只读引用） |
| `098` 的 `wireApi="chat_completions"` 回声断言需要同步 | `092` 交回原话（"连带 098 的回声断言需同步"）；现有测试见 `tests/server/test_provenance_wire_098.py` |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| `providerModels.create/update` 的参数白名单 | 跟上 canonical 词汇：`harness` **可选** ＋ `protocols[]`/`endpoints{}`/`models[].{protocols,capabilities}` 进白名单 | 写面落后于 `092` 立下的词汇（`092` 交回 ①） |
| `wireApi` 枚举（实读 `:1388` 只有两值） | 扩到 **canonical 四值** ＋ **旧两值归一** | 不许"以前能写、现在被拒" |
| canonical 取值 | **引用** runtime 侧 `execution/protocols.py`（单一真相），**不复制字面** | 两处字面＝静默分叉 |
| `098` 的回声断言 | 同步措辞（**强度不降**） | "产品接受"≠"测试认识" |

**必须保持不变**：`providerModels` 的读写语义与仓储；`098` 的断言强度；`wire` 其它方法的参数白名单。
**边界**：本单只写 `handlers.py` 与 `tests/**`；runtime 侧词汇只读。

## Requirements

### Requirement: 写面白名单与 canonical 词汇对齐

#### Scenario: 新形状可写

**WHEN** 调 `providerModels.create/update` 且带上 `harness`（可选）、`protocols[]`、`endpoints{}`、`models[].{protocols,capabilities}`
**THEN** 都在白名单内、按既有校验粒度被接受或给出 typed 拒绝，**不再因为"不认识这个参数"被拒**

#### Scenario: `wireApi` 四值 ＋ 旧两值归一

**WHEN** 分别写 canonical 四值中的每一个，以及**旧的**两值
**THEN** canonical 值按 `execution/protocols.py` 的定义被接受；**旧值被归一**（写成等价的 canonical 值或明确标注的遗留形态），**不出现"以前能写、现在被拒"**

#### Scenario: 反例（门要能咬）

**WHEN** 把白名单退回当前实现（或把枚举收回两值）
**THEN** 本单新增的门**必须红**

### Requirement: 词汇只有一处真相

#### Scenario: 不复制词汇

**WHEN** 读本单 diff
**THEN** canonical 值**来自引用**（`execution/protocols.py` 或等价单一真相），**没有**在 `handlers.py` 里再写一份四值字面（**并且**有一个门能咬住"两处字面分叉"这件事）

### Requirement: `098` 的回声断言同步

#### Scenario: 产品接受 = 测试认识

**WHEN** 跑 `098` 的定向门
**THEN** 断言的措辞与写面接受的归一结果**一致**（同步措辞；**断言强度只增不减**）

## Stages

- [ ] 1. 观测：列出两个写入口**当前**接受/拒绝的参数集（含被拒的新形状），并读 `execution/protocols.py` 的 canonical 定义（提交）
- [ ] 2. 白名单对齐（harness 可选 ＋ 三个新形状）（提交）
- [ ] 3. `wireApi` 四值 ＋ 旧两值归一（**引用**单一真相，不复制字面）（提交）
- [ ] 4. 门：新形状正例 ＋ 旧值归一正例 ＋ 反例（退回即红）＋ "两处字面分叉"必红（提交）
- [ ] 5. 同步 `098` 的回声断言（措辞同步、强度不降）＋ 账与证据（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 新形状可写 | `harness` 可选 ＋ `protocols[]`/`endpoints{}`/`models[].{protocols,capabilities}` 在白名单 | 退回旧白名单必须门红 | fail (typed) |
| G2 四值 ＋ 归一 | canonical 四值可写、旧两值被归一 | 收回两值／旧值被拒 ⇒ 门红 | fail (typed) |
| G3 单一真相 | canonical 值来自引用，`handlers.py` 无第二份字面 | 复制字面 ⇒ 门红 | fail (typed) |
| G4 098 同步 | `098` 的定向门与写面归一一致（强度不降） | 断言与实现不一致 ⇒ 门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/server/test_provenance_wire_098.py -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 两个写入口的接受/拒绝清单 ＋ canonical 定义一读 · 2. 白名单对齐 · 3. 四值＋归一（引用单一真相）· 4. 四道门（含两处字面分叉）· 5. `098` 同步 ＋ 账。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`PROVIDER_MODEL_WRITE_WHITELIST_DONE`
- 否则：`PROVIDER_MODEL_WRITE_WHITELIST_PARTIAL` + 精确剩余

## Notes for the executor

- **排序**：**排在 `123`（第三道墙）之后、`103` 之前**——它是 `092` 收口链上**最后一块写面**（`092` 的 runtime 侧已 DONE，② 工件/重锁走 `113` 修订，③ v2 多槽走 `125`）。
- **不许发明词汇**：canonical 值以 runtime 线的 `execution/protocols.py` 为准（跨树**只读**核验允许）；若你发现"两处已经是两份字面"，**交回**并附行号（那属 `OF-11` 那类账的问题）。
- **前提待验**（`OF-02`）：行号与交回文本引自 `092` 的交回与 ops 实读，第一步自己复核。
