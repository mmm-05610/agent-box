# Round 3 · A 型 Preview 与 Evidence 真实性证伪（Demo/Evidence 红队）

报告日期 **2026-08-27**。工作目录 `/home/maoqh/projects/agent-box`，分支 `spike/real-governed-binding`。本报告为第三轮对抗验证中候选 D（Embedded SDK/Provenance Middleware）作者承担的 Demo 与 Evidence 红队任务。

## 审计范围与标签

已完整阅读：round-1 四份、round-2 四份（01 Work Platform / 02 Dual-entry / 03 Workflow Substrate / 04 Embedded SDK）、产品重校准文档；未读取任何 round-3 其他输出。本轮亲自核对的证据：

- **全部测试套件本轮实跑**：`pytest tests/ plugins/*/tests -q` → **328 passed, 1 skipped (30.28s)**。其中 Work Core 关键子集（repository/services/contracts/vertical_slice）27 passed，resource/observation/responsibility/input-dispatch/real-resource/cli + resource_contracts 31 passed，五个插件合计 84 passed。**[TEST VERIFIED]**
- WorkBoard `model.py`/`app.py`/`render.py`、Codex `provider.py`/`tmux_provider.py`/`contract.py`、Pi `provider.py`/`config.py`、tmux `provider.py`、preview-resources 插件、Core `resources.py`、Core `services.py` 的 dispatch/observation 路径。
- 九个 preview_demo 脚本、live runbook、两份 storyboard/blueprint、DSH 输入文档、`prepare_target_repository.py`。

| 标签 | 含义 |
|---|---|
| **LOCAL VERIFIED** | 本轮在本机文件系统/终端直接核实的行为或路径 |
| **TEST VERIFIED** | 由本轮通过的具体测试覆盖的代码行为 |
| **DOCUMENTED ONLY** | 仅存在于设计文档/storyboard/ADR，无对应执行路径 |
| **SEEDED/FAKE** | 演示数据由脚本合成，不代表真实运行产物 |
| **NOT IMPLEMENTED** | 无生产执行路径 |
| **BLOCKED** | 有设计、有部分依赖，但被外部条件卡住 |

---

# Executive verdict

**结论预览：B —— 可以证明共享 Execution Kernel，但必须缩小 Demo 题材与产品宣称；Evidence 当前不能以平台级形态出镜。**

正面发现（超出红队预期的部分）：A 型 Preview 的"拒绝能力"是真实且被测试钉死的。profile/prompt/Git worktree/tmux 四类资源解析器都在 dispatch 事务内原地 resolve，任何 frozen pin 漂移都会让 Dispatch 记为 failed 并带原因——这不是 UI 姿态，是核心事务语义。**[TEST VERIFIED]** 共享 Kernel 的四个不变量（冻结后禁止新增输入、幂等键冲突拒绝、一 Execution 一 Dispatch、digest 绑定）在真实测试中成立。**[TEST VERIFIED]**

负面主结论：WorkBoard 的 Evidence 页目前是**计数器**，不是对账表——`coverage="coverage unavailable"` 硬编码（model.py:225），Evidence 视图只渲染 refs 数量（app.py:795-803），resource state 是任意 ≤256 字符串（services.py `_validate_resource_states`），provider 可把 "consumed" 写进去而 Core 无从辨伪。"expected-vs-actual matrix" 在产品里不存在，只存在于 storyboard 和 round-2 各候选的表格里。若今天照 A 型承诺录制 "verified/provider-reported/unknown 三态矩阵"，就是在记录一个不存在的功能。**[LOCAL VERIFIED]**

第二负面结论：Demo 题材（DeepSeek Harness 多会话插件）没有 fixture——目标仓库由脚本创建且只有 README，明确写着 "The implementation is intentionally undecided"（prepare_target_repository.py:16）；storyboard 自认 "DSH rc 且 profile fixture 未就绪……拍摄前硬依赖"。该题材当前只能以 investigation-only 形式出现，插件完成宣称不可录制。**[LOCAL VERIFIED]**

判词详见文末 Final verdict：选择 **B**。

---

# Current Demo reality

逐项清单。分类依据为本轮亲核的代码与测试结果。

