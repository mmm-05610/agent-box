# 前端抽象模型 v0.1（Agent Desktop）

对象：`candidates/best.md` @ `b4f5c5cc46c4`（R013 集成字节）
配套执行证据：[MODEL-V0.1-RUN.md](MODEL-V0.1-RUN.md)　未决项：[OPEN-QUESTIONS-V0.1.md](OPEN-QUESTIONS-V0.1.md)

## 1. 核心是什么，解决什么问题

**问题**：桌面端要同时接多个 Agent 服务，而这些服务的形状完全不同——有的只会文本往返，
有的只给"提交/进度/结果"，有的只有配置和文件。若以"会话"或"对话轮次"为组织中心，
后两类服务就必须被伪装成聊天；若以某个后端的能力集为中心，接入方就被绑定。

**核心主张**：宿主只管理**"有东西在被观察"这件事本身**——哪个服务发布了哪些**资源**、
每个资源的**事件按序到达**、谁可以**看/调用**、以及**看不看得懂都如实显示**。
内容、协议、状态含义一律不归宿主。

一句话：**命名空间化的资源目录 + 每资源一条有序事件流 + 同命名空间的观察句柄 + 类型化调用，
宿主不持内容权威。**

## 2. 最小核心概念（每个都给"删掉谁会失败"）

| 概念 | 是什么 | 删掉它 → 谁失败 |
| --- | --- | --- |
| **Namespace** | 一次服务接入的隔离单元，有自己的 id 空间 | 两个服务返回同名 id 时目录/缓存/事件互串（多服务同名资源） |
| **Resource** `(ns_id, local_id)` | 被观察的东西：一条消息流、一个任务、一份配置、一次授权 | 无会话场景没有可指向的目标；调用与订阅无处挂靠 |
| **Event stream（每资源、有序、有位置）** | 宿主为每个资源维护的递增序号事件序列，订阅者自报"从哪个位置开始" | 离开页面再回来无法续上；长任务产物与进度无法补齐 |
| **SubscriberScope** | 观察句柄，唯一权限规则 = 资源属于本命名空间 | 扩展可以跨服务读取；隔离无处落地 |
| **Typed action + Outcome** | 调用必须有注册的类型；结果是四类之一（结果/能力缺失/越权/未知） | 只能 `execute(any)`；"不支持"与"失败"无法区分 → 伪造支持 |
| **RenderRow（渲染契约）** | 每个字段一行，带 `value/absent/unreadable/opaque` 状态 | 缺字段被静默补全、读不懂的内容让面板变空白 |
| **CapMap**（数据，非原语） | 适配器声明的能力→支持/不支持/未知 | 只能靠点按钮失败去"推断"能力 → 假按钮 |

**不是核心原语的规则**（写在规范里、由原语组合执行，不额外占概念位）：
保留期与处置点、`from_cursor` 的取值选择、同命名空间权限、
"未确认的结果不得显示为当前值"、认领记录、重连时不得自动重发。

## 3. 职责划分

| 层 | 负责 | 明确不负责 |
| --- | --- | --- |
| **核心宿主** | 命名空间与资源目录；事件入序、按位投递、必要时终止通知；作用域与权限；类型化调用路由；渲染契约（行模型 + 四类结果的可区分性）；认领表记录 | 解释任何 payload；判断业务状态；保存全局历史；猜服务是否在线 |
| **服务适配器** | 打开命名空间、发布资源与 CapMap、注册动作类型、把远端事件按稳定顺序推进流；断连时关闭命名空间；自己的去重与稳定 id | 不计算游标、不写视图、不跨命名空间 |
| **业务扩展** | 领域能力与动作实现、认领自己能渲染的 schema、持久化自己的游标三元组、决定何时调用 | 不越本命名空间；不依赖别的扩展的内部状态 |
| **视图** | 把行模型/结果变体画出来，处理四类结果与终止信号；缺省视图 = 可替换的**内置回退扩展** | 不解释未声明内容；不把"未知"改写成"否" |

