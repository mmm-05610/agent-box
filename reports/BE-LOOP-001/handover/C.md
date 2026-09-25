# BE-LOOP-001 · 中央 C 交接文档（后端协调机制切换）

**撰写**：中央 C（BE-LOOP-001 原生 goal 会话）· 2026-09-22 00:53Z（本地 08:53）
**授权**：I 交接指令（00:50Z）——立即停止新增派工/批准/集成；等待当前命令结束；不终止进程、不追加修复；状态落盘本文件；保留所有修改、不重置预算；落盘后结束交接 goal、不恢复旧循环、等待 I 新规则。
**性质**：只读盘点 + 本文件落盘。**自 00:50Z 起 C 未做任何新派工/批准/集成/代码修改**；此前所有在途产物原样保留。

---

## 0. 冻结时点声明（切换瞬间的真实状态）

- C 侧无在跑命令：最后一个后台任务（β2 沙盒全量门 `b3atwtebc`）已于 00:33Z 完成；沙盒 worktree（/tmp/c67-*）已全部 `worktree remove --force`+prune，`git worktree list` 无 /tmp 残留。未终止任何进程。
- 四组 qodercli 会话进程仍在（server/execution/harness 见 `ps`，启动约 7h47m 前；platform 同构）。**按指令不动它们。**
- 集成树 `worktrees/integration-linux/backend`（分支 `integration/linux-native-0`）HEAD=`67e5c52`、porcelain 干净（除 `.qoder/`）。
- **I 曾于 00:47Z 授权「选项 B：C 代 S 提交 β2 五文件（单次）」——该授权已失效且从未执行**：S 会话在授权前（00:43:25Z）已自行提交 `405b8b4` 并交 CHECKPOINT（msg.server.22）。C 未对 S 树做任何写操作。
- **S β2 提交 `405b8b4` 按冻结令未集成**——它是「待新机制处理的在途产物」，详见 §4。

## 1. 实际 Sol 预算（账本原文，未重置）

账本：`control/backend-loop/controller/ledger/budget.json`（version 1，budget_id `BE-LOOP-001-backend`，model gpt-5.6-sol）
- **total=10，used=4，余 6**。group_used：E=4、H=0（组帽 3 未动）、P=0、S=0、central=0。
- 4 次全为 E、全 counted：`E-DESIGN-FINAL-001`（reservation，01:34+0800，REJECT 6 反例）→ `E-DESIGN-FINAL-002`（flexible，01:59，概念接受/范围 reject）→ `c71fcc4f…`（flexible，03:06，milestone E-impl-accept，INC1a@`ee39270` 验收）→ `3eb6faff…`（flexible，03:19，milestone E-impl-accept）。
- reservations：`E-design-final`=used；**`E-impl-accept`=仍标 reserved**（而两次 impl-accept 消费走的是 flexible 路——账本原样如此，未改）。
- 原始留痕：`control/reports/BE-LOOP-001/goal/sol/`（raw/记录件）。调用法：`budget.py consume`（exit 0=GRANTED/10=DUPLICATE）+ `codex exec -C <树> -c model=gpt-5.6-sol -s read-only --skip-git-repo-check`。

## 2. 候选与集成基线（新机制的起点事实）

