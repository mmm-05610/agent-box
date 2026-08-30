# WorkBoard Binding Composer 设计
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

**状态：** 已实施（2026-08-27，本会话直接实施，workboard 测试 26/26 通过；Core 零改动）
**日期：** 2026-08-27
**范围：** `plugins/agent-box-workboard`（及其测试）
**约束：** 不修改 Work Core、migration、Provider Core protocol、Resource Contract ontology；不引入桌面端 / Web UI；不增加 workflow 语义。

> 实施记录（与本文档的偏差仅三处，均为更优行为）：
> 1. **每行 Add 按钮直达该 contract 的 adapter 表单**（用户已选定 contract，不再过 chooser）；footer 的 `Add Resource` 才打开多 contract 选择器。
> 2. `_Form` 增加 `escape` 取消关闭（共享改进，所有表单可 `Esc` 取消）。
> 3. **New Execution 表单的 provider 从自由文本改为 ExecutionProvider 下拉**（显示 display name + 各自 input_limits 摘要 + capabilities），明确"绑定执行系统"这一步，杜绝把 `codex-plus` 当 provider 填；Composer header 明示「执行系统（ExecutionProvider）vs Binding 装入的资源」，Agent-Box profile 只是其中一种输入资源，不是 Provider 本身。

## 0. 问题定义

当前 Binding 装配体验不对位。用户对一次真实 Execution 的使用直觉是：

```text
定义责任 → 选择唯一 ExecutionProvider → 查看它需要/允许哪些输入
→ 逐个选择要装入的 Ref → resolve 成 exact Ref → Review Binding → Freeze & Launch
```

而当前 `app.py` 的 `_present_composer()` 实际行为是：

```text
创建 Execution 时顺手填 Provider
→ WorkBoard 找出该 Provider 支持的所有 adapter
→ 把所有 adapter 的表单字段一次性摊进一个大 Form
→ 全部 adapter 一起 prepare()，一起加入 Binding
```

缺少的核心交互：

- 用户主动决定"这次 Execution 装入哪些 Ref"（Add / Replace / Remove）；
- required / optional 区分（`input_limits()` 的 `(min, max)` 已存在但 UI 没有使用展示）；
- 同一 Contract 多个输入（例如 `PromptFragmentV1 (1, None)`）；
- 装配是否满足 Provider 要求（min/max 门控）再允许 Review & Freeze；
- 没有 adapter 的 Contract 被静默跳过，用户不知道缺了什么。

## 1. 三层边界（第一条验收规则）

> **TUI 决定"这次 Execution 选择什么"。**
> **插件 / 配置文件决定"能力与协议"。**
> **Core 记录"最后冻结了什么、实际发生了什么"。**

| 层 | 管什么 | 例子 |
|---|---|---|
| WorkBoard (TUI) | 本次 responsibility、选择的 Provider、装入哪些 Ref、动态资源的 selector、Add/Replace/Remove、Freeze & Launch、查看 Evidence | `Profile: codex-plus`、`tmux pane %2`、`Git main` |
| 插件 / 配置文件 | Provider 启动协议、selector→exact Ref 解析、choices/picker、profile 内容、bwrap/GH Actions/LangGraph 策略、credential secret 位置 | codex 启动命令、pane 发现规则、MCP server JSON |
| Work Core | 冻结后的 `(contract_id, Ref)`、`inputs_digest`、Dispatch state、observation/evidence | 不可变 Binding 事实 |

**Adapter fields 只能描述"如何选择本次 Ref"，不能描述"如何配置 Provider"。** 以下内容绝不允许进入 TUI 表单：codex 启动命令、git executable、MCP server JSON、credential secret、bwrap 原始 mount 参数、model/approval_policy 等 profile 内部项。

Provider 选择发生在 New Execution（`create_execution` 需要 `provider_id`，这是 Core 语义）；Composer 绑定在某个 Execution 的 Provider 上，不提供改 Provider 能力——想换 Provider 就走"Create Revised Execution"新建。

## 2. 三个界面职责

```text
右侧 Inspector（主界面）
= 摘要 + 缺失状态 + 进入 Composer 的入口

Binding Composer（独立 Screen，未 Dispatch 时）
= Add / Replace / Remove / Resolve Preview

Frozen Binding Detail（Dispatch 后，只读）
= 不可变事实（沿用现有 _show_details("binding")）
```

