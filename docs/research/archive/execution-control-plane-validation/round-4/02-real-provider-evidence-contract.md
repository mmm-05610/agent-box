# Round 4 · 真实 Provider Evidence 能力与最薄 Reconciliation Adapter 协议

日期：2026-08-27。工作目录 `/home/maoqh/projects/agent-box`。本报告只读取指定 round-3 输出（04、01）、ADR-0006 与当前仓库实现；未读取任何其他 round-4 输出。未修改代码，未执行 Git 操作。

标签体系：

| 标签 | 用途 |
|---|---|
| **LOCAL VERIFIED** | 本轮直接核对本机文件/行为 |
| **TEST VERIFIED** | 由现有测试套件钉死的路径（基线：round-3 复跑 328 passed，插件 84 passed） |
| **DOCUMENTED ONLY** | 仅存在于设计文档/spike/storyboard |
| **ABSENT** | 无生产执行路径 |
| REPOSITORY VERIFIED / ROUND-1..3 EVIDENCE / REASONED PROPOSAL / DESIGN NOT IMPLEMENTED / REQUIRES USER VALIDATION | 论证性结论沿用前几轮语义 |

接受的背景约束（全部照办）：Provider 自持 observation；Human Finish 调 `Provider.finish()`；Provider 返回 terminal Observation；Core 不新增 Finish entity；terminal 不可 reopen；continuation = 新 Execution + 冻结旧 SessionRef；无 continuation_of entity；projected 永不写成 consumed；不可证明一律 unknown/unverifiable；secret value 不进 Evidence。

---

# Executive verdict

**总判词：当前真实 Provider 已经能支撑一个"pinned + pre-flight refusing + sealed + honestly-unknown"的证据层——证据能力的最强点在 dispatch 事务内的 resolve-time 复核（四类资源Mismatch 必拒），最弱点是 post-run 对账（reconciler 不存在，Evidence 页是计数器）。因此本轮交付的协议只做三件事：(1) 把已经隐式存在的 verify 动作显式化为可选 `ResourceProvider.verify`；(2) 把 comparator 按 contract_id 归属到与 ResourceProvider 同包发布，Core 永远不学资源语义；(3) 以 issuer-role 规则压制插件自称 authority。** **[REPOSITORY VERIFIED 现状 + REASONED PROPOSAL 协议]**

四个决定性事实：

1. **pre-start refusal 是全仓库最硬的 evidence 能力**：git tree 改写、worktree HEAD≠frozen、profile bytes 改动、prompt 内容改动、tmux 身份/版本不符——五条都会在 provider.start 之前 raise 并落为 Dispatch failed [REPOSITORY VERIFIED]，而 post-run 的 expected-vs-actual 对账在产品里不存在 [ROUND-3 EVIDENCE]。
2. **post-run 材料其实大部分已存在，但没有通路**：`GitWorktreeResourceProvider.snapshot()` 能产出 head/tree/diff_digest/dirty [REPOSITORY VERIFIED resources.py:105–120]，但没有任何 finish 路径自动调用它；Codex/Pi 的 scrollback/session JSONL artifact 落盘且带 sha256 [REPOSITORY VERIFIED tmux_provider.py:320–366, provider.py:438–449]。缺口不是采集能力，是 claim 结构与写入口径。
3. **两个结构性空洞无法靠 adapter 解决**：credential reference 无 Ref 类型、无版本 pin [REPOSITORY VERIFIED models.py:23–28]；MCP/plugin 的 tool-call 事件虽然会出现在 Codex JSONL 里，但没有任何组件解析或声明它们 [TEST VERIFIED absence]。
4. **Evidence 页现状（coverage="coverage unavailable" 硬编码、自由字符串 state）意味着任何 "verified/consumed/reconciled" 宣称今天都是伪造** [ROUND-3 EVIDENCE model.py:225, services.py `_validate_resource_states`]。

对 §12 六问的一句话预答：可支撑级别 = T1–T3 混合（见 Trust model）；最强 Provider = git-worktree；最弱 = credential/MCP 类（整体缺席）；不进 Preview Evidence = credential、负向 undeclared-input 声明、模型消费类；最薄协议 = §5 的 1+1+1 组合；Core 绝不可推断 = consumed、负向完整性、authority 真值、业务完成。

---

# Provider readiness

逐类别标定。"锚点"给出本轮亲自核对的位置或测试文件。

