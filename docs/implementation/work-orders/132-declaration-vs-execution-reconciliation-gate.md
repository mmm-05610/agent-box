---
id: "132"
slug: declaration-vs-execution-reconciliation-gate
batch: b2
baseline: "1bec4a4"
depends_on: [{"order": "128", "condition": "agent-box-env-provider tree：wire `seq` 单一编号空间（或两套可判定）落地，且它自己的门在场"}, {"order": "130", "condition": "agent-box-runtime-round1 tree：sidecar 进程树回收落地，且它自己的门在场"}, {"order": "131", "condition": "agent-box-runtime-round1 tree：沙箱网络姿态同源落地，且它自己的门在场"}]
write_paths: ["scripts/server-round1/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "release/**", "src/agent_box/**"]
ruling: R-0046
terminal: ["DECLARATION_VS_EXECUTION_GATE_DONE", "DECLARATION_VS_EXECUTION_GATE_PARTIAL"]
waive: []
parallel_units: ["gate", "fixtures"]
serialize_with: ["068", "069", "070", "072", "080", "081", "082", "083", "084", "085", "086", "087", "089", "097", "098", "099", "101", "103", "104", "105", "112", "113", "115", "117", "118", "119", "123", "124", "125", "128", "129"]
---

# Work Order 132 — 批末对账门：**同一事实只允许一处记账**（`AUD-B-015 ③` 的归批建议，形制归纳）

## Objective

**来源：后端审阅者 `AUD-B-015` 的第 ③ 条（自述"**形制归纳、非发现**"）＋ ops 第 122 轮的归批决定。**

审阅者把三条**独立发现**归纳成**同一个形状**：「**声明 / 判定 / 执行各记一本账**」：

| 单 | 形状 |
| --- | --- |
| `128`（`AUD-B-010`） | **有没有帧** vs **有没有编号**（`wire_seq` 不覆盖 4 类真产帧事件） |
| `130`（`AUD-B-013`） | **四处 `Popen`** vs **三种回收形制**，**一处漏接**（只杀直接子进程） |
| `131`（`AUD-B-015`） | **网络姿态声明** vs **递给 provider 的默认值**（`none` vs `inherit`，无映射） |

它与 `097` 对 `server.hello` 做过的那类**机械对账**同族（"同一事实只允许一处记账"）。
⇒ 审阅者的建议是：**这三条归一批，批末统一加一道机械对账门**。

**本单要的就是那道门**：把它做成**可跑、会咬、可复算**的检查（而不是三条各自的门再抄一遍）。

**明确不做**：改三条单的实现（它们是各自的历史与门）；把三条单的门合并（本单是**批末对账**，不是替代品）；改 `src/**`（本单只写门脚本与账）。

## Current state（一手，`AUD-B-015 ③` ＋ 三张单）

| 事实 | 出处 |
| --- | --- |
| 三条发现**同族**：声明/判定/执行各记一本账 | `AUD-B-015 ③`（同族归纳） |
| `097` 为 `server.hello` 做过同类机械对账（可作形制参照） | 同上（"097 对 hello 做过的那类"） |
| 三张单（`128`/`130`/`131`）各自的**门在场**是本单的前置 | 本单 `depends_on` 的谓词 |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 对账门 | 新增**可跑**检查：对每一族"同一事实"，把**两处记账**取出来**机械比对**（帧↔编号、进程↔回收、声明↔请求），**不一致即失败** | 让"两本账"不可能悄悄存在 |
| 门的方式 | **不复制**三条单的门；本单的门**只做对账**（读两侧事实 → 比对 → 报差）＋把 `097` 那类 hello 对账**一并纳入同一入口** | 一个入口，一处真相 |
| **反例夹具** | 三族各一个**受控反例**：人为让两侧不一致 ⇒ 门**必须红**（并把夹具来源写清：分别来自 `128`/`130`/`131` 的哪条事实） | 门必须咬 |
| 可复算 | 门自带命令与退出码约定；报告里给出**逐族的两侧取值**（可在任何一台机器上复算） | 引用级事实（QA 线口径） |

**必须保持不变**：三条单各自的实现与门（本单**只读**它们的事实）；`scripts/server-round1/**` 的既有门（只增）；`src/**`（不写）。
**边界**：本单只写门脚本、测试与账；跨树核验（runtime 侧的事实）**只读**。

## Requirements

### Requirement: 两处记账必须一致

#### Scenario: 一致

**WHEN** 跑对账门
**THEN** 三族（帧↔编号、进程↔回收、声明↔请求）的两侧取值**逐条一致**；不一致的行**逐条报出**（含两侧取值与出处）

#### Scenario: 反例（门要能咬）

**WHEN** 人为把任一族的两侧改成不一致（用 `128`/`130`/`131` 提供的事实做夹具）
**THEN** 对账门**必须红**，且**指出是哪一族、哪两侧**

### Requirement: 一个入口

#### Scenario: 与 `097` 同类

**WHEN** 找"同一事实只允许一处记账"的检查
**THEN** 有**单一入口**（本门），`hello` 那类对账也在同一入口内（不各写一份）

## Stages

- [ ] 1. 观测：把三族的"两处记账"各自定位到**可读的取值**（行号＋取值），并核对三条单的门确实在场（提交）
- [ ] 2. 对账门实现（三族 ＋ `hello` 那类并入同一入口）（提交）
- [ ] 3. 三个受控反例（逐族一个；人为不一致 ⇒ 必须红）（提交）
- [ ] 4. 可复算报告（逐族两侧取值 ＋ 命令 ＋ 退出码约定）（提交）
- [ ] 5. 账与证据（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 三族一致 | 三族的双侧取值逐条一致 | 任一族人为不一致必须门红 | fail (typed) |
| G2 单一入口 | `hello` 类对账与三族**同一入口** | 另写一份 ⇒ 门红 | fail (typed) |
| G3 可复算 | 命令＋退出码＋两侧取值可复算 | 只给结论 ⇒ fail | fail (typed) |
| G4 不越界 | 未改 `src/**` 与既有门；跨树核验只读 | 越界 ⇒ 门红 | fail (typed) |

## Validation

```bash
python3 scripts/server-round1/declaration-vs-execution-reconciliation.py --self-check
python3 -m pytest tests/ -q -k reconciliation
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

（脚本名可自定，但**入口唯一**且命令写进报告。）

## DoD

1. 三族两侧取值的定位（行号＋取值）＋三张单门在场面 · 2. 对账门 · 3. 三个受控反例 · 4. 可复算报告 · 5. 账与证据。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`DECLARATION_VS_EXECUTION_GATE_DONE`
- 否则：`DECLARATION_VS_EXECUTION_GATE_PARTIAL` + 精确剩余

## Notes for the executor

- **排序：批末**（`depends_on` 三张单；排在 `128/129/130/131` 都落地之后）。它是这一批的**收口门**，不是插队项。
- **只做对账**：不要顺手改三条单的实现；发现不一致只**报**（并注明属哪张单的剩余）。
- **前提待验**（`OF-02`）：三族的行号引自 `128/130/131` 与 `AUD-B-015`；第一步自己复核（跨树只读）。