## 4. 最小接口草图

```typescript
interface NamespaceHandle {                       // 适配器侧
  readonly ns_id: string
  announce(d: { local_id: string; kind: string; capabilities: CapMap }): void
  retire(local_id: string, reason: string): void  // 处置：释放日志 + 烧 id + onEnd
  teardown(reason: string): void                  // 断连时由适配器调用
  pump(local_id: string, payload_schema_id: string, payload: unknown): void
}
interface SubscriberScope {                       // 扩展侧（同 ns 权限）
  directory_list(f?): readonly ResourceDescriptor[]
  directory_lookup(id: string): ResourceDescriptor | ExplicitAbsent
  cursor_resolve(id: ResourceId): Seq | ExplicitAbsent
  subscribe(id: ResourceId, from_cursor: Seq): Subscription | ExplicitAbsent
  invoke<A extends ActionSchema>(id: ResourceId, a: A, p: A["params"]): InvokeOutcome<A>
}
interface Subscription { onNext(h): void; onEnd(h: (reason: string) => void): void; close(): void }
type InvokeOutcome<A> = Result<A> | CapabilityAbsent | ScopeDenied | OutcomeUnknown | ExplicitAbsent
interface ViewHost {                              // 扩展侧唯一入口
  open_scope(ns_id: string): SubscriberScope | ExplicitAbsent
  claim_schema(ns_id: string, schema_id: string): ClaimOutcome
  on_claim_changed(h: (ns_id, schema_id, owner: string | null) => void): void
}
type RenderRow = { path: string; label: string; value: string;
                   status: "value" | "absent" | "unreadable" | "opaque" }
type SchemaDecl = { kind: "scalar" } | { kind: "opaque" }
               | { kind: "record"; fields: Record<string, SchemaDecl> }
               | { kind: "list"; item: SchemaDecl }
```

投递只有一条规则：`subscribe(id, c)` 先按 `seq >= c` 顺序补发已存事件，再转实时。
`c` 由订阅者自己算：新建资源用 `0`，已存在资源用 `cursor_resolve`，回来续读用
`上次见到 +1`（命名空间变了就回 `0`）。

## 5. 两条路径怎么成立

**对话路径**（简单 Agent，文本往返）
1 适配器 `open` → `announce(kind=text.stream, CapMap{cancel:not_supported})` → `register(send)`
2 扩展 `open_scope(ns)` → `invoke(main, send, {text})` → 适配器远端往返后 `pump(text.delta…)`
3 扩展 `subscribe(main, from_cursor=0)`（资源刚由自己创建）→ `onNext` 逐条渲染
4 断连：适配器观察到即 `teardown` → 扩展收到 `onEnd`，把最后状态改标"已结束"，不冒充在线
- 成立条件：**没有 Profile、工作区、历史、恢复能力也能走完**；能力缺失由 `CapabilityAbsent` 结构性回答。

**非对话任务路径**（只有提交/进度/结果的服务）
1 `register(submit)`，其结果类型里带 `job_resource: ResourceId`
2 `invoke(submit)` → 适配器在处理器内 `announce(job-7)` 并 `pump(进度头)`，再返回
3 扩展用 `subscribe(job_resource, from_cursor=0)` 捕获头部与后续进度（**不伪造会话或 assistant 消息**：Envelope 无 role/turn 字段）
4 离开页面：`close` 并存 `{local_id, ns_id, last_seen}`；回来续读 `last_seen+1`
5 结束：`retire` → `onEnd(reason)` → 视图改标"已结束/结果在此"；远端仍在跑时扩展卸载只关自己的订阅
- 成立条件：全程不出现"消息/轮次/角色"概念；进度就是流里的事件，结果就是最后一个事件。

## 6. 职责收缩检查（本次必做）

