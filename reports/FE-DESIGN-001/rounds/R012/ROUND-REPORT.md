# R012 轮次报告

本轮主题：用**候选自身的游标规则**回放候选自身的步进表，再修 R011 评审提的两件事。
维度 `D01-order-dedup`。攻击字节 `candidates/best.md` = `fece1121311d…`。全程 mcode 独立上下文
子代理产出判定，经同一道 `loopctl` 机检门落盘（来源与缺口见 `PROVENANCE-AND-GAPS.md`）。

## 新立案与独立判定

| ID | 严重度 | 判定 | 一句话 |
| --- | --- | --- | --- |
| `FE-CE-025` | major | **holds** | S01 步进表先 `pump` 两条用户敲入的 delta（宿主赋 seq=1、2），再在 step 5 用 `cursor_resolve` 订阅。§R11.2 定义 `cursor_resolve` = "下一个将赋的 seq" = 3，§R11.3 只回放 `seq >= c`，于是**用户自己输入的内容被 pump、被保留、却永不渲染**；而同一张表的删除列写着"step 5 收不到"。缺陷是候选自己的证据违反候选自己的游标规则——S02/S04 先订阅后 pump，所以只有 S01 断 |
| `FE-CE-026` | major | **holds** | `handle_for` 全文只出现一次（S01 step 3 的调用点），接口块、边界规则、散文里都没有声明；每个场景的扩展侧都需要一个 `SubscriberScope`，而"从哪里拿到"从未有规则。§R11.7 自称"S01–S12 全文复现、不必取用于他处"因此为假 |
| `FE-CE-027` | major | **holds**（核验者 `MISSED_CHECK` 补立） | **这是上一轮修复自身的产物**：§R11.3 的成本条款允许适配器用"retire 后重新 announce"来限制内存。若它在**同一命名空间用同一 `local_id`** 重新 announce，`seq` 空间重启、`ResourceId` 不变，唯一守卫 `recorded_ns_id == current ns_id` 依然通过；持久化了 `saved_last_seen=20` 的视图回放为空、从第 6 个事件起才收到 live，而追赶**看起来是完整的**。命名空间守卫看不见"化身"变化 |

核验者另记两处更正：`FABRICATION_CHECK` —— 本轮攻击者"哪些场景藏了句柄"的清单被夸大
（S02 的 `h` 首次出现在 step 3 而非 step 2；S07/S12 当时既无编号步骤也无句柄）；结论成立、
计数不成立，记录保留更正而不保留原话。`CONTRADICTION_CHECK` —— 与 `FE-CE-026` 同一缺陷的
自包含视角。`FE-CE-007` 第四次被判 `does_not_hold`（属 B），由守卫记为 `not_applicable`，
B 行继续 OPEN。

## 集成（新候选字节 `25c36f4c40d8…`）

三处修复 + 评审两项要求，**零新核心概念**：

1. `FE-CE-026`：§R11.2 增加 `ViewHost.open_scope(ns_id): SubscriberScope | ExplicitAbsent`；
   §R11.6 增补 **host 第 9 条**（每 (view, ns_id) 铸一个 scope；命名空间未打开则 `ExplicitAbsent`；
   scope 之间不可发现、不共享他命名空间内容、除 `resource.ns_id == scope.ns_id` 外不授予任何权限）；
   §R11.5 把原先"指向文件里并不存在的 §R8.4"的那句换成它实际想说的四条规则
   （扩展选择、缺席→回退、抛错→错误边界、卸载→宿主关闭 scope）与配对手势。
2. `FE-CE-025`：S01 step 5 改为 `from_cursor=0`（该资源是同一扩展一步之前自己 announce 的，
   适用"刚创建"规则，`0` 恰好纳入 seq=1、2），删除列改为点名"用 `cursor_resolve` 是错的"。
3. `FE-CE-027`：`retire(local_id)` 除处置日志外**把该 `local_id` 在本命名空间内永久烧毁**；
   再 announce 同 id 抛 `LocalIdBurned`；`cursor_resolve` / `subscribe` 对"当前未 announce 的
   `local_id`"返回 `ExplicitAbsent`。于是持久游标不可能被静默改指到另一个化身：要么同 id 仍可解析
   且 `seq` 连续，要么不可解析、视图被告知"该资源已不存在"。内存控制杆随之改写为
   "retire 后用**新** `local_id` announce 继任者"；S09 增加 step 7 渲染该路径。