| # | 检查项 | 分类 | 事实 |
|---|---|---|---|
| 1 | Work 创建 | **TEST VERIFIED** | `create-work` CLI + `WorkService.create_work`；runbook Step 1 即此路径 |
| 2 | Execution 创建 | **TEST VERIFIED** | `ExecutionService.create_execution`；`exec_*` ID 先于 provider start |
| 3 | responsibility intent | **TEST VERIFIED** | 有界字符串持久化并显示在卡片上；仅为声明文本 |
| 4 | Provider 选择 | **TEST VERIFIED** | in-process registry + entry-point 加载；codex-tmux-interactive 注册可见 |
| 5 | Binding Composer（draft→resolve→review→freeze&launch） | **TEST VERIFIED**（draft 机制与 operations 测试在 84 个插件测试内） | draft 是本地文件，`Freeze & Launch` 前无 Core 副作用。但**默认流程无人交互确认 requested selector**——seed/live 脚本代替用户做了多数选择 |
| 6 | selector→exact Ref | **TEST VERIFIED** | Git `rev-parse {selector}^{commit}`+tree；prompt SHA-256；profile manifest digest（排除 auth.json/history 等 mutable/secret 项）；tmux exact pane identity+version |
| 7 | freeze | **TEST VERIFIED** | 单事务写入 canonical `(contract_id, Ref)` inputs + digest；冻结后 INPUT 不可新增 |
| 8 | Dispatch | **TEST VERIFIED** | requested/accepted/failed + 幂等键冲突拒绝 + 一 E 一 D。已知缺陷：failed 后同 key 重调静默返回新 start request 不重启不复报旧失败（round-1 发现，本轮未复跑但代码未见修复——services.py 同路径） |
| 9 | tmux attach | **LOCAL VERIFIED** | attach 命令由 provider 打印；需本机 tmux server。pane 绑定有 pre-start 校验（version/session 归属/pane 数不符即 raise） |
| 10 | Codex/Pi launch | **LOCAL VERIFIED**（round-1 real-provider spike 已真机验证；本轮测试以 fake harness 运行） | Codex 走 App Server stdio `thread/start`+`turn/start`；Pi 构造 argv 于 pane 内启动并把 DEEPSEEK_API_KEY 仅作环境引用 |
| 11 | native SessionRef | **TEST VERIFIED**（attach 机制）/ **LOCAL VERIFIED**（真实 Thread/Turn ID 需 live App Server） | observe 时附 NATIVE Ref；单字符串 receipt correlation 是上限 |
| 12 | explicit Finish | **TEST VERIFIED** | runbook 阻塞等待人工输入 `FINISH`；`provider.finish()` 落盘 scrollback(≤64KiB)/session event 并 sha256 成 ArtifactRef |
| 13 | continuation new Execution | **PARTIAL，拆分标注**：Pi/Codex continuation contract（thread_id/session_id 冻结）**TEST VERIFIED**；WorkBoard 由精确 Ref identity 匹配派生 "continues native session" 关系**TEST VERIFIED**（model.py `_with_proven_relations`）；Core 层 `continuation_of` 字段**NOT IMPLEMENTED**（仅 bounded provenance map 可手工写）；terminal 后 Core 仍允许 `resume_execution()`——语义缺陷未修 |
| 14 | Git output facts | **TEST VERIFIED**（snapshot 能力）/ **NOT IMPLEMENTED**（finish 时自动持久化到 resource evidence 的路径不存在） | snapshot() 给 head/tree/diff_digest/dirty/tracked_dirty；是否被调用取决于 host 脚本自觉 |
| 15 | Evidence coverage | **NOT IMPLEMENTED** | coverage 硬编码 "coverage unavailable"；无 authority/method/level/disposition 字段；state 为自由字符串 |
| 16 | LangGraph context | **NOT IMPLEMENTED**（类型字面量存在） | `RefType.WORKFLOW_INSTANCE` 枚举值存在；无 resolver/snapshot adapter；LangGraph 一词不出现在任何 src/plugins Python 里 |
| 17 | CI | **NOT IMPLEMENTED** | 全仓库无 GitHub Actions/CI provider；RunRef 只能当普通 correlation 字符串用 |
| 18 | DSH plugin 实现 | **NOT IMPLEMENTED** | 目标仓库=README+gitignore；"implementation is intentionally undecided" |
| 19 | DSH isolation/shared-resource tests | **BLOCKED** | storyboard 自列 P0："DSH binary rc.6 存在；profile fixture 未就绪"；isolation matrix（§801 行）属拍摄规划非现实 |
| 20 | Work completion | **TEST VERIFIED** | complete/reopen 带 reason 显式操作；provider terminal 不触碰 lifecycle |

**红线遵守**：下文一切 Demo 设计不得把 `scripts/preview_demo/seed_preview_board.py`（合成 TERMINAL E1 + 手工 observation 事件）和 `seed_preview_pi_board.py` 记为真实 E2E——它们是 SEEDED/FAKE fixture，仅用于离线检查视图渲染。live runbook 是真实路径但其 E1 明确为 investigation-only。

---

# Evidence inventory

按当前真实 Provider/Resource 能力逐项列出。等级词汇沿用 round-1 技术审计的 E0–E7/D0–D3/C0–C1。"最诚实 UI 文案"给出建议原话。