- **当前候选＝`67e5c52`**，谱系：`b067c571`(四组共同基线) ⊕ P-T1/T2(`4917f56`) ⊕ P-T3/T4 ⊕ E-INC1a(`ee39270`) ⊕ S-block1(`b15c435`：E 腿 `acadad7`+`e906cb4`+`f846cbc` ⊕ S 腿 `3a06783`+`2ec4a86`) ⊕ INC1b β1(`f97e96f`，E `1dec494`) ⊕ H-1(`ac28ad5` 段)/1b(`2bbf7bf`)/1c/1d(`c309395`) ⊕ P-T6(B)(`67e5c52`)。**11 个 C 验收增量**，检查点文件在 `goal/checkpoint/`。
- **权威门配方（ENV-NOTICE-001 后唯一口径）**：集成树 `.venv`（Python 3.12.14/pytest 9.1.1），`PYTHONPATH=src:$(ls -d plugins/*/src|paste -sd:)`，`pytest tests/ -q -p no:cacheprovider -rf --tb=line`，**默认 prepend 模式（勿加 `--import-mode=importlib`——会断 tests/server 裸名同级导入 `test_wire_v1`/`test_delegation`）**。系统 `/usr/bin/python3.12` 已被移除、`agent-box/.venv` 坏，勿用。
- **基线账**：pristine `b067c571` 与候选 `67e5c52` 同为 **21F/1388P(β1 后)/33skip/1xfail**，21 枚 FAILED-ID 逐字节同（皆 tool/model/binary 缺席的环境固有失败：pi_gate_cleanup×5、opencode_gate_cleanup×11、child_limits×2、gate_worker_defaults、hermes、sidecar_lease）。**验收判据＝FAILED-ID 集与 pristine 同环境对照逐字节相同（0 新增）**，勿只比计数。
- 集成纪律（历次执行）：只在组已 commit 的 CHECKPOINT 上 cherry-pick/合批；整批原子入候选；集成前查目标树 dirty；禁 `git add -A`；禁 push；禁碰他组未提交 WIP；撤回只撤 C 自己并入的提交。

## 3. 各组状态（HEAD / 在途 / 批准范围 / 阻塞 / 下一动作）

### S（server，`worktrees/backend-loop/server`，repo 在 `source/`）
- **HEAD=`405b8b4`（β2 S-leg，00:43:25Z 自提交），树 clean**（仅 `.qoder/`）。基线链：`b067c57`→`3a06783`→`2ec4a86`(block1)→`405b8b4`(β2)。
- **在途产物＝`405b8b4` 待集成**（内容见 §4）。CHECKPOINT=msg.server.22（08:45:37+0800）。
- 已批准范围：block1（P1-P4+P9，已入候选）、INC1b b-4 S 腿（`approvals/INC1b-release.md`+`INC1b-batch-E-approved.md`+`decisions/INC1b-b4-confluence-interface.md`，键名定形 `effective_config_object_digest`）。
- 阻塞：无（等集成方处理 `405b8b4`）。
- 下一动作（旧循环原定，**冻结中、由新机制决定**）：β2 合批后领 INC1c S 项（legacy COALESCE 回退删、resolve_all 直读删相关 S 侧、死参清理微批的 S 半）。

### E（execution，`worktrees/backend-loop/execution`）
- HEAD=`2c69343`（β2 E-leg，已 commit、**注明 NOT for standalone integration——只随 S⊗E 合批**），树 clean。
- 已批准/已入候选：INC0 钉、INC1a（`ee39270`，Sol#3 验收）、INC1b β1（`1dec494`→候选 `f97e96f`，Sol#4）、block1 E 腿三提交。
- 在途：`2c69343` 待与 S `405b8b4` 合批集成。
- 兼任：**C-RUNTIME 动词公共区单写者**（`approvals/C-RUNTIME-verbs-single-writer.md`，INC2 时执行、加性）。
- 阻塞：合批集成冻结中。下一动作（原定）：INC1c E 项（委派写点 `_create_child_turn` 落同 digest 语义、delegation-leg strict-xfail 转正、`resolve_all` 直读删）。

### H（harness，`worktrees/backend-loop/harness`）
- HEAD=`1c7c76c`（增量 1d 尾段），clean；1/1b/1c/1d 全部已入候选（`ac28ad5`/`2bbf7bf`/`2bbf7bf`/`c309395`）。
- 阻塞：**增量 2（迁 SDK/帧层/license/公开 message.final/X17②⑥+X18(a)）挂 IFR-06 待 I**；增量 3 待 C-RES 执行面+E 委派停止语义（即 β2/INC1c 之后）。Sol 组帽 3 未动。
- 下一动作：等 IFR-06 裁定或新机制指令。

### P（platform，`worktrees/backend-loop/platform`）
- HEAD=`a5e230a`（P-T6(B)），已入候选（`67e5c52`）。clean、**IDLE_AWAITING_DISPATCH**（P 自报，msg.platform.26 纯闭环 ACK）。
- 未决登记（全为「只登记不自修」）：缺口 A（disable 陈旧令牌→typed `REVISION_CONFLICT`）→R-6/INC2；msg.platform.20 两问（windows `provider.py:91,176` `IsolatedProcessSpec` 归属、E-015 征询-1 定形）→INC2 批文点名；P-T5 暂缓（C 20:20Z 裁）；D17、ssh 排期、windows `cleanup->bool` 归属。历史孤儿目录未清扫（R-1，需 I 另立带归属判据的处置）。

