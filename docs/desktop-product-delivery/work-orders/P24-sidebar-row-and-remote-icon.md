---
id: P24
slug: sidebar-row-and-remote-icon
batch: Q2
baseline: "84818534"
depends_on: []
write_paths: ["apps/desktop/**", "tests-js/**", "docs/desktop-product-delivery/**"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-env-provider/**", "release/**"]
ruling: R-0001
terminal: ["SIDEBAR_REMOTE_UI_DONE", "SIDEBAR_REMOTE_UI_PARTIAL"]
waive: []
parallel_units: []
---

# Work Order P24 — 侧栏行重叠 + 远程图标换成云朵 + 服务行不再说假话

## Objective

试用首轮暴露了三处**同一个区域**（侧栏 / 状态行）的呈现问题：① 工作区行在**侧栏变窄时元素互相压叠**；
② 远程连接用的是**地球/转圈**式图标，与产品（ZCode 那套）不一致，应换成**云朵描边**；③ 底部状态行写着
"Gateway is not connected"，而服务**明明是连着的**（Models 页有真实数据）。本单只修这三处呈现，不动 wire 语义。

## Current state

**实测（2026-09-19，CDP 量元素盒，窗口 1436×844）**：

- 工作区行 `BUTTON`：`x=40..187, h=30`；行内 grid `x=10..223`，两列 = 内容列 `10..195 (w=185)` + **动作列 `195..215 (w=20)`**；
  `WSL` 徽章 `SPAN`：`x=155..188 (w=33)`，`class` 含 `shrink-0`；内容列第一列是 `minmax(0,1fr)`，动作列 `shrink-0`。
  ⇒ **结构原因**：侧栏变窄时第一列被压到最小，徽章（`shrink-0`）向右顶进动作列（chevron / ⋮ 所在），
  图标压在徽章上方；hover 时还有 "Connection info" tooltip 叠在同一处。
- 证据图（主树，绝对路径可直接看）：
  `/home/maoqh/projects/agent-box-server-round1/docs/server-round1/findings/ui-2026-09-19/01-sidebar-row-overlap.png`（用户截图：徽章被压叠）
  `/home/maoqh/projects/agent-box-server-round1/docs/server-round1/findings/ui-2026-09-19/02-zcode-cloud-icons.png` 与 `…/03-zcode-cloud-row.png`（**要学的图标语言**：云朵描边）
  `/home/maoqh/projects/agent-box-server-round1/docs/server-round1/findings/ui-2026-09-19/05-measured-row-1436px.png`（我量的那一屏）
- 状态行文案：底部 `Service / Gateway is not connected`（与"服务已连"矛盾；P14 的"UI 不出现 gateway"也未扫净）。

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 侧栏工作区行 | 窄宽度下**不重叠**（徽章与动作列互不侵占） | 可用性 |
| 远程连接指示图标 | 换成**云朵描边**（ZCode 同款语言），侧栏行与底部状态行一致 | 视觉一致 |
| 底部状态行文案 | 按**真实连接状态**显示，去掉 "Gateway" 字样 | 不许说假话 |

- 不新增 wire 方法、不改 Server 语义；徽章文字（`WSL`）保留，图标只作连接类型指示
- 窄宽度行为要与既有 sidebar 折叠/隐藏逻辑一致（不得靠 `overflow: hidden` 把图标切掉充数）

## Requirements

### Requirement: 窄侧栏下不重叠

#### Scenario: 侧栏压窄

**WHEN** 侧栏宽度从 320px 连续压到 160px（含 hover 出现动作图标与 tooltip 的情形）
**THEN** 任意两个可交互元素的包围盒相交面积 ≤ 1px²（用 `getBoundingClientRect` 逐对检查，方法见 Validation）

### Requirement: 远程指示是云朵

#### Scenario: 远程条目

**WHEN** 侧栏出现远程（WSL / ssh）工作区或远程连接
**THEN** 其指示图标是**云朵描边**（与 `02/03` 参考图同语言），不是地球/转圈图标；同一含义在底部状态行用同一图标

### Requirement: 状态行说实话

#### Scenario: 服务已连

**WHEN** 服务连通（`profiles.list` 等有真实返回）
**THEN** 状态行显示"已连接"语义（含目标提示），**不出现** "Gateway is not connected" 或 "gateway" 字样；
未连通时显示**原因**而不是同一句话

## Stages

- [ ] 1. 复现：把窗口压窄到能看见重叠，截图存证（提交）
- [ ] 2. 修行布局（徽章与动作列的收缩规则）（提交）
- [ ] 3. 换云朵图标（侧栏行 + 状态行一致）（提交）
- [ ] 4. 状态行按真实连接状态显示 + i18n 全语种 + 四项检查计数（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 无重叠 | 160–320px 逐宽度量：任意可交互元素相交 ≤1px² | 修复前同一方法必须量到重叠（把测到的重叠贴进报告） | fail (typed)：量不了就如实记未测 |
| G2 云朵 | 远程指示为云朵描边；全局搜不到"地球/转圈"式的远程图标 | 换回旧图标即失败 | fail (typed) |
| G3 不说假话 | 已连时状态行不含 gateway 字样且语义为已连接 | 强制断开（停 Server）后必须显示原因而非"已连接" | fail (typed) |
| G4 不退化 | tsc / eslint / build / vitest 四项计数入账（既有红照实记） | 任一项 skip 即失败 | fail (typed) |

## Validation

```bash
# 侧栏压窄后逐对量包围盒（在应用窗口的 CDP 里跑，输出给报告）
#   const els=[...document.querySelectorAll('aside *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>4&&r.height>4});
#   逐对计算相交面积，报最大者；160/200/240/280/320 各测一次
cd apps/desktop && npx tsc --noEmit && npx eslint . ; npm run build
cd ../.. && npx vitest run --reporter=basic
git diff --check && git status --short
```

## DoD

1. 实现：布局 + 图标 + 文案。2. 反例：G1 修复前的重叠数据、G3 断连后的显示。3. 真实环境：真应用里压窄侧栏复现→修复。
4. 回归：四项计数。5. 账务：无。6. 账：本单终态行。

## Acceptance

- 绿：`SIDEBAR_REMOTE_UI_DONE`；否则 `SIDEBAR_REMOTE_UI_PARTIAL` + 精确剩余项
