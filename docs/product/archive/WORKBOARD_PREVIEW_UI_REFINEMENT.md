# WorkBoard Preview UI 精简设计
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

**状态：** implementation-ready
**范围：** `plugins/agent-box-workboard`
**目标：** 为 Agent-Box Preview 提供一个简洁、可观察、可控制、适合录屏的统一 TUI。
**约束：** 不修改 Work Core，不引入桌面端或 Web 前端，不增加 workflow 语义。

## 1. 设计结论

Preview 继续使用 Textual TUI。

当前问题主要是信息重复和视觉主次不清，不是终端媒介本身。主界面应只回答四个问题：

1. 这个 Work 当前是什么状态？
2. 已经发生过哪些 Execution？
3. 当前选中的 Execution 有哪些关键事实？
4. 用户现在可以做什么？

Binding、Evidence 和完整 Ref 细节进入独立详情页，不全部堆在主界面。

## 2. 非目标

本轮不做：

- Windows/macOS 桌面应用；
- Web UI 或后端 API；
- terminal emulator 嵌入；
- workflow graph、未来 Execution 列表或下一步自动推荐；
- Work Core schema、event 或 ontology 修改；
- 通用 UI schema framework；
- Provider-specific 分支写进 WorkBoard。

## 3. 主界面

```text
┌ WORK · OPEN ───────────────────────────────────────────────┐
│ DeepSeek Harness 多会话配置插件                            │
│ 1 Execution · 0 active · 等待当前下一步决策                │
└────────────────────────────────────────────────────────────┘

┌ 已发生的历史 ─────────────────┬ 当前选择 ──────────────────┐
│ E1  调查现有配置机制           │ E1 · SUCCEEDED              │
│ ✓ Codex · 4 inputs · 4 outputs│ Provider  Codex            │
│                                │ Dispatch  accepted          │
│                                │ Binding   4 frozen          │
│                                │ Outputs   4                 │
│                                │ Evidence  partial           │
└────────────────────────────────┴────────────────────────────┘

[查看成果] [Binding] [Evidence] [创建下一次 Execution]
```

### 3.1 Work 区

最多三行：

- `WORK · <lifecycle>`；
- objective，最多两行，超出省略；
- Execution 数量、ACTIVE 数量和当前提示。

删除常驻的架构辩护文案，例如 `no future workflow is generated`。没有未来 Execution 本身就应由
界面事实表达，不需要持续解释。

### 3.2 历史区

历史是主轴，按实际创建顺序展示，不渲染未来步骤。

每个 Execution 固定两行：

```text
E2  修复并发启动污染
● ACTIVE · codex-tmux-interactive · 6 inputs · observed now
```

规则：

- ACTIVE 使用 cyan；
- succeeded 使用 green；
- failed/cancelled/abandoned 使用 red；
- unknown/unreachable 使用 yellow；
- selected 只使用一个背景高亮，不再增加额外边框；
- 完整 ID、时间、Refs 和 provenance 不进入卡片。

### 3.3 当前选择区

右侧只展示结构化摘要：

- responsibility，最多三行；
- phase/outcome；
- accountable Provider；
- Dispatch state；
- frozen Binding 数量；
- native/output 数量；
- Evidence 状态；
- 已证明的 incoming handoff，仅在存在时显示。

不重复底部动作，不显示长 Ref、URI 或 metadata。

窄终端隐藏右侧区域，`Enter` 打开同样内容的详情 modal；历史始终优先。

### 3.4 Handoff

删除主界面常驻的 `OBSERVED HANDOFFS` 区和空状态占位。

若当前 Execution 存在由 exact Ref 证明的 handoff，仅在右侧显示：

```text
PROVEN HANDOFF
E1 output → E2 input
SessionRef S1 continued from E1
```

它是历史事实，不画成 DAG，不提供未来路线，也不占用独立 navigation surface。

### 3.5 动作区

底部只保留一套 contextual action bar。删除 Textual 默认 `Footer`，避免两套命令提示。

动作使用可聚焦、可点击的 `Button`；快捷键继续可用，但不是唯一入口。最多显示四个主要动作，
其余动作进入 `Ctrl+P` command palette。

| 当前选择 | 主要动作 |
|---|---|
| Work open | `New Execution`、`Work Evidence`、`Complete Work` |
| 未 Dispatch E | `Compose Binding`、`Freeze & Launch`、`Create Revised Execution` |
| ACTIVE E | `Attach`、`Observe`、`Finish Execution`、`Evidence` |
| terminal E | `View Outputs`、`Binding`、`Evidence`、`New/Continuation Execution` |

只能由现有 Core facts 和已安装 Host/Provider adapters 决定动作。不可用动作不伪装为成功；可以
隐藏，或在 palette 中显示 disabled reason。

## 4. Binding 页面

Binding 是 Preview 的主要产品镜头。`b` 或 `Binding` 按钮打开独立、可滚动的 modal。

### Dispatch 前 review