4. 评审要求①：S06/S07/S08/S09/S10/S12 六条压缩链**重写为步进表**（每步含 actor、操作、
   权威方、删除后的用户可见失败）。全文 12 张步进表；§R11.7 前言不再空口主张。
   另修 S03 step 4 的删除列（原先点的是同命名空间规则，实际使能者是保留条款）。
5. 评审要求②：新增 §R11.7b 把**扩展作者成本**分类列出（持久化游标三元组、正确选 `c`、
   处理 `ExplicitAbsent`、卸载时关闭、渲染四个变体、为可检视资源注册 `read`/`status`、
   只按字段名声明 schema），并点名第 6 条是设计对适配器施加的**最大单项成本**。

## 本轮实验（3 条，全部实跑并带反例）

- `R12-A` 化身规则：无烧毁规则时同一 id 重 announce 会让追赶静默跳过 5 个事件且"看起来完整"；
  有烧毁规则时 `LocalIdBurned` + `ExplicitAbsent`。**对照出缺陷**。
- `R12-B` 订阅顺序：按 S01 原顺序（先 pump 后 `cursor_resolve`）得不到任何 delta；
  改 `from_cursor=0` 或"先订阅后 pump"都拿到 2 条。**对照出缺陷**。
- `R12-C` 静态检查：扫描 12 张步进表的代码跨度，要求每个调用记号都是候选自己声明过的成员。
  在**改前字节上确实报错**（`handle_for`，且只找到 6 张表），在改后字节上通过。
  ⇒ 该守卫非空转；这也正是 `FE-CE-026` 被机械复现的方式。

过程内两次自纠（记录在案）：`R12-B` 首版模型把"订阅"建模成一次性快照，无法表达 live，
断言失败后改为真正的订阅对象；`R12-C` 首版对**改前**字节运行且正则无词边界，
误报 `current(`/`RenderRow(`/`Absent(` 等，改为限定步进表行 + 代码跨度 + 词边界后成立。
两次都是先跑再改，未通过放宽断言来"通过"。

## 独立回放与场景判定（候选评审角色，绑定 `25c36f4c40d8…`）

评审确认：内联材料与磁盘 `candidates/best.md` 逐字一致、摘要匹配，判的是保存的字节。

**回放 20 条，`fail` 0 条** ⇒ `closed 待独立回放` 从 18 归 0，`open_major` 保持 0。
含 `FE-CE-025/026/027` 全部 `pass`，即本轮三处修复被独立确认；
`FE-CE-007` 本轮被评审判 `pass`（"A 侧无 `edges` 机制，序列不可表达"），
由守卫改写为 `not_applicable`，B 行继续 OPEN。

**场景 12 条**：`trajectory_ok` = S01/S02/S03/S04/S05/S06/S07/S10/S11/S12（10）；
`trajectory_broken` = **S08**；`insufficient_evidence` = **S09**。

**评审的核心判词："形状主张成立，内容主张不成立。"**

1. **S08 判破（真缺陷，与本轮修的 FE-CE-025 同一类）**：S08 step 7 断言 `ns_D` pump 出的
   `ArtifactReady`"经 `s_D` 送达视图"，但全文唯一的投递机制是"投递给 `from_cursor <= seq` 的
   活跃订阅者"（§R11.3），而 §R11.5 定义配对手势**只给 scope**（"只授予
   `resource.ns_id == scope.ns_id`"）。S08 全表没有任何对 `ns_D` 资源的
   `s_D.subscribe(...)`，连被 pump 的 `local_id` 都没命名 ⇒ 该投递**没有声明的机制**。
   这是我自己在 R012 写 S08 表时引入的，评审抓到了。
2. **S09 证据不足**：§R11.4 第 8 条要求适配器**一旦观测到连接丢失就必须 `teardown`**，
   而 §R11.3 说 `teardown` 会处置日志、强制关闭订阅者并重启 id 空间；S09 step 6 却保留了
   "`recorded_ns_id` 仍匹配则 `saved_last_seen+1` 追赶"的同命名空间分支，step 5 还让适配器
   重连后继续 pump ⇒ 两支不可能同时可达，且没有任何行在强制关闭后重新铸 scope。