| Resource | expected Binding | projection | 可独立 read-back 的 actual | Provider self-report | evidence artifact/ref | authority | method | coverage | negative claim | 最诚实 UI 文案 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Git commit/tree** | selector+commit/tree 进 frozen inputs，参与 digest | checkout 到 detached managed worktree | resolve 时校验 tree==frozen；worktree 物化时校验 HEAD^{commit}==frozen，不符 raise（拒发） | — | Ref metadata 存 tree | git object store | rev-parse read-back | 该 commit/tree 对象本身，bounded | 不适用 | 「启动前由 Git 权威核实了精确 commit 与 tree」 |
| **worktree** | WorkspaceRef 精确 pin | cwd 注入 Codex/Pi 进程 | snapshot()：HEAD/tree/diff_digest/dirty/tracked_dirty | — | diff_digest 可作 ArtifactRef | filesystem+git | status+diff hash | 快照时刻的 tracked(+声明 untracked)；快照后漂移不追 | 否（快照窗之外 C0） | 「物化时 HEAD 与冻结合同一致；随后的改动属于 agent 工作内容」 |
| **profile** | name+manifest digest 写进 Ref.metadata（排除 credential/mutable 文件） | 文件交由 harness 加载（无独立加载事件） | resolve 时重算 manifest digest≠frozen 即 raise「profile configuration differs from frozen ProfileRef」 | 无（没有任何组件报告"加载成功"） | digest 字符串 | filesystem | byte-manifest SHA-256 重算 | 仅配置字节；生效与否未知 | 否 | 「启动时重算摘要并与冻结一致；是否被真正加载 unknown」 |
| **prompt/context** | ArtifactRef sha256 native_id | bytes 进入 turn/start request body / Pi script | finish 前 digest re-check ≠ 即拒发「artifact digest differs」 | Codex JSONL 会收录事件流（收到≠读到） | prompt artifact digest | filesystem+AppServer 记录 | file hash + 请求体投影 | 投影 E2/D1 verified-as-projected；消费/attention=E0 unknown | 否 | 「这份指令确实进入了发给模型的请求；模型是否使用不可知」 |
| **tmux pane** | TmuxPaneRef %N + socket spec + version metadata | TUI 替换 pane 内容 | start 前校验 socket/version/session 归属/pane 数量，不符 raise | SessionStart hook 自报（E4） | identity_digest；finish 时 ≤64KiB scrollback sha256 元数据标 `partial-scrollback` | tmux server(exact socket) | list-panes/display-message read-back | momentary identity；scrollback 仅捕获 bytes | 否（未观测面之外 C0） | 「绑定的是这个确切 pane；回看只截获了最后一段输出」 |
| **Codex/Pi session** | CodexContinuationV1 thread_id / PiContinuationV1 session_id 作为可冻续接输入 | turn/start 或新进程 | Thread/Turn ID 来自 App Server response | JSONL/scrollback 都由 client-side 捕获后自哈希 | session event JSONL artifact（sha256） | codex app-server（其 response/read 回） | JSONL hash + thread read-back（如接线） | 收录的事件流；遗漏无从察觉 | 否 | 「会话身份与事件日志的真实性以 Codex 服务端为准」 |
| **MCP/plugin** | 未进入任何现有 Binding 类型 | 无 | 无 | 无 tool-call 观察 | 无 | 无 | 无 | C0 | 否（绝不可宣称"没用额外工具"） | 「本 Preview 无法观察 MCP/插件——不显示此行或显式标 unknown」 |
| **credential reference** | 无 CredentialRef 类型；Pi 仅运行时环境引用 DEEPSEEK_API_KEY 且不入库（config.py 注释） | env 变量注入进程 | 无版本 pin、无 access receipt | 无 | 无 | pi config/环境 | 环境存在性检查而已 | E1 declaration only | 否 | 「key 经环境传入、不落盘；用了哪个版本 unknown」 |
| **LangGraph checkpoint** | WORKFLOW_INSTANCE 枚举值存在 | — | — | — | — | — | — | — | — | 不应出现在 Demo 中（功能不存在） |
| **GitHub Actions** | 无 | — | — | — | — | — | — | — | — | 不应出现在 Demo 中 |
| **output artifact** | — | finish 时生成 | ArtifactRef.sha256 == 文件 bytes 可复核 | 哈希由写文件的同一进程计算 | scrollback/session-start/prompt diff 等 ArtifactRef | 本进程（self-captured） | sha256 over captured bytes | 仅覆盖被捕获的内容 | 否 | 「产物摘要是我们自己算的——完整性针对已捕获字节」 |

结构性事实：**全表最硬的一行是 pre-start refusal**（四类资源解析失败→Dispatch failed），而不是任何 post-run 对账。这条结论直接决定 §3 与 §4 的判定。

---

# Binding-versus-manifest verdict

用当前真实能力回答五个问题。

**Freeze 阻止了什么错误？（真实，TEST VERIFIED）**

1. 启动后补充输入：frozen INPUT 集合不可扩；
2. 幂等键挪用：同 key 异 digest → `DispatchRejected`；异 E 复用 key → reject；
3. 双发：一 Execution 第二个 Dispatch 被唯一约束拒绝；
4. **pin 漂移四连拒**（resolve 在 dispatch 事务内原地执行）：git tree 改写、worktree HEAD≠frozen、profile bytes 改动、prompt 内容改动、tmux version/session 归属不符——全部在 provider.start 之前 raise，Dispatch 记 failed 带原因。这是当前产品真正拥有的、普通 launcher 没有的"说不"。