### 2.1 主界面 Inspector（`_inspector_text()` 补充）

对**未 Dispatch** 的选中 Execution，增加一段 Binding draft 摘要（Host 状态，来自 `controller.draft_for()` + `provider.input_limits()`，不读 Core 新字段）：

```text
E2 · NOT DISPATCHED
Provider: codex-tmux-interactive

BINDING DRAFT
Required  2/3 · Optional 1
Missing:  Terminal
[Compose Binding]   ← 底部动作已有，Inspector 只做状态提示
```

Dispatch 后维持现状（`Binding N frozen`），不显示 draft。

### 2.2 Binding Composer Screen（新增 `_BindingComposerScreen`）

```text
BINDING COMPOSER · E2
Responsibility: 实现多会话配置隔离  (超长省略)
Provider: codex-tmux-interactive

REQUIRED
Workspace      (1/1)
 ✓ commit 0b5689… · tree 06e8f0…      [Replace] [Remove]
Profile        (1/1)
 ✓ codex-plus · sha256:…               [Replace] [Remove]
Prompt Context (1/∞)
 ✓ H1-decision.md                      [Add another] [Replace] [Remove]
Terminal       (1/1)
 ✗ missing                             [Add Resource]

OPTIONAL
Continuation Session  (0/1)
 ✗ no adapter installed — CodexContinuationV1
tmux pane      (0/1)
 ✓ %2 · session … window … pane …      [Replace] [Remove]

[Back]  [Resolve Preview]  [Review Binding]   ← Review 在 min 全部满足且全部 resolved 后才可用
```

要求：

- 分组由 `provider.input_limits()` 决定：`min > 0` → REQUIRED，否则 OPTIONAL；
- 每行显示 `(当前数/min, max|∞)`；
- 每行基于已 resolve 的 `PreparedInput` 显示 requested/exact/assurance 摘要；未 resolve 显示 `✗` + 原因；
- `Add Resource` / `Add another`：按 Contract 添加（见 2.3）；
- `Replace`：用该 slot 的参数预填重新打开该 adapter 的表单，prepare 后原位替换；
- `Remove`：删除该 slot（同 contract 多 slot 按行删除单个）；
- 无 adapter 的 Contract 明确显示"no adapter installed — <contract_id>"，不静默跳过；若 REQUIRED 中某项无法装配，Review 不可用并提示"该 Provider 无法满足要求，请改用其他 Provider 或安装 adapter"；
- 所有操作只写本地 draft（`BindingDraftStore`），不触碰 Core；`Freeze & Launch` 由现有的 Review Screen 承担副作用。

### 2.3 Add Resource 流程

```text
点击某个 Contract 的 Add
  → 若该 contract 有多个 adapter：先选 adapter（列表）
  → 打开 adapter 的表单（复用 _Form 的字段渲染 / choices / refresh 机制）
  → 填写 selector 参数
  → adapter.prepare(parameters, execution_id=...)
  → 成功 → 追加成一个新 slot（PreparedInput 摘要展示在行内）
  → 失败 → 表单内报错，不新增 slot
  → 保存 draft（controller.save_draft）
```

复用已有机制：`FormField.kind=="select"` + `adapter.choices()` 即 Provider 自有的 picker（tmux pane picker、profile 列表已经存在）；P0 不升级为独立列表选择屏，入口仍是字段表单，pane/model 等富 picker 留 P1（见 §7）。

### 2.4 Resolve Preview 与 Review

- `Resolve Preview`：对当前 draft 的**所有** slot 重新调用 `prepare()`；按 slot 收集结果，单项失败只标红该项，不整体失败；全部成功才允许进入 `Review Binding`；
- `Review Binding`：沿用现有 `_BindingReviewScreen`（requested → exact → assurance），文案保持"candidates only; Core has not been changed"；
- `Freeze & Launch`：在副作用边界**重新** `prepare()` 所有 slot（沿用现有 `_confirm_launch` 语义），再走 `controller.dispatch()`；Core 仍会独立校验 input_limits 与 Contract 类型——Composer 只是 UX 门控，不是 authority。

## 3. 数据模型：不改 schema，复用现有 draft

