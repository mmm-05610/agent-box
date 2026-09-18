---
id: P22
slug: contract-faces
batch: Q2
baseline: "8fc1a807"
depends_on: []
write_paths: ["apps/desktop/**", "apps/shared/**", "tests-js/**", "docs/desktop-product-delivery/**"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-env-provider/**", "release/**"]
ruling: R-0004
terminal: ["CONTRACT_FACES_DONE", "CONTRACT_FACES_PARTIAL"]
waive: []
parallel_units: []
---

# Work Order P22 — 五处已在合同里、界面还没接的面

## Objective

P21 把 `profiles.clone`/`setPermissions`、`assets.bind`/`unbind`/`publish*`、`accounts.*`、`hooks.*` 编进了合同，
但**一个都没调用**（P21 的 G3 只读边界）。本单把它们各自的**产品面**接上：角色页的克隆与权限规则、资产 hub 的绑定/解绑/发布、
订阅账号、hook 管理——都按合同里的方法真调，并按 `available:false`/类型化错误如实显示。

## Current state

- Q1 报告 §5："只读边界：`profiles.clone`/`setPermissions`/`assets.bind`/`unbind`/`publish*`/`hooks.*`/`accounts.*` 已进合同但**本单一个都没调用**（G3）；它们各自的产品面属于后续单。"
- 本树已有：P15（skill/MCP hub）、P16（hook 管理）、P17（角色设置）的**只读/展示**面；本单是它们的**写路径**补齐

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 角色页 | 克隆（带逐项迁移报告与来源标注）+ 权限规则编辑（`ask` 走审批往返） | 合同已有、界面未接 |
| 资产 hub | 绑定/解绑/发布（发布成功显示 provenance） | 同上 |
| 订阅账号、hook 管理 | 列表/录入/启停（按类型化错误显示原因） | 同上 |

- **不新增本地推断**：`available:false` 就隐藏或灰显并给原因；写操作失败按 Server 的类型化码显示
- 不改合同形状、不碰后端仓；`tsc`/`eslint`/`build`/`vitest` 四项真跑并记计数（eslint 的既有红照实记）

## Requirements

### Requirement: 五处写路径真调合同方法

#### Scenario: 克隆与权限

**WHEN** 在角色页克隆一个角色
**THEN** 调 `profiles.clone`，显示逐项迁移报告与来源；跨家族克隆按合同拒绝时显示其类型化原因

#### Scenario: 资产发布

**WHEN** 发布一个资产
**THEN** 调 `assets.publish*`，成功显示 provenance；失败按类型化码显示，不改本地状态

### Requirement: 不画假开关

#### Scenario: 能力不可用

**WHEN** 某面在合同里为 `available:false` 或该方法不可用
**THEN** 该面隐藏或灰显并给原因，**不**允许点击后静默失败

## Stages

- [ ] 1. 逐面核对合同方法签名与类型化码（提交）
- [ ] 2. 角色页（克隆 + 权限规则）（提交）
- [ ] 3. 资产 hub（绑定/解绑/发布）+ 订阅账号 + hook 管理（提交）
- [ ] 4. 四项检查真跑 + 反例（不可用面不画假开关）+ 账与证据（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 真调合同 | 五处各有调用点，且参数按合同（有测试或截图证据） | 用本地状态假装成功即失败 | fail (typed) |
| G2 不画假开关 | `available:false` 面不可提交 | 允许点击后无反馈即失败 | fail (typed) |
| G3 不退化 | 四项检查计数入账（eslint 既有红照实记） | 任一项 skip/放宽即失败 | fail (typed) |

## Validation

```bash
cd apps/desktop && npx tsc --noEmit && npx eslint . ; npm run build
cd ../.. && npx vitest run --reporter=basic
git diff --check && git status --short
```

## DoD

1. 实现：五处产品面。2. 反例：G2 演练。3. 真实环境：构建产物真跑一遍（若仍缺 electron 二进制，如实记录并说明替代验证）。
4. 回归：四项计数与退出码。5. 账务：`§Spend` 记账与清理。6. 账：本单终态行 + 剩余面清单。

## Acceptance

- 绿：`CONTRACT_FACES_DONE`；否则 `CONTRACT_FACES_PARTIAL` + 精确剩余（哪一面、哪个方法）