**actual read-back 找出了什么不一致？** 只有三处且全部发生在**启动前的同一时刻窗口**：worktree HEAD 校验、Git tree 复核、pane identity 校验。运行中与运行后的 actual（dirty 演化、harness 实际读到的 profile、CI head_sha、模型注意力）没有任何自动对账——没有 reconciler，snapshot() 结果也不会自己进入 evidence。

**哪些只是把请求抄回？** ①Codex/Pi 的 `projected_contracts = tuple(sorted(request.inputs))`——把冻结输入原样抄成"已投影"字段；②WorkBoard resource_observation_count 只是数了 host 自己写了多少条 state；③profile 的"加载"没有任何观察者，若有人写字符串 consumed 也是 echo。filler 判定：Evidence 页的数据来源几乎全部等于 Expected 页数据源加计数。

**如果删掉 Evidence 页面，Demo 是否只剩 launcher？** 比 launcher 强一点、比 accountability platform 弱很多：剩 chronicle（状态时间线）+ 冻结输入账本 + 拒绝与断代语义 + explicit Finish。它们是 launcher 不关心的历史纪律，所以不是纯 launcher；但因为"实际发生了什么 vs 承诺了什么"这一层完全缺席，把删掉后的东西称为 platform 就是撒谎。删除实验的结论是：**当前差异化价值约七成在 pre-start，三成在断代/Finish 语义，post-run≈零**。

**当前 Evidence 是否足以支撑"可验证"宣传？** 不能。可支撑的最强句式：'launch is pinned and pre-flight verified'。不可支撑：verified execution、consumed、reconciled。任何 storyboard 里出现的 ✅ matrix 在今天的 repo 里都是 DOCUMENTED ONLY。

**Preview 可以使用的最强准确措辞**（可直接用于录制旁白）：

> “Agent-Box 在你按下放行之前，把每个承诺过的资源重新读一遍——profile 变过、代码被改写过、终端不是那个终端，它就拒绝启动并留下失败原因。启动之后它给你一条谁也改不掉的责任记录：哪次尝试、用什么跑的、你是何时亲手结束它的。至于模型到底读了什么、有没有偷偷用别的工具——它不知道，也不装作知道。”

其中每一句都有 TEST VERIFIED 对应物（resolve 拒绝、append-only events、explicit FINISH、无 consumption claim）。注意这句宣传已经**不含** Evidence reconciliation——这正是必须收缩的部分。

---

# Deliberate divergence fixture

设计一个可重复 fixture（不实施）。选 **profile digest 漂移**为主案：确定性最高、无需 race、 refusal 路径已有测试锚点（tests/test_work_core_real_resource_providers.py:81 match="differs"）。

```text
名称：divergence-profile-drift
前置：
  scripts/divergence_fixture/make_env.sh
    - export AGENT_BOX_HOME=$(mktemp -d)                 # 隔离 store
    - PROFILE_DIR=$AGENT_BOX_HOME/profiles/demo-p        # 生成最小合法 profile v1
    - python create_execution(...)                       # intent 固定字符串
  步骤：
  S1 make_ref("demo-p") → Ref(metadata.digest=D1)
     inspect 输出打印 D1                                   # 预期面板显示 requested/frozen 一致
  S2 cp -r profile v1 → sentinel/                          # 留底
  S3 printf '\n# tuned by teammate\n' >> profiles/demo-p/*  # 确定性内容变更
  S4 dispatch_execution(key="divergence-demo")
  S5 期望：record_dispatch_failed(dispatch_id,
       "ValueError: profile configuration differs from frozen ProfileRef")
       Execution 保持 ready；chronicle 显示 Failed + 原因
  S6 restore sentinel → 重复 dispatch（新 key）
  S7 期望：accepted；正常 Finish
替代变体（各自独立可选）：
  V2 prompt drift：改 prompt 文件一个字符 → "artifact digest differs"
  V3 git rewrite：在 target repo 上 commit --amend 使 tree 不匹配
     → "WorkspaceRef tree no longer matches exact commit"
  V4 pane 替换：kill %2 再开新 pane → tmux session/pane 校验 raise
对照组（证明不是空转）：
  C0 不做破坏走完同样脚本 → accepted → succeeded
录像判定标准：S5 必须出现 failed 且原因字符串包含 'differs from frozen'；
             UI 不得在任何位置显示 succeeded/verified
```

**当前实现能否做到？** 分解回答：

- **拒绝 Dispatch：能，且已经是现状。** resolve 位于 services.py try 块内、provider.start 之前；异常 → `record_dispatch_failed(message≤256)` → `DispatchFailed` 上抛。fixture S5 无需新代码。**[TEST VERIFIED]**（mismatch raises 的三个测试）
- **记录 divergent（区别于 generic failed）：不能。** 状态枚举只有 requested/accepted/failed；"divergent" 语义只能藏在 error message 文本里。要在状态机上区分"资源不符"与"启动失败"，需要 disposition 字段——NOT IMPLEMENTED。
- **succeeded-but-divergent（更难的命题）：不能。** 例如 "main 已前进，但冻结合同继续用旧 commit 正常跑完" 这种最有教学价值的 divergence，需要 requested-selector 入库才能表述"requested main @T0 vs used pinned C vs current main D"——selector 根本没持久化，该对比无法生成。DOCUMENTED ONLY（round-2 多份候选都把 slot provenance 列为最小修改）。
- **启动后漂移检测：不能。** materialize 之后 start 之前仍有窗口；post-finish snapshot 无人消费。reconciliation ABSENT。
- **负向防线：可信。** refusal 同时意味着 Core 没有"为了演示好看而降级放行"的暗门——测试证明 mismatch 必抛。