| # | 类别 | 标定 | 锚点与说明 |
|---|---|---|---|
| 1 | Git selector→commit/tree | **TEST VERIFIED** | `make_ref`: `rev-parse {selector}^{commit}` + `{commit}^{tree}` 入 metadata（resources.py:61–74）；resolve 时双重复核，tree 不符抛 "WorkspaceRef tree no longer matches exact commit"（:87–89）[tests/test_work_core_real_resource_providers.py] |
| 2 | worktree materialization | **TEST VERIFIED** | detach worktree add；新物化与已存在两条路径都回读 `HEAD^{commit}` 对比，不符即拒（resources.py:93–102） |
| 3 | artifact digest | **TEST VERIFIED** | 文件 SHA-256 进 native_id；resolve 重算不等抛 "artifact digest differs"（resources.py:148–158） |
| 4 | profile digest | **TEST VERIFIED** | manifest digest 显式排除 auth.json/sessions/logs 等 mutable/secret 面（resources.py:161–176）；resolve 重算对比（:239–249），异常文案已被测试锚定 |
| 5 | prompt artifact 投影 | **TEST VERIFIED** | PromptFragmentV1 渲染进 turn/start body / Pi argv script；digest 双侧记录；App Server JSONL 会记录请求事件 [provider.py:272–279] |
| 6 | tmux pane identity | **TEST VERIFIED** | display-message 单行九字段冻结身份+identity digest；resolve 只比对不可变坐标（socket/server PID/session/window/pane），version 不符拒绝；专用 console 带 `@agent_box_ref` 所有权 marker 防冒领（plugins/agent-box-tmux/provider.py:75–139, 188–249） |
| 7 | Codex App Server thread/turn | **TEST VERIFIED**（fake harness 测试）/ live Thread-Turn ID 曾由 round-1 real-provider spike LOCAL VERIFIED | JSON-RPC client 全量 stdout 落盘 JSONL（provider.py:107–129）；thread/resume 分支支持 CodexContinuationV1 |
| 8 | Codex tmux interactive | **TEST VERIFIED**（机制级）/ live SessionStart hook 属 round-1 LOCAL | TOML hook override 写 session-start JSON（tmux_provider.py:171–180）；续接 session_id ≠ frozen → RuntimeError（:296–302）；finish 捕获 ≤64KiB scrollback，chmod 600（:320–351） |
| 9 | Pi session | **TEST VERIFIED** | `--session-id` fresh id 直通；continuation `--session {file\|id}`；prompt digest/start record/session .jsonl 存根（pi/provider.py:92–183, sessions.py） |
| 10 | MCP config/tool events | **ABSENT** | JSONL 中可能出现 mcp tool-call 事件，但零解析、零 claim 类型、零 capability；RefType 无对应类型 |
| 11 | credential reference | **ABSENT** | 无 CredentialRef；Pi 仅继承环境 `DEEPSEEK_API_KEY` 且不入库（pi/config.py 注释明示）；profile digest 设计上排除 secret 文件 |
| 12 | LangGraph Thread/Checkpoint | **ABSENT**（spike 形态 DOCUMENTED ONLY） | `RefType.WORKFLOW_INSTANCE` 仅枚举字面量；spikes/langgraph_operator_lab 是实验室，不得当集成 |
| 13 | GitHub Actions Run/Attempt/SHA | **ABSENT**（DESIGN NOT IMPLEMENTED） | 无任何 CI provider；RunRef 只能作为普通 correlation 字符串出现 |
| 14 | output commit/tree/diff | **TEST VERIFIED（能力）/ 未接线（通路缺失）** | `snapshot()` 给 head/tree/diff_digest/dirty/tracked_dirty（resources.py:105–120）；但没有任何 finish 流程自动调用并写入 resource evidence——是否发生取决于 host 脚本自觉 [ROUND-3 EVIDENCE] |
| 15 | captured transcript/scrollback | **TEST VERIFIED（bounded/partial）** | App Server events JSONL 整体 sha256 ArtifactRef（kind=app-server-events）；scrollback ≤64KiB，ArtifactRef metadata 明示 `evidence:"partial"`（tmux_provider.py:353–366） |

小结：**15 项里 8 项 TEST VERIFIED（其中 2 项带通路缺失标注）、2 项机制 TEST/live 另证、5 项 ABSENT 或仅 spike。** 已有能力覆盖全部 Binding-side 资源，consumption-side 资源全部缺席或永久受限。**[REPOSITORY VERIFIED]**

---

# Evidence ceilings

每类资源的诚实上限。E/D/C 词表沿 round-1 技术审计定义 [ROUND-1 EVIDENCE]。"最限定语"列即 strongest honest claim。