`BindingDraft` / `BindingSlot(contract_id, adapter_id, parameters)` 已经支持同 contract 多 slot、任意 adapter 组合——正好承载"用户主动装入的 Ref 集合"。draft 只存 selector 参数（不存 prepared Ref，Ref 是候选投影，每次 resolve 重算），与现在一致。

- Composer 打开时：`controller.draft_for(execution_id, provider_id)` 读出已存 slots（按 contract 分组展示）；
- 每次 Add/Replace/Remove：`controller.draft_for` → 变更 slots → `controller.save_draft`；
- Dispatch 成功后现有逻辑 `drafts.delete(execution_id)` 清理，无需改动。

**不改** `drafts.py`、`adapters.py`、`model.py`、`render.py`：

- `adapters.py` 的 `ResourceInputAdapter`（fields/choices/prepare）已够用；
- `model.py` 只渲染 Core 冻结事实，draft 摘要属于 Host 状态，由 app/controller 计算，不进 view-model；
- 若某些 Contract 需要多于一个 adapter 实例并存，由 composer 按 slot 记录 adapter_id 支持，无需 adapter 加字段。

## 4. 文件级改动

### 4.1 `plugins/agent-box-workboard/src/agent_box_workboard/app.py`（主要改动）

1. 新增 `_BindingComposerScreen(ModalScreen)`：
   - 构造参数：`execution_id`、`provider_id`、`provider_descriptor`（或仅 id）、`limits`（来自 `provider.input_limits()`）、`adapters_by_contract`（仅 limits 内的 contract）、`initial_draft`、`controller`；
   - 内部维护 slot 列表 + 每 slot 的 `PreparedInput | None`；
   - 提供 `add_contract` → 子表单（复用 `_Form`）、`replace_slot`、`remove_slot`、`resolve_preview`、`review_binding`（dismiss 返回 `prepared`）；
   - 渲染 REQUIRED/OPTIONAL 分组与展开摘要（§2.2 格局），CJK 尺寸规则同 UI 精简文档。
2. 重写 `action_compose_binding`：不再调 `_present_composer`；改为
   - 捕获 `card.id` / `card.provider_id`（不依赖打开期间的 live selection）；
   - 计算 limits、group 已装 adapter、读 draft；
   - 若 limits 内**一个**可装配 adapter 都没有 → notify 列出全部 contract 并提示装 adapter / 换 provider，不打开空 Composer；
   - 否则 `push_screen(_BindingComposerScreen(...), self._composer_done)`；
3. 删除 `_present_composer()` 与 `_resolve_binding()`（连同 `_compose_adapters`、`_compose_parameters`、`_compose_field_ids`、`_choice_values`、`_choice_stale_fields` 状态），替换为 composer 内部状态；
4. `_confirm_launch`：改为从 `controller.draft_for(card.id, card.provider_id).slots` 重新 `prepare()`（按 `adapter_id` 查 `self.resource_adapters`）；保留 `card.id in self._prepared` 的进入方式，但 `_prepared` 的来源改为 composer 的 Review 返回值；
5. `_inspector_text()`：未 Dispatch 时追加 Binding draft 摘要（required 满足数、optional 数、缺失列表），见 §2.1；
6. `_create_execution`：成功后自动选中新 Execution，并在存在可装配 adapter 时自动打开 Binding Composer（新用户主路径 `New Execution → 自动进入 Composer`）；无 adapter 则仅选中并 notify；
7. `_show_details("binding")` / `_detail_text()`：Dispatch 后的只读 frozen facts 保持现状；未 Dispatch 时 Binding 详情页显示 draft 摘要 + "Open Binding Composer"入口文案（可点击动作仍走底部 Compose Binding）。

### 4.2 `plugins/agent-box-workboard/tests/test_app.py`（新增/更新）

- Composer 打开：required/optional 分组正确、无 adapter contract 显示标记；
- Add：填字段→prepare→slot 增加；prepare 抛错→slot 不增加且显示错误；
- Replace / Remove：slot 原位替换 / 删除；Remove 后 required 缺失 → Review 不可用；
- 多 slot：`PromptFragmentV1` 添加 2 个输入，`(1, None)` 上限不被误判；
- min/max 门控：`Review Binding` 在 required 未满足时不可用；
- stale choice：沿用 `_Form` refresh 机制回归；
- 现有 CJK 三尺寸（100×35 / 120×35 / 150×42）与 pilot 测试保持通过。