Fixture 结论：可以录"拒绝并留痕"，不可以录"带 divergent 徽章的成功"。P0 措辞必须 accordingly。

---

# 90-second Demo

A 型体验、可选 Work 开场（先不建 Work，直接 Execution——现库要求 work_id，见 Blocker L-6 的 P1 备注：本期以"快速建一句话 Work"两秒镜头替代，旁白不得暗示 Work 理论必选）。≤3 resources：source、profile、instruction。真实 Harness=Codex tmux。

| 幕 | viewer sees | 真实系统 | Core fact | 不能声称 |
|---|---|---|---|---|
| 0:00–0:08 终端里 `abx/demo` 脚本创建一句话 Work 与 Execution（intent 打字可见） | bash+sqlite | Work 行、Execution 行、evt CREATE | — 不能声称"未来计划已就绪" |
| 0:08–0:22 review 屏幕：三行 requested→exact（commit C8..+tree / profile demo-p+D1 / instruction sha 9d02..），右下角 pane %2 高亮 | git rev-parse、ProfileRepo、sha256sum（同一组命令观众可在旁路终端复跑） | Ref rows 尚未写；draft 在本地文件 | 不能称此时已 freeze；不能展示第四槽以外的"MCP/credential 行" |
| 0:22–0:34 Freeze & Launch：digest 一闪，receipt accepted，%2 开始真实 Codex 输出（≥4 秒不剪） | sqlite INSERT×N → provider.start → tmux send-keys | frozen inputs rows、dispatch accepted、EXECUTION_DISPATCH_REQUESTED event | 不能声称 provider 内部 durable accept（现状=start() 未抛异常） |
| 0:34–0:46 **矛盾镜头（来自 §4 fixture 的 S3–S5 预录**，剪辑上放在第一次成功之后作为快切）：teammate 改 profile → 再次 dispatch → Failed+'differs from frozen' | 同 S1–S7 真命令 | dispatch row state=failed + error text | 不能说"系统检测到生产事故"；只能说"再次放行被拒" |
| 0:46–0:58 用户干活、steer；回 board 按 f；倒计时字幕 'turn 完成 ≠ 结束' | tmux capture-pane；provider.finish() | NATIVE SessionRef、ArtifactRef(scrollback sha)、terminal | 不能展示完整 transcript 覆盖宣称（只有 ≤64KiB） |
| 0:58–1:20 E 卡薄版：三行两态——『pinned & pre-flight verified ×3』『模型侧消费 unknown』『续看仅限截获输出』 | board render.py（本期内嵌最小改版） | 无新 facts；复述既有 rows | **不能出现 verified/consumed/reconciled 词**；不能给每格打绿勾 |
| 1:20–1:30 review 评论到达 → continue-from-here：E2 建立，Board 自动画 'continues native session' 弧线指向 E1；E1 卡片盖 'SEALED' 章 | derived relation(model.py)＋Pi/CodexContinuationV1 | 新 E2 输入含 SessionRef(S1)；E1 无任何字段变化 | 不能声称 Core 有 lineage 字段（现无 continuation_of 列）；不能 reopen E1 |

传播主线一句话：“它在放行前认真核对，放行后寸步不改写历史。”

---

# 3–6-minute Demo

在 90 秒闭环上追加组件。每个追加组件的存在理由单独给出，不为 provider 数量买单。

| 时间 | 内容 | 存在理由（为何不可删） | 不能声称 |
|---|---|---|---|
| 0:00–0:40 痛点前置：15 秒真人翻 shell history/v2-final 分支找“上次用的什么”，失败收场 | 让 abstain-cost 具象化；round-1 场景 1 | 不能暗示痛点已被量化 |
| 0:40–1:45 90 秒版全程重演（慢速版，review 页多停 3 秒给 digest 特写） | 主叙事 | 同 90 秒限制 |
| 1:45–2:20 Human decision：review 评论屏幕可见；用户读完 E 薄卡才决定‘只读复查一轮’；E2 用 reviewer profile+read-only worktree 新建 | 展示“决策基于 known/unknown 清单”——platform 价值主张的核心一步 | 不能声称系统替人决定；unknown 行保持灰色不消失 |
| 2:20–2:50 Work 历史：W 下 E1(sealed)/E2(reviewer)/E3(fix) 时间线并列；complete work 需键入 reason 'CI green; all unknowns accepted' | Work 作 B 类聚合的最小正当性镜头；round-1 判 B 模型 | 不能宣称 Work 不可被 Issue 替代 |
| 2:50–3:20 CI 低调出现：旁路浏览器打开 GitHub Actions 页（**非 Agent-Box 功能**），head_sha 与 binding 卡上的 C 一致 | 诚实交代外部权威在自己地盘运作；为 future RunRef 对账留钩子 | **绝不宣称作 Agent-Box evidence**；画面加“外部系统”水印角标 |
| 3:20–3:50 crash beat：kill -9 dispatch 进程→重启→`recover`（tmux recover_handle 路径）找回 handle→receipt 标 recovered；若 substrate 无法反查则如实打 ambiguous 灰条 | 崩溃恢复是共享 kernel 的差异化支柱之一 | ambiguous 情形**必须保留灰条**，不得剪掉 |
| 3:50–4:10 收束：完整_evt ledger 滚屏 3 秒＋标语“Submit the present. Remember the past.” | append-only 记忆是品牌钉子 | — |

