---
id: P21
slug: wire-relock-and-new-surfaces
batch: Q1
baseline: "df05959e"
depends_on: []
write_paths: ["apps/desktop/**", "apps/shared/**", "tests-js/**", "docs/desktop-product-delivery/**"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-env-provider/**", "release/**"]
ruling: R-0004
terminal: ["WIRE_RELOCK_DONE", "WIRE_RELOCK_PARTIAL"]
waive: []
parallel_units: []
---

# Work Order P21 — 与后端对齐当前 wire（两仓重锁）+ 接上四个新面

## Objective

后端的 58–64 落了新方法与新字段（资产 hub、hook、角色设置增量、工作区 Git 状态、Profile 记忆、运行中执行清单），
每个小节的末尾都写着"**需前端同步 + 两仓重锁**"。本树最后一次记录的合同摘要（2026-09-17）**已落后**，
所以界面还看不到这几个面。本单做两件事：**把合同摘要与后端对齐**（重生成工件 + 两端接受同一对摘要），
**再把四个只读面接上**（Git 卡、记忆分区、执行清单卡、角色设置增量）。

## Current state

- 本树 `docs/desktop-product-delivery/contracts/wire-v1/README.md` 记录：权威
  `774640498429ca9f501dcddd3c7f434e58af3c60a7360578e0387e8aca356276`、生成工件
  `14f7f73605bb6f048a09a8e7faa93f15ca77d4d66a0b38439a9e9cf2bc6428c7`（**2026-09-17**）。
- 后端 `docs/server-round1/wire-review.md` 在本树记录之后仍有多次重锁（至少 `986889e4…`/`d3f7412710e7e951…`
  与更晚的一对），并在 Order 60/62/63/64 小节逐条列出**新增方法与字段**及"需前端同步（P17/P20）与两仓重锁"。
- ⇒ **两端摘要不一致 = 未锁定**。本单第一阶段的"当前值"必须**第一手读取后端文件**后填入，不得沿用此段文字。

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| `apps/desktop/src/types/wire/wire-v1.ts` | 补后端 58–64 的新方法/字段（按后端小节逐条核对） | 合同落后 |
| `docs/desktop-product-delivery/contracts/wire-v1/generated/…` | 重生成工件并记录新摘要 | 重锁 |
| renderer 三个面 | Git 卡（62）、记忆分区（63）、执行清单卡（64）；角色页增量（60：克隆、权限规则、资产重绑） | 让新面可见 |
| `docs/desktop-product-delivery/status.md` | 本单终态、摘要对、剩余项 | 账 |

- **只读面**：四个面都只读展示；不新增写操作、不改后端语义、不新增本地推断（`available:false` / `null` 就按其原因显示，不画假开关）
- 不碰后端仓、不碰发布源；`tsc`/`eslint`/`build`/`vitest` 四项必须真跑并记计数

## Requirements

### Requirement: 两端接受同一对摘要

#### Scenario: 摘要对齐

**WHEN** 第一阶段第一手读取后端 `docs/server-round1/wire-review.md` 里**最后一条**"TS 权威 / 生成工件"摘要对，
并按本树 README 的重生成命令重生成工件
**THEN** 本树记录的一对摘要与后端最后一条**逐字相等**，并把这一对与新时间写进本树 `contracts/wire-v1/README.md`

### Requirement: 新面按各自的方法真实取值

#### Scenario: Git 卡

**WHEN** 打开工作区的 Git 卡
**THEN** 它显示 `workspaces.gitStatus` 的六个字段；任一字段为 `null` 时显示其 `reason`，**不显示 0 冒充**

#### Scenario: 记忆分区

**WHEN** 该 Profile 的注册表未声明 `memory_paths`（`available:false`）
**THEN** 角色页**隐藏**记忆分区（不画空分区、不画灰开关）；命中凭据的项按其 `reason` 显示为拒绝项，不显示内容

#### Scenario: 执行清单卡

**WHEN** 打开执行清单卡
**THEN** 行来自 `executions.list`，`pid` 为 `null` 时显示其 `pidReason`；超 200 行的失败按类型化错误显示，不静默截断

## Stages

- [ ] 1. 第一手读后端 wire-review 的最后摘要对；重生成工件；把摘要对写进本树 README（提交）
- [ ] 2. 合同补齐 58–64 的新方法与字段；`tsc` + 合同测试通过并记计数（提交）
- [ ] 3. 接上四个面（Git 卡 / 记忆分区 / 执行清单卡 / 角色页增量）（提交）
- [ ] 4. 四项检查真跑（tsc / eslint / build / vitest）+ 账与证据落盘（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 摘要对齐 | 本树记录的一对摘要 == 后端最后一条（逐字） | 用旧摘要 `774640498429ca9f…` 充当当前值即失败 | fail (typed)：读不到后端文件就停下记阻塞，不猜 |
| G2 不画假值 | `null`/`available:false` 一律显示原因或隐藏 | 任一字段为 null 却显示 0/"可用"即失败 | fail (typed) |
| G3 只读 | 四个面不引入任何写方法 | 出现写方法调用即失败 | fail (typed) |
| G4 不退化 | `tsc`/`eslint`/`build`/`vitest` 四项计数记入账且全过 | 任一项 skip 或放宽断言即失败 | fail (typed) |

## Validation

```bash
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/desktop-product-delivery/work-orders/P21-wire-relock-and-new-surfaces.md --strict || true  # P 编号会报文件名一条，其余必须为空
sed -n '1,40p' /home/maoqh/projects/agent-box-env-provider/docs/server-round1/wire-review.md   # 第一手读摘要对
cd apps/desktop && npx tsc --noEmit && npx eslint . && npm run build
cd ../.. && npx vitest run --reporter=basic
git diff --check && git status --short
```

## DoD

1. 实现：合同补齐 + 四个面接线。2. 反例：G1/G2/G3 各演练一次并写进报告。3. 真实环境：构建产物真跑一遍应用。
4. 回归：四项计数与退出码。5. 账务与清理：`§Spend` 记请求/费用，临时文件清理。
6. 账：本单在 `status.md` 有终态行 + 摘要对（交回主树以便两仓重锁同步给后端）。

## Acceptance

- 绿：`WIRE_RELOCK_DONE`
- 否则：`WIRE_RELOCK_PARTIAL` + 精确剩余项（哪个面、哪个方法、哪条摘要）
