# Round-3 · Kernel 替代性验证与外部包边界

日期 **2026-08-27**。本报告依据 round-1 四份文档、round-2 全部四份输出、产品重校准文档,以及对本轮亲自核验的当前仓库代码(`work_core`、`extensions/`、`resource_contracts/`、五个插件、pyproject entry-points)撰写。未读取任何其他 round-3 输出;未修改代码;未执行 Git 操作。

标签沿用前三轮:

| 标签 | 含义 |
|---|---|
| **REPOSITORY VERIFIED** | 本轮或此前由仓库代码、测试、迁移直接证明 |
| **ROUND-1 EVIDENCE** | 第一轮验证确立的事实与结论(含其中官方文档核验) |
| **REASONED PROPOSAL** | 本设计稿的主张,未经实现或用户验证(round-2 各候选亦属此类,引用时标注出处) |
| **REQUIRES USER VALIDATION** | 必须由真实用户行为检验 |

本轮审查的核心命题:

> Agent-Box 的产品形态可以多样,但必须有一个不被 LangGraph/Temporal/Git/Harness/CI metadata 轻易替代的最小 Execution Kernel。

---

# Executive verdict

**结论:B. Kernel 成立——但它的稳定价值是协议、边界情形正确性与 adapter library,而不是一个不可复制的运行时器官。**(完整判词见文末 #Final verdict)

三条支撑:

1. **最强替代方案(Temporal 中心组合)可以覆盖大部分能力**,但在四个位置要么留有会被事故利用的缝隙、要么每个团队都要重新踩一遍坑:requested→exact 的 TOCTOU 闭合、mono-dispatch 幂等的崩溃窗口、责任窗口断代(terminal 不可改写 + continuation)、跨 provider 可比较的证据词汇。**[ROUND-1 EVIDENCE**(round-1 03 已逐矩阵确认各 substrate 原生能力边界) **+ REASONED PROPOSAL]**
2. **round-2 四个候选在互不通信的条件下收敛到了同一个最小内核**:Execution envelope(id 先于副作用存在、terminal 单调、continuation 血缘)、InputManifest 冻结 + digest、幂等 mono-dispatch receipt、typed evidence claim、外置 scope;并一致降级了强制 Work 与中央服务默认([round-2 01](../round-2/01-execution-centric-work-platform.md)、[02](../round-2/02-dual-entry-execution-control-plane.md)、[03](../round-2/03-workflow-execution-substrate.md)、[04](../round-2/04-embedded-sdk-provenance-middleware.md))。四份独立设计的交集就是对 Kernel 最小集的自然实验答案。**[ROUND-1 EVIDENCE 背景下的 REASONED PROPOSAL 汇聚]**
3. **诚实的天花板**:单引擎、浅保障的用户可以用几百行 wrapper 复制 happy-path;没有非旁路 enforcement 时 Kernel 可被绕过;"不可替代"只能以"抄走 schema 容易、把边界情形做对并持续养 adapter 生态昂贵"的形式成立。若未来证据显示连这一点也无人在意,判词自动滑向 D/Kill #1。**[ROUND-1 EVIDENCE + REQUIRES USER VALIDATION]**

接受的前置事实(round-1/round-2 公理,不再重证):workflow runtime 拥有一切 progression 能力;Binding 底层零件已商品化;Work 必选未通过删除测试(`Execution.work_id` 当前必填,[models.py:77](../../../../src/agent_box/work_core/models.py#L77));crash reconciliation/cancellation/settlement aggregate 在 Core ABSENT 或 PARTIAL;Evidence 现状 `apply_observation` 接受自由字符串([services.py:314](../../../../src/agent_box/work_core/services.py#L314));合计 135 个测试通过构成回归网。

---

# Strongest no-Agent-Box substitute

选择 **Temporal 为骨架**(round-1 技术审计判定其为"最强通用替代"**[ROUND-1 EVIDENCE]**),辅以 Git/worktree、Codex native session(App Server stdio)、GitHub Actions 验证、一个普通 SQLite 账本。设计原则:**不做稻草人**——用平台工程师真实会写的工程实践(官方 API + 明确 discipline),并如实标注它仍要自己承担的部分。

## 组件清单

```text
rollback-auditor/                       # 假想项目名
├─ exec/
│  ├─ manifest.py        # canonical JSON 输入快照 + sha256(~60 行)
│  ├─ pins.py            # branch→commit/tree 解析(在调度前执行)+ worktree add @SHA(~120)
│  ├─ ledger.py          # SQLite 四张表:sheet/attempt/slot/claim + 唯一索引(~150)
│  ├─ harness.py         # Codex AppServer thread/start|resume + turn/start 封装(~250)
│  ├─ pane.py            # tmux 新窗口启动 + attach 打印 + scrollback capture(~80)
│  └─ receipts.py        # 幂等键 = f"{wf_run}:{activity_id}";同键同 digest 复用/~50
├─ activities.py         # patch_service_agent():resolve→freeze→start→await-finish→claims(~200)
├─ wait_human.py         # Workflow signal/update 等待显式 Finish + 孤儿告警查询(~120)
├─ gh_verify.py          # run/jobs API 回读 actual head_sha 对比(~80)
└─ cli.py                # finish / attach / show-evidence / list-stale(~130)
```

规模量级约 **1200 行源码 + 测试**;实现组成估算见下表(不需要精确工时,只给难度分布)。**[REASONED PROPOSAL]**

## 覆盖逐项

| 要求 | 替代实现做法 | 该项的实现成本/风险 |
|---|---|---|
| responsibility intent | Activity input payload 字段 + `memo`/Search Attribute `[ROUND-1 EVIDENCE 官方语义]` | 低 |
| exact source/workspace | workflow 第一步 resolve:`branch→sha256:tree`,payload 只传 SHA;`git worktree add wt@$SHA`;记录 worker 上 `rev-parse HEAD^{commit}` 二次回读 | 低~中(drift 判定逻辑要自写,~40 行) |
| input snapshot | canonical JSON(payload 即 immutable Event History 内容)+ 自算 digest 存入账本 | 低 |
| provider launch | activity 内 spawn AppServer 子进程,stdio JSON-RPC | 中(harness client 是最贵组件;无现成库则从 codex 参考实现抄协议行为) |
| idempotency | 双保险:deterministic Activity ID(WF run 内唯一)+ SQLite `dispatch_receipt(idempotency_key UNIQUE)` 同键同 digest 直接返回既有 receipt;异 digest 抛错 | 中(冲突矩阵要自建测试) |
| native session | thread_id/turn ids 写入 activity result → History;另存账本 correlation 表 | 低 |
| interactive attach | tmux window 里起 TUI;receipt 附 `tmux attach -t ...`;engine 无感 | 低 |
| Human Finish | Workflow 定义 `@workflow.signal def human_finish(actor, reason)`;activity 循环 heartbeat 等待 flag;finish handler 同时触发 scrollback capture 并把 actor/reason 写入 result(**显式 Finish 记录就此入库**) | 中(wait-for-human 模式 + 手势纪律,每团队重写) |
| continuation | 下一个 Activity 复用同一 `thread_id` 作输入 + 新 manifest 新 attempt;History 天然保留先后 | 低 |
| CI actual SHA | deploy job 由 Actions 执行,`gh api ... head_sha` 回读与 frozen SHA 对比,mismatch 记 divergent claim 且不让 success 掩盖 | 中(read-back helper ~80 行,好写但易忘写) |
| expected/actual evidence | 自定 JSON claim:`{subject, method, level∈{pinned-verified\|reported\|observed\|unknown}, note}` 存 claims 表;导出 markdown 卡片 | 低(首次)/隐性高(见 §Accumulating value) |
| unknown | level=unknown 即一等状态;负向断言一律禁写(无 coverage 概念就直接不给这个词) | 低 |
| long-term scope | GitHub Issue/Project 或 milestone 承担目标与完成;ledger 存 external_ref 字符串 | 低(原生更优,round-1 已证 Work 未过删除测试) |

## 主要边界(替代方案的诚实代价)

1. **单引擎锁定**:一切以 Temporal History/Memo/Search Attributes 的表达力为上限;换 Prefect/LangGraph/内部平台时 `wait_human`、幂等键、恢复扫描全部按各家原语重写,**没有任何可搬运部件**。
2. **crash 窗口仍然裸奔于最难的一段**:activity 收尾前进程死掉 → "side effect 可能已发生但 receipt 未落盘"。替代方案的 stale-scan 只能启发式(thread 名/时间窗匹配);Codex 无反查 API 时该团队自己决定"接受歧义或双跑风险"。这正是 round-1 判 ABSENT 的通用缺口在该团队内的私有重现。**[ROUND-1 EVIDENCE + REASONED PROPOSAL]**
3. **词汇漂移不可避免**:`level` 枚举三个月后会随新需求长歪;第二个团队 fork 后两组 claim 不可互相比较——因为没有 canonical 化规则钉死序列化字节。
4. **边界情形测试自担**:双跑、terminal 改写、failed-key 重发静默成功等 round-1 在 AB 测试里发现过的缺陷,这个团队要在自己的生产数据里重新踩出来。**[ROUND-1 EVIDENCE(缺陷清单)]**

结论:该替代方案对单团队**完全可行且合理**;它的每一处省略都精确落在 Kernel 候选集上(§3)。这不是稻草人弱点,而是系统性收益边界的划定。**[REASONED PROPOSAL]**

---

# Capability-by-capability comparison

分档定义:①原生可做到(engine/authority 自带,无需补充结构);②少量 wrapper(几十行一次性胶水);③需要重复实现公共协议(每次集成/每个团队都要重写,且写错的代价是事故而非 lint 报错);④无法自然做到(原语层面不存在)。

评估对象为上述 Temporal 中心替代方案;其他 engine 的差异在备注列。

| 能力 | 分档 | 依据与备注 |
|---|---|---|
| cross-domain Execution identity | 单引擎内①;跨域③ | Temporal WorkflowID+RunID+ActivityID 身份链成熟**[ROUND-1 EVIDENCE]**;但要同时关联 Thread×workspace×CI run 时,"同一次责任"的 join key 要自己发明并持久化 |
| requested→exact provenance | ②(resolve-before-schedule + payload pin) | 剩余缺口:resolve 步骤与 schedule 之间仍有窗口;pin 后 read-back 脚本②。selector 字符串本身是否入 History 取决于作者自觉 |
| atomic freeze + Dispatch intent | ②~③ | Event History 一旦写入不可变(①的一半)**[ROUND-1 EVIDENCE]**;但"解析结果与启动请求一致性要求事务边界"“同键异 digest 拒绝""一责任一 dispatch"这些不变量要靠纪律③——写错不会报错,只会晚点出事 |
| one accountable Provider | ① | 一个 Activity Execution 恰由一个 worker task 承接;无第二物主问题 |
| multi-native correlation | 单次写入②;统一查询③ | memo/result 存多个 native id 很容易;跨系统一致检索(哪个 pane 属于哪次 attempt)又回到自建 join |
| interactive responsibility window | ③ | Signal/Update 提供等待原语(①),但 idle≠完成、pane 死亡≠失败、window 跨进程存活的治理语义无一原生;每团队重写 wait-human/orphan-detect 模式,写歪=提前关闭或永久悬挂 |
| same-session new Execution(new attempt on S1) | ② | thread_id 传递 + 纪律;E1 sealed/E2 fresh 的区分只是约定,无机制阻止有人"接着上一格继续写" |
| explicit Finish(含 actor) | ②(signal handler 落 result) | 手势可达;难在不与 idle/exit 混淆——纯纪律 |
| external authority read-back(Git/CI) | ② 每 authority | rev-parse/gh api 脚本直白;容易被"反正 CI 绿了"省略 |
| evidence disposition/coverage | ③~④ | 作为**字段**容易(JSON 而);作为**共享标准**④——各家枚举必然漂移,集团内不可比;coverage 概念(bounded-complete vs unknown)需自觉理解,原语零支持 |
| crash reconciliation(start-effect vs recorded-receipt 窗口) | ③(高风险) | heartbeat 只能告知 worker 死亡;副作用去重判断完全自定义;Codex 类 substrate 反查缺失时被迫接受 ambiguous——所有团队在此各自最弱 |
| Work/long-term completion | ①(在外部系统) | Issue/Project/milestone 原生拥有目标与 closure;AB Work 不再有位置——四份 round-2 与 round-1 共识 |

汇总:12 项中 **4 项引擎/权限原生覆盖**(accountable provider、long-term scope、以及 identity/read-back 的单侧事实),**5 项少量 wrapper**, **3.5 项落进"重复实现公共协议"区**(interactive window、evidence 标准化、crash reconciliation,外加跨域 join 的统一查询面),**0.5 项接近无法自然做到**(shared evidence vocabulary 作为标准,而非某个 JSON 字段)。被重复实现的三块半恰好构成下面 §Irreducible Kernel 的主体。**[REASONED PROPOSAL 基于 ROUND-1 EVIDENCE 矩阵]**

---

# Irreducible Kernel

## 准入标准(题设五条)

每项保留资格须同时满足:(a) 至少两个 Host/产品形态复用;(b) 不能合理塞进单一 Provider plugin;(c) 不属于 workflow progression;(d) 有具体错误或不一致会被它避免;(e) 当前或近期可实现。

## Kernel 最小集(K1–K5)

### K1. Canonical Ref 与 InputManifest 冻结信封

内容:typed Ref(provider, native_id, uri, bounded metadata)+ 版本化 Resource Contract(`vendor.name@N` frozen dataclass)+ requested selector → resolved exact pin 分层(slot purpose、authority、resolved_at、resolver 身份)+ canonical 序列化规则 + `binding_digest`。

- (a) direct CLI、WorkBoard、LangGraph node、Temporal activity、evidence export 全部消费;**REPOSITORY VERIFIED**(Ref/contract/digest 已存在并被 board/codex/pi/tmux 多包使用)
- (b) resolvers 各归插件,但**信封格式与 digest 规则不能归任何一家**——codex plugin 无法替 pi 定义 manifest;
- (c) 纯数据,零 progression;
- (d) 避免:round-1 故障表第一条 `main` C→D 漂移不可质证;两团队 manifest 结构不同导致 digest 断言不可复核;types 混杂使 `Selector("main")==Resolved(ref)` 这类错误可表示;
- (e) 骨干已在;增量仅 slot provenance 字段(迁移级)。**[REPOSITORY VERIFIED + REASONED PROPOSAL]**

### K2. Dispatch 事务边界与幂等 receipt 状态机

内容:request(frozen inputs + digest + idempotency_key)在同一事务落盘先于任何 side effect;状态机 `prepared → dispatched(requested) → accepted | failed | ambiguous(recovered)`;同键同 digest 幂等返回、同键异 digest 拒绝、一 Execution 一 Dispatch 唯一约束;failed 态重放显式报错或受控 rearm(修 [services.py:101](../../../../src/agent_box/work_core/services.py#L101) 区域缺陷);recover 协议(stale-requested 扫描 → provider recover 钩子 → 补记/ambiguous 终局)。

- (a) SDK 形态(候选 D)、dual-entry S1(候选 B)、substrate(C)、direct CLI(A)无一可缺;
- (b) 与具体 provider 无关(codex/tmux 只是 recover 钩子实现方);
- (c) 无;
- (d) 避免:双跑副作用(真金白银事故)、silent-redo-after-failed、崩溃后无可操作判定程序;
- (e) 前三项已实现并有测试**[REPOSITORY VERIFIED]**;ambiguous 态、rearm 策略、reconcile_pending 为近端增量(round-2 D §3.3 已给出协议草案)。**[ROUND-2 REASONED PROPOSAL 采纳]**

### K3. 责任窗口身份规则(execution identity semantics)

内容:`exec_*` 先于 start 生成;terminal 单调(sealed 永不 reopen/API 拒绝 + 测试钉死);`continuation_of` 血缘 + SessionRef 可作多 Execution frozen input(N Executions : 1 Session);attempt vs new-E 决策函数(binding ∧ intent ∧ provider ∧ approval 不变 = attempt,否则新 E)。

- (a) 所有形态;人机两侧同样依赖"历史不被续写";
- (b) 治理规则在 Core,runtime 翻译在各 plugin;
- (c) 显然否;
- (d) 避免:E1 被 resume 污染输入(现状缺陷,resume_execution 允许 terminal 续用——须收紧**[ROUND-1 EVIDENCE]**);retry 双重计费;session 连续被误读为责任连续;
- (e) 继续/血缘现有雏形(provenance map、pi README 语义);新增 enforcement 即迁移级。**[REPOSITORY VERIFIED 部分 + REASONED PROPOSAL]**

### K4. Typed EvidenceClaim 与 reconcile 词表

内容:claim 必备 `subject(identity digest)、proposition、issuer、method、level(projected/provider-reported/process-observed/external-authority/attested/unknown)、disposition(conformant/divergent/…)、coverage(unknown/bounded-complete{window,surface})、observed_at、integrity{digest}`;reconcile(manifest × claims)产出 per-slot conformant/divergent/unknown 矩阵;禁止 free-string state(替换现行 apply_observation 弱校验)。

- (a) 所有形态的呈现层(evidence card/board/export/PR comment);
- (b) issuer 是各 plugin,词法与校验不可能私有一家;
- (c) 否;
- (d) 避免:projected→consumed 升级谎言(fake adapter 可写任意 state 的现状**[REPOSITORY VERIFIED]**);"coverage unavailable" 式硬编码欺骗;跨团队 claim 不可比;
- (e) 词条体系来自 round-1 技术审计(E/D/C 矩阵)可直接落地为受限枚举列,迁移小。**[ROUND-1 EVIDENCE + REPOSITORY VERIFIED 缺口]**

### K5. Capability握手契约(descriptor/capabilities/input_limits)

内容:provider 自声明版本、支持的操作(capability keys:start/observe/resume/finish/cancel/recover)、每 contract 的 input limits;`require_capability()` 运行期拒绝。

- 判定:勉强满足五条而保留,但它应视为 **SPI 接口的一部分随 K1–K4 发行**,不是独立卖点。原因:codex app-server/tmux/pi 三个真实实现已经形状各异(而 `require_capability()` 门禁已存在、resume 等 keys 尚无人声明**[REPOSITORY VERIFIED via registry.py capability 检查与 round-1 实现矩阵])**,说明握手面确有必要;但把它拔高为"产品能力"就是概念堆叠。**[REPOSITORY VERIFIED + REASONED PROPOSAL]**

## 移出 Kernel(去向明确)

| 移出项 | 去向 | 理由摘要 |
|---|---|---|
| Work 实体 + complete/reopen 服务 | 可选 `case` extension 包 | 删除测试未过;scope 外置(JIRA/issue/workflow-id)。round-2 四候选齐票 **[ROUND-1 EVIDENCE]** |
| 中央 event ledger 强制性 | kernel 允许 store=False 纯值返回模式 | Host 自持久的合法性(round-2 D §4) |
| projection 轮询策略/freshness 判定 | observation adapter(plugin 侧),kernel 只存已申报事实 | provider-specific 波动不属于公共语义 |
| resource resolvers(git/file/profile/tmux) | `resources-local` 及插件包 | SPI 消费者非 SPI 本体(已如此布局 **[REPOSITORY VERIFIED]**) |
| host_ref/HostScopeRef 类型与 defaults 生成 | SDK 层 | kernel 只见 opaque `external_scope` 字符串;引擎知识不得下沉 |
| admission/policy 求值器、credential broker、sandbox | DEFER(外部 Authority 组合) | 非旁路 enforcement 无任何 pull 证据 **[ROUND-1 EVIDENCE]** |
| Board/composer/exporter UI | Host 包 | 入口未证明(round-1 user verdict) |

Kernel 总计约等于当前 `work_core` + `resource_contracts` + `extensions` 的**语义子集减去 Work**,加三组小的 schema/接口增量(slot provenance、receipt 状态机扩展、claims 受限列)。"当前 Core 是否过大?"——不大:它基本就是 K1–K5 + 尚未拆走的 Work;过大的是隐含承诺(daemon 化冲动、board 主入口幻想),不是行数。**[REASONED PROPOSAL]**

---

# Package and dependency map

包结构提案(设计,不实施)。命名以分发现实为准,codex/pi 等插件目前 untracked,拆包即顺手入库(参照 round-2 D §9 迁移路线)。

```text
                        ┌────────────────────────────┐
                        │  agent-box-kernel (K1–K5)  │  ← 只 import stdlib
                        │  models/manifest/digest/   │
                        │  receipt rules/evidence    │
                        │  types/identity policy     │
                        └──────┬───────────┬─────────┘
              implements ports │           │ defines Protocols(SPI)
        ┌──────────────────────┴───┐   ┌───┴──────────────────────────┐
        │ agent-box-store-sqlite   │   │  agent-box-sdk (facade)      │ ← prepare/resolve/
        │ WAL/append-events/       │   │  freeze/dispatch/observe/    │    finish/reconcile/
        │ migrations 001..00n      │   │  external_scope/host refs/   │    export-API
        └──────┬───────────────────┘   │  defaults policy             │
               │                       └──┬──────┬──────────┬─────────┘
               │        imports sdk only  │      │          │
   ┌───────────┴────────┐   ┌─────────────┴──┐ ┌─┴──────────┴─┐ ┌───────────────┐
   │ agent-box-case-ext │   │ abx-cli        │ │ adapter-     │ │ adapter-      │
   │ (Work/Case 可选)    │   │ (attach/finish/│ │ langgraph    │ │ temporal      │
   └────────────────────┘   │ show/export)   │ └──────────────┘ └───────────────┘
                            └──────┬─────────┘
                                   │
                 ┌─────────────────┼──────────────────────────┐
        ┌────────┴────────┐  ┌─────┴──────────┐  ┌────────────┴─────────────┐
        │ agent-box-board │  │ resources-local│  │ provider-codex/-pi/-tmux │
        │ (TUI inspector, │  │ git/file/prof. │  │ (+资源 resolver 部分)     │
        │  读 store+sdk)   │  └────────────────┘  └──────────────────────────┘
        └────────┬────────┘
                 │ 渲染 only
        ┌────────┴──────────┐
        │ exporter-evidence │ claims → html/markdown/(后续 DSSE)
        └───────────────────┘
```

依赖方向强制规则与现状核对:

| 规则 | 现状核对 | 备注 |
|---|---|---|
| Core 不 import 产品 Provider | ✅ 成立:registry 仅依赖 errors/models/resource_contracts;插件经 entry-point 反转注入 **[REPOSITORY VERIFIED registry.py/extension loader]** | 拆包后保持 kernel 零 runtime import;SPI 类型放 kernel 内还是独立 spi 包?**裁决:并入 kernel**——Protocol 只有 3 个、抽两个包增加解释成本无隔离收益(rule:不为对称美拆包) |
| Core 不 import WorkBoard | ✅ 成立(board → core 单向) **[REPOSITORY VERIFIED plugins/agent-box-workboard import 清单]** | 拆包后 board 可选安装 |
| workflow adapter 不向 Core 注入 node/routing | 设计约束;adapter 包物理上无法做到(仅消费 sdk 返回值) | CodexContinuationV1 式 contract 注册是唯一合法注入面(数据类型,非行为) |
| Provider-owned config 不进 Binding | 已由 profile contract 显式排除 secret/易变字段 **[REPOSITORY VERIFIED profile_contract_digest 设计]** | 增补:credentials 走 CredentialHandle 引用前提是 K1 扩展 RefType,仍坚持"≥2 消费者才加枚举" |
| Host draft ≠ frozen Binding | 语义上已分(draft 本地文件 vs freeze 事务);schema 上 draft 无 Core 副作用 **[REPOSITORY VERIFIED runbook 行为]** | sdk 保持两阶段 API 使这一区分成为类型事实(prepare()/freeze()) |
| 插件不能改变 terminal/continuation/evidence 语义 | ⚠️ 当前不足:apply_observation 弱校验意味着敌意/马虎 plugin 可写任意 state;capability 门禁只挡不支持的操作,不挡伪造证据 | K4 落地(受限 disposition 列 + issuer 必填)是让该规则可执行的机制,而不仅是文档道德 |
| 导入方向禁止环 | ✅ 现状无环 | 拆包后以 import-linter/CI 静态检查固化 |

工作板相关 entry-points 的归属裁决:现有 `agent_box.plugins`(Core 面)与 `agent_box.workboard_resource_inputs`/`agent_box.workboard_execution_controls`(Board 自有面)**[REPOSITORY VERIFIED 五个 pyproject]** 恰好示范了正确分层:Core 只认三种组件;UI 想要自己的适配面,自己去定义 group、自己加载。这个既成事实值得写成规矩:**Kernel 的扩展面只有 ExecutionProvider/ResourceProvider/Contract 三种;其余一切"adapter 概念"都是某 Host 包的私有协议。**

---

# Extension protocol assessment

逐面审判(是否真实需要 = 是否已有 ≥2 个异构真实实现或不可避免的二方需求;避免无限 schema):

| 扩展面 | 判定 | 论据 |
|---|---|---|
| ExecutionProvider(descriptor/capabilities/input_limits/start/observe) | **真实需要** | 已有 4 个实现形状各异:coded AppServer 流式、Codex-tmux 交互、Pi-tmux、tmux 通用;observe 返回类型已是 provider-defined。保留 Protocol,冻结签名语义 |
| capability flags(resume/finish/cancel/recover) | **真实需要(新增 keys)** | 现 require_capability 机制就绪**[REPOSITORY VERIFIED]**;resume 聲明缺失导致 Core 动态调用兜底(round-1 指认);flags 应改为 dict[str,str] 枚举值 supported/emulated/absent 文档化 |
| ResourceProvider.resolve(contract_id, ref) | **真实需要** | git/artifact/profile 三实现;contract 校验(unknown contract 拒绝注册)防止 schema 漂移 |
| Contract 注册/版本化(`id@N`) | **真实需要** | 既是 K1 的地基也是插件生态的兼容边界;CONTRACT_TYPES 内置目录 + register_contract 双轨已被 registry 注释解释为兼容用途 **[REPOSITORY VERIFIED]** |
| Plugin bundle(entry-point + api_version + 原子注册) | **真实需要** | 加载器已实现 duplicate-id 拒绝、失败隔离(strict 可选)**[REPOSITORY VERIFIED extensions/loader.py]**;多 Host 时代这是分发主干 |
| ResourceInputAdapter(`agent_box.workboard_resource_inputs`) | **Board 私有协议,非 Core 协议** | 它产出的是 UI draft(Host draft≠Binding 的实证);不应晋升 Core 概念;若 IDE/CLI 未来也要 draft 适配,复制此 group 模式即可 |
| WorkBoard execution controls(finish 按钮等) | **Board 私有,须经由 sdk 动词** | 控件不得自定义终态语义,只能调 sdk.finish_by_human;现状经 services 单路径,保持即可 |
| Host adapter(langgraph/temporal 包装) | **约定,不是注册协议** | 每个 adapter 只是把宿主原语翻译成 sdk 调用;注册进 Core 毫无意义,禁止为此造第三组 entry-points |
| Observation/recovery adapter | **以 capability flags 吸收,不设新类** | observe 已在 Protocol 内;recover 仅是下一枚举位;单独 SPI 类属于概念堆叠(round-2 D 已按钩子函数处理,采纳) |
| Evidence exporter | **纯数据消费者,无需协议对象** | claim schema 稳定后 exporter 是函数;DSSE/attestation 未来作为输出格式选项 |
| workflow context adapter(Mode B snapshot) | **归属各 Host adapter 包的帮助函数** | checkpoint→ArtifactRef 快照本质是 langgraph 侧技巧;Core 只见 ArtifactRef |

**概念堆叠警戒名单**(出现即抵制):GenericAdapter、UniversalSlot、PolicyObject、PipelineStep、"Host-neutral Routing Hints"、第 7 种以上 adapter 基类。反提议:任何新扩展面必须携带 ≥2 个现有实现的 PR 或一份"没有它会写出什么 bug"的事故引用,否则折叠进相邻面。**[REASONED PROPOSAL]**

---

# A/B/C/D mapping

四种形态与包组合(Kernel 是否完全一致的检验;A/B/C/D 依次对应 round-2 候选 A/B/C/D):

| 形态 | 组成包 | Kernel 差异 | 修改 Kernel 语义的压力点 |
|---|---|---|---|
| **A. Execution-centric Work Platform** | kernel + sqlite + sdk + cli + case-ext(默认开) + board + resources-local + provider-codex/pi/tmux | **一致**(case-ext 可卸载证明独立性) | 会想往 Work 加 approval/participant、往 Execution 加"建议下一步";防线:审批外置 metadata、next-step 永不进 schema(round-2 01 已自带禁令) |
| **B. Dual-entry service** | A 的全部 + store 共享拓扑(WAL 多进程)+ 可选 remote service 壳 | **一致**(S1 顶层存储替换,语义零改) | service 会诱惑加 ACL/fleet 身份合并;凡涉及全局策略的都会破坏"local-first 默认",按 round-2 B 门禁只在升级条件触发后建 |
| **C. Workflow substrate** | kernel + sqlite(store=false 可选) + sdk + adapters(langgraph/temporal) + providers/resolvers;无 board/case 默认 | **一致**(idle/wait 人交互增强 receipt 通知面,不动语汇) | 会想让 receipt 附带 routing hints、retry 建议来解决"下一步谁决定";此为越界,K3 断代语义反而最有价值之处 |
| **D. Embedded SDK** | kernel(+可选 store) + sdk + adapters + providers/resolvers + exporter;cli 是分发皮 | **一致**(store=False 时 sqlite 不装,kernel 经 ports 解耦支撑) | 会想删掉 sqlite port 换纯函数库;若发生,interactive finish/reconcile_pending 失去载体(round-2 D §4 已论证其必要) |

结论:**K1–K5 在四种形态下无需任何语义修改**——这正是 Kernel 命题成立的操作性含义。四种形态的差异全部落在"哪些外围包装箱默认安装"与服务拓扑上。反向表述:任何一个形态若迫使 Kernel 增加 progression/approval/UI 语义,当立即作为架构违规上报,而不是 Kernel 演进。**[REASONED PROPOSAL]**

---

# Dict-UUID-logs challenge

设团队用 ~300 行实现:UUID(json)、JSON manifest(dict+sortkeys+sha256)、provider call(subprocess/HTTP)、native ID 记录(str 字段)、JSON evidence(dict)。

这 300 行**确实消灭**了 Agent-Box 的以下表面:UI、board、CLI 动词、sqlite 文件管理、安装仪式、品牌。

**剩下的差距不在字段,在六处行为级边界(全部有对应测试/事故原型):**

1. **请求与解析的分型**:`Requested(selector)` 与 `Resolved(pin)` 是不同类型且转换发生在 authority 处——300 行版里它们是同一个字符串的两份拷贝,"main 漂移"不会编译错,只会到复盘才发现。类型差消灭的是一整类静默错误,不是少打几行字。**[REPOSITORY VERIFIED(_resolve_inputs 类型校验存在)]**
2. **mono-dispatch 不变量矩阵**:同键同 digest 重放直接返旧 receipt(杜绝双跑)、同键异 digest 硬拒、failed 后再调显式炸出(不 silent-success)——这三行的反面每一个都是生产事故原型;300 行版通常只实现"有个 UUID",冲突矩阵靠运气。**[REPOSITORY VERIFIED(UNIQUE 约束/冲突分支)+ ROUND-1 EVIDENCE(defect)]**
3. **崩溃窗口的可判定收敛**:stale-requested 清单 → recover 钩子 → recovered/ambiguous 终局,不许 timeout 自动洗白。300 行版的等价物是"重启后肉眼看一眼 tmux"。抽象地说都是字典;可操作地说是恢复协议存在与否。**[REASONED PROPOSAL;缺口判定 ROUND-1 EVIDENCE]**
4. **sealed 历史**:terminal 拒绝 resume、continuation_of 必为新 E、attempt/new-E 决策函数。没有这条,dict 会悄悄变成 append-and-overwrite 日志。**[ROUND-1 EVIDENCE(E1/E2 原则)+ 待收紧现状 REPOSITORY VERIFIED]**
5. **六级 claim + coverage 的受控词汇与 reconcile**:issuer/method 必填使"provider 说加载了"永远渲染不成"已验证";bounded-complete 才许写 negative。300 行版的 evidence 枚举会漂移,第二个 provider 接入日起两家 claim 不可比——那时再统一,迁移成本远高于起步就用词表。**[REASONED PROPOSAL(框架 ROUND-1 EVIDENCE)]**
6. **conformance 语料**:135 个通过测试 + binding_flow_stress 28 场景把"哪里会错"变成了可执行规格;300 行团队要用生产流量重新采样这些场景。**[REPOSITORY VERIFIED + ROUND-1 EVIDENCE]**

**诚实陈述(如果只剩……)**:对"单 Host × 单 provider × 无保障要求 × 从不复盘"的用户,Agent-Box 的剩余价值确实收缩为 **adapter 数量 + 统一词汇 + 免维护的字段正确性**——也就是一个 library 的价值。我们不试图向这类用户出售 Kernel。命题因此修正为:*在被重复实现区(interactive window、crash 收敛、多 provider 证据可比)真的痛的组织里*,Kernel 以 library 形态交付净正价值;该前提本身 REQUIRES USER VALIDATION。

---

# Accumulating value

七个价值载体的累积性判断(不做市场预测):

| 载体 | 累积性 | 判断 |
|---|---|---|
| schema/protocol(Ref/manifest/receipt/claim) | ★★☆ 缓慢累积,易复制难渗透 | 字段可一夜照抄;**canonical 规则 + 版本兼容纪律**是他方懒得维护的部分。累积条件:成为他人引用单位(死亡线 12 个月,承袭 round-2 D kill #3/#8) |
| correctness/conformance corpus(135 tests + stress 场景 + 故障矩阵) | ★★★ 真累积 | 每个新事故固化为测试是单调增量的;复制者获得的是"截至拷贝日的旧语料",且会错过后续更新。这是 B 判词最硬的部分 |
| adapter ecosystem(第三方贡献) | ★★★ 条件性最强 | 每个新 adapter 提升所有存量用户的覆盖率——网络效应真形态;监测点:6 个月内外部 PR 数(承袭 kill) |
| recovery semantics(crash/ambiguity 协议) | ★★☆ 协议层累积、per-substrate 重做 | recover 钩子按 substrate 各写一次,但骨架(shared pending 扫描/终局分类)只写一次;复制者最易在此翻车 |
| evidence vocabulary(E/D/C 六级+disposition+coverage) | ★★☆ 累积但被现实封顶 | 成为会议用语即是护城河成型;反向风险:E≤4 占比长期过高会让词表变成"诚实的墓志铭"(round-1 Q4 场景) |
| UI(board) | ☆ 易复制、入口未证 | 已降级 inspector,不承担护城河叙事 |
| central authority(admission/enforcement) | —— 当前不存在 | 只有 non-bypass enforcement 出现才可能积累组织粘性;现在谈它是把 DEFER 当资产(round-1 红队判决仍有效) |

**Anti-moat 声明**:开源宽松许可下,schema 与 reference 实现没有秘密;护城河选项只剩"更新速度 + 正确性语料 + 生态位占用"。若有损这三个中的任何一个去换短期功能 flashy,是在主动拆除唯一的长期资产。**[REASONED PROPOSAL]**

---

# Kill criteria

十项,覆盖题设七问;命中任一即触发对应动作,不允许"带病迭代":

1. **Kernel 无必要(mono-replica)**:试点中某单引擎团队的 ≤1 人日 wrapper 通过其自家两次真实复盘检验,且该团队此后不再援引 K2/K3/K4 任何一项 → 判词降 D;Agent-Box 停止对外宣称 Kernel 论题。
2. **只应为 library(single-form deadlock)**:90 天试点中,direct-human 入口执行占比 <20% 且从未出现第二个并发 writer(round-2 B kill #4 复用)→ 撤退 S0 纯 SDK;store/case/board 包转入社区或废弃。
3. **service 必要的真实触发(前瞻性杀标)**:仅当 ≥2 台机器 caller 要求重叠 history、合规点名 non-bypassable admission 或 unforgeable audit trail 时允许动工 remote service;在此之前任何人开工 daemon/HA/ACL 即为架构违规(Kill 反向条款,承袭 round-2 B/D 门禁)。
4. **package 过度(archaeology test)**:发布 6 个月后 >半数包无第三方导入案(orphan packages:>4 个)或 `abx` CLI 一半动词无人调用 → 合并降维(pkgs 砍半不算失败,是验收)。
5. **Provider contract 需要拆分**:`ExecutionProvider` Protocol 出现 substrate 特有参数泄漏(start() 需要流式特有参数/job 型参数二选一传 null)或 capability flags 超 ~10 个且互斥成簇 → 拆分为 protocol families(interactive-streaming / batch-job / ci-trigger),否则每次新 provider 都在污染全体签名。
6. **Work 应彻底移出(case dead-weight)**:Case extension 上线两周期内 complete/reopen 决策记录 <总 Execution 10%,或无一部署启用 → 删除 case 包与 migrations(Work 实体退役,不再是"可选"而消失);反之若某部署开始给 Work 加 obligations/SLA 迭代 → 那是新产品立项,禁止夹带进 kernel 包(防僵尸回流)。
7. **workflow adapter 不值得做(any of)**:(i) 两家平台安全政策拒绝第三方 receipt callback schema(round-2 C kill #5 复用);(ii) LangGraph/Temporal 原生发布覆盖 freeze-manifest+idempotent-dispatch+typed-claims 的 JTBD 功能(round-2 D kill #6 复用);(iii) 单个 adapter 维护成本超过其节省的手工胶水实测值 → 停止 adapter 线,kernel 退守 CLI/direct 市场(这是 C 判词的分解动作)。
8. **词汇死亡(vocabulary oracle)**:12 个月内无任何外部团队/文档引用 E/D/C、divergent、continuation_of 术语 → moat 主张作废;项目转 reference implementation 维护态,并公开承认(round-2 D kill #3 收紧)。
9. **Ambiguity 无消费者(recovery dead code)**:多部署 90 天 reconcile_pending 触发数为 0 且无团队能叙述一次真实受益 → 简化 K2(去掉协议级 recovery,降为文档建议);反例如发生 ≥1 次真实拦截即视为永久有效。
10. **Board 归零**:6 个月无自愿打开记录(round-1 K1 口径)→ 删除 board 包,exporter 的静态 evidence card 成为唯一人类界面。

---

# Final verdict

## **B. Kernel 成立,但主要价值只是协议和 adapter library。**

推理链:

1. **不选 A(不存在稳定、不可替代的共享 Kernel)。**"不可替代"必须是可防守的行为级属性。Kernel 五件的每一件单独看都可抄(dict+UUID 挑战证明了字段层零防御);能防守的只有组合后的边界情形正确性 + 更新速度 + 语料,而这些是 library 的美德,不是 runtime 器官的美德。且"stable"需要时间与外部消费者检验——当前外部消费者为零。**[REASONED PROPOSAL;REQUIRES USER VALIDATION]**
2. **不选 C(workflow-specific)。**Kernel 的最大消费场景一半在 workflow 外(direct interactive、人 Finish、跨 harness 复盘;round-1 JTBD1/2 机制成立),host_ref 早已抽象为 opaque scope。定位专属等于放弃一半复用面。
3. **不选 D(wrapper 足够)。**wrapper 方案在评测中真实输掉了三个存在事故原型的能力点(mono-dispatch 冲突矩阵、crash 收敛、sealed 断代),且证据词汇不可比的问题会在第二家 provider/团队接入日转为协作税。round-1 红队"普通 DB 四张表是最小重写"的判定成立于 *schema 层*,在本轮被收缩为"wrapper 无法覆盖行为层"。**[REASONED PROPOSAL 基于 ROUND-1 EVIDENCE]**
4. **不选 E。**不是证据不足,而是证据正好够到"B":spine 实测可跑、round-2 四候选独立汇聚出同一最小集、替代实验划定了收益边界。E 的用法应该留给"连 spine 都跑不通"的世界,不是这里。**[REPOSITORY VERIFIED + ROUND-1 EVIDENCE]**

## 判词的可执行含义(对下阶段的合同)

1. **Kernel 定格为 K1–K5 + 三包(kernel/store/sdk)**;case、board、adapters、providers、exporter 全部作为外围发行物,默认最小安装 = D 形态(这与 round-2 D"B 为首发形态"判词及 round-2 B"S1 门禁"兼容,与 A/C 的扩展也兼容——§A/B/C/D mapping 已证一致)。
2. **第一优先工程序**不再是任何 UI/服务:migration(slot provenance/disposition/coverage 列)→ failed-idempotency 修复 → resume-on-terminal 收紧 → reconcile_pending + recover 钩子 + ambiguous 态。完成后,K2/K3/K4 才第一次真正达到本轮为其声称的安全性质。**[REPOSITORY VERIFIED 缺口清单]**
3. **对外叙事降一档**:从此不再说"control plane/必要性",只说 *"the accountability envelope your execution calls"*;被替代方案击穿的场合(conformance 验收语料盲区)按 Kill #1–#8 执行,不辩护。
4. **通往 A 或死亡的唯一途径**:adapter ecosystem 出现第一批非我方贡献 + 词表外部引用(round-2 D kill #3/#8 反向指标)。二者发生,A 的"稳定"二字才开始有资格讨论;在此之前,B 就是终点站,而且是体面的终点站。

一句话收束:

> 300 行可以复刻 Agent-Box 的*名词*,复刻不了它的*动词顺序*——freeze 先于副作用、sealed 先于续篇、承认先于宣称。Kernel 存在的理由是这三种顺序被 135 个测试看着,而不是因为多了一张表。