不改其他文件；不触碰 `src/agent_box/` 任何模块。

## 5. 不改动清单（防回归）

- `src/agent_box/work_core/`（services / repository / events / registry / projection / models）；
- `src/agent_box/migrations/005_*`（及之前 migration）；
- `plugins/agent-box-preview-resources/`、`plugins/agent-box-tmux/`、`plugins/agent-box-codex/`（本轮无协议改动；如有 picker 升级属 P1）；
- `drafts.py` / `adapters.py` / `model.py` / `render.py`；
- 桌面端、Web UI、watch/control 双模式。

## 6. 验收条件

1. **边界第一**：Composer 中不存在任何"配置 Provider"级字段；TUI 只呈现本次选择项（对照 §1 表格逐项检查）。
2. 未 Dispatch 的 Execution 在 Inspector 与 Binding 详情页能看到 draft 摘要与缺失项，并能进入 Composer。
3. Composer 按 REQUIRED/OPTIONAL 分组展示 provider 的 `input_limits()`；同 contract 多输入可用（≥2 个 PromptFragment）。
4. Add / Replace / Remove 全部可用；Remove 导致 required 缺失时 Review 被禁用。
5. 无 adapter 的 contract 明确显示"no adapter installed"；若有 REQUIRED 无法装配，给出换 Provider / 装 adapter 的明确提示，不允许假装可装配。
6. Resolve Preview 单 slot 失败只标红该项；全部 resolved 且 min 满足才可 Review。
7. Freeze & Launch 在副作用边界重新 `prepare()`，Core 独立校验 input_limits 与 Contract 类型（Composer 不是 authority）。
8. Frozen Binding Detail 只读，与本地 draft 明显区分。
9. 新增测试全部通过；现有 workboard 测试与 CJK 三尺寸回归通过；Core 测试零改动零失败。
10. 真实路径走通：`New Execution → 自动进入 Composer → Add/Replace/Remove → Resolve Preview → Review → Freeze & Launch → Codex 在 tmux pane 启动`。

## 7. P1（本轮不做，仅记录方向）

- Provider-owned 富 picker（tmux pane / git ref / artifact file 列表选择屏）；当前 `choices()` 字段表单已满足 P0；
- 多 adapter 同 contract 时的选择列表（P0 只处理 1:1，若出现多个直接列出单选）；
- Continuation Session 的 adapter（绑定已有 Codex SessionRef）——由 codex 插件贡献，不属 WorkBoard。

## 8. 实施顺序

1. `_BindingComposerScreen` 骨架 + `action_compose_binding` 接线（先不动 Inspector）；
2. Add / Replace / Remove + draft 持久化；
3. Resolve Preview 与 Review 门控（min/max）；
4. Inspector / Binding 详情页 draft 摘要；New Execution 自动进入 Composer；
5. 测试补齐（§4.2）＋真实 Work 三尺寸验证；
6. 汇报改动文件、真实截图、测试结果与剩余限制。

## 9. 给实施会话的提示词

```text
请严格按照 docs/product/WORKBOARD_BINDING_COMPOSER_DESIGN.md 实施 WorkBoard Binding Composer。

要求：
1. 先检查当前 Git 状态（分支 spike/real-governed-binding，大量未提交改动来自其他会话，只增改不覆盖，不提交不清理）；
2. 只修改 plugins/agent-box-workboard（app.py 与 tests/）；
3. 不修改 Work Core、migration、Provider Core protocol、Resource Contract ontology、drafts.py、adapters.py、model.py、render.py；
4. 不引入桌面端 / Web UI / workflow 语义；不做 P1 富 picker；
5. 严格遵守设计文档 §1 三层边界：TUI 只提供"本次选择项"，绝不把 Provider 配置项暴露成表单字段；
6. 完成真实 Work 渲染及 100×35 / 120×35 / 150×42 的 CJK 尺寸验证；
7. 运行 WorkBoard 测试和相关回归测试（Core 测试应零改动零失败）；
8. 最后汇报：改动文件、真实截图、测试结果、验收条件逐项核对、仍存在的限制。

直接实施，不要重新发散设计或重构 Core。
```
