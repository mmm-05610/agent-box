---
id: "125"
slug: config-describe-slot-projection
batch: b2
baseline: "bd5d328"
depends_on: []
write_paths: ["src/agent_box/server/wire/handlers.py", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-runtime-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "release/**"]
ruling: R-0013
terminal: ["CONFIG_DESCRIBE_SLOT_PROJECTION_DONE", "CONFIG_DESCRIBE_SLOT_PROJECTION_PARTIAL"]
waive: []
parallel_units: ["projection", "reference-shape"]
serialize_with: ["068", "069", "070", "072", "080", "081", "082", "083", "084", "085", "086", "087", "089", "097", "098", "099", "101", "103", "104", "105", "112", "113", "115", "117", "118", "119", "123", "124"]
---

# Work Order 125 — `config.describe` 的**逐槽**投影与 profile 槽表引用形状（`092` 交回的 ③，wire 半边）

## Objective

**来源：`092` 收口交回（runtime `status.md`，`PROVIDER_REGISTRY_PARTIAL` 的"精确剩余 ③"）＋ ops 第 118 轮转单。**

`R-0013` 的追加要求（**v2 多槽**，判据 G8/G9/G10）里，**wire 半边**落在本树：`config.describe` 要能**逐槽**投影 `model_slot`，
并且 profile 侧的**槽表引用形状**要说清（"这个槽引用的是哪张表/哪条记录"）。
`092` 明确写了：这一半**在它「不碰 `server/wire/**`」的边界外**（`handlers.py::config_describe/_controls`＝A 线），
**另一半**（描述符 `model_controls` 声明）runtime 可**随后补**、**不阻塞本单**。

**本单要的是**：`config.describe` 的**多槽**形状可判定、可核，且与 runtime 侧的 canonical 定义**不各写一份**。

**明确不做**：改 runtime 侧的描述符/装配（那半是 runtime 的活，**不阻塞你**）；改 `config.describe` 的既有单槽行为（**只增**）；改 `R-0013` 的 G8/G9/G10 判据本身。

## Current state（一手，ops 逐行核过 A 树 `bd5d328`）

| 事实 | 出处 |
| --- | --- |
| `config.describe` 与控件枚举已存在，且已有 `kind: "model_slot"` 的控件形态 | `src/agent_box/server/wire/handlers.py:1444`（`config_describe`）→ `:1480`（`_controls`）→ `:1507`/`:1514`（`"kind": "model_slot"`） |
| 锁定控件与已知控件集合的既有用法 | 同文件 `:1452`（`securityLockedIds`）、`:1460`（`known = {control["controlId"] …}`）、`:1536`（`_locked_controls`） |
| `092` 的 runtime 半边已 DONE（描述符 `wire_protocols` 逐家声明、派生与冻结、账），其交回明确把 ③ 的 wire 半路由本树 | `092` 阶段 4/4b（`8e6fa44`/`56af017`）＋ 收口 `6df2213` |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| `config.describe`（实读 `:1444` → `_controls` `:1480`） | **逐槽**投影（每槽可见、`controlId` 不重不漏） | `R-0013` v2 多槽（G8/G9/G10） |
| 槽表引用形状 | 变成**稳定、机器可读**的标识；与 G8/G9/G10 的逐条对应写进报告 | "引用哪张表"必须可核对 |
| 取值来源 | 引用单一真相，**不新增第二份字面** | 同 `124` |
| runtime 侧描述符 `model_controls` | **不写**（runtime 随后补，**不阻塞本单**） | 边界 |

**必须保持不变**：单槽既有行为与 `securityLockedIds` 语义；`wire` 其它方法。
**边界**：本单只写 `handlers.py` 与 `tests/**`。

## Requirements

### Requirement: 逐槽投影可判定

#### Scenario: 多槽

**WHEN** 一个 profile 引用**多张**槽表（多条 `model_slot` 控件）
**THEN** `config.describe` 的输出里**每个槽各自可见**（槽标识、绑定、可编辑性、锁定态），且能与既有控件集合**逐一对应**（`controlId` 不重、不漏）

#### Scenario: 反例（门要能咬）

**WHEN** 人为让两个槽共用同一个 `controlId`（或让一个槽从输出里消失）
**THEN** 本单新增的门**必须红**

### Requirement: 槽表引用形状说清

#### Scenario: 引用可核

**WHEN** 读输出
**THEN** "这个槽引用哪张表/哪条记录"是**可核的**（稳定的机器可读标识），不是靠字符串约定去猜；报告里写清该形状与 `R-0013` 的 G8/G9/G10 逐条对应关系

### Requirement: 不写第二份词汇

#### Scenario: 单一真相

**WHEN** 读本单 diff
**THEN** 槽/协议的取值**来自引用**（runtime 侧单一真相或既有常量），`handlers.py` 里**没有**新增第二份字面集合；并且有一个门能咬住"两处字面分叉"

## Stages

- [ ] 1. 观测：一手跑 `config.describe` 的**单槽**现状（含 `model_slot` 控件形态与 `controlId` 生成规则），并把 `R-0013` 的 G8/G9/G10 逐条抄成可判定清单（提交）
- [ ] 2. 逐槽投影（每槽可见、`controlId` 不重不漏）（提交）
- [ ] 3. 槽表引用形状（机器可读、稳定）（提交）
- [ ] 4. 门：多槽正例 ＋ `controlId` 冲突/丢槽的反例 ＋ "两处字面分叉"门（提交）
- [ ] 5. 与 runtime 侧描述符的**接口说明**（谁先谁后、不阻塞）＋ 账与证据（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 逐槽 | 多槽时每槽可见、`controlId` 不重不漏 | 槽共用 id／丢槽 ⇒ 门红 | fail (typed) |
| G2 引用可核 | 槽表引用是稳定机器可读标识（报告写清与 G8/G9/G10 的对应） | 只靠字符串约定 ⇒ 门红 | fail (typed) |
| G3 单一真相 | 取值来自引用；无第二份字面（有门咬住分叉） | 复制字面 ⇒ 门红 | fail (typed) |
| G4 不回归 | 单槽既有行为与 `securityLockedIds` 语义逐字不变 | 任一变红即门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/server -k "config or controls or slot" -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 单槽现状 ＋ G8/G9/G10 可判定清单 · 2. 逐槽投影 · 3. 引用形状 · 4. 三道门 · 5. 与 runtime 的接口说明 ＋ 账。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`CONFIG_DESCRIBE_SLOT_PROJECTION_DONE`
- 否则：`CONFIG_DESCRIBE_SLOT_PROJECTION_PARTIAL` + 精确剩余

## Notes for the executor

- **排序**：**排在 `124` 之后**（写面先行，读面随后）；**不阻塞** `092` 的 runtime 侧收口（它那半已 DONE）。
- **与 runtime 的接口**：描述符 `model_controls` 由 runtime 随后补 ⇒ 你若需要它**先在**，写清"消费什么形状"并**交回 ops**（我来排先后），**不要**跨树去写。
- **前提待验**（`OF-02`）：行号引自 ops 实读 `bd5d328`；`R-0013` 的 G8/G9/G10 请以 `rulings.md` 原文为准（别用我这里的转述）。