**评审另列的薄弱点（保真记录，供下一轮直接使用）**：
(i) 步进表省略了它们依赖的前置行 —— S01 step 3 的 `"send"`、S03 step 5 / S05 step 4 的 `"read"`
都**没有 `action.register` 行**（而 §R11.6 第 4 条是唯一注册路径）；S04 step 4 / S08 step 6
订阅的 `job-7` 没有任何行 announce（按 §R11.3 该返回 `ExplicitAbsent`）；
S02/S03/S04/S05/S09/S11 六张表仍在用**未铸造的裸 `h`/`s`**——即 `FE-CE-026` 的闭环只落在
S01 一张表上。评审明确指出 **`R12-C` 抓不到这类问题**（它只检查调用记号，不检查前置步骤是否存在）。
(ii) `c` 选择规则只列三种情形，而 S01 step 5 / S03 step 1 在规则外使用 `0`（投递仍成立，
但规则比它自己的表更窄）。(iii) `ExplicitAbsent` 只对"持久化 `local_id`"一种情形规定了渲染；
`ViewHost.open_scope` 与 `directory_lookup` 的 `ExplicitAbsent`、以及 `CapMap` 的第三个值
`"unknown"`，**都没有渲染规则** ⇒ 视图无法把它与 supported/not_supported 区分。
(iv) **声明式 schema 的语言从未定义**：§R11.5 的 `list<record>`／opaque／递归都预设了一种
schema 记号，而 §R11.7b 第 7 条只说"只按字段名声明"，无法表达 opaque 或形状 ——
`FE-CE-020/021` 的全域性主张悬在未定义的记号上。(v) 扩展选择按**挂载顺序**（"最近挂载者胜"，
且"宿主不记录该选择"），§R11.5 自认卸载会静默换渲染器 —— 一条隐式顺序通道 + 无解释的界面变化。
(vi) `payload_schema_id` 的视图认领**没有命名空间化**，而动作注册与 scope 都命名空间化了。
(vii) §R11.7b 只给扩展职责 1–7 定价；适配器的新义务（逻辑序 pump、自持 id 去重、
观测丢失即 teardown）与"retire 后换新 id 限制内存"的成本**未计入任何地方**。

**重点(b) 的评审结论**：四个变体**确实可区分**，`OutcomeUnknown` 不会呈现为已确认值，
所以"非空"之上确实做到了"可操作（可辨未确认）"；但 running/done/failed 只在适配器注册了
typed `read`/`status` 时才可判定，宿主自己**不能**说 running 或 failed —— 这一点候选 §R11.9
自认。评审据此指出 §R11.1 的"不命名任何自己的能力"**属过度陈述**（回退契约本身是名字形状的）。

**本条为我的记录缺口**：R012 评审 prompt 写成"nineteen rows"却实际列了 19 个 id **加** `FE-CE-007`
（共 20）。评审没有静默丢一个，而是把 20 条全判了并明确写出这个不一致——处理正确，
但口径错误是我的，记录在案。


## 当前状态

```
state=running  round=12  best=A  digest=25c36f4c40d8
open_major=0  open_any=1（仅 FE-CE-007，挂 B）  closed 待回放=0（20 条全 pass）
scenarios: claimed=12  required=12  independently_ruled_covered=10  trajectory_broken=1
clean streak 0/3
convergence: NO — covered=10<12; trajectory_broken=1; clean_streak=0<3
Sol: cap=10 reserved=0 ok=0 bad=0 remaining=10 final_reserve=2；入口缺失 → 待审
```

未收敛的三个原因（彼此独立，且第三项是结构性不可满足）：
① 覆盖 10/12，剩 S08 判破 + S09 证据不足；
② 收敛要求连续 3 个干净轮，而本会话每轮都在关 major（干净轮定义使然）；
③ 唯一计入收敛的最终独立核验按设计只认 `gpt-5.6-sol`，其调用入口在活动路径上不存在 → 待审。

## 边界

产品代码只读（本轮未写 `repos/`、`worktrees/`）；未启停服务；未读凭据；无提交/合并/推送；
未派发实现任务；未重置预算；零 Sol 调用；未修改控制器。
**观察（非我所为）**：同一时间窗内 `worktrees/backend-loop/**` 与 `control/reports/BE-LOOP-001/**`、
`control/reports/BE-PROFILE-001/INDEX.md` 有另一写入方在活动（距今数分钟内仍在新写）。
我未触碰这些路径，也未据其内容做任何判断；仅作为边界事实记录。