| 资源簇 | Binding expected | resolve-time exact | projection | provider read-back | external authority read-back | 最强诚实宣称 | 不能证明 | negative claim | coverage | locator |
|---|---|---|---|---|---|---|---|---|---|---|
| Git commit/tree + worktree | selector+commit+tree 入 frozen set | commit/tree 双重 rev-parse | detached worktree 作 cwd | 物化后 HEAD 回读（存在新旧两分支都查） | **git object store 即外部权威**（rev-parse 是 authority read-back） | "启动前由 Git 权威核实了精确 commit 与 tree，并在物化时复验 HEAD 一致"(E5/E6) | 之后 agent 自身的合法改动（属产出不算漂移）；快照窗外的变化 | 否（窗外 C0） | 该对象本身+物化时刻 | Ref metadata.tree + snapshot dict |
| prompt/context | ArtifactRef sha256 | file hash 复算比对 | bytes 进入 request body | 无独立 reader | —（AppServer 收录为 side evidence） | "这份指令确实进入了发给模型的请求"(E2/E6 projected) | 模型是否阅读/采用(永远 E0) | 否 | 被捕获字节/收录事件 | prompt ArtifactRef + events JSONL |
| profile | name+manifest digest（排除 secret/mutable） | 重算 manifest digest 相等才放行 | 文件交 harness 加载 | **无任何加载观察者** | — | "启动时重算摘要一致；是否真正加载 unknown"(D2-at-most) | 生效、读取的字节子集 | 否 | 配置文件字节面 | Ref.metadata.digest |
| tmux pane/console | 九字段身份+version+policy | display-message 身份行复核 | launch 替换 pane 内容 | inspect() reachable/dead/pid/exit | tmux server(exact socket) 即权威（momentary） | "绑定的是这个确切 pane；身份在启动前经 tmux server 复核"(E3/E5 momentary) | pane 内进程可信性、未观测时段行为 | 否 | momentary identity + 截获字节 | SESSION/RUN Ref + capture 文件 |
| Codex session | thread_id 续接冻结 | thread/resume 接受即用 | turn/start body | Thread/Turn ID 来自 response；finish 后 JSONL 可回读 | codex app-server（response/read 属官方接口） | "native 会话身份与其收录的事件流真实"(E4/E5-bounded) | 未收录事件的存在；遗漏无从察觉 | 否 | 收录事件流 | session/turn Refs + JSONL artifact |
| Pi session | session_id/.jsonl 冻结 | --session 目标可达 | argv/script 启动 | start record + prompt digest | pi session dir（本地权威，弱中心化） | "该会话由此 argv 在此 pane 启动，session 文件落盘"(E3/E4) | 同上 | 否 | 进程与会话文件边界 | handle start_record + .jsonl |
| MCP/plugin | （无类型） | — | — | — | — | **不存在 Preview 行**——渲染为显式 unknown 行或不显示 | tool 是否被列出/调用/effect | **绝不允许"没用额外工具"** | C0 | 无 |
| credential reference | （无类型） | — | env 注入（如 DEEPSEEK_API_KEY 继承） | 无版本 pin/access receipt | 需 broker 类外部系统（缺席） | "key 经环境传入未落盘；用了哪个版本 unknown"(E1) | value 版本、旁路获取路径 | 否 | E0/E1 | 环境存在性而已 |
| CI Run/Attempt/SHA | （设计目标：branch+workflow pin） | — | 触发动作本身 | — | **GitHub REST read-back 才是权威**(head_sha/jobs/artifact sha256) | （设计）"run r/a 的 head_sha==C 经 REST 复核"(E5/E6) | runner 内额外 checkout/下载依赖 | 部分（comparison 面内） | run/attemp/artifact 边界 | RunRef+attempt+artifact ID |
| captured outputs | — | — | — | 捕获进程自算 sha256 | — | "产物摘要针对已捕获字节成立"(E6-partial/self-captured) | 捕获面之外的内容 | 否 | partial/bounded 元数据已入 metadata | ArtifactRef(kind,evidence=partial/bounded) |

五条强制区隔（题设点名，全部成立且必须进 UI 词表）：**[REASONED PROPOSAL，事实基础 REPOSITORY VERIFIED]**

- profile bytes verified ≠ Harness consumed —— 当前连加载观察者都不存在， ceiling 止步 D2-at-most。
- prompt sent ≠ 模型理解 —— attention/consumption 属 E0，永久 unknown。
- pane identity verified ≠ pane 内所有进程可信 —— freeze 的只是 server 坐标，进程被替换成什么都可能。
- credential ref projected ≠ secret 未经其他路径获得 —— 无负向观测面。
- CI head_sha 的 GitHub API read-back 天然强于 Harness self-report —— authority 分层不同级，UI 必须分色渲染。

---

# Observation lifecycle

九阶段归属表。"允许写 Core?"以当前约束（resource_state subject 必须∈frozen INPUT；INPUT 冻结后禁增；native/output 冻结后仍可增 [ADR-0006 §6, REPOSITORY VERIFIED]）为准绳。

| 阶段 | Owner | 允许写 Core？ | 今天实际落库什么 | 状态 |
|---|---|---|---|---|
| resolve | ResourceProvider（dispatch 事务内被 Core 调用） | 允许（此时 INPUT 已冻结、start 未发生） | 仅失败文案进 dispatch failed message；成功路径的"tree 相等/摘要相等"等中间事实**不落库** | ◐ 半通 |
| pre-start validate | 同上窗口 | 允许 | 同上——最强的证据时刻反而零持久化 | ◐ 半通 |
| materialize/project | ExecutionProvider.start 内部 | 允许（projected 口径） | 无独立记录；projected_contracts 只是 handle 内存 echo，事后原样抄进 observation 字段 | ✗ 回声 [ROUND-3 EVIDENCE] |
| start accepted | Core（record_dispatch_accepted） | 允许+必写 | correlation 字符串 + accepted 状态 | ✔ 实现 |
| running observe | Provider.observe → Host 转 apply_observation | 允许 | ACTIVE projection + NATIVE refs；语义不变去重 | ✔ 实现 |
| Human Finish | Host 调 `Provider.finish()` → 返回 terminal Observation | 允许 | TERMINAL projection（outcome 来自 provider 判定）+ scrollback/session-start artifacts | ✔ 插件侧实现 |
| post-finish collection | Provider/Host；**协议未定** | 允许（resource_states 于 frozen inputs；OUTPUT artifacts） | **无标准流程**：git snapshot/profile 复核无人触发 | ✗ 缺口主战场 |
| recovery | Plugin（recover_handle 子集）+ Core 状态机 | 有条件 | tmux recover_handle 重建控制（不重启不再派生 D）；App Server handle 进程内存即失；crash window 无判定程序 | ◐ PARTIAL [ROUND-3 EVIDENCE] |
| late external evidence | 外部 authority adapter（缺席） | 允许但受 subject 约束 | 无通道；CI 完成晚于 E terminal 时其事实无处可靠落位 | ✗ ABSENT |

