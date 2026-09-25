# FE-DESIGN-001 — 接管登记（R013，续接不重做）

登记时间：2026-09-22T05:20Z（本地 13:20）　接管者：pi 前台会话（换工具后的前端设计执行者）
上一执行者：mcode 前台会话，**已由用户更换工具而停止**。旧调度不重启，后端会话不归本会话调度。

本文件只登记事实与在途状态，不改写任何历史轮次的候选、反例、核验或收敛记录。

## 0. 写入者核查（接管前置，先报告后动手）

| 检查 | 结果 |
| --- | --- |
| `lsof +D` / `fuser` 扫描本报告目录 | 除本会话自己的 shell 与探测进程外，**无其他进程打开本目录文件** |
| 近 3 分钟写入 | 仅 `candidates/best.digest`，时间戳 = 本会话执行 `loopctl status` 的时刻；**内容摘要未变**（仍是 `25c36f4c40d8…`，文件本就是「摘要 + 刷新时间」两行结构） |
| 近 30 分钟写入 | 全部集中在 12:49–12:53（前任的 `_pt/model/`、`rounds/R013/{plan,attack}`、`counterexamples.tsv`、`SOL-ENTRY-CHECK-R013.md`），此后**再无写入** |
| 正在运行的循环进程 | 无 `loop.sh`、无 FE 相关后台进程、无 mcode/qoder 前端设计进程 |
| 同机其他写入者 | 有，但**全在后端侧**（`control/reports/BE-LOOP-001/`、`worktrees/backend-loop/`，含一个 `qodercli -w …backend-loop/server/source` 会话与一个 inbox watcher）——**不归本会话调度，不与本目录同批文件相交** |

**结论：前端旧写入者已停；不存在并发改同一批文件的风险。** 后端写入者照旧，只读不干预。

## 1. 从磁盘实际进度续接（R013 已推进，保留并接续，不从 R012 重做）

| 项 | 磁盘现状 | 出处 |
| --- | --- | --- |
| 已完成的最新轮 | **R012**（六阶段全过） | `rounds.tsv` 末行 |
| 在途轮 | **R013：plan ✓、attack ✓，下一阶段 = verify** | `rounds/R013/{plan,attack}.meta`（`outcome=ok`） |
| R013 攻击维度 | `D11-long-run` | `rounds/R013/dimension.txt` |
| 攻击方式变更 | 首次用**共享的最小可执行语义模型**（`_pt/model/core.py` + `run.py`）执行 12 场景 + 4 项模型检查；`run.repro.txt` 的期望值 19 项**全部对上** | `_pt/model/run.repro.txt` |
| 反例账新增 | 10 条正式立账：`FE-CE-028`…`FE-CE-037`（提议案 `028–038` 经 `ce-id-map.tsv` 规范重编号），`ce_next=38` | `counterexamples.tsv`、`rounds/R013/ce-id-map.tsv` |
| 台账快照 | `rounds/R013/ledger-after-{plan,attack}/` 已存 | 目录在 |
| 未发生 | verify / integrate / review 三阶段**尚无任何产物** | `rounds/R013/` |

⇒ **续接点：R013 的 verifier 阶段**，不是新轮，也不是 R012 重放。

## 2. 候选摘要（现账）

```
id=A   文件=candidates/best.md
sha256=25c36f4c40d85fed87d79a175c6964018ff7c91bcd0ca6d66a042fe2e25293e7
核心赌注：命名空间化 (ns_id, local_id) 资源目录 + 每资源 cursor-stream 保留日志（retire/teardown 为唯一处置点）
          + 订阅者自算 from_cursor（0 / cursor_resolve / saved+1 带 ns 守卫）
          + 适配器 owns 开放 CapMap 与 ns 作用域类型化动作 + 类型化 pump；宿主不持内容权威
淘汰候选 B：缺陷（FE-CE-007）保留在 B 账上，不冒充修复、不阻塞 A，按守卫 E6/E7 不动。
```

## 3. 收敛现账（`loopctl convergence` 实跑）

```
NO: scenarios_independently_ruled_covered=10<12; scenarios_ruled_trajectory_broken=1;
    open_major_CE=7; clean_streak=0<3;
counterexamples: open_major=7 open_any=11 closed_awaiting_independent_replay=0
                 deferred_to_discarded_alternative=1
scenarios: claimed=12 independently_ruled_covered=10 broken=1 required=12
clean streak: 0/3
```

未决 11 条 = `FE-CE-007`（挂 B，不许动）+ 本轮新立 `028–037`。**评审的实质缺口已入台账与收敛门槛**（R013 攻击阶段完成，不再只躺在待办里）。

## 4. Sol 预算现账（未重置、未消费）

```
cap=10 reserved=0 ok=0 bad=0 remaining=10 final_reserve=2; auto-dispatch=off; pending=0
loopctl sol-audit : audit: budget record, reply artifacts and pending rows all reconcile
sol-budget.log    : 仅表头（从未发生调用）
sol/              : 空
```

