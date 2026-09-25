> **⚠ 更正（2026-09-22，见 `STOP-STATE-R012-CORRECTION.md`）**：本文件下方的"预算截止"停止依据
> **已失效**。用户已取消总轮数与总时长上限，现行 `RUNBOOK.md` 明文"无总轮数、无总时长上限"，
> 用户本次授权从 R013 继续。以下正文为 R012 当时的原始记录，**一字未改，保留为历史**；
> 其中只有"候选待审／需决策"部分仍成立，"预算截止"不再成立。

# FE-DESIGN-001 停止状态（R012 末，交接给下一次续接）

依 `control/product/agent-desktop-design-brief.md` 第 64 行"建议上限：12 轮或 6 小时，先到者停止"
与第 78 行"停止状态为候选待审/预算截止/需决策，不自行宣布最终架构锁定"，本轮到达**轮次上限**，
故按**预算截止 + 候选待审 + 需决策**停止。**不是**收敛，也**不是**架构锁定。

## 1. 交付物与状态

| 项 | 值 |
| --- | --- |
| 候选 | `candidates/best.md`，sha256 `25c36f4c40d85fed87d79a175c6964018ff7c91bcd0ca6d66a042fe2e25293e7` |
| 候选自包含性 | 是：729 行，S01–S12 全为步进表，无对外部文件的悬空引用 |
| 反例账 | `open_major=0`；`open_any=1` = `FE-CE-007`（挂已淘汰的 B，**不许动**） |
| 独立回放 | 当前字节 20 条**全 pass**，`closed 待回放=0` |
| 场景独立核验 | **10/12**（要求 12）；`trajectory_broken=1`（**S08**）；`insufficient_evidence=1`（**S09**） |
| clean streak | 0/3 |
| Sol | `cap=10 reserved=0 ok=0 bad=0 remaining=10 final_reserve=2`，**未重置、零调用**；活动路径无有效调用入口 → **待审**（`PENDING_INDEPENDENT_REVIEW=1`） |
| 控制器 | 未修改（含两处已观察但未修的生成器缺陷，见 `PROVENANCE-AND-GAPS.md`） |

## 2. 本次接管的两处重点——结论

**(a) 事件回放承诺 与「无核心事件存储」的职责是否自洽** → **原先不自洽，现已修复并获独立回放。**
原候选的投递规则发的是"已存信封"，而机制台账把 `host-event-store` 记为 `removed`，
适配器（拿不到 `seq`、被禁止算 `from_cursor`）与订阅者（只存位置）都无法保留载荷。
修复：把每资源 cursor 流**正名为保留日志**（`cursor-stream-log|core`，保留期=资源存活期，
`retire`/`teardown` 为唯一处置点），删除"关闭订阅即丢弃信封"这句自相矛盾的话，
并把 `retire` 后的 `local_id` 永久烧毁以免持久游标被静默改指到新化身。
`FE-CE-022/023/024/027` 均经独立核验 `holds` 且在最终字节上 **pass**。

**(b) 默认视图是否真正可操作（而非只是非空）** → **做到了"可辨未确认"，未做到"宿主自证运行状态"。**
四个 `InvokeOutcome` 变体渲染确实可区分：`OutcomeUnknown` 只呈现为
`last confirmed … NOT current` + 横幅 + Retry，不变式是"未确认的结果不得呈现为当前值/状态"。
但 running/done/failed 只在适配器注册了 typed `read`/`status` 时才能判定，
宿主自己不能说 running 或 failed（候选 §R11.9 自认）。评审据此指出
§R11.1 的"不命名任何自己的能力"**属过度陈述**（回退契约本身是名字形状的）——这条**未修**。

## 3. 下一次续接必须处理的具体缺口（评审已精确给出，可直接用）

1. **S08 判破**：step 7 断言 `ns_D` 的 `ArtifactReady`"经 `s_D` 送达"，但全表没有对任何
   `ns_D` 资源的 `s_D.subscribe(...)`，被 pump 的 `local_id` 也未命名；配对手势按 §R11.5
   **只给 scope**。需在表里补出真正的投递机制（命名 `local_id` + 该资源的订阅行），
   或改掉该断言。