```text
BINDING REVIEW

Workspace
requested  HEAD
resolved   commit 0b5689… · tree 06e8f0…
assurance  Git resolved now

Profile
requested  codex-plus
resolved   profile digest sha256:…
assurance  launch config pinned

tmux pane
requested  %2
resolved   server $0 · window @0 · pane %2
assurance  exact pane observed

[返回修改]                         [Freeze & Launch]
```

要求：

- 使用现有 `PreparedInput.requested_summary`、`exact_summary` 和 `assurance`；
- `Resolve Preview` 不写 Core；
- `Freeze & Launch` 前重新执行 `prepare()`；
- 不要求用户输入 `LAUNCH` 字符串，改为带明确影响说明的确认按钮；
- 长 ID 默认缩写，但允许查看完整值。

### Dispatch 后 facts

只读展示 Core 已冻结的 `(contract_id, Ref)`、`inputs_digest` 和 Dispatch state。不能继续编辑，
不能把 Host draft 当成 frozen fact。

## 5. Evidence 页面

`e` 或 `Evidence` 按钮打开独立详情页。优先展示“预期与实际”的差异，不做 `used=true` 汇总。

```text
EVIDENCE

Workspace actual HEAD       verified
Profile projected           provider-reported
tmux exact pane             observed
Harness read prompt         unknown
All plugins were used       unverifiable
```

规则：

- 只展示数据库中真实存在的 Ref、observation 和 evidence；
- 没有 coverage 时明确显示 `unknown`，不能推断为 complete；
- authority、method、EvidenceRef 等长信息放在展开详情；
- `provider-reported` 与 independently observed 必须视觉上可区分；
- 不为美化 Demo 伪造 Evidence。

## 6. 视觉规则

继续使用当前工业控制台方向，但减少装饰：

- background：`#10161b`；
- primary surface：`#17232a`；
- selected/primary action：amber；
- ACTIVE：cyan；success：green；failure：red；unknown：yellow；
- 主界面只允许右侧 Inspector 使用一个边框；
- 不使用 Execution 大方框、流程箭头或大面积状态色；
- 标题使用统一大写层级，正文保持中英文可读；
- 所有宽度计算和截图测试必须覆盖 CJK，不允许中文换行重叠。

## 7. 代码改动范围

主要修改：

- `plugins/agent-box-workboard/src/agent_box_workboard/app.py`
  - 删除 Header/Footer 和主 Handoff surface；
  - 重组主布局；
  - 增加 contextual button bar；
  - 将 Binding/Evidence/Outputs 做成明确 modal；
- `plugins/agent-box-workboard/src/agent_box_workboard/render.py`
  - 保持 Execution row 为固定两行；
  - 删除与主界面重复的展开内容；
- `plugins/agent-box-workboard/src/agent_box_workboard/model.py`
  - 原则上只复用现有数据；仅在 ViewModel 缺少真实展示事实时做最小补充；
- `plugins/agent-box-workboard/tests/`
  - 更新交互、布局、CJK、Binding 和 Evidence 测试。

不得修改：

- `src/agent_box/work_core/`；
- migrations；
- Provider Core protocols；
- Resource Contract ontology。

如果 UI 缺少某项信息，先使用已有 Ref/Event/Dispatch 查询或标记 unknown。不能为了显示方便往
Core 增字段。

## 8. 实施顺序

1. 精简主布局：移除 Handoff surface、Header、Footer 和重复文案。
2. 增加单一 contextual button bar，并连接现有 actions。
3. 精简 Inspector 和 Execution rows。
4. 重做 Binding review/frozen facts modal。
5. 重做 Evidence modal；没有事实时显示 unknown。
6. 在真实 Work 和测试 fixture 上验证 100×35、120×35、150×42 三种尺寸。

## 9. 验收条件

- 用户首次打开界面，五秒内能指出 Work 状态、历史 Execution、当前选择和主要动作；
- 主界面没有空 Handoff 区，没有未来 Execution 或 runnable DAG；
- 底部只有一套动作入口；
- 所有主要动作可点击，也保留键盘快捷方式；
- terminal Execution 的主要动作明确是创建新/continuation Execution，不出现 reopen/resume old E；
- Binding review 明确展示 requested → exact → assurance；
- frozen Binding 与本地 draft 有明显区分；
- Evidence 至少能诚实展示 verified/provider-reported/unknown/unverifiable 中当前实际存在的状态；
- Provider terminal 后 Work 仍保持 OPEN，只有 Human 动作可以 Complete Work；
- polling 不抢 selection，不重置 modal，不在后台事实变化时自动触发动作；
- CJK 在规定尺寸下不重叠、不破坏布局；
- Work Core 测试不需要因本改动调整。

## 10. Preview 后再考虑

Preview 后可评估：

- 使用 `textual serve` 在浏览器中承载同一个 WorkBoard；
- 独立桌面 View 复用现有 ViewModel、Controller 和 plugin adapters；
- richer provider-owned resource picker；
- 多 Work 导航。

这些都不属于本轮实施，也不应阻塞 Demo。