三个设计裁定 **[REASONED PROPOSAL]**：

1. **pre-flight claims 应当落库**：resolve/pre-start 是全链最硬时刻，产生 `{subject=frozen Ref, method=re-validate, disposition=conformant|refused, issuer=resource plugin}` 型 fact。这不需要新实体——`record_resource_state` 通道已在，缺的是结构化词表（v1 前可用受控字符串约定过渡，字表见 §10）。
2. **finish→collect 的自动接线归 Host（WorkBoard controller/plugin workboard_control），不属于 Core**：Core 只收 Observation 结果包（native/output refs + resource_states + projection），符合"Finish 调 provider.finish()"约束，不新增 Finish entity。
3. **late external evidence 合法性判定**：CI claim 若关于某个 frozen INPUT 资源（workspace commit）→ 允许走 resource_state subject=该 frozen Ref，disposition=divergent/conformant 附 observed_at；若关于全新对象（新 CI run）→ 作为 OUTPUT/native ArtifactRef 附着 + Metadata 声明外部 issuer。禁止的只有一种：让迟到的外部事实改写既有历史（状态机单调性保护已有 dispatch/receipt 层）。

---

# Comparator ownership

裁决框架：comparator = "拿 frozen expectation 与 actual facts 比较并给出 conformant/divergent 判定的纯函数"。它必须住在懂资源语义的那一层。

| 资源 | A ResourceProvider | B Contract-type adapter | C ExecutionProvider | D Host | E Core-generic | 本轮裁决 |
|---|---|---|---|---|---|---|
| Git commit/worktree | ● 同包实现 | 注册于 contract_id 名下 | — | — | 仅 digest 相等兜底 | **A+B 合体**：比较函数随 git-worktree ResourceProvider 发布，按 `contract_id` 注册 |
| workspace dirty/diff 快照 | ● | ● | — | — | 同上 | A+B；diff_digest 相等即 conformant，dirty=true 不是 divergent 而是"工作内容"需 UI 区分 [REASONED PROPOSAL] |
| profile | ● manifest 重算比较 | ● | — | — | digest 兜底 | A+B |
| prompt/artifact | ● file digest 比较 | ● | — | — | digest 兜底 | A+B |
| tmux pane identity | ● 身份坐标比较 | ● | — | — | digest 兜底 | A+B（不可变坐标集已白名单化，provider.py:227 注释明确 pid/command 只是快照） |
| Codex/Pi session identity | — | — | ● thread/session 归 ExecutionProvider 的读回职责（resume-mismatch guard 已在做） | — | — | **C**（双角色标注见 §6） |
| MCP/tool effect | — | — | — | 未来 server-side attestation | — | **独立 verifier 角色**（非五 owner 简单归属），Preview 内=unknown |
| credential | — | — | — | broker-authority adapter（缺席） | — | 外部 Authority，Preview=unknown |
| CI run facts | — | — | — | — | — | **external authority adapter**（github-ci-reader 角色），比较 head_sha vs frozen commit 属 source-conformance comparator（B 位，键 contract@future） |
| artifact bytes 完整性 | ● 自capture自hash | — | — | 导出器可本地重算 | digest 相等是唯一 Core 合法推断 | A（捕获方）+导出器复核义务 |

执行机制（防 `if git` 进 Core 三件套）**[REASONED PROPOSAL，依赖已验证边界]**：

1. registry 以 `contract_id → comparator callable` 索引扩展点装载（与 resource provider 同 entry-point 包提交）；
2. Core 层唯一保留的比较是 canonical-digest 相等与时间/新鲜度单调规则（语义中立）；
3. 既有边界测试"Work Core 不导入 Git/Codex/tmpl/Profile 模块、resource_contracts 不反向导入"继续作为 conformance 断言把守 [ADR-0006 §9.7–8 方向 REPOSITORY VERIFIED]。

---

# Minimal adapter protocol

从五个候选动词收敛后的最薄集合。原则：**只新增一个方法 + 一个能力 token + 一个纯函数注册位；其余用已存在的形状。**

```python
# ── 新增 1：ResourceProvider 可选方法（缺省不支持）─────────────
def verify(self, contract_id: str, ref: Ref) -> VerifyClaim:
    """NOW 重新回读自有 authority，与 frozen Ref 比较，返回 typed 判定。"""

@dataclass(frozen=True)
class VerifyClaim:
    contract_id: str
    ref_identity: str          # ref identity digest
    issuer: str                # plugin id == ref.provider（静态一致性见下）
    issuer_role: str           # resource-authority | executor | independent-verifier:<system>
    authority_class: str       # authority-readback | process-local | self-report
    method: str                # e.g. "rev-parse HEAD^{commit}"
    disposition: str           # conformant | divergent | unknown
    detail: str | None         # ≤256；绝不承载 secret value
    observed_at: datetime
    evidence: Ref | None       # ArtifactRef locator（可选）
```