**① 长期事件保存、完整历史回放必须由 GUI 核心承担吗？——不必，但"能续读"是用户需求。**
- 用户需求（不可删）：离开再回来要能接着看（S03）、扩展崩溃后远端仍在跑要能补看（S10）。
- 设计者自加承诺（可质疑）：**"日志保留到资源消亡、永不截断、任意久之后可完整回放"**——
  这是当前候选自己加的，代价是内存随事件数线性增长，且只有产出方能靠 `retire` 收口（用户可见的资源更替）。
- 建议：核心保留**有界**窗口 + 过期时结构化返回"游标过期，需要快照"；完整历史下沉给
  **服务适配器的分页读取**或可替换的 history 扩展。接收方与成本：适配器要实现分页 `read`，
  扩展要处理"过期→改用快照"。→ 列为 C1 待你选择。

**② 回退视图、schema 渲染、扩展选择策略能作为内置扩展吗？——两个能，一个只能一半。**
- **schema 渲染（SchemaDecl walk）**：可以整体下沉为内置回退扩展。核心只需承诺 RenderRow 形状。
  接收方：内置扩展作者；成本：要把 walk、四类结果画法、终止信号处理都搬过去（候选 §R11.7b 已列）。
- **通用回退视图**：实现可下沉，但**"任何可发现资源都不得空白"这条不变式必须留在核心**——
  否则"装了扩展才看得见、卸了就白屏"无法约束。
- **扩展选择策略**：**记录式认领表必须留在核心**（跨扩展争抢只能有一个权威写入者），
  但"谁赢"的策略可以换：当前是"最近挂载者胜"，仍有静默换渲染器的味道。
  推荐改为"先认领者保持到释放"，由 `on_claim_changed` 明确广播。→ C4。

**③ 哪些机制只因旧候选的额外承诺才"不可删除"？**
| 机制 | 来源 | 判断 |
| --- | --- | --- |
| 无界事件日志（资源存活期保留） | 设计者自加"任意久完整回放" | **可收缩** → C1 |
| 回退视图作为核心部件 | 设计者自加（实为默认扩展） | **可下沉**，保留"不空白"不变式 → C2 |
| `claim` 记录 + 广播 | 由"卸载要可见"的用户要求推出 | 保留（记录），策略可换 → C4 |
| 四类调用结果可区分 | 用户要求（S11 不伪造支持、S09 不藏未知） | **保留**（类型在核心，画法可下沉） |
| 同命名空间权限、烧毁 id、不自动重发 | 分别对应串号、游标改指、重复执行 | **保留**（各有具体失败序列） |
| presence≠可达 的措辞收窄 | 对"核心不猜状态"的翻译 | 保留为规范，非原语 |

**复杂度守恒检查**：以上任何下沉都写明了接收方与成本（适配器分页读取、扩展处理游标过期、
内置回退扩展承接 walk 与四类画法），没有把负担默移给接入方。

## 7. 推荐模型与备选（两条边界无法兼得时）

关键边界：**宿主不解释内容**（诚实、最小、可接任意服务） vs **默认视图要能显示"在跑/已完成/当前值"**（好用）。

- **推荐（A）**：核心只有目录 + 流 + 类型化调用 + 同 ns 句柄 + 渲染契约；
  "运行状态"由适配器注册的 `read`/`status` 动作提供，没有就**如实说拿不到**。
  代价：没注册 read 的服务，默认视图只有流事件、拿不到快照（诚实但可能显贫）。
- **备选（B）**：核心再加一个**不透明状态向量** `Resource.state`（适配器随时更新、宿主只存不读），
  默认视图据此显示 running/done 而无需动作调用。
  代价：核心多一个概念，并开始承载"最新状态"语义——必须严格只存不解释，否则内容权威就回来了。

推荐 A：它把"默认视图更完整"的成本放在最清楚知道答案的一方（适配器），
而 B 用一个核心概念换掉这份成本，但换来的是一条更容易被后续需求撑破的边界。
