---
id: 081
slug: relock-register-frontend
batch: b2
baseline: "f819ad3"
depends_on: []
write_paths: ["docs/server-round1/wire-review.md", "docs/implementation/status.md"]
forbidden: ["src/**", "plugins/**", "tests/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**"]
ruling: R-0004
terminal: ["RELOCK_REGISTERED_DONE", "RELOCK_REGISTERED_PARTIAL"]
waive: []
parallel_units: []
---

# Work Order 081 — 两仓重锁：登记前端交出的工件

## Objective

前端在 P21 里与后端最后一条摘要对齐并交回（前端记录值 `b284f70c`），但**后端登记值还停在旧的一对**。
本单把前端交出的工件在后端侧**复核并登记**，使 `wire-review.md` 里"两端接受同一对摘要"成立——这是"两仓重锁"的收口。

## Current state

- 前端 Q1 报告：两端**未锁定**，需后端重新登记（前端交回 `b284f70c`）
- 后端 `docs/server-round1/wire-review.md`：最后一条摘要对为本单要复核的对象

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| `docs/server-round1/wire-review.md` | 追记一节：复核前端工件摘要 + **登记**一致的一对 | 重锁收口 |

- **只写评审面与账**；不改 `src/plugins/tests`、不改前端任何文件
- 复核必须是**逐字比对**（读前端仓库的生成工件现物，不采信转述）

## Requirements

### Requirement: 两端逐字一致

#### Scenario: 复核并登记

**WHEN** 读前端 `contracts/wire-v1/generated/` 现物与 `README.md` 记录值，与本后端最后一条摘要对比较
**THEN** 两者**逐字相等**时在该文件追记"已登记 + 值 + 日期"；不等则**登记差异并类型化交回**（不自行改前端）

## Stages

- [x] 1. 读前端现物与记录（只读）并比对（提交）
- [x] 2. 追记登记或差异（提交）
- [x] 3. 自查（两端值各引一次）与账（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 逐字 | 登记值与前端现物逐字相等（引用两处路径） | 用旧值 `b284f70c` 充当"已一致"即失败 | fail (typed)：前端不可读就停下记阻塞 |
| G2 只写两文件 | `git diff --stat -- src plugins tests` 为空 | 出现实现改动即失败 | fail (typed) |

## Validation

```bash
sha256sum /home/maoqh/projects/agent-box-desktop-next-wsl-round1/docs/desktop-product-delivery/contracts/wire-v1/generated/wire-v1.schema.json
git diff --stat -- src plugins tests && git diff --check && git status --short
```

## DoD

1. 实现：无。2. 反例：G1 的旧值演练。3. 真实环境：前端现物即真机产物。4. 回归：无代码改动。
5. 账务：零调用。6. 账：本单终态行 + 两端值。

## Acceptance

- 绿：`RELOCK_REGISTERED_DONE`；否则 `RELOCK_REGISTERED_PARTIAL` + 差异原文

---

## 修订（2026-09-19，调度者：两仓重锁的权威对已由调度者第一手复现）

调度者按用户指示（"统一一下然后分别跟两边说明"）**亲自复跑**了严格校验，结论与要登记的一对如下：

- **前端 TS 权威**：`apps/desktop/src/types/wire/wire-v1.ts`
  → `sha256:1019b38b069899137440f22f0e8cebedefb7b13b8e95784651b96189ad977556`
- **前端生成工件**：`docs/desktop-product-delivery/contracts/wire-v1/generated/wire-v1.schema.json`
  → `sha256:1a3604ee9dd543eedacc4be33af8e87b44f8ed3aaa7d395484c28973b6d8e5be`（**64 方法**）
- **后端严格校验**（调度者实跑，命令与结果）：
  `AGENT_BOX_WIRE_SCHEMA=<上述工件> PYTHONPATH=src:plugins/... python3 -m pytest tests/server/test_wire_v1.py -q`
  → **37 passed**（100.68s）。即：**后端 handler 与前端当前工件逐方法一致**。

**本单剩余动作（收口 081 的 PARTIAL）**：
1. 在 `docs/server-round1/wire-review.md` 追记一节：登记上面**同一对摘要** + 方法数 64 + 上面这条命令与 37 passed 的实测结果；
2. 明确写"两端接受同一对摘要 ⇒ `WIRE_LOCKED_FOR_IMPLEMENTATION` 成立"（081 此前的 PARTIAL 理由随之关闭）；
3. 若执行者复跑得到不同结果（例如前端又动了合同），**以第一手为准**并把差异写进该节，不要照抄本修订的数字。