- 前任已完成入口核对（`SOL-ENTRY-CHECK-R013.md`：命令、模型、二进制、目录、审计要求均已核对；唯一未证的是「服务能否真正补全一次」，须真实调用才可证明）。
- **本阶段获准的一次关键审阅：前任未用（reserved=0），本会话可使用一次**，须按 `sol-reserve → 调用 → 保存原始结果 → sol-complete`，`key` 绑定届时的最终候选摘要；不重复申请、不绕过入口、不替换指定模型 `gpt-5.6-sol`。入口不通只阻塞该项，其余工作继续。

## 5. 本轮（R013）待解决的上一轮未决事项 ↔ 台账落点

| 用户指定的未决事项 | 台账落点 | 状态 |
| --- | --- | --- |
| ① S08/S09 订阅、重连与回放矛盾；注册/句柄前置缺失 | `FE-CE-028`(S08 无投递机制) `FE-CE-029`(观测到丢失 vs 同 ns 追赶互斥) `FE-CE-030`(缺 register/铸 scope 前置行) `FE-CE-031`(invoke-spawned announce 时机矛盾) | OPEN，待 verifier 判定 |
| ② 用共享最小可执行语义模型验证 announce/注册/订阅/推送/销毁/重连 | `_pt/model/`（一个模型跑全部，不为单场景补专用规则；`run.repro.txt` 19/19 对上） | 已具备，verify/integrate 继续复用 |
| ③ 缓存保留与容量边界、资源重建后的游标、扩展命名冲突与卸载 | `FE-CE-037`(retire 对在线订阅者不可见 / retire 后 invoke 未定义) `FE-CE-034`(认领按挂载顺序、卸载静默换渲染器) `FE-CE-035`(schema 认领未命名空间化) `FE-CE-036`(成本只给扩展侧定价) | OPEN，待判定+修订 |
| ④ 评审实质缺口入台账与收敛门槛 | `FE-CE-028…037` 由 R012 candidate-reviewer 的散文缺口正式立账 | 已完成（本阶段） |
| ⑤ 核心不猜 Agent 状态：有权威声明就消费，没有就如实标未知 | `FE-CE-032`(`ExplicitAbsent`/`CapMap="unknown"` 无渲染规则) —— 修在**回退视图渲染规则**，不修进核心语义 | OPEN，待修订 |

另：`FE-CE-033`（声明式 schema 记号未定义，`020/021` 的闭合悬在未定义记号上）。

## 6. 生效规则（本轮起）

1. **总轮数/时长上限已由用户取消**；旧简报「12 轮或 6 小时」失效（见 `STOP-STATE-R012-CORRECTION.md`）。研究、攻击、验证可持续推进；**用户停止优先**。
2. 空转禁令仍有效：每轮须产出新成立反例或新删减；产品取舍自行不可决时只暂停该问题并给选项。
3. 真正收敛后**交候选待用户验收**，不自行锁定架构。
4. 只做设计与隔离实验；**所有新产物写在本报告目录**；不改产品代码、不改后端任务、不重建控制器。
5. 实验通过**仅证明模型**，不代表产品实现通过；独立核验若不可得则如实记录，**不把自评冒充独立核验**。
6. 不重置 Sol 预算、不绕过入口、不替换指定模型；前端 Sol 总预算 10 次与后端预算分开。

## 7. 本会话的独立上下文机制（如实标注，不冒充）

- 本会话**没有**子代理/独立上下文工具（工具面仅 read/bash/edit/write），因此**无法在会话内自行产生独立上下文**。
- 可用的独立上下文机制 = RUNBOOK 指定的 **Qoder 无工具纯文本角色调用**：`qodercli -p --model <FE_WORKER_MODEL> --tools "" --no-session-persistence --output-format text < prompt`。
  实测依据：本机 `qodercli --help` 全量读数（本会话已读，参数与 `NATIVE-CAPABILITY-AUDIT.md` 一致）、`env.conf` 指定 `FE_WORKER_MODEL=Qwen3.8-Flash`（I 于 2026-09-22 的裁定）、且同机后端侧 `qodercli … --model Qwen3.8-Flash` 会话正在正常出字。
- 该机制产出**与本会话不同模型、不同上下文**，经同一道 `loopctl accept` 机检门落盘 ⇒ 计为独立上下文核验（`ctx=qodercli/Qwen3.8-Flash`）。
- **不声称任何自动唤醒能力**：本会话不具备 `ScheduleWakeup`；若本轮跑到需要再次续接的停点，会在交付中明确报告实际停点。
- 机检门通过 ≠ 语义通过；语义结论只来自 candidate-reviewer 对同一字节摘要的判定。

## 8. 已观察、未修的控制器记录（不重建控制器，只登记）

