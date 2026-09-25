# R010 / R011 轮次报告

接管轮。R010 = 补做 R009 遗留的 verifier；R011 = 新开一轮，主攻用户指定的第一处重点。
两轮均由 mcode 独立上下文子代理产出判定，经同一道 `loopctl` 机检门落盘（来源与缺口见
`PROVENANCE-AND-GAPS.md`）。

## R010 —— 补做 R009 遗留核验

- 被裁定字节：`rounds/R009/cand-A.md` = `cf554e67…`（**未集成**进 `candidates/best.md`）。
- 独立判定：`FE-CE-019 holds`、`FE-CE-020 holds`、`FE-CE-021 holds`；`FE-CE-007 does_not_hold`
  （A 无 `edges` 机制，序列不可表达）→ 由 `fn_commit_verify` 的守卫记为 `not_applicable`，
  仍留在 B 账上 OPEN。
- 核验者另报两处：`FABRICATION_CHECK` = 攻击者把
  “hiding uncertainty (disqualifier)”误挂在 §4 Q3 名下（实为 §6 MECH 删除行），
  实质成立、引用错位；`CONTRADICTION_CHECK` = §8 的“本轮没有新反例”与 §4 Q1 的缺口、
  §5 的“EXPERIMENT A 已证明”与 §6 的“全部实验 MODEL ONLY”互相打架。
- 产出：`rounds/R010/verify.md`（861 词）。R009 遗留的两次形状不合规拒收就此闭环。

## R011 —— 事件回放承诺 vs「无核心事件存储」

维度 `D09-splits-truth`（轮换规则允许；正是用户给定重点）。攻击字节
`candidates/best.md` = `49df1e9345ab…`。

### 新立案

| ID | 严重度 | 一句话 |
| --- | --- | --- |
| `FE-CE-022` | major | 投递规则发的是「**已存**信封」（§R8.1/§R8.2/S03 step1/3/4/S04 step3），而机制台账与 §R8.1/§R8.2/§R8.6 又写「no host event store」。逐当事方排除：适配器拿不到 `seq`（`pump` 返回 void）、被禁止算 `from_cursor`；订阅者只存位置不存载荷。两角都坏：要么宿主有一个**未具名、无保留规则**的核心缓冲（资源存活期内无界增长），要么回放承诺为空、S03/S04/S09/S10 与 T-Boring 全部落空 |
| `FE-CE-023` | major | `teardown` 是唯一撤下命名空间的路径，而链路断开并不要求适配器 `teardown`。于是不可达服务的资源会**无限期**在目录与回退动作表里表现为"活着且可取消"——同一事实出现两个互相矛盾的归属方 |

### 独立判定

`FE-CE-022 holds`、`FE-CE-023 holds`。
核验者的 `MISSED_CHECK` 又补了一条更锋利的：**`FE-CE-024`（major）** —— 候选并非"没有保留规则"，
而是**写了一条与自身保证相矛盾的规则**：§R8.2 Envelope「after the subscription is closed,
envelope is dropped」。按此规则，重新订阅的视图要回放的那批信封恰好已被丢掉。
（攻击者"全文没有任何保留规则"的说法属**过度陈述**，已按核验者的 `FABRICATION_CHECK` 更正；
缺陷本身成立且形式更糟。）`FE-CE-024` 已按反例账规则登记为 R011 新行。

### 集成（新候选字节 `fece1121311d…`）

六处修正，**零新核心概念**：

1. `FE-CE-022`：把每资源 cursor 流**正名为**保留日志——`pump` 追加并赋 `seq`，
   保留期 = 资源存活期（`pump` → `retire`/`teardown`），存活期内不截断；
   删除"no extra host store"这一**假陈述**；机制台账 `host-event-store|removed` 换成
   `cursor-stream-log|core`（并承认 R006–R010 那行是错的）。不引入**第二个**存储。
2. `FE-CE-024`：删除"关闭订阅即丢弃信封"，改为关闭只释放**引用**；
   `retire`/`teardown` 是唯一处置点。
3. `FE-CE-023`：目录的"存在"收窄为"已 announce 且未 retire"，**不等于可达**；
   新增适配器边界第 8 条（观测到连接丢失必须 `teardown`）；
   `OutcomeUnknown` 的动作渲染为"未确认"；硬杀适配器的残留**明示为局限**，不假装修好。