- merge 了任务清单里的 `observe(ref)`/`verify(...)`/`recover_observation(resource)` 三个资源向关注点：verify 就是"现在再验一次"；恢复场景=对既有 frozen inputs 循环调 verify。
- 支持与否由 `capabilities()` token **"verify": "supported"** 声明；未声明的 plugin ⇒ 调用方得到 `CapabilityUnsupported`（沿用 require_capability 模式 [REPOSITORY VERIFIED registry/services]），Host 据此把该资源行的 post-run 判定渲染为 unknown(reason="capability-unavailable")，不得留空白冒充通过。

#（新增 2 其实是正名）ExecutionProvider 侧：

- `collect_evidence(execution, handle)` **不新增** —— 它就是既有的 `finish(handle)`：约束已规定 Human Finish 调 finish() 且返回 terminal Observation [背景约束]，codex/pi 两家 observe() 返回值已是 (projection, native_refs, output_refs, …) 形状 [REPOSITORY VERIFIED]。补的只是约定：terminal Observation 应携带其 OUTPUT artifacts 清单（两家已做到）。
- `recover_observation(native_ref)` 归入 capabilities token **"recover"** 的可选方法族：tmux 的 `recover_handle()` 是现成实现 [REPOSITORY VERIFIED tmux_provider.py:254–285]，App Server 无此能力即不声明。

#（候选 5 转 pure function）reconcile 不属于任何 Provider：

```python
# 随 contract 发布的比较器注册位（§4 裁决）
agent_box_contract_comparators: Mapping[str, Callable[[object, VerifyClaim], str]]
# reconcile(frozen_input, claims) 由 Host/视图层循环：
#   for (cid, ref) in frozen_inputs:
#       verdict = comparators[cid](expected_value_from_ref, latest_claim(ref))
```

防伪三规 **[REASONED PROPOSAL]**：

1. **issuer↔ref.provider 静态一致**：资源向 VerifyClaim 只有 `issuer == ref.provider` 才登记为该资源的 verify 行——因为只有那个插件声明了 supported_contract_ids 所有权 [registry 结构 REPOSITORY VERIFIED]。想验证别人家资源，必须走第三种角色。
2. **independent-verifier:<system> 角色单列**：github-ci-reader 这类外部适配器以 `<system>` 指名外部权威，其 claims 的 authority_class 可达 authority-readback；executor 角色的同类内容最高只给 self-report。
3. **同插件先启后验（executor 双角色）**：Codex verifier 读自己启动的 thread → 必须加注 "self-verified-by-executor"，渲染上限锁死，UI 不给它绿色确认级词汇（详见 §6）。

---

# Trust model

五级信任梯映射现实（E0–E7 沿 round-1 定义）：

| 梯级 | 名称 | 当前生产者 | Preview 承诺上限 |
|---|---|---|---|
| T1 | self-report | projected_contracts 回声、turn status、SessionStart hook | 仅记录；黄色系词汇 |
| T2 | process-local observation | tmux inspect(reachable/dead/exit)、pane PID | 记录+可显示，灰绿之间 |
| T3 | resource authority read-back | git rev-parse/manifest 重算/tmux 身份/display-message/file sha256 | **Preview 最高档**："pre-flight verified" |
| T4 | independent verifier | （缺席：CI/GitHub adapter 是第一个候选） | DESIGN NOT IMPLEMENTED |
| T5 | signed attestation | （完全缺席） | DEFER，触发条件见下 |

逐问回答：

- **issuer 怎样识别**：claim 存储 `(issuer=plugin_id, descriptor.version)` 数据字段；extension 加载报告可见 entry-point 来源 [registry LOCAL VERIFIED]。这只是署名，不是担保。
- **Core 是否信任 plugin descriptor**：**否。** descriptor 无签名可 spoof；Core 的角色只是如实存储并把 issuer 交给渲染层与 conformance 工具。信任何 accreditation 属于部署策略（DEFER allowlist），不进内核语义。
- **插件能否声称 authority**：能写字符串但换不到等级。按 §5 的静态一致与角色规则，越权声称会被降格渲染为 provider-reported；conformance 测试可机械化抓违规 label。
- **同一插件同时启动和验证**：强制 dual-role 标注 "self-verified-by-executor"，其 claim 的渲染语义等价 T1/T2 之和而非 T3——这条借用 SLSA builder≠verifier 分离原则 [ROUND-1 EVIDENCE]。
- **恶意/buggy plugin 如何限制（Preview 手段）**：append-only ledger 使坏行留痕且指认到 issuer；有界字符串/artifact 尺寸限制污染半径；mismatch 路径在副作用前 raise（错误的数据进不来）；deep isolation（签名 descriptor、plugin 进程沙箱、权限分级）明确 DEFER——承认这是 Preview 信任模型的主动收缩而非疏忽。
- **Evidence Artifact 完整性如何验证**：sha256 由捕获进程计算 = self-report of bytes [T1 附 T6 含义]；同机导出器可以低成本重算（uri 为 file://，LOCAL VERIFIED 可行）；跨机器/时间点的抗篡改需要 artifact store+签名 → v1+。
- **是否需要签名**：Preview **不需要也不承诺**。DSSE/in-toto 接入的触发条件：出现了机器之外的第二验证方（审计导出给外部、CI 结论回写冲突仲裁）。此前签名只会制造不可兑现的信任词汇。[REASONED PROPOSAL]
- **Preview 最强可承诺到哪里**：exact 一句——**"launch is pinned and pre-flight verified; the record is sealed; everything else is named unknown."** 含 attested/enforced/independent/negative/completeness 的任何变体都在线外。（此句是 round-3 措辞的证据层重述 [ROUND-3 EVIDENCE §3]）