剔除项及理由：LangGraph canvas / 未来 DAG（禁令）；多 Agent 数量堆砌（数量从来不是责任边界）；DSH 插件宣称（§8 判决）。LangGraph checkpoint、GitHub API 回读等 round-2 候选稿里的镜头全部退出，因 NOT IMPLEMENTED。

---

# Cross-form narrative risk

- **Viewer 是否会认为 Work 必选？** 会。Demo 第一个动作就是建 Work，而产品 schema 也真的强制 work_id——观众无法区分“产品限制”与“刻意叙事”。纠正：一词不省的固定台词“Work 今天是默认容器，一次单独的执行本来就可以不需要它”。以及 ui hint：new-execution 流程给出“跳过命名”入口即使内部仍建骨架 Work（须提前向观众言明是占位）。
- **Viewer 是否会认为 WorkBoard 就是全部 Agent-Box？** 会。Pane %0 里 WorkBoard 占满全场。纠正：镜头 3:50 前后给 service 层调用一个 8 秒特写（python REPL 直接 import services 读写同一 db），台词“同一个内核，三种皮：CLI、库、这块板子”。
- **Viewer 是否会认为 Agent-Box 决定下一步？** 风险中等（timeline 纵轴容易被读成 pipeline）。纠正：每次 Finish 后屏幕右下角弹出固定贴片：“下一步 = 你。这里没有计划队列。”不让板子在任何时刻显示 future items。
- **Viewer 是否会认为 LangGraph 在 Core 内？** 本轮设计已把 LangGraph 镜头全部移除，风险关闭；若未来加回 Mode B 镜头，必须用双框动画标出边界。
- **一句 UI/旁白纠正总汇**：“Agent-Box 管一次执行从承诺到结算的账，不管你的目标怎么排期。”
- **是否需要显示 'Execution may also be created by external Hosts'？** 需要，且写成 UI 元素而非只在口播：E1 详情页右上角常驻 `created-by: human(console)` 徽章（provenance map 已能存这个字符串——LOCAL VERIFIED，字段现成），3 分钟版的 CI beats 处再口头补一句。理由：candidate 02/03/04 的共存前提都依赖 direct/host 双通道想象，一行徽章是最便宜的反面证明。

---

# Demo topic verdict

**选项四选一裁决：更换为已有真实 target（同时保留 investigation/repair 叙事）。**

原因对照：

- 继续使用（DSH multi-session plugin 作主宣称）：不可接受。target repo 只有 README（prepare_target_repository.py），fixture BLOCKED（storyboard §828 自列 No-Go 条件），isolation/shared-resource tests 不存在。录出来必然违反“不得靠 seed 数据掩盖”的任务红线。
- 缩小目标（仍讲 DSH 但只讲调研路线图）：比前者好，但 Airtime 产出极低——对一个空仓库做 6 分钟调研没有观众留存，“investigation as show”是反传播题材。
- Preview 先只展示 investigation/repair、不宣称插件完成：正确的心态、错误的载体——难点不在宣称而在**目标仓库本身空无一物**，repair 无处着力。
- **更换为已有真实 target（选定）**：把 E1/E2/E3 换到一个真实小仓库的一个已知可修问题上（候选：agent-box 自己的历史 issue、或任一本地开源小工具的 flaky test）。好处全在红队立场：①git pin/漂移/完工判定全部落到真实 diff 上；②"expected-vs-actual"至少有 actual 可言；③失败可重现、成功可验证（跑 test 命令就是 evidence）；④零 fixture 建设成本即可开拍。DSH 插件立项不撤销——但它回归 roadmap，待 fixture+probe 落地（storyboard P0 行自提的条件）再谈镜头。

附带清理项：storyboard 中已完成的部分（A/B/C session matrix 台词、bwrap projection、OpenCode projector、“GH Actions C3 matrix 通过”）在 target 更换后一律不得复用到新视频里——它们描述的是另一个尚未存在的世界。

---

# Preview blocker ledger