4. `FE-CE-019`：四个 `InvokeOutcome` 变体在**值通道与状态通道同一张表**上都有渲染规则，
   不变式"未经确认的结果不得呈现为当前值或当前状态"；陈旧行只能作为
   `last confirmed … NOT current` + 横幅 + Retry。
5. `FE-CE-020`：GenericWalk 对声明 schema **全域**——每个声明字段恰好一行，
   含显式 `(absent at runtime)` / `(unreadable: declared <shape>)`；不抛异常、不替换整屏。
6. `FE-CE-021`：走查**递归到任意深度**并按声明路径标注；**删除**"适配器必须写扁平
   scalar/list-of-record 字段"的义务（本轮唯一删减——它把宿主渲染器的递归深度泄漏成了
   适配器契约）。

复用并运行的模型实验 3 条（`^```python`，全 3/3 退出 0，脚本存 `_pt/`）：
R11-A 存储归属与处置点（旧规则回放 0 条 vs 新规则 15 条）；R11-B 四态可区分且
未确认不呈现为当前/可用；R11-C 走查全域且递归（partial / null-list / nested 均出显式行）。

**过程内自纠一处**：首版集成只把 S01/S02/S04/S06/S08/S09/S10/S12 写成"沿用 §R8.5"的摘要，
使候选字节无法被独立核验——已把 12 个场景的逐步轨迹**写回候选自身**（S05/S11 用删除完备表），
重新过门（`fece1121311d…`）。候选字节不自包含视为交付缺陷，不视为"文档问题"。

### 独立回放与场景判定（候选评审角色，绑定 `fece1121311d…`）

- **回放 17 条**：`FE-CE-003/004/005/006/012/013/014/016/017/018/019/020/021/022/023/024` 全部
  `pass`；`FE-CE-007` 判 `fail`（**属于 B**），由守卫改写为 `not_applicable`，
  不进 A 的收敛口径。`closed 待独立回放` 从 15 归 0。
- **场景 12 条**：`trajectory_ok` = S02/S03/S04/S05/S11（5）；`trajectory_broken` = **S01**；
  `insufficient_evidence` = S06/S07/S08/S09/S10/S12（6）。

**S01 判破的具体依据**（本轮最有价值的发现，属设计缺陷而非文档问题）：
S01 表中 step 4 先 `pump` 两条 delta（宿主因此赋予 seq=1、2），step 5 才用
`cursor_resolve` 订阅；而 `cursor_resolve` 按 §R11.2 返回"下一个将赋的 seq"=3，
按 §R11.3 的回放过滤 `seq >= c` 就从 3 开始——**用户自己刚敲的两条 delta 不会被渲染**。
同表 step 3 还调用了 `handle_for`，该函数在 §R11.2 接口清单里不存在。

**六条 `insufficient_evidence` 的性质**：S06–S10、S12 是压缩箭头链，
有序但没有"每步具名 owner + 每步删除后果"，不满足契约的三段式检验。
注意这与 R008 的评审结论**不同**（R008 把同一批压缩链判为 `trajectory_ok`）；
两次判定都保留在 `review-rulings.tsv`，不以后一次覆盖前一次，
本报告不替它们调和——记录分歧本身。
另有 `BOUNDARY_SCAN` 发现：§R11.5 把"扩展选择 / 未安装 / 抛错边界 / 配对手势"指向
**不在本文件里**的 §R8.4，属"把负担搬到工件外"；且全文**没有扩展作者成本**一节。

## 当前状态（不冒充收敛）

```
state=running  round=11  best=A  digest=fece1121311d
open_major=0  open_any=1（仅 FE-CE-007，挂 B）  closed 待回放=0
场景：声称 12　独立通过 5　判破 1　要求 12
clean streak 0/3
convergence: NO — covered=5<12; trajectory_broken=1; clean_streak=0<3
Sol: cap=10 reserved=0 ok=0 bad=0 remaining=10 final_reserve=2；入口缺失 → 待审
```

**未收敛的三个原因彼此独立**：① 覆盖只有 5/12（S01 判破 + 6 条证据形式不足）；
② 收敛要求 3 个**连续干净轮**，而干净轮不许有新立案或新闭合的 major；
③ 唯一计入收敛的最终独立核验按设计只认 `gpt-5.6-sol`，其调用入口在活动路径上不存在 → 待审。

## 边界

产品代码只读；未启停服务；未读凭据；无提交/合并/推送；未派发实现任务；
未重置预算；零 Sol 调用；未修改控制器。收敛仅指设计候选，不指用户批准或实施。