2. **S09 证据不足**：§R11.4 第 8 条"观测到丢失即 `teardown`"与 §R11.3"`teardown` 处置日志、
   强制关闭订阅者、重启 id 空间"合起来，使 S09 step 6 的同命名空间追赶分支与 step 5 的重连
   pump 不可能同时可达；且强制关闭后没有任何行重新铸 scope。需明确"哪一支适用"。
3. **步进表补前置行**：S01 step 3 的 `"send"`、S03 step 5 / S05 step 4 的 `"read"` 缺
   `action.register` 行；S04 step 4 / S08 step 6 订阅的 `job-7` 无 announce 行；
   **S02/S03/S04/S05/S09/S11 六表仍用未铸造的裸 `h`/`s`** —— `FE-CE-026` 的闭环只落在 S01。
   注意 `R12-C` 抓不到这类问题（只查调用记号，不查前置步骤是否存在），需要更强的实验。
4. **渲染规则补齐**：`ViewHost.open_scope` 与 `directory_lookup` 的 `ExplicitAbsent`、
   以及 `CapMap` 的第三个值 `"unknown"`，目前**都没有渲染规则**。
5. **声明式 schema 的语言未定义**：`list<record>`/opaque/递归都预设了一种记号，
   而 §R11.7b 第 7 条只说"只按字段名声明"，无法表达 opaque 或形状 ——
   `FE-CE-020/021` 的全域性主张悬在未定义记号上。
6. **扩展选择按挂载顺序**（"最近挂载者胜，宿主不记录"）：一条隐式顺序通道，
   且卸载会静默换渲染器。
7. `payload_schema_id` 的视图认领**未命名空间化**，而动作注册与 scope 已命名空间化。
8. §R11.7b 只给扩展职责 1–7 定价，**适配器侧新义务与内存控制杆未计价**。
9. §R11.1 "不命名任何自己的能力"过度陈述，需收窄措辞。

## 4. 需要用户决策的事项

1. **Sol 调用入口**：活动路径上 `fn_sol_call`/`fn_sol_dispatch`/`fn_sol_pack` 都在退役库里，
   `loopctl` 只暴露记账命令。要么补上入口、要么授权我按 `loopctl sol-reserve` → 调用 →
   落 `sol/<cid>.reply.md` → `sol-complete` 手工贯通，要么由用户本人做最终独立审阅。
   在此之前**不会**绕过预算直调。
2. **是否授权继续 R013+**：第 3 节的 9 条缺口足以支撑一整轮（攻击维度建议
   `D07-extension-burden` 或 `D09-splits-truth`）。但即使 R013 把覆盖做到 12/12，
   收敛仍需再连续 3 个干净轮，且第 ③ 项（Sol 最终核验）结构性不可满足 ——
   即"真正收敛"在当前装置下**不可达**，本候选的最强可达状态就是**候选待审**。
3. 是否把 `FE-CE-007`（B 的缺陷）正式结案或保留 OPEN —— 按守卫 E6/E7，
   A 侧历轮判定均为 `not_applicable`，我未动它。

## 5. 本次接管新增/关闭的反例一览

| ID | 轮 | 严重度 | 现状态 | 一句话 |
| --- | --- | --- | --- | --- |
| `FE-CE-022` | R011 | major | CLOSED，回放 pass | 回放承诺无归属：宿主要么有未具名无界缓冲，要么回放为空 |
| `FE-CE-023` | R011 | major | CLOSED，回放 pass | 命名空间死亡无归属：不可达服务的资源无限期表现为可取消 |
| `FE-CE-024` | R011 | major | CLOSED，回放 pass | "关闭订阅即丢弃信封"与追赶保证自相矛盾（核验者补立） |
| `FE-CE-025` | R012 | major | CLOSED，回放 pass | S01 先 pump 后用 `cursor_resolve` 订阅 ⇒ 用户自己输入的内容永不渲染 |
| `FE-CE-026` | R012 | major | CLOSED，回放 pass | `handle_for` 只被调用、从未声明；每个场景的扩展侧都缺句柄来源 |
| `FE-CE-027` | R012 | major | CLOSED，回放 pass | 同 id 重 announce 使持久游标静默跳过新化身的事件（核验者补立） |
| `FE-CE-019/020/021` | R009 | 2 major + 1 minor | CLOSED，回放 pass | R010 独立核验为 `holds`，R011 集成修复 |