只列影响诚实演示的缺口。分层：Core / Plugin / Host:UI / Demo fixture。判级原则：没有就不能录=P0；明显增强=P1；不影响主证明=P2。禁令自查：workflow/generic retry/scheduler/sandbox platform 均不在列。

**P0**

| # | 层 | 缺口 | 为什么不修就不能录 |
|---|---|---|---|
| P0-1 | Demo fixture | 真实替换 target（§8 选定的仓库+基线 commit+sabotage 脚本固化成 divergence_fixture/ 目录） | DSH 空 repo 无可证明对象；sabotage 步骤不固化为脚本则每次录制手工改文件不可重现 |
| P0-2 | Host:UI | Evidence 页从计数器改为薄对账卡（两态渲染：pre-flight verified 行 + unknown 行），文案取自 §3 措辞模板；**不含 typed claim 字段改造** | 现页面只有 counts+"coverage unavailable"，录出来与“Launch happened”无差异；此缺口正卡在“漂亮 UI 掩盖 Evidence 缺口”的红线上 |
| P0-3 | Host:UI | Failed-dispatch 原因文案在卡片上层高亮呈现（而非只在 detail 区一行小字） | §4 的矛盾镜头视觉重心；静默失败会让观众以为系统没反应 |

**P1**

| # | 层 | 缺口 | 说明 |
|---|---|---|---|
| P1-1 | Core | 状态机增加 divergent（或 refused-pre-flight）与 generic failed 区分 | 让 S5 转为正式 fact 而非 error 字符串；对 E 卡可信度是实质提升但两态薄卡版本可先行 |
| P1-2 | Core | requested-selector 随 slot 入库（slot purpose+selector 字符串） | 解锁"requested main @T0 vs used C"叙事；无它则以 pin-stability 叙事替代 |
| P1-3 | Core | terminal Execution 禁止 resume_execution()+failed-idempotency 重调修复 | 断代原则的一致性；demo happy path 不触发故非 P0 |
| P1-4 | Plugin | Codex App Server crash 后 recover_handle 等价物（跨进程） | 3 分钟版 crash beat 若走“ambiguous 灰条”可不阻塞录制，只是画面弱一档 |
| P1-5 | Host:UI | new-execution 的“跳过命名”UI 入口（内部骨架 Work 占位并明示） | 防“Work 必选”误读；两秒镜头成本低但优先级低于主要三幕 |

**P2**

| # | 层 | 缺口 |
|---|---|---|
| P2-1 | Plugin | resource_state 迁往受控词表+authority/method 字段（v1 产品需求，recording 可用纪律性脚本绕过） |
| P2-2 | Core | continuation_of lineage 列 |
| P2-3 | Plugin | scrollback 捕获上限可配置+越大越好的转写导出 |
| P2-4 | Host:UI | created-by/host 徽章样式打磨 |

明令不入账：LangGraph adapter、Temporal wrapper、GitHub Actions reader、generic retry/scheduler/cancel、sandbox/bwrap 平台化、signed attestation、远程 service。以上皆可显著增强竞争力但均与“能否诚实录完这支 Demo”无关。

---

# Viewer test

五题协议（沿用 round-1 comprehension 方法论：盲看、不回放、不给提示词）。通过线：每题 ≥4/5 独立答对。

| # | 问题 | 通过标准（合格答案要素） | 主要失分信号 |
|---|---|---|---|
| VQ1 | 这个工具管什么？ | 一次执行的责任窗口：放行前锁定精确输入、放行前核对、结束后留下不可改写的责任记录与 unknown 清单 | “管理 DeepSeek 配置”“管理 tmux”“是个启动器” |
| VQ2 | Binding 和平时的 config 有什么不同？ | Binding 是这一次执行专属的冻结快照（含当时的 commit/摘要），config 是长期共享的设置；两者一对一核验而非等同 | 把 panel 里 profile 名当成“就是配置改名”；认为 Binding 会随后台配置变化自动更新 |
| VQ3 | 为什么它不只是个 agent 启动器？ | 至少说出两根钉子：放行前 mismatch 拒绝（不启动）、E1 盖章 sealed 永不重开、Finish 是人为的显式动作 | 只记住“要先填一下表才能开” |
| VQ4 | 为什么有了 E2 还留着封存的 E1？为什么不能再打开 E1 继续？ | 新责任新约束必须配新合同；重开 E1 会篡改历史边界；session 可以连续但责任窗口不行 | “无所谓，就是个列表顺序问题” |
| VQ5 | 这次执行有什么是被证实的？什么还未知？ | 至少区分一组：pre-flight 核对(pinned/核对过) vs 模型侧消费未知 vs 截获输出有限；并能指出某一个具体的 unknown 例（如“它读了指令吗？”） | 认为“任务完成=全部证实”；或在灰色行旁脑补绿色结论 |

采集方式附加要求：看完后请观众凭记忆指出画面里任一 evidence 来源（比如 scrollback 文件/git 命令），指不出即 VQ5 连坐 fail。预期失败热点：VQ5 是最难的一题（round-1 七问法中最弱的同为证据类），若首轮 <4/5，裁剪镜头而不是补旁白。

