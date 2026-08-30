# WorkBoard：统一观察 + 控制 TUI 设计
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

**状态：** implementation-ready design

**日期：** 2026-08-26

**范围：** `agent-box-workboard` Host/UI plugin；不改变 Work Core ontology。
**研究方法：** 先核对 2026-08-26 工作树与源码，再查阅下列项目的官方文档、官方 GitHub
源码/README。外部工具只用于提炼「持续观察当前对象 + 对选中对象受约束地操作」的交互，
不作 Agent/workflow 产品竞品比较。

## Executive verdict

应该采用一个统一的 WorkBoardApp，优于 `watch` / `control` 两个模式。观察是常驻背景
能力；控制是对当前选中 Work 或 Execution 的显式、状态受限动作。切换模式会使用户丢失
正在观察的事实、重复定位对象，并暗示一个不存在的「控制状态机」。统一界面应保持一个
稳定的历史选择，随 Core 新事实增量更新，在底部和命令面板仅暴露当前合法动作。

WorkBoard 的核心交互模型是：

```text
事实 chronicle（Core 查询，持续刷新）
        +
稳定 selection（Work 或已发生的 Execution）
        +
上下文 action descriptors（Host 计算，显式触发）
        +
本地 Binding draft（Dispatch 前可改，非事实）
        = 一个 Work 的 Host Console
```

它不是 workflow builder：没有未来 DAG、Node、下一步推荐或自动推进。它也不是
Work progression authority：Provider terminal 不完成 Work，Human 的明确 `Complete Work`
才调用 `WorkService.complete_work()`。

**结论：可做到零 Work Core 修改。** 现有 `WorkService`、`ExecutionService`、
`CoreRepository`、`ExtensionRegistry`、Resource/Execution Providers 足以表达 Work、一次
Execution、原子 frozen inputs + requested Dispatch、accepted/failed Dispatch、Refs、
observations/evidence 和人工 Work completion。缺的是 Host 的表单、draft、操作编排以及
provider-owned recovery/finish adapter，均应位于 WorkBoard 与插件，不是 Core ontology。

## 当前 WorkBoard assessment

本节是基于当前工作树的实际检查，而非题述推断。检查时 Git 分支为
`spike/real-governed-binding`，工作树已有大量用户未提交改动（含 `plugins/`、
`docs/`、`work_core/`）；本设计不覆盖或修改这些改动。

| 现状 | 代码证据 | 结论 |
|---|---|---|
| 单 Work、0.5 秒轮询、全量查询 | `app.py:refresh_board()` | 合适的观察基础；读取失败保留旧 model 并标记 stale。 |
| 索引 selection / 展开状态 | `selected_index`、`expanded_ids` | 刷新不会丢索引，但当历史插入/重排时应以 `execution_id` 而非 index 锚定。 |
| 卡片历史 | `model.py:_card()`、`render.py:render_snapshot()` | 已展示 lifecycle、intent、phase/outcome、Dispatch、frozen inputs、native/output refs、evidence 计数。 |
| 只读定位明确 | `README.md` 与 `app.py` class docstring | 当前没有 Work/Execution 服务、registry、draft 或 Provider 控制入口。 |
| attach 只是通知命令 | `action_show_attach()` | 不会 suspend/restore TUI，也不调用 Provider；仅 tmux metadata 的 best-effort 推断。 |
| CLI 只有 `watch` | `cli.py` | 应迁移到统一入口，不新增 `control` 子命令。可在 P0 暂时保留 `watch` 作兼容 alias。 |
| dispatch 时序 | `ExecutionService.dispatch_execution()` | 先同事务写 frozen INPUT + `requested` Dispatch；再 resolve、`provider.start()`；成功后写 accepted，异常写 Dispatch failed。UI 必须如实显示这个危险窗口。 |
| Codex/tmux 的 finish / handle | `agent_box_codex/tmux_provider.py` | `finish()`、`observe()` 存在，但 handle 仅内存；跨 WorkBoard 重启的 reconstruct 仍在 `scripts/preview_demo/recover_investigation_control.py`。这是产品入口的主要缺口。 |
| Core 当前 recovery contract | `registry.py` 仅有 `start/observe`；ADR-0002/3/4 有更强的 proposed/semantic-frozen 设计 | 不把 ADR 当作已实现 API。P0 只能对已 accepted、已有冻结 Ref/本地证据的 tmux/Codex path 做 provider-owned reconstruct；不可伪称通用 durable recovery。 |

另一个重要边界：`responsibility_intent` 在当前 Core 中是 `ExecutionCreated` event 的不可变
事实，`ExecutionService` 没有 update API。因此「已创建但未 Dispatch 的 Execution 编辑
责任」不能被 UI 假造。Flow A 的 Create modal 在提交前可编辑；创建后动作应命名为
**Create revised Execution**（保留旧 E 的历史），而不是 Edit Responsibility。这样既不需要
Core 修改，也不制造可被误解的事实。

## Comparable observe-and-control tools

