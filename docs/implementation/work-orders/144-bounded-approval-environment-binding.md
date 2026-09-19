---
id: "144"
slug: bounded-approval-environment-binding
batch: b2
baseline: "58e037c"
depends_on: []
write_paths: ["src/agent_box/server/execution/**", "src/agent_box/server/approvals/**", "src/agent_box/server/sessions/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-env-provider/**", "release/**", "src/agent_box/server/wire/**", "protocols/**"]
ruling: R-0046
terminal: ["BOUNDED_APPROVAL_ENVIRONMENT_BINDING_DONE", "BOUNDED_APPROVAL_ENVIRONMENT_BINDING_PARTIAL"]
waive: []
parallel_units: ["facts-three-sources", "boundary-decision", "gate"]
serialize_with: ["092", "120", "121", "122", "126", "127", "130", "131", "133", "134", "135", "136", "137", "138", "139", "140", "141", "142"]
---

# Work Order 144 — `bounded` 审批的 `environmentId` **只有形状校验、零绑定、零消费者**（`AUD-B-026` **needs_validation**）⇒ 先定档：**"我批准的是环境 X"这句话是否真按 X 生效**

## Objective

**来源：后端审阅者 `AUD-B-026`（`needs_validation`）＋ ops 第 132 轮转单。**

审阅者实测：`approvals.decide#params.scope.bounded` **形状与已锁工件逐条相符**（这点它核过、是对的），
但 `environmentId` 在两棵树的 `src/` 里**只有那段形状校验**（`env-provider wire/handlers.py:1993-1997`／
`runtime wire/handlers.py:1744-1748`）——**服务端既不校验它指向真实环境，也不读它**；
决定与 scope **原样转发给 harness**（`sidecar.py:1505-1514 resolve(...)`），`approvals/records.py:122` 只当证据存进 `scope_json`、
`_row(:195)` 只回读成视图字段 ⇒ **树内无消费者**。

⇒ **缺的就是那一条事实**：`bounded.environmentId` 到底由谁约束？三种结论各有归属（**别停在"没结论"**）：

1. **由 Server 约束**（授权范围必须与实际执行环境对齐）⇒ **这是缺陷**（＝"授权范围与实际生效脱钩"，与 `138`/`139` 同族）⇒ **本单实现绑定**；
2. **由插件/harness 约束**（`AGENTS.md`：『Server 组合插件、**插件拥有原生 harness 语义**』）⇒ **不是缺陷**，但**必须把边界写成事实**：文档声明 ＋ 门断言 **scope 被逐字转发**（Server 不静默改写/丢弃）；
3. **谁都没约束**（既无 Server 校验、插件也不读）⇒ **是缺陷**（同上第 1 类），本单按"Server 侧绑定"实现**或**交回 ops 定归属。

**本单是定档单**：不起服务、不发真实模型调用；**定档成本低**（grep ＋ 一次有界探针 ＋ 一次归属判定）。
**明确不做**：改 `wire/**` 的形状（审阅者已确认形状**与工件相符**；若你判断需改形状 ⇒ **交回 ops**）；动 `protocols/**`；改 `65` 的合同文字。

## Current state（一手，`AUD-B-026`）

| 事实 | 出处 |
| --- | --- |
| `bounded` 只查四件事：键集恰为 `{kind,until,environmentId}`、`until=='session_end'`、`environmentId ∈ {None, 非空 str}` | `AUD-B-026`（含 `handlers.py` 行号，两棵树各一处） |
| 两棵树 `grep -rn environmentId --include=*.py src/` **命中就是那段形状校验** ⇒ 零绑定、零消费者 | 同上 |
| 决定与 scope **原样转发**给 harness（`sidecar.py:1505-1514`）；`records.py:122` 存 `scope_json`、`:195` 只回读成视图 | 同上 |
| 形状**与已锁工件逐条相符**（审阅者核过：`required=[kind,until,environmentId]`、`environmentId: 非空串\|null`） | 同上 |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 事实 | 三源对账（**声明**／**产生**／**投递**）：`environmentId` 在服务端是否有**任何**绑定或消费者；再跑一次有界探针（真审批记录 ＋ 真 `resolve` 路径，断言 scope **逐字**到达 harness） | 定档要有可复核的证据，不是读码印象 |
| 归属判定 | 按上面**三种结论之一**定档并**写进账**（逐条给判据） | 停在"没结论"＝这条规则最想消灭的形状 |
| 结论 1/3（Server 须绑定） | 实现**绑定**：把 `environmentId` 与**本轮实际执行环境**对照，不匹配 ⇒ **类型化拒绝**（不静默降级） | 授权范围必须与实际生效同一份事实 |
| 结论 2（插件所有） | 写**边界声明**（`docs/server-round1/**`）＋ **门**断言 scope **被逐字转发**（Server 不静默改写/丢弃） | 归属可以不在本树，但**事实必须在账上** |
| 门 | 反例：把绑定/转发断言**注释掉** ⇒ 门**必须红**；探针类结论 ⇒ 载荷级明细（不许只报总数） | `OF-14`：门要走真腿 |