---

# Interactive post-run sequence

一次 Codex-tmux interactive Execution 的真实序列。图例：✔ 已接线｜◐ host/脚本须自觉调用｜✗ 缺口。**[REPOSITORY VERIFIED 逐行核对]**

```text
 0 compose   WorkBoard composer 生成 draft：selector=HEAD / prompt file / profile / pane %N   ✔（draft 本地，无 Core 副作用）
 1 make_refs GitWorktree.make_rev_parse→Ref(commit,tree)；ArtifactPrompt sha256；Profile manifest digest；
             tmux 九字段身份冻结                                                            ✔
 2 dispatch  services.dispatch_execution：同事务冻结 (contract_id,Ref)+digest → resolve 各 provider：
               - git: 重验 commit/tree + 物化 worktree + HEAD 回读        → 过则不留痕，败则 failed 文案   ◐（成功事实未落库）
               - profile/prompt/tmux: 同上三条 refusal 路径              ◐ 同上
 3 start     CodexTmuxInteractive.start：argv 构造(TOML hook override)+console.launch 进 pane %N          ✔
 4 accepted  record_dispatch_accepted(correlation=pane identity URI)                                      ✔
 5 interact  人 attach 多轮 steer/纠偏；turn 完成/idle 均≠结束                                              ✔（交互本身无 Core 写）
 6 running-observe  board 'o' → apply_observation(ACTIVE+SESSION/RUN refs)                                 ✔（手动触发）
 7 FINISH    人输入大写 FINISH（runbook 纪律）→ host 调 provider.finish():
               wait_session_start → 续接 mismatch 即 RuntimeError                                        ✔
               inspect 最终 pane(reachable/dead/exit)                                                   ✔
               capture ≤64KiB scrollback → 文件 chmod 600                                                               ✔
               submitted=True；cleanup console                                                          ✔
 8 collect-native   observe() → SESSION(tmux)+RUN(tmux)+SESSION(codex session_id) refs +TERMINAL 投影    ✔
 9 collect-artifacts scrollback artifact(partial)+session-start artifact(bounded)，均 sha256              ✔
10 workspace-facts  GitWorktreeResource.snapshot(head/tree/diff_digest/dirty/tracked_dirty)              ✗ 无人调用 [r3/04 #14]
11 profile/prompt 复核  再跑 profile_contract_digest/file-hash 对照 frozen                               ✗ verify 方法尚未存在（§5 即为此设）
12 consumption rows 模型消费/MCP/credential                                                                ✗ 结构性 unknown，渲染为具名灰行
13 reconciliation view expected-vs-actual 卡片（含 verified×3/unknown×2 之类）                            ✗ Evidence 页现为计数器+r3/04 P0-2 待做
```

能做到的：0–9 全链真实、可重复、且 2 的失败分支已被测试钉死。做不到的：10–13 构成本轮全部增量的靶心——其中 13 的薄版（两态卡：pre-flight verified / unknown）在 round-3 已定为 P0 且不需要 typed claim 改造即可录制 [ROUND-3 EVIDENCE blocker ledger]。**核心判断不变式：以上任何一步都没有产生过一条 "consumed"。**

---

# CI authority sequence

> **DESIGN NOT IMPLEMENTED —— 全小节为设计稿。仓库无 CI adapter [ABSENT]，e2e/文档中的相关描述不构成生产集成。GitHub 侧接口语义依据 round-1 官方文档审计 [ROUND-1 EVIDENCE]。**

```text
 frozen commit C（来自 Git ResourceProvider，TEST VERIFIED 前 ，chain 起点）
   ↓ push/PR → GitHub Actions workflow 触发（外部）
   ↓ WorkflowRun 创建：run_id R、run_attempt A（rerun 不变 R、递增 A）
   ↓ 独立 verifier 角色适配器（§5 角色 independent-verifier:github）REST 读回：
       run.head_sha / jobs[].conclusion / steps / started_at            ← authority-readback 级别 T4
   ↓ artifact 下载：artifact_id + 官方返回 sha256 + 所属 run/head_sha 关联
       本地重算下载字节 digest 与之一致                                  ← E6
   ↓ 生成 Agent-Box claims：
       Claim(subject=WorkspaceRef(C), method="actions-run-head-sha",
             issuer=independent-verifier:github, observed_at=t,
             disposition = conformant if head_sha==C else divergent)
   ↓ 迟到场景：E 已 terminal 后上述 claim 才到达 → 按 §3-late 规则附挂，
     绝不改写 receipt/projection 历史
```

四者严格区分（这是本序列的价值核心）：

| 概念 | 是什么 | 权威 | 证据形态 |
|---|---|---|---|
| CI Execution outcome | 那个 workflow run 自己成功了没有 | GitHub（run status API） | T4 read-back |
| test verdict | 测试断言说 pass/fail | CI 定义作者（脚本自我报告的下游） | run 内 logs/report artifact，至多 E4+E6-partial |
| source conformance | 实际构建的源码==冻结的 C 吗 | **比较器结论**（head_sha vs frozen，第三方 issuer） | conformant/divergent claim |
| evidence authority | 这个 claim 为什么可信 | GitHub 平台身份 × 独立 issuer 角色 | issuer 字段+authority_class=T4 |