## 4. 待集成：INC1b β2 S⊗E 合批（冻结前已 100% 预验证）

**这是旧循环唯一在途的集成路径，冻结令下未执行。新机制接手时的完整事实：**

- **合批内容**：候选 `67e5c52` ⊕ E `2c69343` ⊕ S `405b8b4`（5 文件：`sessions/repository.py` +8-3、`sessions/service.py` +18-1、`wire/handlers.py` +6-1、`tests/server/test_b4_acceptance_freeze_s.py` 新增 230 行、`tests/server/test_stage_a_server.py` +1）。
- **C 侧独立预验证（沙盒、与 S 提交内容同一 diff，00:30-00:33Z）**：
  - `git apply --check` 两腿全 rc=0；
  - 定向：stage_a+S b4 钉+E b4 钉+E block1 钉+boundaries+shared_store＝**62 passed/1 xfailed/0 failed**（该 xfail＝E 刻意 delegation-leg strict-xfail，归 INC1c）；
  - **全量权威门（同一树内容）＝21 failed/1397 passed/33 skipped/1 xfailed，FAILED-ID 集与 pristine `67e5c52` 逐字节相同（diff 空）＝0 新增**；
  - 反证非假绿：无 b-4 时 F1/F2（非空冻结 digest）+F4（N1 强制交错 409）红、F3/F5 绿（刻意护栏）——钉有效。
- **S 自报门（msg.server.22，单目录串行法）＝合并树 10F/1388P/33s/1xf/20E ↔ pristine 10F/1379P，FAILED+ERROR 双向 comm 空＝0 新增、+9P=新钉**。**两账构成差异（C：21F/0E；S：10F/20E）未对账**——疑为跑法差异（S 含插件目录串行→同名 `test_plugin.py` 收集错误显 E；C 只跑根 `tests/` 权威配方）。**结论一致（0 新增）；权威口径以 C 的 ENV-NOTICE-001 配方字节差分为准。**此差异留给新机制，C 按冻结令未追加核实。
- **原定下一步（冻结中）**：cherry-pick `2c69343`+`405b8b4` 上 `67e5c52`（先核 S 提交内容==C 已验 diff：`git show 405b8b4` 对 §4 清单）→ 复跑权威门（预期 21F/0 新增）→ 写 `CP-INC1b-beta2` → 闭 INC1b → 派 INC1c（范围＝`decisions/INC1b-b4-confluence-interface.md` §6：委派写点、legacy COALESCE 删、resolve_all 直读删、死参清理微批、Gap-A/R-6 拒绝枚举归 INC2）。
- 合批语义要点（防误读）：`effective_config_object_digest` 为**原始键**（无 COALESCE）；null→`AgentBoxProfileV1` typed 拒绝（无静默活行回退）；legacy NULL 行 READ 侧 COALESCE 回退保留至 INC1c；两 accept 调用点均已停传 overrides（E 形参保留忽略、Protocol 未动）。

## 5. 契约与关键决定（全部已发布、自洽）

