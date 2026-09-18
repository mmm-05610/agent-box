# P09 — 会话区过程呈现（思考行 / 工具行 / 状态尾 / 时长），尽量用现成组件

基线：P08（输入条）之后；`writer_lease` 按 `handoff-policy.md` 取放。
本单只改**转写区（会话区主体）**，不动输入条（P08）、不动侧栏与会话头。

```text
之前
├── thread/message-parts.tsx   ⚠ 只渲染"文本/澄清/工具失败"这几类部件
├── tool/**                    ⚠ 有工具渲染子树，但没有生命周期（开始/进行/结束）
└── chat/activity-timer.ts     ⚠ 计时器在，但只服务整体活动
之后
├── thread/                    ◀ 思考行（可折叠 + 时长）、工具行（名称/分组/状态/输出摘要）
├── tool/**                    ◀ 工具生命周期渲染（进行中 / 完成 / 失败），ANSI 输出用现有 ansi-text
└── 状态尾                     ◀ "正在获取…" 尾行 + "已工作 N 分 N 秒"（复用 activity-timer）
```

## 目标

把会话区做成 ZCode/Codex 同款的过程视图：**折叠的"思考 · 持续了几秒"**、**工具行（如"终端 · 4 个命令"）**、
工具输出摘要、**流式状态尾**（"正在获取任务输出"）、以及**"已工作 N 分 N 秒"**。
形状尽量用外部 copy-in 组件，不手写。

## 现状（第一手，动手前复核）

- 已有可复用件：`components/assistant-ui/thread/message-parts.tsx`（assistant-ui 的 `MessagePrimitive.Parts`
  部件渲染）、`components/assistant-ui/tool/**`、`components/chat/activity-timer.ts`、
  `components/assistant-ui/ansi-text.tsx`（终端输出着色）、`status-tail-only` 相关用例、
  `markdown-text.tsx`、`clarify-tool.tsx`、`mcp-setup-tool.tsx`。
- 形状基准：AI Elements（copy-in）里的 `Reasoning`（折叠思考 + 时长）、`Tool`（工具卡：状态/参数/输出）、
  `Terminal`/`Code Block`（输出）、`Chain of Thought`（多步分组）、`Shimmer`（进行中效果）、`Task`/`Plan`。
  **许可证核实并写进 evidence**；**不得**引入其运行时/传输层。
- **事实面（关键）**：后端今天只上行 `message.delta` / `message.final` / **只报失败**的 `tool.update`
  → **思考行、工具生命周期、分组、每步耗时今天都拿不到**。后端已开 52（过程事实）与 51（用量），
  它们要共用一次 wire 重锁；**在合同到位前**，本单只点亮"现在真有的事实"。

## 阶段

**A 盘点可用事实（不改代码）**：列出当前渲染所需的每一类数据 → 对应到已有事件；
产出一张"**已可用 / 等待后端合同**"两栏对照表（放进 evidence）。**不显示等待中的数据**（可留空位但
不得伪造）。

**B 形状基准**：引入外部 copy-in 组件（AI Elements 的 `Reasoning` / `Tool` / `Chain of Thought` /
`Shimmer` / `Terminal` 按需取件），替换 `message-parts` 里对应部件的**外观与排布**；保留 assistant-ui
作行为层（折叠、流式追加、虚拟滚动现状）。

**C 现在就点亮的部分**：消息流（已有）、**工具失败行**（沿用既有语义与文案）、
**状态尾**（"正在获取…"，基于既有 turn 状态与流式事实）、
**"已工作 N 分 N 秒"**（复用 `activity-timer`，数据来自既有事件时间戳）。

**D 合同到位后点亮的部分**（后端 52/51 落地后**增量接入**，不重开本单）：
思考行（含时长）、工具行（名称/参数摘要/输出摘要/ANSI 着色）、工具分组（"终端 · N 个命令"）、
计划与模式行、上下文用量。

**E 回归与收口**：既有 thread/tool 用例与 `tests-js` 不退化；补"缺失事实不显示"的反例用例；
更新 `status.md`/`evidence/`；释放写权。

## 门

| 门 | 断言 |
| --- | --- |
| **G1 事实对照表** | "已可用 / 等待合同"两栏齐全，逐项有来源（事件名或"无"） |
| **G2 不伪造** | 等待中的数据**不显示**；有反例用例（例如无思考事件时不得渲染空的"思考"行） |
| **G3 形状** | 组件来自外部 copy-in 库（许可证已核实并记录）；折叠/流式/滚动行为不回退 |
| **G4 时长诚实** | 时长由事件时间戳推导；推不出的组合显示为空/未知，不得估算 |
| **G5 不退化** | 既有 JS/e2e 用例计数不降；**保护路径零改动**；**后端仓零写入**；不碰 main、不 merge、不 push |

## 范围与调度

写集：`docs/desktop-product-delivery/**`、`apps/desktop/src/components/assistant-ui/**`、
`apps/desktop/src/features/chat/**`、`apps/desktop/src/i18n/**`、`apps/desktop/e2e/**`、`tests-js/**`、
`package.json`、`package-lock.json`。保护路径与保护规则见 manifest；单 Windows 构建槽；
按 `handoff-policy.md` 取放写权。

## 边界

输入条（P08）、侧栏、会话头与环境/分支 chip、文件变更摘要卡（各自单）；
**后端的事实面（51 用量 / 52 过程事实）不在本单**——本单只消费它们的合同，
届时**增量接入**而不重开。