关键点：test 绿了不等于 source conformance 成立（runner 可能 build 别的 revision）；source conformance 成立不等于业务验收；三者共用同一个 run 却是三种强度/三种 owner 的 claims。Agent-Box 只负责让这三个词在数据上不能互相冒充。**[REASONED PROPOSAL]**

---

# Divergence fixtures

六个蓄意漂移夹具。每个给出触发、期望出口（pre-start 拒绝/post-run divergent/unknown）、claim 生成者、验证测试。前四个的失败分支 TODAY 即可测 [REPOSITORY VERIFIED 异常文案与 raise 点]；后两个随 §5/§8 设计落地后成为测试。

| fixture | 触发 | 出口 | claim 生成者 | 测试锚点 |
|---|---|---|---|---|
| ① Git/worktree mismatch | freeze 后在 target repo 上 `commit --amend` 使 tree 改写；或 worktree HEAD 被人为 detach 到别的 commit | **pre-start 拒绝**：dispatch failed("…tree no longer matches exact commit"/"worktree HEAD differs") | git-worktree resolve 内置比较 | tests/test_work_core_real_resource_providers.py（已有锚）+ 新 case |
| ② profile drift | freeze 后追加一行配置字节 | **pre-start 拒绝**："profile configuration differs from frozen ProfileRef" | profile resolve | 同上（异常 match="differs" 已被测试固定 [ROUND-3 EVIDENCE §4 S5]） |
| ③ tmux pane replacement | kill %N 开新 pane 占位 / 换 socket / tmux 升级 | **pre-start 拒绝**：identity/version/marker 三道（"@agent_box_ref 所有权不符"、"installed tmux version differs"、"pane identity differs: key"） | tmux provider resolve | plugins/agent-box-tmux/tests |
| ④ prompt artifact drift | 冻结后改 prompt 一个字符 | **pre-start 拒绝**："artifact digest differs from frozen ArtifactRef" | artifact-file resolve | 同 §① 族 |
| ⑤ CI head_sha mismatch | design-only：实际 run 的 head_sha=D≠frozen C 但 conclusion=success | **post-run divergent**（不是 failed！job 绿着） | independent-verifier:github 适配器 + B 位 comparator | （适配器缺失）先用 GH API fixture + fake verifier 单测 comparator 纯函数 |
| ⑥ late contradiction | E terminal 之后 ⑤ 类反证到达 | **late-divergent 附加行**：不改写历史，卡片尾部红行+observed_at | 同 ⑤；经 OUTPUT/native 附挂通道 | 附挂通道的单测（apply_observation 追加语义已存在 [REPOSITORY VERIFIED]） |

两面必须同测（防表演化，承接 round-3 K9）：对照组合（无破坏→accepted 全 conformant）与误报率口径（阈值只允许全等比较，避免 fuzzy 阈值引入 false-positive）。②⑤⑥ 需要 round-3 P1-1（divergent 与 generic failed 状态分离）才能在 Core 状态层区分——在此之前它们的 divergent 性只能落在 error 文案与 claim 行里，fixture 结论照抄 round-3：“可录拒绝留痕，不可录 divergent 徽章”。**[ROUND-3/4 EVIDENCE]**

---

# Preview adapter

最小可录制版本（不给实现，给规格）：只允许四类行进入画面，全部由**今天已落库/已可现场取证**的数据构成。**[REASONED PROPOSAL，承接 r3/04 P0-2 薄卡决策]**

| 行类型 | 数据来源（现存） | 渲染词 |
|---|---|---|
| pre-flight verified | resolve 成功路径（截屏演示可旁路复跑 rev-parse/sha256sum [r3/04 演示手法]）+（P1-1 后）failed 文案库 | 「启动前已由各自 authority 复核一致」 |
| provider-projected | handle.projected_contracts 措辞改为「投影清单」；指令进请求体的 JSONL 特写 | 「确已送入」 |
| unknown/unverifiable | MCP/credential/消费 类（§2 表固定的灰名单） | 「不可知——本 Preview 不观测」 |
| output-git-facts | snapshot()(host 补一行调用即可)/scrollback/session JSONL sha256 | 「结束时的仓的事实与截获输出（有限）」 |

硬规则：禁词清单 `consumed / verified execution / reconciled / enforced / independent(Preview 内) / complete coverage / negative-claims`；每张卡右上角固定角标 `creator-id`（哪个人还是哪个 host 建）——字段已在 provenance map，零成本 [ROUND-3 EVIDENCE cross-form §已核实]。

配套最小裁剪：Preview 期 whitelist = {workspace, prompt, profile, pane} 四 slot 之外的资源类型根本不出现在 composer，MCP/credential/LangGraph/CI 行只以灰色 unknown 行体现"我们知道我们不知道"。这就是"不伪造 consumed/independent/complete coverage"的工程化表达。

---

# v1 contract

Preview 之后的六项补齐（顺序即依赖序）：