| 工具（当前来源） | 具体相关交互 | 借鉴 | 不照搬 |
|---|---|---|---|
| [k9s Commands](https://k9scli.io/topics/commands/) / [Hotkeys](https://k9scli.io/topics/hotkeys/) | 常驻 resource view；`:` 进入资源/命令定位，`?` 展示助记帮助；可配置 readonly，readonly 会禁用变更命令。 | 选择对象后动作受资源、权限、状态限制；显式 readonly 是「观察仍在，控制被禁」的安全降级；命令模式帮助发现。 | 不把 Work 映射成 Kubernetes resource universe，也不提供泛化 delete/scale 等对象操作。WorkBoard 只针对一个 Work，不需要集群导航。 |
| [Lazydocker README](https://github.com/jesseduffield/lazydocker) / [keybindings](https://github.com/jesseduffield/lazydocker/blob/master/docs/keybindings/Keybindings_en.md) | 实时容器/服务状态旁直接有 logs、attach、shell、pause/stop/restart；按 panel/selection 作用。 | ACTIVE E 的 Attach / Observe / Finish 应自然出现在选中卡片 action bar；把 attach 看成到真实外部 runtime 的 handoff，而非 TUI 内嵌终端。 | 不采用一键 restart。Agent-Box 一次 E 只能一个 Dispatch；重跑/continuation 必须新 E，不能把 restart 伪装为同一 E。 |
| [Lazygit keybindings](https://github.com/jesseduffield/lazygit/blob/master/docs/keybindings/Keybindings_en.md) / [custom command menus](https://github.com/jesseduffield/lazygit/blob/master/docs/Custom_Command_Keybindings.md) | 后台 refresh，不离开 selected panel；`?` 可发现键；危险 git 动作经过 options/confirmation；低频命令放 menu，menu 内键仅局部唯一。 | 固定少量高频键（新建、palette、refresh、attach、finish），其余在 Actions/palette；confirmation 文案显示精确对象与影响。 | 不把用户 shell command 或任意 plugin command 直接暴露给 WorkBoard；只接受 typed、状态受限 descriptor。 |
| [gh-dash keybindings](https://www.gh-dash.dev/getting-started/keybindings/) / [preview pane](https://www.gh-dash.dev/getting-started/keybindings/preview/) | selected work item 与可切换、可滚动的 preview pane 分离；global、selected-item、selected-PR/Issue actions 分层。 | 主历史不塞满 Ref/Evidence；右侧/底部 detail drawer 依 selection 展示 Binding、native、outputs、evidence，且可切换位置。 | 不需要多 section inbox 或 GitHub issue/PR 分类；一个 Work 的 chronology 才是主轴。 |
| [btop README](https://github.com/aristocratos/btop) | 高频刷新、稳定进程选择、选中对象 detail、filter，且允许 pause list 与发送 signal。 | Refresh 不能抢焦点；局部「冻结视图」用于审阅长 evidence，而 background Core observation 仍可继续；危险操作需对象名确认。 | 不提供 arbitrary signal/kill；Finish 是 provider protocol，不是进程 signal。 |
| [Vibe Kanban monitoring source](https://github.com/BloopAI/vibe-kanban/blob/main/docs/core-features/monitoring-task-execution.mdx) | task attempt 的实时日志、状态及交互控制在同一 task surface。 | agent execution 的实时观察与人工交互可以同屏，不应因某一 turn idle 而终结长期责任窗口。 | 不引入看板、自动 setup/worktree orchestration、task retry 或完整 agent product。 |
| [Textual command palette](https://textual.textualize.io/guide/command_palette/) / [Workers](https://textual.textualize.io/guide/workers/) | 内建 `Ctrl+P` fuzzy palette；screen-specific commands；Workers 保持 UI 响应，`exclusive=True` 防止旧结果覆盖新结果。 | 直接采用 palette 的 discover/search、ModalScreen、message + worker；操作 completion 回到 selection 的真实 snapshot。 | palette 不应成为绕开确认、权限、状态校验的后门；它只列出 descriptor 允许的 action。 |

最值得借鉴的三个真实工具是 **k9s（readonly 降级与对象上下文动作）**、
**Lazydocker（观察旁 attach/log/control）**、**Lazygit（低频动作菜单、确认和键位层级）**。
Textual 是实现层的直接能力来源而非产品交互蓝本。

## Interaction pattern synthesis

1. **事实刷新与交互状态分离。** Core snapshot 可替换，selection 必须以 stable ID 保存；
   modal 打开、输入编辑、detail scroll 时不由轮询重建 widget。新 E 出现只显示 `+1 new
   Execution`，不自动移动焦点。
2. **动作是查询结果，不是全局按钮。** `available_actions(selection, snapshot, registry,
   host_capabilities)` 每次计算；不可用动作不抢占 action bar，可在 palette 搜索时显示 disabled
   reason。
3. **两层 discoverability。** Footer/action bar 只放 4–6 个当前高频动作；`Ctrl+P` 搜索所有
   allowed action；`?` 打开上下文 help。新手可点、读 action bar、选 palette；熟练用户用键。
4. **确认分级。** 无副作用（Observe、view、preview）无确认；创建 E、freeze/launch、finish、
   complete/reopen 均 review/confirm。确认页必须含 Work/E id、frozen digest/refs 或 closure
   reason；对 `Complete Work` 要求输入理由，对 Finish 要求明确 `FINISH` 或 focused confirm。
5. **长操作是 Host 临时操作状态，真实结果回读 Core。** worker 显示步骤、cancelability、error；
   worker 后立即 refresh，不乐观改卡片。失败保留已写 Core facts，绝不显示「已回滚」除非有
   provider evidence。
6. **attach 是离开与返回。** 显示执行的 provider-owned attach command；确认后
   `App.suspend()`/subprocess attach，返回时强制 refresh。若无 TTY 或 attach 失败，显示可复制
   command 和保持 WorkBoard。
7. **历史优先。** terminal 卡不消失；没有下一步占位、依赖边或预生成 E。Continuation 始终由
   New Execution 带入 previous `SessionRef` draft，而不是 Resume Old Execution。

## Recommended unified WorkBoard model

### 信息架构

主 Screen 始终是单 Work console：

* header：objective、lifecycle、Work ID、连接/刷新状态、ACTIVE count；
* center：按创建时间的已发生 Execution cards（terminal 留存，ACTIVE 高亮）；
* detail drawer：选中对象的 Summary / Binding / Native & Outputs / Evidence tabs；
* bottom action bar：selection 上 4–6 个 allowed actions，`Actions…` 打开完整列表；
* transient overlays：form、binding review、confirmation、progress、error drawer。

窄终端时 detail drawer 改为 modal/tab；历史永远优先。选择模型为
`Selection(kind="work" | "execution", id=...)`，初始选 Work；`selected_execution_id` 不存在时
回退 Work（不使用 index）。

### Keyboard and command palette

| 按键 | 行为 |
|---|---|
| `j/k`、上下 | 在 Work header 与 history card 之间移动 selection；不改变观察。 |
| `Enter` | 打开当前 selection 的默认 detail（Work summary 或 E summary）。 |
| `Tab` | 切换主 history / detail drawer / action bar；modal 内不穿透。 |
| `Ctrl+P` | Textual command palette；只列当前 selection 的 allowed actions + safe global actions。 |
| `a` | 当前 ACTIVE E 的 Attach（不存在则在 footer 显示 disabled reason）。 |
| `o` / `r` | Observe selected E / refresh Core snapshot；`r` 永远只读。 |
| `n` | Work selected 时 New Execution；terminal E selected 时 New/Continuation chooser。 |
| `f` | 仅 ACTIVE E 的 Finish，先开 confirmation。 |
| `b`, `e`, `v` | Binding、Evidence、Outputs detail tab。 |
| `?` | 根据 selection 生成的 action/help sheet。 |
| `Esc` | cancel modal/return drawer，不终止 execution。 |

`Complete Work`、`Reopen Work`、`Freeze & Launch` 不给裸单键，只从 action bar/palette 的明确
命名项进入确认。动作 text 不使用模糊的「Run」「Done」「Resume」。

### Contextual action model

| Selection / Core facts | 显示 actions |
|---|---|
| Work open | New Execution；Work Evidence；Refresh；Complete Work。 |
| Work completed / abandoned | Work Evidence；Refresh；Reopen Work（原因确认）；不可创建 E。 |
| 未 dispatch E | View responsibility；Compose Binding；Resolve Preview；Binding review；Freeze & Launch（draft ready）；Create revised Execution。 |
| requested/failed Dispatch E（frozen） | View frozen Binding / dispatch error；Observe；不允许编辑/重新 freeze；根据 provider proof 显示 Recover existing dispatch，否则 Create next E。 |
| accepted ACTIVE E | Attach（provider supports）；Observe；Finish Execution；View Session/Native；Evidence。 |
| accepted E，projection unknown/unreachable | Observe；Recover existing dispatch（adapter supports and has evidence）；View facts；Create next E only as an explicit new responsibility—not blind redispatch。 |
| terminal E | View Outputs；View Evidence；New Execution；Create continuation draft（若 provider output/native SessionRef 可满足 continuation contract）；不能 reopen。 |

`action_id` 应是 namespaced string（如 `core.work.complete`、`host.binding.compose`、
`provider.codex-tmux.finish`），而非显示文案。每项含 `scope_id`、标题、快捷提示、risk
(`safe | material | terminal | work-lifecycle`)、disabled reason、confirmation factory、worker
factory。action service 在真正调用前再次读取 Core 并校验 preconditions，防止 refresh 与点击
之间的 TOCTOU。

## Binding Composer design

### Draft persistence design

未冻结 Binding 是 WorkBoard Host 的本地草稿：

```json
{
  "schema_version": 1,
  "execution_id": "exec_…",
  "provider_id_at_create": "codex-tmux-interactive",
  "updated_at": "2026-08-26T…Z",
  "slots": [
    {"contract_id": "agent-box.workspace@1", "resource_provider": "git-worktree",
     "adapter_id": "agent-box.git-worktree@1", "parameters": {"repo": "/repo", "selector": "HEAD"}},
    {"contract_id": "agent-box.prompt-fragment@1", "resource_provider": "artifact-file",
     "adapter_id": "agent-box.artifact-file@1", "parameters": {"path": "/input.md", "title": "responsibility"}}
  ]
}
```

不保存 final Ref 作为事实；preview result 可缓存为 `candidate_ref`、`resolved_at`、adapter
version，但必须标注 **candidate / stale if inputs changed**。Draft 写到
`$AGENT_BOX_HOME/plugins/workboard/drafts/<execution-id>.json`，atomic replace、`0600`、
schema/ID 校验、每 E 一个文件。它不写 Core event、不出现 evidence/history、不参与 digest。
启动时仅当 E 未 dispatch、provider ID 相同才恢复；一旦 Core 有 Dispatch，UI 只读 Core
`list_input_refs()` 和 `inputs_digest`，draft 改名为 cache / 删除均不影响事实。

Binding Composer 按 ExecutionProvider `input_limits()` 显示 slots（required/optional、数量、
已选数），每项展示：

```text
Requested selector → candidate exact Ref → validation / assurance → readiness
HEAD               → commit 4ba… tree 17c…  → resolved now              ready
codex-plus         → profile digest sha256… → frozen config checked     ready
%2                 → socket/server/session/window/pane → live identity  ready
```

`Resolve Preview` 仅运行 adapter `prepare()`，不会写 Core、不会 materialize workspace 或启动
Harness。`Freeze & Launch` 在 review 中重新 prepare 所有 slot（不能信任旧 cache），展示 exact
Refs 与预测 digest；用户确认后将这组 `(contract_id, Ref)` 一次性交给
`ExecutionService.dispatch_execution()`。Core 的 transaction 写入 inputs + requested Dispatch；
之后才 resolve 并调用 provider start；accepted 只在 start 返回后记录。这决定 progress overlay
必须如实显示而不能说「accepted」过早。

### 默认 P0 adapter 的 preview

| Contract | Requested input | Provider-owned candidate exact Ref | Preview assurance |
|---|---|---|---|
| `agent-box.workspace@1` | Git repository path + selector | `GitWorktreeResourceProvider.make_ref(selector, materialization_key)` 的 commit + tree、repo URI | `rev-parse` 成功；明确「launch 才 materialize worktree」。 |
| `agent-box.prompt-fragment@1` | file path + title | `ArtifactPromptResourceProvider.make_ref()` 的 SHA-256 | 文件可读，digest 显示。 |
| `agent-box.profile@1` | profile name | `AgentBoxProfileResourceProvider.make_ref()` 的 agent type + digest | profile 存在；digest 是 non-secret launch-relevant config snapshot。 |
| `agent-box-tmux.pane@1` | exact `%N` + optional socket + replacement policy | `TmuxConsoleResourceProvider.make_existing_pane_ref()` 的 socket/server/session/window/pane identity | 可访问、精确 identity；process/pid/path 是 snapshot，launch 会重检 idle-shell policy。 |

`%2` 是 selector，不是 frozen identity；不能让用户手填 session name 来冒充 exact pane。若 pane
process 已变化，preview/re-resolve 必须显示 drift/block，不能偷偷换 pane。

## Resource plugin contribution design

### 选择：小型 WorkBoard entry-point adapter

采用独立 entry point group **`agent_box.workboard_resource_inputs`**，不扩展
`PluginRegistration`，也不把 UI schema 写进 Core。每个 entry point 返回一个小、无副作用的
factory；WorkBoard 用当前 registry、host paths、execution/provider input limits 构造 adapter。

```python
class ResourceInputAdapter(Protocol):
    descriptor: ResourceInputDescriptor  # id, resource_provider_id, contract_id, title
    def form(self) -> FormSpec: ...       # bounded fields: text/select/path, validation hints
    def prepare(self, parameters: Mapping[str, str], context: PrepareContext) -> PreparedInput: ...
    # PreparedInput(contract_id, ref, requested_summary, exact_summary, assurance, warnings)
```

`prepare` 必须调用 owning ResourceProvider 的 public `make_ref` / selector API；不能由
WorkBoard 自行 `git rev-parse`、digest 文件或编造 tmux Ref。`FormSpec` 是很小的 declarative
field set（P0: text, path, select, choice, optional），而非 provider-owned arbitrary Textual
widget、任意 Python callback 或巨大 JSON-schema UI framework。第一个有特殊 UI 的 provider
可在以后添加 `presenter_id`，但 P0 不预埋。

entry point discovery 出错时隔离该 adapter，仍可观察已有 frozen Ref；缺 adapter 时显示
`No composer for <contract>; frozen facts remain viewable`，不影响 WorkBoard。第三方 adapter
只能贡献 provider/contract 自己的候选 Ref；`ExecutionService` 仍做 contract、limits、
ResourceProvider.resolve 和 type validation 的最终治理。

**比较并否决：**

* 把 `prepare_ref(contract_id, parameters)` 加进 `ResourceProvider`：会把 Host selector/UI
  concerns 强加给所有 headless provider，且现有 make_ref 参数并不统一；否决。
* 巨大 JSON Schema / provider-owned Textual form：灵活但一天内无法审计、版本化和测试；否决。
* 在 WorkBoard 写 Git/tmux/Codex `if provider_id`：P0 很快但不可扩展、侵蚀 authority；否决。
* 独立 adapter entry point：只多一个稳定小协议，插件仍拥有实际 selector→Ref authority；采用。

`git-worktree`、`artifact-file`、`agent-box-profile` 当前是 in-tree providers 而非插件。
P0 由 WorkBoard 自己发行同一 adapter package，并通过明确 Host configuration 构造其 provider
instances；tmux/codex distributions 则各注册其 adapter entry point。长期可把 in-tree provider
的 adapter 移到各自的 distribution，但不改变 Core。

## ExecutionProvider control and recovery design

另设 entry point group **`agent_box.workboard_execution_controls`**。它以
`provider_id` 匹配，不修改 `ExecutionProvider` Core protocol：

```python
class ExecutionControlAdapter(Protocol):
    provider_id: str
    def actions(self, facts: ExecutionFacts) -> Iterable[HostAction]: ...
    def observe_existing(self, facts: ExecutionFacts) -> NormalizedObservation: ...
    def attach(self, facts: ExecutionFacts) -> AttachTarget: ...
    def recover(self, facts: ExecutionFacts) -> RecoveredHandle: ...
    def finish(self, facts: ExecutionFacts, handle: RecoveredHandle | None) -> NormalizedObservation: ...
```

`ExecutionFacts` 从 repository 读取 E、one Dispatch、frozen inputs、native/output refs 和
provider-owned evidence locators；adapter 不得到 mutable draft。`NormalizedObservation` 交给
`ExecutionService.apply_observation()`，因此 native refs、outputs、resource states 与 terminal
仍由公开 service 写入。adapter 不直接 SQL、更不直接改 projection/Dispatch。

P0 为 `codex-tmux-interactive` 实现 adapter，并把
`recover_investigation_control.py` 的 handle reconstruction 移入 `agent_box_codex`：

1. 要求已有 **accepted** Dispatch、非 terminal E、精确 frozen tmux input；
2. 从 frozen Ref 校验/定位同一 pane，从 provider evidence root 读取 session-start marker，
   重建 `CodexTmuxHandle`；不调用 `start()`，不产生 D2；
3. profile drift 只作为 `resource_state` 观察（frozen profile digest 仍权威），recovery 不把
   当前 profile 重新投影成启动事实；
4. `observe` / `finish` 通过该 handle 调 provider，再用 service 持久化 returned facts；
5. missing marker 或 pane identity/process safety failure 返回 `unrecoverable`，保留真实 facts，
   不可 blind redispatch；Human 可新建 E。

P0 同时为 tmux resource adapter 贡献 AttachTarget。App Server provider 没有 durable cross-process
handle/recover 实现，P0 必须显示 `Recovery unavailable: provider has no persisted locator`，不能
从 thread ID 猜测重连。未来 provider 可声明自己的 adapter；这正是 recovery 属于 provider、
不是 Core 的原因。

## Detailed interaction flows

### A — Create current next Execution

1. Work open，用户选 Work，`n` 或 `New Execution`。
2. modal 显示 objective、multiline responsibility、已安装 accountable ExecutionProvider picker
   （descriptor display name + input contract summary）。
3. Create 前可修改；Confirm 后 worker 调 `ExecutionService.create_execution()`，立即 refresh，
   保持 Work selection 并 toast `E<n> created`，不生成未来 E。
4. 创建成功后 intent 不再可编辑；要改责任，Create revised Execution，并可在 modal prefill。

### B — Compose Binding

1. 选未 dispatch E → Compose Binding，加载或新建 local draft。
2. 根据 selected provider `input_limits()` 显示 required slots。用户选择 repo + `HEAD`、
   `codex-plus`、responsibility artifact、exact `%2`。
3. 每次 explicit Resolve Preview 在 worker 调各 ResourceInputAdapter.prepare；显示 requested →
   exact identity → assurance/validation。失败保留 draft parameters 和上一次候选，但标为 stale。
4. review 只有全部 cardinality 合格、候选 fresh 时启用 Freeze & Launch。

### C — Freeze & Launch (Launch flow)

1. review modal 重跑 prepare，显示每个 exact Ref 和 candidate digest；用户确认。
2. progress：`preparing exact refs` → `freezing inputs + requested dispatch (Core transaction)` →
   `resolving frozen refs` → `calling <provider>.start` → `recording accepted` → `observing`。
3. service 成功后 refresh；accepted/ACTIVE 以 Core read-back 为准。provider start 后
   `record_dispatch_accepted` 写入前失败时显示「native launch may have occurred; accepted not
   proven」，禁止同 E 再 launch，提供 Recover existing dispatch（若 adapter 能证明）或 New E。

### D — Interactive Execution (Observe / attach flow)

ACTIVE card 保持高亮；Attach 显示 attach target，suspend WorkBoard 到真实 tmux，退出后恢复同一
selection、强制 Observe。CLI idle/一轮 Codex 回复不变 terminal。detail 可查看 SessionRef、turn
RunRefs、输入 digest 与 resource observations。

### E — Finish / finalization flow

Finish modal 指明「将提交责任窗口；不是自动 Work completion」，需确认。UI 的 `FINALIZING`
是本地 Host operation state（可持有 until worker completes），不是 Core projection。worker:
provider finish → capture outputs / native facts → `apply_observation` → read back。partial failure
显示具体已持久化的 refs/projection；若 provider 已 capture、Core evidence persistence 失败，
显示 `FINALIZING: provider result obtained; Core persistence incomplete`，允许安全的 provider
recover/reconcile，不标 terminal until Core observation succeeds。

### F — Recovery flow

App restart 读取 existing E/D/frozen inputs/NativeRefs，**不会自动调用任何 provider**。ACTIVE/
unreachable card 出现 Observe 和（adapter proof 足够时）Recover existing dispatch。Recover 使用
旧 D 和 immutable inputs，成功后显示 `recovered observation at …`；没有 New Dispatch，不能把
recovery 写成 continuation。不能 recovery 时保留 `unknown/unreachable`，Human 决定等待证据或
create new E。

### G — Next step

terminal E detail 显示 outputs/evidence 和 `New Execution`。若选择 continuation，composer
预填前 E 的 provider-owned SessionRef 与 continuation contract，仍需责任、provider、Binding
review、Freeze & Launch。无 `Resume Old Execution`，不显示未来图。

## Failure UX

| 场景 | UI / 已发生事实 | 允许与禁止 |
|---|---|---|
| migration 未应用，freeze transaction 失败 | `Freeze failed before Dispatch accepted`，显示 migration/SQLite error；没有 frozen inputs/Dispatch 则 draft 仍可改。 | 修复 DB 后可重试同一 draft；不显示 launch。若 transaction 实际成功则 read-back 会切换到 frozen 状态。 |
| accepted 后 Provider 已启动、evidence persistence 失败 | 明示两列：`Dispatch accepted`（事实）与 `evidence persistence failed`（未完成）；保留 ACTIVE/unknown 最后真实 projection。 | 禁止再 launch；允许 Observe/Recover existing；不能自动把 E 成功/失败。 |
| WorkBoard 退出、Harness 仍运行 | 下次读 E/D/frozen/native facts，卡片可能 stale/unknown。 | P0 Codex tmux 可 Recover existing；其他 provider 仅 Observe if supported；不创建第二 Dispatch。 |
| launch 后 Profile runtime drift | frozen ProfileRef/digest 保持事实；detail 显示 current authority recheck drift。 | 可 Observe/Finish；不能重新 resolve 当前 profile 并冒充启动输入；下一 E 才可选新 profile。 |
| provider recovery 重解 mutable profile | 显示 `recovery blocked/limited: frozen profile differs`; frozen digest 不被替换。 | 仅不依赖重投影的 recovery/attach；不得用新 profile launch/finish。 |
| pane identity 可找回但 pane process 已变化 | 显示 frozen coordinates match + live process differs / idle-policy failed。 | Attach/Observe 可由 adapter 返回真实状态；不 `respawn-pane` 或 Finish 猜测；需要新 E 或人工处理。 |
| output artifact 缺失 | terminal/finish observation 与 `output missing` 分别显示；Ref 不存在不能伪造。 | 可 View evidence / provider reconcile；若责任需要再做，New E。 |
| Finish 部分成功 | progress checklist 标捕获、native refs、output persist、projection persist 的 success/failure。 | 只重试 provider-defined idempotent reconciliation；不盲目再次 finish / new dispatch。 |
| refresh SQLite locked | header `STALE • last good snapshot at … • retrying`，当前 selection/detail 保留。 | read-only actions可稍后重试；mutation action preflight 再读，不能基于 stale model提交。 |
| external Provider unreachable | card `UNREACHABLE (last observed …)`，error drawer 含 adapter/provider context。 | Attach 若本地 target可用；Observe/Recover 可显式重试；不可推断 terminal 或 auto retry start。 |

## ASCII wireframes

### 默认 Work history

```text
┌ WORK  OPEN · 3 executions · 1 ACTIVE · refreshed 0.5s ago ────────────┐
│ Objective  Prepare the current investigation                           │
│ Work work_a1…                                  [New E] [Complete…]    │
├ HISTORY (facts already occurred) ─────────────────────────────────────┤
│   E1  ✓ TERMINAL/SUCCEEDED  investigate scope       10:12              │
│ ▶ E2  ● ACTIVE              implement adapter         observed now     │
│   E3  × TERMINAL/FAILED     review evidence           10:44            │
├ Selected E2 ─ Summary ────────────────────────────────────────────────┤
│ provider codex-tmux-interactive · Dispatch accepted · inputs sha256…  │
│ Session thread… · 4 frozen refs · 2 evidence refs                      │
├ Actions: [Attach a] [Observe o] [Finish… f] [Evidence e] [Actions…] ─┤
│ Ctrl+P commands · ? help · r refresh · terminal facts are retained    │
└───────────────────────────────────────────────────────────────────────┘
```

### Binding Composer

```text
┌ Compose Binding — E4 / codex-tmux-interactive ───────────────────────┐
│ required: workspace 1/1 · prompt 1+ · profile 1/1 · tmux pane 1/1    │
│ Workspace  repo /target        selector HEAD        [Resolve]         │
│   requested HEAD → commit 4ba1… tree 17c2…          ✓ exact now       │
│ Prompt     /inputs/resp.md     digest sha256:91…     ✓ readable        │
│ Profile    codex-plus          digest sha256:52…     ✓ config frozen   │
│ tmux pane  %2 / socket …       session $1/window @0  ✓ identity exact  │
│                                                                      │
│ Draft local only · never frozen · changed 12:04                      │
│ [Save draft] [Resolve Preview] [Review Freeze & Launch] [Cancel]      │
└──────────────────────────────────────────────────────────────────────┘
```

### ACTIVE / attach

```text
┌ E4 ● ACTIVE — codex-tmux-interactive ─────────────────────────────────┐
│ Dispatch accepted d_… · frozen inputs sha256:… · observed 3s ago      │
│ Native: tmux pane %2; Codex Session sess_…                             │
│ Runtime: reachable · current command codex · responsibility not sent   │
│ [Attach a] [Observe o] [Finish… f] [Native refs] [Evidence]            │
│ Attach opens: tmux -S /… attach -t demo; returns here on detach         │
└───────────────────────────────────────────────────────────────────────┘
```

### Finalizing (UI only)

```text
┌ Finish E4 — FINALIZING (Host operation, not Core phase) ──────────────┐
│ ✓ explicit submission accepted by provider                             │
│ ✓ captured tmux scrollback artifact                                    │
│ … persist output refs and terminal observation                         │
│ Core card remains ACTIVE until read-back confirms terminal. [Details]  │
└───────────────────────────────────────────────────────────────────────┘
```

### recovery / error

```text
┌ E4 ? UNREACHABLE — last fact 12:21:07 ────────────────────────────────┐
│ accepted Dispatch d_…; frozen pane tmux://…/%2; session marker found  │
│ WorkBoard restarted. No new Dispatch has been created.                 │
│ [Recover existing dispatch…] [Observe] [View frozen binding]          │
│ If recovery cannot prove same native execution: create a new E only.  │
└───────────────────────────────────────────────────────────────────────┘
```

## Exact component design

| Kind | Proposed names / responsibility |
|---|---|
| Screen | `WorkBoardScreen` is the one persistent screen; `BindingComposerScreen`, `ExecutionDetailScreen` only responsive variants, not workflows. |
| Widgets | `WorkHeader`, `ExecutionHistory`, `ExecutionCard`, `DetailDrawer`, `ContextActionBar`, `RefreshStatus`, `OperationProgress`, `FrozenBindingView`, `EvidenceView`. Cards keyed by E ID. |
| Modals | `NewExecutionModal`, `BindingComposerModal`, `BindingReviewModal`, `ConfirmActionModal`, `WorkLifecycleModal`, `ErrorDrawer`, `AttachConfirmModal`. |
| Message/Event | `SnapshotLoaded(revision, model)`, `SnapshotFailed(error)`, `SelectionChanged`, `DraftChanged`, `ActionRequested`, `OperationProgressed`, `OperationFinished`, `ProviderObservationReady`. UI thread alone mutates widgets. |
| Controller/service | `WorkBoardController` orchestrates public services/repository; `ActionResolver`; `BindingDraftStore`; `ResourceInputCatalog`; `ExecutionControlCatalog`; `ObservationPersister`; `AttachRunner`. None are Core entities. |
| Store | immutable `BoardState(snapshot, selection_id, selected_tab, stale, operation)` plus separately persisted `BindingDraftStore`; Core snapshot never contains draft. |
| Background workers | `refresh` group: coalesced, never writes; `operation:<E>` group: serial mutation; `preview:<E>` group: latest-only/cancellable; attach suspends App rather than running in UI worker. Textual workers post messages, then controller refreshes. |

Use a monotonic `snapshot_generation`: a completed old read/preview may update its own error/progress only if its
generation matches, never replace newer facts. During modal editing, refresh updates state cache/header but not
form fields. On modal close, merge only explicit draft save.

## File-by-file implementation map

### Modify

| File | Change |
|---|---|
| `plugins/agent-box-workboard/src/agent_box_workboard/app.py` | Replace single `Static` renderer with persistent ID-keyed widgets, stable-ID selection, action resolver, Textual palette, modal dispatch and workers. Keep polling observation active. |
| `plugins/agent-box-workboard/src/agent_box_workboard/model.py` | Extend read-only view model with exact selected fact fields, lifecycle/Dispatch capability derivation, event/observation summaries; do not add domain state. |
| `plugins/agent-box-workboard/src/agent_box_workboard/render.py` | Keep `--once` chronicle compatibility; add action/status annotations only from supplied model, no mutation logic. |
| `plugins/agent-box-workboard/src/agent_box_workboard/cli.py` | Unified `agent-box-workboard WORK_ID [--refresh]`; optionally accept deprecated `watch WORK_ID` alias in P0. Bootstrap registry/adapters/config. Never add `control`. |
| `plugins/agent-box-workboard/src/agent_box_workboard/__init__.py` | Export only plugin UI public API/version if needed. |
| `plugins/agent-box-workboard/pyproject.toml` | Update description/version and Textual requirement if widgets/worker version needs it. |
| `plugins/agent-box-workboard/README.md` | Replace read-only claim and keys with unified console safety/recovery behavior. |
| `plugins/agent-box-codex/src/agent_box_codex/tmux_provider.py` | Factor current script’s validated reconstruct-handle logic into provider-owned methods; no `start()` during recovery. Keep `finish` explicit. |
| `plugins/agent-box-codex/src/agent_box_codex/plugin.py` and `pyproject.toml` | Register Codex execution-control entry point. |
| `plugins/agent-box-tmux/src/agent_box_tmux/plugin.py` and `pyproject.toml` | Register tmux resource-input/attach contribution; reuse `make_existing_pane_ref`. |

### Add

| File | Purpose |
|---|---|
| `plugins/agent-box-workboard/src/agent_box_workboard/state.py` | immutable UI state and stable Selection. |
| `…/actions.py` | typed descriptors, availability resolver, confirmation/risk rules. |
| `…/controller.py` | only gateway from UI to public Work/Execution services and repository reads. |
| `…/drafts.py` | versioned, atomic local Binding draft store. |
| `…/adapters.py` | entry-point catalog, small ResourceInput/ExecutionControl protocols and fault isolation. |
| `…/widgets.py` | reusable cards/header/drawer/action bar. |
| `…/screens.py` | modals/composer/review/error screens. |
| `…/workboard_inputs.py` | in-tree Git/artifact/profile adapters, configured by Host paths. |
| `plugins/agent-box-codex/src/agent_box_codex/workboard_control.py` | Codex-tmux control/recover/finish adapter and fact→observation mapping. |
| `plugins/agent-box-tmux/src/agent_box_tmux/workboard_input.py` | exact pane picker/prepare + attach target adapter. |
| `plugins/agent-box-workboard/tests/test_actions.py`, `test_drafts.py`, `test_adapters.py`, `test_flows.py` | unit and pilot acceptance coverage below. |

### Do not modify

`src/agent_box/work_core/services.py`, `repository.py`, `registry.py`, `models.py`, migrations,
`docs/adr/0006-resource-contract-input-protocol.md`, existing Work Core ontology, and
`scripts/preview_demo/*` (except later deletion/deprecation only after P0 has replacement coverage). Do not
modify `plugins/agent-box-tmux/control.py` semantics, and do not make any current user worktree changes.

## Core boundary audit

| Required capability | Existing expression | Why no Core change |
|---|---|---|
| Work objective/lifecycle; explicit complete/reopen | `WorkService`, Work event/version | UI invokes service after confirmation; no authority changes. |
| next/current E and responsibility | `ExecutionService.create_execution`, immutable creation event | Host chooses one E when Human asks; no future plan needed. |
| editable pre-freeze selection | host JSON draft | A draft is not an auditable domain fact. |
| atomic freeze and dispatch | `dispatch_execution()` / repository transaction | UI supplies prepared `(contract_id, Ref)`; Core remains sole freezer. |
| selected exact resource | Ref + contract + ResourceProvider.resolve | adapter prepares, provider owns interpretation, Core validates. |
| accepted / failure | Dispatch rows/read APIs | UI renders read-back rather than simulating acceptance. |
| observe, native/output/evidence | `apply_observation()` and `record_resource_state()` | provider adapter supplies observations; Core persists facts. |
| explicit terminal | provider normalized projection through service | Finish never mutates E directly. |
| recovery | accepted D + frozen refs + provider-owned evidence | algorithm belongs in provider Host adapter; Core need not know tmux/Codex. |

No requested operation requires `WorkController`, progression/scheduler, workflow graph, Core Binding entity,
retry engine, or WorkBoard entity. The only current gap is implementation location (preview scripts / in-memory
provider handles), not representational inability. Should future cross-process recovery need Core’s stronger
ADR-0002/3 contracts, that is a separately justified Core project; P0 must not claim those proposed APIs exist.

## One-day implementation cut

### P0 — one day; removes operational dependence on preview demo scripts

1. Unified invocation and stable ID selection; persistent history/detail/action bar; polling stale banner.
2. New Execution modal (intent/provider), explicit Work Complete/Reopen modal, no future E.
3. JSON draft store; Composer with four adapters: Git workspace, artifact, profile, exact tmux pane; preview,
   review and call to existing `dispatch_execution()`.
4. Codex tmux control adapter: observe, attach, explicit Finish, provider-owned reconstruction from accepted
   D + frozen inputs + marker; migrate the reusable code out of `recover_investigation_control.py`.
5. progress/error overlay with Core read-back, disabled unsafe actions, tests for P0 acceptance list.
6. `scripts/preview_demo` are no longer a normal Host/UI path; leave them untouched as demo fixtures until a
   separate cleanup decision.

P0 deliberately excludes generic adapters, app-server cross-process recovery, operation journal persistence,
workspace final snapshot UX polish, bulk actions and custom layouts.

### P1 — experience hardening

Provider-distributed adapters for more providers; durable local non-authoritative operation journal; detail tabs,
filter/search, adaptive layout; `--once` action/status render; file picker/profile list completion; richer
workspace/output evidence review; lock retry/backoff and telemetry-safe diagnostics.

### P2 — future extension

Second independent Host product validates adapter protocol; provider-owned recover-start support when Core API
is actually implemented; richer form controls/presenter capability; remote providers (LangGraph/ACPX) with
their own exact locator/recovery evidence. Still no workflow graph or automatic progression.

## Acceptance tests

1. Polling adds/removes/reorders cards yet selection is retained by E ID; if selected E disappears only then
   selection falls back to Work; open modal text is unchanged.
2. open Work exposes New/Complete; active E exposes Attach/Observe/Finish; terminal E exposes Outputs/
   Evidence/New/Continuation; unavailable palette action gives reason.
3. saving/editing/deleting draft changes only `$AGENT_BOX_HOME/plugins/workboard/drafts`; Core events/refs/
   dispatches are unchanged.
4. Freeze writes all inputs plus one requested Dispatch atomically; after any Dispatch composer becomes
   read-only and no replace/delete action exists.
5. provider start success is displayed accepted only after repository read-back; start/persist partial error
   shows separate facts and forbids second launch.
6. ACTIVE tmux E attaches through provider target, returns to same E selection and refreshes; idle turn does
   not terminal E.
7. Finish requires explicit confirmation, invokes provider finish then `apply_observation`; Work stays open.
8. app restart with accepted Codex/tmux D reconstructs same handle, calls no `start`, creates no D2 and labels
   observation recovered; bad pane/marker yields recoverable error, not redispatch.
9. profile drift / missing output / locked DB / provider unreachable each preserves last known fact and
   communicates unknown/partial state rather than all-success/all-failure.
10. Complete Work requires Human reason and calls only `WorkService.complete_work`; terminal E never triggers it.
11. rendering and interaction never generate a future Execution, DAG, Node or Resume Old Execution action.
12. third-party fake resource adapter receives parameters, returns Ref, is dispatched through existing Core
validation; broken adapter entry point is isolated and frozen historical Ref remains readable.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Current code’s accepted state does not implement ADR durable-correlation guarantees | Label P0 recovery capability narrowly; require accepted D plus provider-specific proof; never blind start. |
| Dynamic provider discovery loads untrusted/broken code | normal Agent-Box plugin trust boundary applies; discover lazily, catch/diagnose adapter errors, no writes at discovery. |
| Draft leaks paths/selection details | restrict directory/file modes; store no secrets or credential values; expose delete draft. |
| UI says ready but resource drifts before dispatch | re-prepare in Freeze review and rely on Core resolve/validation; report exact error. |
| Textual worker races | generation IDs, per-E serial mutation groups, read-back only; no widget writes from thread. |
| Finish is non-idempotent for a provider | descriptor must specify provider-defined finish/reconcile behavior; P0 disables repeat until facts are reconciled. |
| Too many shortcuts | footer only high-frequency context actions; `?` and `Ctrl+P` are the discoverable escape valve. |

## Final recommendation

Build P0 as **one continuously observing WorkBoardApp with stable selection and contextual explicit actions**.
Make local drafts and transient finalizing/progress states visibly Host/UI-only; make frozen binding, Dispatch,
projection, refs and evidence visibly Core facts. Use tiny entry-point adapters so ResourceProviders retain
selector→exact Ref authority and ExecutionProviders retain attach/recover/finish authority. Move the proven
Codex/tmux recovery logic out of the preview script into its plugin adapter, but do not generalize beyond what
the current provider can prove. This gives users a normal console path in one day while preserving every stated
Work Core boundary.

---

## Addendum — provider-owned resource selector (research and implementation design)

**Status:** design only; appended 2026-08-26. This section intentionally does
not change Work Core or start selector implementation.

### Current mechanism: verified against the P1 source

The current P1 implementation already has the right ownership boundary, but
only a text-form minimum:

* `agent_box_workboard.adapters.FormField` currently has `key`, `label`,
  `default`, and `secret`; every field is rendered as a Textual `Input`.
* `ResourceInputAdapter` is discovered through the existing
  `agent_box.workboard_resource_inputs` entry-point group. It declares an
  adapter ID, a `contract_id`, title, `fields`, optional `bind(registry)`, and
  `prepare(parameters, execution_id) -> PreparedInput`.
* `PreparedInput` already separates `requested_summary`, candidate exact
  `Ref`, `exact_summary`, and `assurance`.
* `WorkBoardApp.action_compose_binding()` asks the selected
  ExecutionProvider for `input_limits()`, selects matching adapters, and
  renders their fields generically. It does not import or branch on a resource
  product. It stores only adapter parameters in the local draft; `prepare()`
  creates the candidate Ref.
* Current Preview adapters live outside WorkBoard: the Preview resource plugin
  supplies Git/artifact/profile preparation, and the tmux plugin supplies pane
  preparation. The tmux adapter currently asks for textual `pane`, optional
  `socket`, and `replace_policy` values.

Therefore the missing capability is not a new Core entity or a new entry point.
It is an optional, small extension to the existing adapter form protocol:
**an adapter may supply choices for one of its own fields.**

### Design goals and non-goals

The selector must make dynamic discovery helpful without treating it as
authority. A choice list is a current UI observation; only a successful
`prepare()` can turn the selected value into a candidate exact Ref, and only
Freeze & Launch can atomically persist it as a Core input.

It must not add JSON Schema, provider-specific widgets to WorkBoard, a UI
schema to the Core `ResourceProvider` protocol, or `if provider == "tmux"`
branches. It must preserve existing all-text adapters unchanged and fit a day
of Preview work.

### Three design options

| Option | Shape | Benefit | Cost / rejection reason |
|---|---|---|---|
| A. WorkBoard hard-codes pickers | WorkBoard recognizes contracts/products and executes their discovery commands. | Quick demo. | Violates the plugin ownership boundary immediately; every new Provider edits WorkBoard. Reject. |
| B. Provider-owned Textual widget | Adapter returns an arbitrary widget/modal and owns all interaction. | Maximum presentation freedom. | Turns the boundary into a large UI framework, complicates focus/lifecycle/testing, and makes a second Host difficult. Reject for Preview. |
| C. Extend the current declarative fields with `text/select` and dynamic choices | Adapter declares field kind and returns small choice DTOs; WorkBoard renders standard Input/Select, refresh/error/stale states. | Keeps UI generic, supports tmux/profile picker, preserves `prepare()` authority, and is small enough for one day. Adopt. |

### Recommended interface sketch

Extend, rather than replace, the current `FormField` and adapter entry point:

```python
FieldKind = Literal["text", "select"]

@dataclass(frozen=True)
class FormField:
    key: str
    label: str
    default: str = ""
    secret: bool = False
    kind: FieldKind = "text"              # backward-compatible default
    placeholder: str = ""
    help: str = ""
    refresh_on: tuple[str, ...] = ()       # other field keys which invalidate choices
    required: bool = True

@dataclass(frozen=True)
class InputChoice:
    value: str                             # submitted back to adapter unchanged
    label: str                             # primary line in WorkBoard Select
    detail: str = ""                       # secondary display only; never Core data
    disabled: bool = False

@dataclass(frozen=True)
class ChoiceResult:
    choices: tuple[InputChoice, ...] = ()
    observation: str = ""                  # "listed 8 panes at …"
    unavailable_reason: str | None = None   # no exception text required in UI
```

The current protocol gains one optional method; `prepare()` remains required
and unchanged:

```python
class ResourceInputAdapter(Protocol):
    id: str
    contract_id: str
    title: str
    fields: tuple[FormField, ...]

    def prepare(self, parameters: Mapping[str, str], *, execution_id: str) -> PreparedInput: ...

    # Optional. Called only for a FormField(kind="select").
    def choices(
        self, field_key: str, parameters: Mapping[str, str]
    ) -> ChoiceResult: ...
```

`choices()` is intentionally adapter-local and receives plain current form
parameters, not a Core service, Execution mutation API, or draft writer.
`bind(registry)` remains the existing optional dependency injection point for
the adapter to reach its owned Provider. Existing adapters that have no
`choices()` continue to render text fields exactly as today. No change to the
`agent_box.workboard_resource_inputs` entry-point group is needed.

The generic WorkBoard form renderer owns only these mechanics:

```text
text field     → Input
select field   → Select populated from adapter.choices()
Refresh choices → background worker with a generation counter
```

It maps Textual-safe widget IDs to `(adapter_id, field_key)` exactly as P1
already does; product IDs never become widget IDs.

### Choice lifecycle, unavailable providers, and stale selections

1. On opening a composer, WorkBoard renders text defaults first. It invokes
   `choices()` for independent `select` fields in a background worker.
2. If a select field declares `refresh_on=("socket",)`, changing socket marks
   its prior choice stale and schedules a latest-only refresh. A manual
   `Refresh choices` action is always available; no hidden polling is needed.
3. Worker results carry a composer generation and the parameter snapshot.
   WorkBoard drops results for a closed composer, an older generation, or a
   different controlling-field value. This prevents an old socket query from
   overwriting a newer choice list.
4. `ChoiceResult.unavailable_reason` displays an inline non-authoritative
   status such as `tmux server unavailable — Retry`. The draft parameters are
   retained. A failed choice discovery never modifies Core or silently changes
   selection.
5. If draft value `%2` is absent from a fresh result, WorkBoard keeps it as a
   visible synthetic option labelled `Previously selected: %2 (stale)` and
   disables Review/Freeze until the user refreshes/reselects or the adapter
   successfully prepares it. WorkBoard must never select the first new choice
   on the user's behalf.
6. A choice list may be stale even when the selected option is still present:
   its observation timestamp is informational only. The actual gate is
   `prepare()`.

### Why Freeze & Launch must re-run `prepare()`

There are four deliberately separate values:

| Stage | Owner / meaning | May change? |
|---|---|---|
| requested selector | local draft parameter, e.g. `%2`, `HEAD`, profile name | yes, before Dispatch |
| candidate exact Ref | result of a current `prepare()` preview | yes; cache only |
| frozen Ref | `(contract_id, Ref)` atomically persisted by Core with requested Dispatch | no |
| actual evidence | provider observations, native/output refs, resource state evidence after start/finish | accumulates; does not rewrite input |

Between a preview and Launch, a branch can move, a profile can drift, a tmux
pane can be replaced, or the adapter may become unavailable. The review action
must therefore re-run every adapter's `prepare()` using the final draft
parameters, compare/display the fresh candidate set, and only then call
`ExecutionService.dispatch_execution()`. Core performs its existing resolve,
contract/type, input-limit, freeze, and Dispatch governance after that. A
choice is convenience; `prepare()` and Core validation are authority.

### tmux pane selector: concrete provider-owned interaction

The tmux plugin changes only its own WorkBoard adapter:

```python
fields = (
    FormField("socket", "Socket path", required=False),
    FormField(
        "pane", "Pane", kind="select", refresh_on=("socket",),
        help="Live pane list; exact identity is resolved only at review.",
    ),
    FormField("replace_policy", "Replacement policy", kind="select"),
)

def choices("pane", parameters) -> ChoiceResult:
    # tmux plugin calls its own provider/controller list operation
    # returns InputChoice(value="%2", label="%2  demo:0", detail="codex · /repo")
```

The adapter-owned list operation returns one `InputChoice` per currently
observable pane. It displays at least:

```text
%2   session-name:window-name   current-command   current-working-directory
```

Socket selection can remain text for the one-day cut; changing it invalidates
the pane list. Replacement policy can use fixed adapter-owned choices
(`idle-shell-only`, `force-replace`). When the user selects `%2`, WorkBoard
stores the scalar `%2` in its draft. At preview/review, the tmux adapter calls
its existing `make_existing_pane_ref()` and displays exact socket, server PID,
session, window, pane identity and policy. If the pane's identity or safety
state changed, prepare fails with an adapter-owned explanation; WorkBoard does
not replace it or launch another pane.

### profile selector: concrete provider-owned interaction

The Preview profile adapter declares:

```python
fields = (FormField("name", "Profile", kind="select"),)

def choices("name", parameters) -> ChoiceResult:
    # provider/plugin-owned ProfileRepo list query
    # InputChoice(value=name, label=name, detail="agent_type · provider")
```

The list is only a current catalog observation. `prepare()` still calls the
profile provider's `make_ref(name)` and produces the digest-bearing candidate
Ref. At review it runs again. A profile that disappeared or whose configuration
has changed is presented as stale/unavailable and blocks freeze; it is never
substituted by a similarly named profile.

### Git and artifact: one-day Preview treatment

Keep Git repository path/selector and artifact file path/title as `text` in
the first selector cut. They already have good typed preparation and exact
preview semantics, and a generic filesystem/repository browser would expand
scope substantially. This is not a limitation in WorkBoard: those adapters
may later change their own fields to `select`, add choices, or remain text
without any WorkBoard product branch.

### File-level implementation scope (future implementation)

| File | Change |
|---|---|
| `plugins/agent-box-workboard/src/agent_box_workboard/adapters.py` | Add `kind`, optional field metadata, `InputChoice`, `ChoiceResult`, and optional `choices()` protocol only. |
| `…/app.py` | Replace generic Input-only rendering with generic text/select rendering, choice refresh workers, generation/stale state, and review re-prepare. No product imports or product IDs. |
| `…/drafts.py` | Optionally store only selected scalar values as today plus a non-authoritative preview timestamp; do not store choice catalog or Ref as fact. |
| `plugins/agent-box-tmux/src/agent_box_tmux/workboard_input.py` | Add pane/policy choices through tmux-owned list/query operations and retain `prepare()`/`make_existing_pane_ref()` authority. |
| `plugins/agent-box-preview-resources/src/agent_box_preview_resources/inputs.py` | Add profile choices through the plugin's profile catalog; retain text Git/artifact fields for the cut. |
| tests under the three plugin directories | Add generic selector and provider-specific tests below. |

Do **not** modify `src/agent_box/work_core/`, migrations, resource contract
types, `ExtensionRegistry`, or the existing WorkBoard adapter entry-point
groups. The existing group is already the correct plugin discovery seam.

### Test checklist

1. Existing text-only adapter still renders and prepares unchanged.
2. A generic fake select adapter renders `InputChoice.label/detail` and passes
   only `InputChoice.value` to `prepare()`.
3. An adapter failure in `choices()` is inline/retryable and leaves the draft
   and Core untouched.
4. A late result from an older controlling-field value cannot overwrite newer
   choices.
5. A stale saved selected value is visible but cannot become an implicit new
   choice or enable Freeze.
6. Review re-runs every prepare even when a candidate Ref was cached; a changed
   exact identity is displayed before confirmation.
7. tmux list shows pane ID/session/command/cwd; selected pane is resolved into
   exact frozen identity only via `prepare()`.
8. profile list shows profile metadata; deletion/drift after listing blocks
   prepare/review without changing the previous frozen Ref.
9. WorkBoard source contains no product-specific provider condition; fake third
   party adapter works through the same generic renderer.
10. Freeze still calls the existing public `ExecutionService.dispatch_execution`
    path, and no Core write occurs before explicit confirmation.

### One-day selector cut

Implement only `text/select`, `InputChoice`, optional synchronous provider
choice method executed by WorkBoard workers, manual refresh, stale blocking,
and review-time re-prepare. Ship tmux pane and profile selectors; leave Git
and artifact text. Do not add search, pagination, multi-select, cascading
arbitrary schemas, provider-owned widgets, or a filesystem browser. This is a
zero-Core-modification change.

---

## Addendum — Relationship-first redesign (2026-08-27)

### Why this redesign is necessary

The first unified-console cut successfully put observation and contextual
control into one screen, but its visual hierarchy is wrong for a Work with
more than two Executions. The screen currently makes a person scan a long
chronological stack of dense cards and discover relationships only through
small inline annotations or a short text block above the stack. In a realistic
Work the related cards are often outside the viewport, so the user cannot
answer the first operational question: **what is happening now, and which
completed responsibility is this active one continuing or consuming?**

This is not solved by drawing more arrows inside each card. A terminal has
very little stable area. Repeating IDs, provider, phase, Dispatch and fact
counts on every card spends that area before the actual Work shape becomes
visible.

The redesign therefore changes the primary mental model from **chronological
cards with annotations** to **an observed-work map with a focused execution
inspector**. It remains a Host Console, never a workflow editor.

### Industry findings

| Product / source | Relevant observed interaction | Reuse for WorkBoard | Do not copy |
|---|---|---|---|
| [K9s](https://github.com/derailed/k9s) | Resource lists remain the main live view; XRay is an explicit relationship drill-in. The selected resource exposes contextual actions such as attach, logs, describe, edit and delete. Its command history/breadcrumb model keeps navigation intelligible. | Keep one live list and a stable selection; expose actions only for the selected Work/Execution; make the relationship lens a first-class but bounded view of the same facts. | K9s can traverse Kubernetes owner/reference data with established semantics. WorkBoard must not infer owner/dependency edges from time order or turn a relation lens into arbitrary graph navigation. |
| [Lazygit](https://github.com/jesseduffield/lazygit/blob/master/docs/Config.md) | Its commits panel can render a topology-ordered graph; the selected commit highlights its parents. It also reflows main/side panels according to available width. | Show relation before full detail; cross-highlight the selected execution and its factual predecessors/successors; switch layout at a width threshold rather than squeezing every panel. | Git commits have universal, durable parent links. WorkBoard's links are partial evidence from frozen inputs and produced/native Refs, not a complete commit-like graph. A missing link must mean “unproven”, not “independent”. |
| [Temporal](https://github.com/temporalio/documentation/blob/main/docs/encyclopedia/workflow/workflow-execution/event.mdx) | Temporal treats event history as an append-only fact log and uses it for audit and recovery. Its UI/CLI are for progress, diagnosis and explicit operations. | Preserve the complete observed chronology underneath the overview; treat the relationship display as a projection over durable facts, never as a replacement truth or recovery authority. | Temporal is itself a durable workflow runtime. Its state/event graph cannot be imported as a product model for Agent-Box Work. |
| [Argo Workflows](https://argo-workflows.readthedocs.io/en/latest/walk-through/dag/) | Its DAG visualization is correct because users explicitly declare task dependencies and the engine schedules parallel branches from them. Artifacts can be clicked from the DAG and opened in a detail panel. | Make frozen Ref provenance clickable/inspectable from a selected relation; distinguish a real data/session hand-off from simultaneous activity. | Do **not** copy its DAG canvas, retry/resubmit/suspend model, or inferred future lanes. Those are valid only because Argo owns a declared DAG and scheduler. |
| [Textual ListView](https://textual.textualize.io/widgets/list_view/) | ListView is keyboard-navigable, emits highlight/select events, and is a vertical scroll container. | Retain ListView for the history/selection surface. Give it compact, predictable rows and keep selection by Execution ID across refresh. | Do not force a DAG into Textual `Tree`: a tree assumes one parent hierarchy whereas a frozen input may be consumed by many Executions and one Execution may have several proven inputs. |

The crucial industry lesson is deliberately asymmetric: a graph is excellent
when it represents an already-known semantic relation, and harmful when it
makes a missing semantic relation look like one. K9s and Lazygit demonstrate
selection-preserving context; Temporal demonstrates an immutable factual
history; Argo demonstrates precisely why a declared-DAG visual language would
be false here.

### Product thesis

> WorkBoard should be **relationship-first at a glance, fact-first on
> inspection, and control-in-context at all times**.

The signature element is an **Observed Handoff Ledger**: a small, fixed
top-of-screen projection that writes each proven hand-off as a readable lane,
not a decorative canvas. It makes the actual responsibility continuity visible
before the user enters the history. Everything else is deliberately quiet.

The screen must communicate three categories with different visual grammar:

| Category | Meaning | Visual grammar | Permitted source |
|---|---|---|---|
| Proven hand-off | A frozen input exactly matches another Execution's native/output Ref. | `E3 ── Session continuation / S1 ──▶ E6` | Core frozen inputs + native/output Refs |
| Activity snapshot | Executions overlap in the current observation window. It is not a dependency. | `NOW  E2  ∥  E6` | timestamps/projection only |
| No known hand-off | No such match is recorded. This is absence of proof, not proof of independence. | `3 executions have no proven hand-off` | WorkBoard projection only |

There is never an arrow for “created later”, “is probably next”, “same
provider”, “same Work”, or “has a similar responsibility”. The renderer must
never write a `Node`, `Edge`, workflow state, scheduling decision or inferred
dependency to Work Core.

### Information architecture

#### Wide terminal (>= 120 columns)

```text
┌ Work pulse ────────────────────────────────────────────────────────────────┐
│ OPEN  Improve WorkBoard relation clarity              6 executions · 2 live │
│ Human decision pending: Work remains OPEN                              [w] │
├ Observed handoffs ────────────────────┬ Focus: E6 ─────────────────────────┤
│ E3 ✓ ─ Session continuation / S1 ──▶ E6 ● ACTIVE                           │
│ E3 ✓ ─ Output review.md ──────────▶ E7 ? draft                             │
│ NOW  E2 ●  ∥  E6 ●  (same snapshot; no dependency)                         │
│ 3 executions have no proven hand-off                                       │
│ [Enter] inspect a lane                                                     │
├ History / factual record ────────────┼ E6  Continue design review          │
│ E1  ? draft       not dispatched     │ ACTIVE · accepted · observed 4s ago │
│ E2  ● active      accepted            │ from E3 SessionRef S1               │
│ E3  ✓ succeeded   terminal            │ inputs 4 · native 2 · outputs 1     │
│ E4  × failed      dispatch failed     │ [Attach] [Observe] [Finish]         │
│ E5  ✓ succeeded   terminal            │ [Binding] [Evidence] [Full details] │
│ E6  ● active      accepted  ← selected│                                      │
└──────────────────────────────────────┴─────────────────────────────────────┘
Footer: ↑↓ select · Enter details · Tab relationship/history · ⌘ palette
```

The left side stays an overview, while the right side is the only place that
expands the selected Execution. The history rows are one or two lines—not
miniature detail pages. Selecting a relation lane selects its target by
default; `Shift+Enter` selects its source. The source and target receive a
shared, restrained highlight colour, and every other row remains quiet.

#### Narrow terminal (< 120 columns)

```text
WORK OPEN · 6 executions · 2 live
Improve WorkBoard relation clarity

OBSERVED HANDOFFS  2 proven · 2 live now
  E3 ✓ ─ session / S1 ─▶ E6 ●
  E3 ✓ ─ output review.md ─▶ E7 ?
  NOW E2 ∥ E6  (not a dependency)
  [t] inspect relationship map

HISTORY
▶ E6 ● Continue design review       accepted · 4s
  E3 ✓ Capture review               terminal · 1 output
  E2 ● Implement responsive card    accepted · 12s
  E1 ? Draft next responsibility    no dispatch

ACTIONS  Attach · Observe · Finish · Evidence
```

The focus inspector is not permanently rendered at narrow widths. `Enter`
opens it as a full-height detail screen; the overview and relationship ledger
remain readable without scrolling. This removes the current failure mode where
one selected card consumes most of the viewport.

### Exact relationship model

`ExecutionRelation` remains a WorkBoard-only read model, but its purpose is
changed from “an annotation on the target card” to “the source of the handoff
ledger.” The model may create a relation only under these rules:

1. **Native-session continuation:** an exact frozen input Ref on target `B`
   equals a native `SessionRef` recorded for source `A`. Label it “continues
   native session”, display the human-safe native-id suffix, and link to both
   facts in the inspector.
2. **Output consumption:** an exact frozen input Ref on `B` equals an output
   Ref recorded for `A`. Label it “consumes output”.
3. **Other exact native hand-off:** a future provider may opt into a
   provider-neutral label only if its Ref type is explicit enough. Until then,
   render “uses recorded native ref”, never guess a product name.
4. **Fan-in/fan-out:** one source can create several rows; one target can have
   several incoming rows. The ledger lists each fact separately and groups
   repeated source/target pairs visually. It does not force a tree.
5. **Concurrency:** calculate a snapshot strip separately from intervals and
   mark it “not a dependency”. Do not persist it, colour it as lineage, or use
   it to order history.
6. **Shared workspace/profile/pane:** do not create a relation in this cut.
   Shared resources can indicate coincidence, not data/control hand-off. They
   remain inspectable in Binding facts.

An incoming relation's source may be terminal while the target is active. That
is the expected continuation story, not an instruction to reopen the old
Execution. The existing architecture already states this as `E1 terminal →
SessionRef S1 → E2 new Binding / new Dispatch`; this design renders that
existing fact without changing it.

### Navigation and control behaviour

| Input | Result | Why it reduces cognitive load |
|---|---|---|
| `Tab` | Toggle keyboard focus between **Observed handoffs** and **History**. | The global shape and chronological record are peers, not separate modes. |
| `↑/↓` | Move inside the focused surface. | Stable, standard navigation. |
| `Enter` on a ledger lane | Select the relation target and open/refresh its focused inspector. | A relation leads directly to the object a user can act on. |
| `Shift+Enter` on a ledger lane | Select the relation source. | Lets the user trace provenance backward without a graph canvas. |
| `Enter` on a history row | Open full details modal. | Details are intentional, not an accidental expansion. |
| `[` / `]` | Previous / next proven hand-off for the selected Execution. | Keyboard experts traverse lineage without learning graph gestures. |
| `a`, `o`, `f`, `c`, `l`, `n`, `w` | Existing contextual controls. | The command has meaning only after selection and remains exposed in the action bar/palette. |
| Command palette | Lists actions and “Go to source/target hand-off” only when they exist. | New users discover capability without a permanently overloaded footer. |

Refresh must preserve `selected_execution_id`, not selected row position. It
must rebuild the ledger and history from the same immutable snapshot, then
restore focus to the matching row/lane. If its relation disappears because the
underlying factual read changed, retain the selected Execution and show a
small, non-modal “handoff no longer proven by current facts” notice. It must
not silently select another Execution.

### State hierarchy and visual tokens

The current dark terminal palette can remain, but status colour must not be
used as decoration:

| Token | Use |
|---|---|
| muted slate | all inactive factual text and unselected history |
| cyan | ACTIVE and current-snapshot activity only |
| green | terminal succeeded only |
| red | terminal/Dispatch failure only |
| amber | keyboard focus and an explicit action requiring user confirmation |
| violet/neutral link accent | a proven hand-off source/target pair; never lifecycle status |

Do not put a border around every panel at every width. One rule under the Work
pulse, one quiet label for the ledger, one focus outline, and one strong
inspector boundary are enough. IDs are secondary data: display short IDs in
the overview and full IDs only in the inspector/copy action. This lets
responsibility and relation words carry the scan path.

### Component plan (implementation after approval)

| Component | Role | Does not do |
|---|---|---|
| `ObservedHandoffLedger` (new WorkBoard widget) | Renders `ExecutionRelation` rows, snapshot activity and unlinked count; emits a selection message with source/target Execution IDs. | It does not own a graph, calculate lifecycle, query providers, or mutate Core. |
| `RelationshipLane` (new small ListItem/widget) | One selectable, two-ended factual hand-off. | It does not invent hierarchy or new data. |
| `HistoryList` (existing ListView, compact row renderer) | Chronological observed record; keeps selected ID across polling. | It does not expand facts inline by default. |
| `ExecutionInspector` (new responsive container; modal on narrow screens) | Renders the selected Execution's full facts and state-allowed action bar. | It does not become a second control mode. |
| `WorkPulse` (replace current multi-line summary Static) | Objective, lifecycle, active/problem counts, human completion status. | It does not predict next work. |
| `RelationLensModel` (ephemeral UI projection) | Groups existing `ExecutionRelation` values, computes display counts and current snapshot activity. | It is not persisted and is not a Core entity. |

Use Textual `ListView` for the history because it supplies keyboard selection,
highlight messages and scrolling. Implement the ledger as another compact
Textual focusable list, not an external graph package. No available Textual
widget is a correct multi-parent provenance graph; `Tree` would encode the
wrong invariant. This avoids adding an external rendering/runtime dependency
to WorkBoard and satisfies the requirement that the console itself not depend
on an external resource.

### Files affected by the redesign

| File | Planned change | Core impact |
|---|---|---|
| `plugins/agent-box-workboard/src/agent_box_workboard/model.py` | Keep exact-ref derivation; add ephemeral ledger grouping/snapshot view values and tests. | None; reads existing facts only. |
| `plugins/agent-box-workboard/src/agent_box_workboard/app.py` | Replace `#relation-map` Static and always-expanded selected card with responsive pulse/ledger/history/inspector composition and focus transfer. | None. |
| `plugins/agent-box-workboard/src/agent_box_workboard/render.py` | Split compact history-row rendering from inspector rendering; remove inline relation duplication as the primary presentation. | None. |
| `plugins/agent-box-workboard/tests/test_model.py` | Cover exact hand-off, fan-in/out, no inferred shared-resource edge, and concurrency-label separation. | None. |
| `plugins/agent-box-workboard/tests/test_app.py` | Cover focus preservation, lane-to-source/target navigation, narrow/wide layout selection, and no-card-overflow regression. | None. |
| Providers, adapters, `src/agent_box/work_core/`, migrations | **No change.** | Zero. |

### Acceptance criteria for this redesign

1. At 120 columns, the user can see Work objective, live count, every proven
   hand-off, current concurrent snapshot, and the selected Execution's
   actionable summary without scrolling history.
2. At 80 columns, the same summary remains readable before history; details
   are opened deliberately rather than making a selected card consume the
   viewport.
3. Selecting a ledger lane reliably selects its real target; reverse traversal
   selects its real source. Refresh preserves the selected Execution ID.
4. A relationship is rendered only after exact Ref equality between frozen
   input and native/output fact. Shared providers/resources and chronological
   adjacency never make arrows.
5. `ACTIVE ∥ ACTIVE` is visibly a snapshot condition and cannot be mistaken
   for a dependency.
6. The existing contextual controls remain available from the selected
   Execution, and terminal Execution still offers a new/continuation
   Execution—not reopen.
7. Work completion remains an explicit Human/Host action and the overview
   says so while the Work is OPEN.
8. No Work Core source file, migration, Core ontology, external graph package
   or provider-specific branch is introduced.

### Deliberate non-goals

- No future DAG, workflow-builder canvas, automatic next-step suggestion,
  scheduler, retry graph, or route computation.
- No claim that the handoff ledger is complete lineage. It shows only recorded,
  provable hand-offs.
- No miniature graph library, mouse pan/zoom, layout algorithm, or external
  graph runtime. For the one-day implementation the compact ledger is more
  readable and far safer in a terminal.
- No change to provider-owned binding selection, dispatch, recovery or finish
  semantics. Those appear in the inspector/action bar exactly as existing
  contextual operations.
