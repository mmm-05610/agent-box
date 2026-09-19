---
id: "136"
slug: child-limits-reach-the-production-call
batch: b2
baseline: "2474ed0"
depends_on: []
write_paths: ["src/agent_box/server/profiles/**", "src/agent_box/server/execution/**", "plugins/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-env-provider/**", "release/**", "src/agent_box/server/wire/**", "protocols/**", "workers/**"]
ruling: R-0046
terminal: ["CHILD_LIMITS_ON_PRODUCTION_CALL_DONE", "CHILD_LIMITS_ON_PRODUCTION_CALL_PARTIAL"]
waive: []
parallel_units: ["call-site", "gate-on-production-path"]
serialize_with: ["068", "069", "070", "072", "080", "081", "088", "090", "091", "092", "093", "094", "095", "096", "100", "102", "106", "107", "108", "109", "110", "111", "114", "116", "120", "121", "122", "126", "127", "130", "131", "133", "134", "135"]
---

# Work Order 136 — 子代理的"只能收紧"两条拒止**在线上永不触发**：生产调用点**从不传 `child_limits`**（`AUD-B-018` confirmed/medium，同族第 5 例）

## Objective

**来源：后端审阅者 `AUD-B-018`（`confirmed` / medium）＋ ops 第 127 轮转单。**

审阅者实测：`G2`「**可选参数只能收紧、不能放宽子 profile 约束**」的**判定逻辑与两条错误码都在**
（`SUBAGENT_PERMISSION_WIDENED` / `SUBAGENT_MODEL_WIDENED`），**但生产调用点从不传 `child_limits`** ⇒

> 实测：同一份**超限参数**在**生产形态**下 **`ACCEPTED`**；只有**手工传入** `child_limits` 才 `REJECTED`。

⇒ **两条拒止在线上永不触发** ⇒ 一个"只能收紧"的约束**在生产上等于不存在**。
这与 `AUD-B-015`（网络姿态声明 vs 执行）**同族**，也是 `OF-14` 记录的「**实现/判定都在、真腿不走它**」的**第 5 例**（前四例：`101/098/117/120`）。

**本单要的是**：让**生产调用点**把 `child_limits` **传到**（或让"没传"在结构上不可能）——并让**门驱动生产路径**。

**明确不做**：改 G2 的判定语义与两条错误码（它们是对的）；改"只能收紧"这条产品约束；改 `wire/**`、`protocols/**`、`workers/**`。

## Current state（一手，`AUD-B-018`）

| 事实 | 出处 |
| --- | --- |
| G2 判定逻辑与 `SUBAGENT_PERMISSION_WIDENED`/`SUBAGENT_MODEL_WIDENED` **都在** | `AUD-B-018` |
| **生产调用点从不传 `child_limits`** ⇒ 超限参数在生产形态下 **`ACCEPTED`**（手工传才 `REJECTED`） | 同上（含实测） |
| 同族对照：`AUD-B-015`（声明 vs 执行）、`OF-14`（门只走一条腿，4 例） | 同上 ＋ ops 第 126 轮 |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 生产调用点（子代理/委派一侧） | **传** `child_limits`（由子 profile 与父约束**派生**，写清派生规则），或**改成不给就构造失败**（让"忘了传"结构上不可能） | 不传＝约束不存在 |
| 门 | **必须驱动生产路径**（真实委派/子代理调用链），断言"父约束更紧 + 子请求更宽 ⇒ **`REJECTED`**"；**反例**：把 `child_limits` 去掉（退回今天）⇒ 门**必须红** | 这正是本单存在的理由 |
| 报告 | 写清：生产路径上 `child_limits` 的**来源**（哪一层派生、依据什么）+ 与 `OF-14` 同族的自查结论 | 第 6 次不再发生 |

**必须保持不变**：G2 的判定与两条错误码；"只能收紧"约束本身；父/子 profile 的既有语义；`wire/**`。
**边界**：若修法需要动 `wire/**`/`protocols/**`/`workers/**` ⇒ **交回 ops**。

## Requirements

### Requirement: 生产路径上拒止会触发

#### Scenario: 子请求放宽父约束

**WHEN** 通过**生产调用路径**（不是手工塞参数）发起一个权限/模型**比父更宽**的子代理请求
**THEN** **`REJECTED`**，码为 `SUBAGENT_PERMISSION_WIDENED` / `SUBAGENT_MODEL_WIDENED` 之一（与约束面一致）

#### Scenario: 反例（门要能咬）

**WHEN** 把生产调用点的 `child_limits` 去掉（退回今天）
**THEN** 本单新增的门**必须红**（超限请求又变 `ACCEPTED`）

### Requirement: 收紧仍可

#### Scenario: 更紧的请求

**WHEN** 子请求**比父更紧**（合法的收紧）
**THEN** 按既有语义**接受**（不许把"能收紧"也拒掉）

## Stages

- [ ] 1. 观测：一手复现"生产形态 `ACCEPTED` / 手工传 `child_limits` 才 `REJECTED`"，并定位生产调用点（提交）
- [ ] 2. 生产调用点传 `child_limits`（或强制显式；写清派生规则）（提交）
- [ ] 3. 门：驱动生产路径（放宽 ⇒ 拒；收紧 ⇒ 收）＋ 反例（退回必红）（提交）
- [ ] 4. `OF-14` 同族的自查结论（本单是否还有"门只走一条腿"的邻居）（提交）
- [ ] 5. 账与证据（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 生产路径拒止 | 生产路径上放宽 ⇒ `REJECTED`（具名码） | 退回不传 `child_limits` 必须门红 | fail (typed) |
| G2 门走生产路径 | 门驱动真实委派/子代理链（不是手工塞参数） | 手工塞 ⇒ 门红 | fail (typed) |
| G3 收紧不被误拒 | 更紧的请求仍按既有语义接受 | 收紧被拒 ⇒ 门红 | fail (typed) |
| G4 零削弱 | G2 判定逻辑与两条码逐字不变 | 改码/改判定 ⇒ 门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 一手复现（含调用点定位）· 2. 调用点传参（或强制显式）· 3. 门（生产路径 ＋ 反例）· 4. 同族自查结论 · 5. 账与证据。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`CHILD_LIMITS_ON_PRODUCTION_CALL_DONE`
- 否则：`CHILD_LIMITS_ON_PRODUCTION_CALL_PARTIAL` + 精确剩余

## Notes for the executor

- **排序**：**排在 `135`/`134` 之后、`126` 之前**（同为"主路径/约束真的生效"一族；`135` 是 `120` 的真腿、本单是子代理约束的真腿）。
- **同族提醒**：`OF-14` 已记 5 例；本单的门**必须驱动生产路径**，否则就是第 6 例。
- **前提待验**（`OF-02`）：引自 `AUD-B-018`（含实测）；第一步自己复核。