1. `state.env` **陈旧**：`CURRENT_ROUND=9 / ROUND_STATUS=R009:verify_not_accepted`，而磁盘已完成 R012、在途 R013。`loopctl status` 因此打印 `round=9 phase=verify:failed`；`convergence` 与反例/场景计数走的是实时台账，数值正确。
2. `latest-summary.md` 刷新时间 04:28Z，**早于 R013 攻击**，其 `open_major=0 open_any=1` 已被现账（7/11）取代；每阶段会用 `loopctl summary` 重新生成。
3. `latest-summary.md` 的「独立核验判定分布」块 awk 语法错误恒为空、Sol 段落为硬编码 —— 见 `PROVENANCE-AND-GAPS.md`，正确来源以各轮 `ROUND-REPORT` 与本文件 §7 为准。

## 9. 边界

产品代码只读；未启停服务；未读凭据；无提交/合并/推送；未派发实现任务；未重置预算；未消费 Sol；
后端会话不归本会话调度。收敛仅指设计候选，不指用户批准或实施。

## 10. 下一动作

1. `loopctl handoff verifier R013` → 以 `qodercli` 无工具纯文本调用产出判定 → `loopctl accept verifier R013 <out>`（判定 `FE-CE-028…037` 是否 holds，并对当前字节重裁 S01–S12）。**← 已执行到这一步，被入口阻塞，见 §11**
2. integrator：按已成立反例修订候选（修在回退视图/边界规则/表内前置行，不把业务语义吸进核心），跑删减与复用 `_pt/model/` 的反例回放。
3. candidate-reviewer：对修订后字节做绑定摘要的独立核验（唯一计入收敛的判定）。
4. 每阶段后更新候选、台账、证据与 `latest-summary.md`，再续下一阶段；不重复输出长历史。

## 11. 本会话实跑进展与实际停点（2026-09-22T05:24Z）

**已完成（不依赖独立上下文）**

| 事 | 产物 |
| --- | --- |
| 写入者核查（§0） | 无前端在途写入者；后端写入者不与本目录相交 |
| 接管登记 | `TAKEOVER-R013.md`（本文件） |
| 续接点确认 | R013 `plan ✓ / attack ✓`，续接 verify，不从 R012 重做 |
| 材料装配 | `rounds/R013/verifier.prompt.txt`（119383 字节，含全量反例账） |
| 共享模型复跑 | `_pt/model/run.repro.txt`：期望 20/20 全中，exit 0 |
| 模型维护 ① | `EXPECTED["repaired"]` 校准：原为空表⇒把负向对照也期望成 PASS，永远不可能全中；现显式声明 5 条负向对照恒 FAIL |
| 模型维护 ② | 新增 `MC_spawn_announce_missing`（FE-CE-031 的删除即失败证据） |
| 执行证据台账 | `rounds/R013/EVIDENCE-R013.md`（逐条证据 + 强度，**明确不是判定**） |
| 阻塞记录 | `rounds/R013/verify.blocked.md`（原始退出码/输出/未落产物的后果 + 三个选项） |
| 摘要刷新 | `loopctl summary` → `latest-summary.md` 轮次 R013、`open_major=7 open_any=11` |

**实际停点（不声称自动唤醒）**

- R013 **verify 阶段被阻塞**：Qoder 每日用量上限，`qodercli -p …` 退出码 1，仅返回限额提示，**无产物过门**。
- 因此 `FE-CE-028…037` 全部**保持 OPEN**（未判成立也未判驳回），`candidates/best.md` 摘要**未变**（`25c36f4c40d8`），
  `rounds.tsv` 无 R013 行，收敛数值不变（`10/12、broken=1、open_major=7、clean_streak=0/3`）。
- **integrator 与 candidate-reviewer 两阶段随之顺延**（无已成立反例则无可关闭项，不跳过核验直接改候选）。
- 本会话**无 ScheduleWakeup / 无子代理**：需要用户再次续接，或按 `rounds/R013/verify.blocked.md` §3 的选项 A/B/C 之一放行。
- **未做**：未重试同一入口、未换模型、未消耗 Sol、未改产品代码、未改后端任务、未重建控制器、未提交/合并/推送。

## 12. 交付检查点（2026-09-22T06:13Z，用户改口径后）

用户将目标调整为“先交出可评审的前端抽象模型 v0.1”，不再等反例清零或三轮干净。
本会话已完成 R013 全六阶段（verify/integrate/review 均已过门并入账，见 `rounds/R013/*.meta`），
随后**暂停下一轮扩写**，`state.env` 置 `STATE=paused-delivery`。

- 交付三件：`MODEL-V0.1.md`、`MODEL-V0.1-RUN.md`（+ 复用的 `_pt/model/`）、`OPEN-QUESTIONS-V0.1.md`
- 状态与验证来源：`DELIVERY-V0.1.md`（含 state.env 修正前后对照、各判定的上下文与模型、待审事项）
- 独立通道已从 Qoder 切换为 `pi -p --no-tools --no-session` 调不同族模型；Sol 未动（0/10，待审标记保留）
- §1–§11 为接管当时的快照与 R013 推进记录，保留原样不改写。