---

# Kill criteria

命中任一项即触发相应退出动作，不允许用叙事补救。编号 K-A 型系列：

1. **K1 Evidence ≤ request echo**：抽样核对任意一次演示产出的 evidence 显示，其信息量逐字段等价于 expected/request 抄写 + provider 自报计数（无一处独立 read-back）⇒ “accountability platform” 宣称撤回，降为 governed launcher 定位。
2. **K2 continuation 无法真实运行**：E2 沿用 S1 的镜头两次彩排均无法在不伪造事件的前提下完成（contract 或 provider 任一层不支持）⇒ 从叙事中删除断代三幕，90 秒版主钉只剩 refusal+pinned。
3. **K3 WorkBoard 依赖脚本才能推进**：离开 runbook/seed 脚本，初次使用者 10 分钟内无法独立走完 create→freeze→finish；board 的按钮只是脚本的傀儡 ⇒ A 型 console 主张失败，Inspector-only 重组。
4. **K4 target fixture 不真实**：为拍摄引入的 target 仓库/任务与真实开发无关、或 sabotage 步骤无法脱离录制者手控复现 ⇒ 本轮 §8 的更换裁决失效，题材退回择优重来阶段。
5. **K5 观众只记住 tmux**：盲测自由回忆中出现频率最高的名词集合里 tmux/Codex 居首而 freeze/sealed/unknown 均未出现 ⇒ 叙事重建；二次复发则承认单视频渠道对该产品无效，转向书面案例营销。
6. **K6 Work 与 workflow 混淆率超标**：VQ 类问题中“它会帮我安排下一步吗”或“这是我项目的计划表吗”答率 >30% ⇒ 裁剪 Work 相关镜头并在所有物料强化双通道定位说明。
7. **K7 unknown 被隐藏或美化**：任一版本成片中，known-unknown 信息缺席、被折叠到不显眼层级、或被 '✅' 视觉语言稀释 ⇒ 即刻撤片重剪；二次违例视为诚信红线事故而非性能问题。
8. **K8 预置 DAG 才能 demo**：若为了让 chronicle “看起来像流程”，预先生成未来执行计划/箭头/甘特 ⇒ 直接违反三方共识禁令，产品方向判断失误升级，提交仲裁是否还留在 A 型。
9. **K9 refusal 变成表演**：divergence fixture 只在录制环境中可通过，日常 dispatch 因浮阈或竞态导致 false-positive 拒绝率可感（试用用户抱怨放行受阻≥2 人次/周）⇒ pre-flight 核对阈值需调参；“拒绝”卖点暂撤。
10. **K10 外部听众把它认成 JIT 管道**：两侧 receipt 双镜头版本放映后，≥半数受访者把 Agent-Box 当成新一代 workflow builder ⇒ 定位文案重构。

---

# Final verdict

**B. 可以证明共享 Kernel，但必须缩小 Demo 和产品声明。**

推理链：

1. **共享 Kernel 的证明义务今天就能履行。** 328 个通过的测试覆盖的是同一条合同在不同客户端下的行为一致性：CLI、library、WorkBoard 共享同一 services/repository 层（round-2 候选 02 的“共享合同 checklist”的三项可满足其一）。freeze/幂等/一-E-D/断代不变量全部 TEST VERIFIED，不是纸面。候选们（round-2 A–D）设想的许多镜头缺口里，**refusal-before-start 这一根最粗的钉子已经现成**——它恰好也是唯一能把 Agent-Box 与普通 launcher 区分开的动作。因此“完全不能证明”（选项 D）过苛。
2. **但按当前素材原样录制必然违背三条红线中的两条**：Evidence 页是无对账能力的计数器（违背“不能靠漂亮 UI 掩盖缺口”），DSH 题材无 fixture（违背“不得用 seed 数据”）。“ beautifully-faked matrix” 与 “empty-repo plugin 完成” 都是本轮明令禁止的产出。因此无条件放行（选项 A）不成立。
3. **C（只能证明 launcher/SDK）与 B 的分界线**在于断代/Finish/双通道语义是否构成非 launcher 事实——它们构成（SEALED E1、显式 actor、Work 后挂外部 ref 空间、跨 CLI/library/board 同内核），且这些同样是 launcher 不具备的。所以 C 低估了现存资产。
4. **E（换题材）不成立**：§8 已论证要换的是 target（branchable 操作），不是 Demo 的整个主题。与 B 相容。
5. **落地条件**（即 Blocker Ledger 的执行顺序）：P0-1/2/3 完成前不开机；90 秒版先行、3 分钟版依赖 P0 全清+crash beat 二选一路线确定；全部成片按 Viewer Test 协议过 VQ1–VQ5；Kill criteria 作为持续监测项随片归档。宣传措辞全面采用 §3 的最强准确句——那句话里没有一个假动词，也就没有一个会被 K 系列击穿的镜头。

*本报告未读取 round-3 其他输出；除本文件外未修改任何代码、测试或文档；未执行 Git 操作。*