**必须保持不变**：`bounded` 的**形状**（与已锁工件一致）；既有的 `approval.settled` 语义（`AUD-B-024`/`025` 已复核）；`wire/**`；`protocols/**`。

**边界**：若定档结论要求**改形状/合同/数据模型** ⇒ **交回 ops**（`R-0070 ②` 留给用户）；按 `R-0069` 在 `status.md` 写**解卡入口＝`需用户裁定`**（附判据与代价）。

## Requirements

### Requirement: 「我批准的是环境 X」必须能判真假

#### Scenario: 定档（三源对账 ＋ 有界探针）

**WHEN** 跑完声明/产生/投递三源对账与本轮审批到 `resolve` 的探针
**THEN** 账上写明**结论号（1/2/3）**＋逐条判据（证据指针），**不许**写"暂未发现消费者"当作结论

#### Scenario: 结论 1/3（Server 绑定，正例）

**WHEN** 审批的 `environmentId` 与本轮实际执行环境不一致
**THEN** **类型化拒绝**（不静默继续）

#### Scenario: 结论 2（插件所有，正例）

**WHEN** 走完审批 → `resolve(...)` → harness
**THEN** scope **逐字**到达（可断言），且账上有**边界声明**指向 `AGENTS.md` 的插件语义

#### Scenario: 反例（门要能咬）

**WHEN** 把绑定断言或"逐字转发"断言**注释掉**
**THEN** 本单的门**必须红**

## Stages

- [ ] 1. 观测：三源对账 ＋ 有界探针（scope 逐字到达？有无绑定/消费者）（提交）
- [ ] 2. 归属判定：结论 1/2/3 ＋ 判据（提交）
- [ ] 3. 按结论落地（绑定 ＋ 类型化拒绝 ／ 边界声明 ＋ 转发门）（提交）
- [ ] 4. 门与反例（注释掉必须红）（提交）
- [ ] 5. 账与证据（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 结论有编号 | 账上写明 1/2/3 ＋ 逐条判据 | 只写"未发现消费者"⇒ 不算过 | fail (typed) |
| G2 真语料 | 探针走真审批记录 ＋ 真 `resolve` 路径（不直调私有函数） | 直调/手工构造入参 ⇒ 门红 | fail (typed) |
| G3 结论落地 | 绑定（类型化拒绝）**或**逐字转发断言，二者有其一带反例 | 注释掉 ⇒ 门红 | fail (typed) |
| G4 形状不变 | `bounded` 形状与已锁工件逐条一致 | 形状漂移 ⇒ 门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 三源对账 ＋ 探针 · 2. 结论号与判据 · 3. 按结论落地 · 4. 门与反例 · 5. 账与证据。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`BOUNDED_APPROVAL_ENVIRONMENT_BINDING_DONE`
- 否则：`BOUNDED_APPROVAL_ENVIRONMENT_BINDING_PARTIAL` + 精确剩余（**定档未完成 ⇒ 必须写 needs_validation 仍未决 ＋ 交回**，不许静默 PARTIAL）

## Notes for the executor

- **这是 `needs_validation` 不是 confirmed** ⇒ 你的交付**首先是事实**；**若结论是"插件所有且它真的读"** ⇒ 本条可判 **rejected**，
  但**仍要**留下边界声明与"逐字转发"的断言（`svg/listing/local-preview` 与 `OF-17` 同一教训：**边界不写下来就等于没有**）。
- **归批**：与 `138`/`139`/`140`/`141` 同族（委派/审批的**授权边界**）⇒ 若你的结论落在"Server 须绑定"，
  可与 `132` 的对账门形制对齐（新亚型＝**『声明的授权范围』与『实际生效范围』必须同源**）。
- **前提待验**（`OF-02`）：引自 `AUD-B-026`（含行号与 grep）；第一步自己复核。