1. **structured observation**：`VerifyClaim`/`ExecutionObservation` 落成受控列表（issuer/issuer_role/authority_class/method/disposition/coverage/observed_at/evidence locator），替换 ≤256 自由串 `record_resource_state`——迁移窄（resource-state 表加列+词表 CHECK），迁移先例 006 已立 [REPOSITORY VERIFIED]。完成之日 I7/I8 两条欠账不变量闭合 [ROUND-3 EVIDENCE invariants 表]。
2. **capability declaration 形式化**：token 词典固定 {start, observe, finish, recover, verify, attach, completion-signal, terminal-evidence}，`require_capability` 语义 + 未声明即 unknown-reason 的统一处理；descriptor 增加 `provides_authority_for: frozenset[ref.provider]`（供 §5 规则静态校验）。
3. **recovery**：start-attempt 先写标记 + `ambiguous` 态 + `"recover"` 能力族，逐 provider 挂 recover_handle 等价物（round-3 四份候选共提欠账 #8，此处仅从 evidence 视角强调：recover 后第一条动作就是对全 frozen inputs 跑一遍 verify，把"回来了"升级成"回来且环境没变"）。
4. **external authority adapter**：新 entry-point 角色组（如 `agent_box.authority_verifiers`），首批两块：`github-ci-reader`（§8 序列）与 `local-artifact-recheck`；claim 强制 issuer_role=independent-verifier，禁止与 executor 同 id。MCP/credential 依然 out-of-scope，直到各自的 authority（server attestation / credential broker）真实存在——这个先后次序本身就是 honesty 的一部分。
5. **conformance tests**：随 SDK 发布 protocol kit——断言 (a) 核心不含资源 import；(b) 所有声明 verify 的实现对同 `contract_id` 在给定 drift fixture 下必 produce divergent-or-refuse；(c) renderer 词表不被越权 badge 绕过；(d) group 05 四类漂移夹具为金样本。这直接服务 round-3 的 K1/K4/K8 三条 kill criteria。
6. **version compatibility**：沿用 ADR-0006 既定规则——Contract 语义变更=`contract_id` 升版 @N→@N+1，字段只加不改；descriptor.version 与能力 token 增量兼容；旧 VerifyClaim 行永不迁移改写（append-only 纪律延伸到 claim 层）。

---

# Final verdict

**六问直答：**

1. **当前 Provider 足够支撑什么级别的 Evidence？** T1–T3 级混合层，重心偏低：pre-flight resolution/refusal（T3）、tmux 进程级观察（T2）、session/scrollback 自报（T1）——足矣支撑 "pinned & refused-before-start & sealed-record & named-unknowns" 这一完整故事；不足支撑任何 post-run 对账宣称（T4 缺、结构化 claims 缺、view 缺）。**[REPOSITORY VERIFIED + ROUND-3 EVIDENCE]**
2. **哪个 Provider 的 Evidence 最强？** `git-worktree`（content-addressable 外部权威 + freeze/物化双时点回读 + diff_digest），它是表中唯一“external authority read-back”常态在线的资源线；亚军 tmux-console（momentary 身份精确但瞬时性强）。**[REPOSITORY VERIFIED]**
3. **哪个最弱？** 整类缺席里 credential/MCP 最弱（零类型零通路）；在场 provider 里 Codex/Pi 的 session-consumption 侧最弱——会话材料丰富（JSONL/hash）但消费命题恒为 E0。
4. **哪些资源不值得进 Preview Evidence？** credential reference（无 pin 无负向面）、undeclared-input negatives（coverage C0 不可救）、模型 attention/消费行（恒 unknown，只能作具名灰行而非证据行）、LangGraph/GitHub CI 行（adapter ABSENT）、以及把 ≤64KiB scrollback 当完整 transcript 的任何用法。
5. **最薄 adapter 协议是什么？** §5 全文压缩成一句：**可选 `ResourceProvider.verify(contract_id, ref)->VerifyClaim`（"verify"能力 token 声明，缺省即 unknown-reason）+ collect 沿用 finish() 现状 + recover 沿用 tmux recover_handle 模式 + comparator 按 contract_id 随资源插件包发布、由视图层循环调用 + VerifyClaim 五字段词表与 issuer-role 三规则。** Core 新增代码量为零逻辑、一 schema 词表（v1）、若干 registry 帮助函数。
6. **哪些绝不能由 Core 推断？** consumed（投影≠使用的一切变体）；negative completeness（"没用额外 X"永远进不了内核语义）；authority 真值与信任等级（只存 issuer/role，等级属渲染与部署策略）；超越合同声明比较器的 divergence 判定（业务正确性、测试语义）；完成（provider terminal/Human Finish/Work completion 三界永不合并）；未重算过的 artifact 真实性（hash 由捕获进程自报）。每一条都已有 break-glass 反例守着（fake-consumed 测试、越权 badge 规则、三态分离测试基线）。**[REPOSITORY VERIFIED 缺口 + REASONED PROPOSAL 守则]**

一句话收束：**别让 Core 学会任何一个资源的名字——让它记住谁在什么时候以何种方式把 frozen 的承诺和 world 对了一遍账；账单的真实性永远由署名的 plugin 与它的外部 authority 挣来，而不是由 schema 授予。**

*本报告未读取其他 round-4 输出；除本文所写文件外未修改任何代码/测试/文档；未执行 Git 操作。*
