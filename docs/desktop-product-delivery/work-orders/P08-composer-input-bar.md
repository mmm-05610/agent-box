# P08 — 会话区输入条：profile 保留、provider/model 可选、控制项按 profile/provider 动态、权限框、上下文用量

基线：前端 goal 已关闭、`writer_lease=RELEASED`、工作树干净（HEAD `5b647a47`）。
本单是**新目标的第一步**：只改**输入条**（会话头、转写、文件变更卡、侧栏都不在本单）。
遵守[总方针](../master-plan.md)、[交接规则](../handoff-policy.md)、[协调规则](../manifest.json)的保护路径。

```text
之前
├── composer/chat-bar.tsx     ⚠ 三段 grid 在，但控件只有 profile + model pill
├── composer/model-pill.tsx   ⚠ 只"显示"不可"选"
└── profiles/profile-config-editor.tsx  ⚠ 控制项渲染器只在设置页用，composer 没用上
之后
├── composer/                 ◀ provider/model 选条 + 动态控制项 + 权限框 + 用量容器
├── profiles/                 ◀ 渲染器被 composer 复用（同一套 kind/样式约束）
└── e2e/ tests-js/            ◀ 选择条与动态性的定向用例
```

## 目标

按用户给的参考形态改造输入条：**profile 选择条保留** → 新增 **provider/model 选条** →
**其余控制项按所选 profile/provider 动态加载** → **权限选框** → **上下文百分比**。
形状用**外部 copy-in 组件**作基准，不从零手写。

## 现状（第一手，动手前逐条复核）

- 依赖已在：`@assistant-ui/react` 0.14.24、`@assistant-ui/core`、`@assistant-ui/react-streamdown`、
  `streamdown` 2.5.0、`react-shiki`、`radix-ui`、`motion`、React 19。**行为层已经有了**（自动增高、
  Enter/Ctrl+Enter、粘贴附件、拖放、编辑、排队、IME 与焦点处理），要换的是**外观与排布**。
- 输入条文件：`apps/desktop/src/features/chat/composer/{chat-bar.tsx, controls.tsx, model-pill.tsx,
  profile-controls.tsx, control-classes.ts}`。
- 控制项渲染器已有：`features/profiles/profile-config-editor.tsx`（按 `config.describe` 的 kind 渲染）。
- wire 数据源（**只消费，不改**）：`provider_models.list`、`config.describe`、`config.resolve`、
  `sessions.switchProfile`、发送带 `overrides: [{controlId, value}]`；未知控制项 → `unknown_control`，
  安全锁 → `security_locked`（如实显示，不要吞掉）。

## 阶段

**A 先验三个事实（不改代码，只记录）**：① `config.describe` 的控制项集合是否**真的**随
profile/provider 变化；② 会话中切换 provider/model 后 `config.resolve` 的有效值是否立刻反映；
③ 现有输入条/控制条用例的计数基线（先跑一遍记数）。**若 ① 的实际结论是"不随 provider 变"，
如实记录并停掉该项**，不得用前端假造"动态"。

**B 形状基准**：引入外部 copy-in 组件（建议 AI Elements 的 `Model Selector` / `Prompt Input` 等，
按需取件）。**许可证必须核实并写进 evidence**（AI Elements 站点页面未标许可证，仓库/包为准）；
**不得**引入 AI SDK 的运行时/传输 hook——传输与状态是本仓已有的东西。保留 assistant-ui 作行为层
（`ComposerPrimitive`），只替换外观与排布。

**C profile 保留 + provider/model 选条**：选项来自 `provider_models.list`；选择结果作为该轮
`overrides` 的模型槽值；UI 上如实显示**生效值**（沿用 `model-pill` 的显示位）。

**D 动态控制项**：composer 内渲染当前 profile 的控制项，**复用** `profile-config-editor` 的渲染器与
`control-classes` 的样式约束；provider/model 变化后重新 describe/resolve；未知与安全锁按码如实显示。

**E 权限选框**：**只渲染后端声明的控制项**。后端今天**没有**"权限档位"这个控制项 → 本阶段做的是
"通用渲染 + 未声明就不显示"，**禁止前端自造档位语义**；后端声明之后它会自动出现。本阶段在 status 里
记一条"等待后端声明权限控制项"。

**F 上下文百分比**：**数据必须来自后端**（用户明确：不能估算）。已核：后端 wire/事件/桥里
`usage`/`tokenCount`/`percent` **零命中**，所以今天没有数据源 → 本阶段只做"**有数据才显示、没有就
显示未知**"的容器与测试；**禁止估算、禁止用转写长度代替**。真实数据面在后端侧单独立项，不在本单。

**G 回归与收口**：既有输入条用例（键盘 / IME / 焦点 / 拖放 / 排队）不得退化；补选择条与动态性的
定向用例；更新 `status.md` 与 `evidence/`；按 `handoff-policy.md` 释放租约。

## 门

| 门 | 断言 |
| --- | --- |
| **G1 形状** | 输入条三段布局保留、**profile 选择条保留**、provider/model 选条可用（定向/e2e 用例） |
| **G2 动态性** | 切换 profile/provider 后控制项集合或有效值变化有**第一手证据**；后端不动态 → 如实记录并停该项 |
| **G3 只渲染已声明** | 未声明的控制项（含权限档位）**不显示**；有反例用例 |
| **G4 用量诚实** | 无数据时显示"未知"；有测试锁死"**不得出现估算值**" |
| **G5 不退化** | 既有 JS/e2e 用例计数不降；**保护路径零改动**；**后端仓零写入** |

## 范围与调度

写集：`docs/desktop-product-delivery/**`、`apps/desktop/src/features/chat/composer/**`、
`apps/desktop/src/features/profiles/**`、`apps/desktop/src/components/assistant-ui/**`、
`apps/desktop/src/i18n/**`、`apps/desktop/e2e/**`、`tests-js/**`、`package.json`、`package-lock.json`。
保护路径（见 manifest `protected`）一律不动；单 Windows 构建槽；按 `handoff-policy.md` 取/放写权。
**不修改后端仓**；**不在 main 施工**；不 reset/stash/clean、不 merge main、不 push。

## 边界（不在本单）

会话头与环境/分支 chip、文件变更摘要卡、转写区改造（后续单）；
后端用量数据面与权限档位的语义实现（后端侧单独立项）；
wire 的任何变更（当前锁在 `wire/1`、28 方法、严格事件 schema）——本单**只消费**。