目录 `control/reports/BE-LOOP-001/goal/`：
- **contracts/**：`C-EXEC-v1-block1.md`（取消三态+`refused_*` 追加节+`<Fact>Outcome` 命名骨架；§1 壳锚已加性更正——β1 删壳后真值唯一面=`cancel_execution`）；`C-RUNTIME-v1.md`（provider 动词加性+回执形状+`RoomProcessSpec`；4 锚指 INC2 域未触）；`C-HARNESS-v1.md`（协议分层/三型角色/stopReason 5 值/复用诚实；§实施门状态=1/1b/1c/1d 已入候选、增量2⏸IFR-06）；`C-RES-v1.md`（**现文 sha256 `7cb3aa16…`/91 行**，R-1..R-9+§10 桩 A-E；P msg.26 独立终验与 `67e5c52` 自洽；唯 `disable` 相关行号指 `a5e230a`＝248-256/219/253/255，余六文件 blob 全等 `2fa8b5a`）。
- **decisions/**（裁定全集）：`INC1b-b4-confluence-interface.md`（β2 接口+§6 INC1c 范围）、`INC1b-naming-round-ruling.md`、`X18-half-split-H-1d-b4-delegation.md`、`H-1d-X19-attribution-fix-approach.md`、`S-block2/block3-rulings.md`、`P-T1-regression.md`、`H-009-X18-…` 等。
- **approvals/**：各组逐路径批文全集（S-block1、INC1b-release、INC1b-batch-E、E-INC0/INC1a、H-1/1b/1c/1d、P-T1..T6、C-RUNTIME-verbs-single-writer）。
- **checkpoint/**：11 个已验收入候选的 CP 文件（CP-P-T1T2 … CP-P-T6）。
- **escalations/**：**IFR-01**（秘密留存政策，交 I，含 21:45Z 第三事实 skills revision 单调增长/R-9）、**IFR-06**（H 增量2 迁 SDK/license/公开 wire，交 I，含 §4 完整增量2公开面）、**IFR-07**（opencode 流粒度）、**OPS-S-session-stalled**（运维 heads-up：S 曾两度停在 commit 前；**已被 S 00:43Z 自提交 `405b8b4` 事实性解决**，文件按「保留所有修改」未改，以本条为准）。
- **review-rubric.md**：验收教训集（并发钉、fake 扫净、能力敏感测试 env 耦合、契约锚点漂移复查、**单腿绿≠全 confluence 绿**、核心门勿加 importlib）。
- **acks/**：ack-S/E/H/P。状态页：**current-state.md**（一页状态+全心跳，最后一条 00:37Z）。

## 6. BE-PROFILE-001（I 新任务，冻结中未启动）

- `control/tasks/BE-PROFILE-001.md`（I 签发 2026-09-22，ISSUED 待 C ACK）+ `goal/decisions/I-BE-PROFILE-001-dispatch.md`：Profile 独立能力职责盘点与拆分方案；C 协调 S/E/H（必要时 P）只做**调查/设计/协商**，不动产品代码不迁数据；不阻塞既有 S/E 合批；交付汇总到 `control/reports/BE-PROFILE-001/`（5 项交付清单见任务卡）。
- **C 未 ACK、未派工**——00:47Z 的前一 goal 曾令 ACK+安排，但 00:50Z 交接冻结令（停止新增派工）覆盖之。**下一动作＝由新机制按 I 新规则决定 ACK 与派工。**

## 7. 残留物件与进程（保留、未清理）

- `/tmp/s_full_tracked.patch`（S β2 四 tracked 文件 diff，95 行，sha256 前 10=`070ad07b4b`）、`/tmp/s_newtest.patch`（236 行）、`/tmp/e_b4_leg.patch`（379 行）＝C 沙盒验证用快照（S 提交前生成；与 `405b8b4` 内容一致性按 §4 diffstat 核对，新机制可再生成）。/tmp 非持久，勿依赖。
- 门日志：`/tmp/betag.log`（importlib 误用废跑）、`/tmp/betag2.log`（S 单腿 22F 抓到回归）、`/tmp/basetag.log`（pristine 21F）、`/tmp/betag3.log`（**最终 5 文件 21F/1397P**）、`/tmp/f_prist.txt`/`f_final.txt`（FAILED-ID 集，diff 空）。
- 进程：四组 qodercli 会话 + 中央会话在跑（未动）；`budget.json.lock` 为账本正常锁文件。

## 8. 给接手机制的三句要诀

1. **先集成 β2 合批（§4）再谈 INC1c**——全部证据已备，预期一次过门；S/E 两 commit 已存在，无需任何组再写码。
2. **权威门只认 ENV-NOTICE-001 配方 + FAILED-ID 字节差分**；组自报账（如 S 的 10F/20E 构成）可与 C 账并存但裁定以 C 配方为准。
3. **交 I 的未决**：IFR-01/06/07 + BE-PROFILE-001 的 ACK/派工 + P 的 INC2 归属点名（windows/E-015）+ 历史孤儿清扫政策（R-1）。

—— 交接完毕。旧循环（收集→批→集成→派下一增量）自本文件落盘起停止，等待 I 的新规则。
