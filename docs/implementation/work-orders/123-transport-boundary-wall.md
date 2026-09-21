---
id: "123"
slug: transport-boundary-wall
batch: b2
baseline: "bd5d328"
depends_on: []
write_paths: ["src/agent_box/server/transport/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-runtime-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "release/**"]
ruling: R-0032
terminal: ["TRANSPORT_BOUNDARY_WALL_DONE", "TRANSPORT_BOUNDARY_WALL_PARTIAL"]
waive: []
parallel_units: ["wall", "gate"]
serialize_with: ["068", "069", "070", "072", "080", "081", "082", "083", "084", "085", "086", "087", "089", "097", "098", "099", "101", "103", "104", "105", "112", "113", "115", "117", "118", "119", "124", "125"]
---

# Work Order 123 — 第三道墙：HTTP 边上**任何意外异常**都不许冒成裸 500（`115` 收口时交回）

## Objective

**来源：`115` 的收口报告（`docs/server-round1/wire-error-family-closure-115.md`，A 线一手）＋ ops 第 118 轮转单。**

`115` 把"未登记域码冒不出裸 500"这一族**闭合了**（两道墙：`errors.converge_family` ＋ dispatch 侧），并用两条真跑的反例证明**闭合是结构性的、故意冗余**。
但它同时**如实交回一处**：**HTTP 边上没有自己的墙**——`src/agent_box/server/transport/http/app.py` 只处理了**四条 `WireError` 路径**，
**任何非 `WireError` 的意外异常**（transport 自己的路径匹配／参数解析／request_id 处理／中间件／delegation bridge 里抛出的东西）**仍会逃成裸 500**。
⇒ QA-008 这一族的"闭合"目前**只在 wire 内部**成立，**边界除外**。

**本单要的是**：把**第三道墙**补在 transport 边界上——**任何**逃出来的异常都变成**合规错误对象**，且 `internalCode` **只放异常类型、绝不放文本**
（文本可能带宿主路径／凭据 locator；`R-0011`）。

**明确不做**：改 `wire/**`（那是 115/117/118 的面，跨树只读核验允许）；改既有四条 `WireError` 路径的语义（**只加一条兜底**）；把 500 改成 200 之外的语义（照既有错误信封约定）。

## Current state（一手，`115` 报告 ＋ ops 逐行核过 A 树 `bd5d328`）

| 事实 | 出处 |
| --- | --- |
| `transport/http/app.py` 只有 `except WireError`（两处：参数解析段 与 `dispatch` 段），**无 `except Exception`** | 实读 `:155-166`（`result = runtime.wire.dispatch(...)` 在 `try/except WireError` 内） |
| 该边界之外仍有可抛路径：路由匹配、`request_id`/信封编码、中间件（含 loopback）、delegation bridge | `115` 报告 §transport（原话："**transport 边界上的一行 `except Exception`** 就能闭合，而它**不在 `115` 的 `write_paths`**"） |
| 该族的"闭合"已由 `115` 在 wire 内部证明（两道墙 ＋ 两条真跑反例） | `115` 收口提交 `bd5d328`（含 `tests/server/test_wire_error_family_closure_115.py`，247 行新测试） |
| 兄弟树在场面：`handlers` 族位仍收内部码（`:1192-1197`/`:1242-1245`）、`errors.py:112-114` 仍 `raise`、dispatch 无墙、63 个 `tests/server` 文件里 **0 个** family 守卫 | `115` 报告 §6（只读核验；`116` 负责本树修复） |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| transport 边界（路由匹配／信封编码／中间件／delegation bridge 里抛出的意外异常） | 加**第三条墙**：`except Exception` → 合规错误对象（`internalCode` **仅异常类型**） | 边界是这一族**唯一没闭合**的地方（`115` 交回） |
| 既有四条 `WireError` 路径 | **一个字不改**（只**新增**兜底） | `115` 已抓到一次"墙把 `WireError` 也吞了"的回归 |
| 异常文本 | **永不**进出站错误体 | 文本可能带宿主路径／凭据 locator（`R-0011`） |

**必须保持不变**：既有四条路径的状态码与 `family`/`details` 语义；`wire/**` 的内容（跨树只读核验允许）。
**边界**：本单只写 `transport/**`；`wire/**` 属 `115/117/118/124/125`。

## Requirements

### Requirement: 边界兜底：意外异常也出合规错误对象

#### Scenario: 非 WireError 逃逸

**WHEN** transport 边界内任何位置抛出**非 `WireError`** 的异常（受控注入：例如路由/信封/middleware 处的 `RuntimeError`）
**THEN** 出站是**合规错误对象**（含 `error` 体、机器可读 `family`/`internalCode`），**不是** 裸 500 纯文本；`internalCode` **只含异常类型**，**不含**任何文本

#### Scenario: 反例（门要能咬）

**WHEN** 把该兜底退回当前实现（只有 `except WireError`）
**THEN** 本单新增的门**必须红**（这是 `115` 交回时那条"待开单"的具体形状）

### Requirement: 不吞既有语义

#### Scenario: typed 拒绝仍 typed

**WHEN** 走既有四条 `WireError` 路径（参数错误 / 方法不匹配 / dispatch 内 typed 失败）
**THEN** 状态码、`family`、`details.internalCode` 与**现在逐字一致**（`115` 已经抓过一次"墙把 `WireError` 也吞了"的回归——本单不许重犯）

## Stages

- [ ] 1. 观测：在边界上注入非 `WireError` 异常（真 socket，`raise_server_exceptions=False`），记录当前出站字节（裸 500／`text/plain`／21 字节）＋ 逃逸点清单（提交）
- [ ] 2. 补第三道墙（`except Exception` 兜底 → 合规错误对象；`internalCode` 仅异常类型）（提交）
- [ ] 3. 门：正例（受控注入 ⇒ 合规对象）＋ 反例（退回旧实现必红）＋ **既有四条路径逐字不回归**（提交）
- [ ] 4. 账与证据（含"边界之外是否还有别的宿主"这一句如实结论）（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 边界兜底 | 受控注入的非 `WireError` ⇒ 合规错误对象（非裸 500） | 退回旧实现必须门红 | fail (typed) |
| G2 零文本 | `internalCode` 只含异常**类型**，不含文本/路径/locator | 放进 `str(exc)` ⇒ 门红 | fail (typed) |
| G3 既有面不回归 | 四条既有 `WireError` 路径的状态码/`family`/`internalCode` 逐字不变 | 任一变红即门红 | fail (typed) |
| G4 真 wire | 门驱动**真 HTTP**（`raise_server_exceptions=False`），不是直调函数 | 改成直调实现必须门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 逃逸点清单 ＋ 当前出站字节一手记录 · 2. 第三道墙落地 · 3. 门（正例＋反例＋既有面不回归）· 4. 账与证据。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`TRANSPORT_BOUNDARY_WALL_DONE`
- 否则：`TRANSPORT_BOUNDARY_WALL_PARTIAL` + 精确剩余

## Notes for the executor

- **排序**：**排在 `087` 之后、与 `115` 同级**（它是"QA-008 这一族闭合"的**最后一块**：wire 内部已闭、边界未闭 ⇒ 不补上，`AQ-0009` 的"主路径无已知未修缺陷"仍差一格）。
- **只加一条兜底**：**不许**顺手重构 transport；`WireError` 的既有四条路径**一个字不改**。
- **前提待验**（`OF-02`）：行号与"只处理四条 WireError 路径"来自 `115` 的一手报告，第一步自己复核；被推翻就交回。
