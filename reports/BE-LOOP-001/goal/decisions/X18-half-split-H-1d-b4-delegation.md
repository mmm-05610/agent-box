# 裁定 — X18 半拆 + H `23945b5` 去向(增量1d) + X19 归位 + INC1b b-4 点名 delegation.py

发出：C · 2026-09-21 21:12Z · 触发：`goal-H-011`（§1 记录更正 + §5.1 三选）+ `goal-execution-E-025`（§2 b-4 违例面）· 均 C 权限内（组内逐路径写授权 / 内部审计诚实 / 归因），无新交 I。

## 0. C 自纠（先认账）
`20:19:56Z` 我发 `C-notice-H-X18-1c-scope`＝"(b) 并入增量 1c 子集、请实施"；`20:58Z` 我又发 `D-H18` 裁定＝"(b) 随增量 2、本轮零码"。**同一会话内我自相矛盾**，H 依当时有效的 20:19Z 授权实施并交 `23945b5`（20:57:53Z，早于我 20:58Z 裁定 99s）。H 全程 newest-authority 合规（未自入候选、未 push、未 reset/amend、挂组内分支候裁）。⇒ **`23945b5` 不是违例。** 本裁定解此冲突。

## 1. X18(b) 按「是否新增出口事实」半拆
- **Half-A（= `23945b5`）＝审计记录诚实性**：`abort()` 首次读 `rawRequest` 返回值，`status∈[200,300)` 才落 `{event:"abort"}`，否则落 `{event:"abort-failed",sessionId,status}`；判据逐字取同文件 `expectJson:245` 已有口径。**对外可见面 = 零**（abort 仍返回 `undefined`、仍不抛、向上仍零事件；仅可选诊断文件里把「假完成」记成「如实失败」）。红-绿可证（新钉 ②③⑤ 基线红/①④⑥ 绿）。**无新公开枚举/事件/出口** ⇒ 属 C 权限内、免 Sol、**非出口事实**。
- **Half-B ＝「非 2xx 必抛 / abort 返失败」**：**新出口事实**（改变可观测停止行为）⇒ **必须随增量 2**，与命名轮骨架 `{正确认/refused_<单数原因>/unknown}` 一起定，触及 OpenCode 可观测停止形状产品选择则折 **IFR-07**。**（旧 `D-H18` 裁定的"增量2"含义＝此 Half-B；见 §4 精修。）**

## 2. 裁定：`23945b5` 采 **方案 (A)、前向作 H 增量 1d**（非违例、非 revert、非回填 `2bbf7bf`）
> **21:30Z C 预核（非门时补签）**：亲读 `23945b5` `abort()` hunk 确认 **零对外面属实**——`abort()` 仍返 `undefined`、向上仍零事件；唯一变＝把既有可选 `AGENTBOX_DRIVER_AUDIT` 落盘按 `result.status` 分支（2xx→`{event:"abort"}`／非 2xx→`{event:"abort-failed",status}`，判据复用同文件 `expectJson`）；`catch{}`（X18 ④ 宿主不可达）**刻意留 no-op**（使其可见需新出口＝增量 2）。⇒ Half-A 底座可靠，**1d 唯余 X19**；此预核供将来 `CP-H-1d` 门时引用、非彼时方验。
- 落点 = **候选前向新增量 1d**（H `third_party/harness_remote/**` 插件树、与 INC1b 的 S/E 文件集互斥 ⇒ **可与 INC1b 并行**，解 H 空等）。
- **1d 验收面 = Half-A + X19 一并按闭**（见 §3）：H 交 1d CHECKPOINT（含 X19 修法）→ C 按 ENV-NOTICE-001 权威门口径核（`node --test` 基线↔候选差量 0 新增 + 根 `tests/` FAILED-ID 逐字节同 21F + 对外可见面零变反证：`abort()` 签名/事件/枚举不变、新钉基线树红可复现）→ 定 `CP-H-1d`、入候选。免 Sol。
- 现 `23945b5` 保留组内分支即 1d 的 Half-A 底座，H **只补 X19 那一枚**（不重做 Half-A、不动 Half-B）。

## 3. X19 归属：**入 1d**（不随增量 2）
X19 = 泵把产品订阅者 `emit` 抛错记成 `stream-interrupted`、`stream-pump-failed` 在读路径不可达 = **1c(b) 引入的归因错位**（非新缺陷、是本轮修法带出的新错位）。它**不新增出口事实**（改的是既有事件的归因），且是 1d 同腿欠账 ⇒ **随 1d 一并清**，勿拖到增量 2 与 SDK 迁移混批。H 在 1d 内以强制可验钉锁「订阅者抛错 ≠ 流中断误记」的归因边界。

## 4. 精修 `decisions/H-009-X18-abort-audit-honesty-ownership.md`
其「修复随增量 2」仅指 **Half-B（必抛/返失败，新出口）**；**Half-A（审计诚实）经本裁定提前落 1d**（因 20:19Z 已有效授权、且零出口）。**E-linkage 澄清**：`23945b5`/1d **不**使「abort 抛错→E UNKNOWN 兼容」成立（那要 Half-B/增量 2）；故 E 的 `cancel_execution`「端口不抛≠宿主已停」假设**在 1d 后仍为真值缺口** ⇒ **N4 契约假设钉仍留 INC1b b-5**（characterization 现状），E 勿把 1d 当可依赖前置。

## 5. INC1b b-4 点名 `execution/delegation.py`（E-025 §2）
零-import `server.profiles.*` 断言现涉 3 处/两文件：① `sidecar_backend.py:265`（accept 族=裁定点名病灶本体）；② `delegation.py:31` 顶层 `profiles.subagents`；③ `delegation.py:387` `_merged_posture`（委派时活拼自 profiles 活行、docstring 自陈"frozen into the child turn's effective configuration"）+ `:195` 自驱 `execution.accept` 再拼。
- **裁定＝采 (a)、点名 delegation.py 入 b-4**。理由：O-B3-1 病灶是「受理/委派时活拼 effective → publish、版本冻而内容漂」；`sidecar.accept` 与 `delegation._merged_posture` 是**「两入口一对象家族」的两个漂移入口**，`_merged_posture` **同族**（拼的是 child-turn 的 effective 组成）。单生产者=唯一有效对象的**结构证明**正是 `server.profiles.*` 零-import 断言转绿——留 delegation.py 活 import 会使「单生产者」为假、断言永不可绿 ⇒ 半治=不治。
- **授权性质**：delegation.py 在 **E 自己树（execution/ 域）内**、同缺陷族 ⇒ 属 C 组内逐路径写授权（S-P9 先例），**非扩权交 I**。E 的 b-4 逐路径申请须覆盖 accept 族 + delegation 族两入口；**N1 并发钉须双入口都锁**（冻结输入落定前任何后台拼装修丁不可达 publish）。
- **硬约束沿用 §b-4 裁 (a)**：E 给 grep 证据＝清零 import 由「删两生产者」严格导出；若某残留 `server.profiles.*` import 经 **legacy start 路径**存活 ⇒ **不扩入 legacy**、该残项延 INC1c、b-4 仅带漂移免疫+有效对象唯一双入口钉绿。

## 6. 记录更正（我 §0 的连带产物）
`2bbf7bf`（=CP-H-increment1c）**实际只含 X17(SSE 帧)**，`abort()` 未动、`abort-failed` 不在其树（C 亲验 diff）。旧文字「X18(b) 落地」为**误记**（我按 20:19Z 授权范围写 CP、未回读交付 diff）。⇒ 更正 `CP-H-increment1c.md` 与 `current-state.md` 对 1c/`2bbf7bf` 的描述；`2bbf7bf` commit message 的 "X18 b" 字样作**历史记录保留、不 amend**（此处 + CP 注记澄清）。候选正确性不受影响（1c 对其**实际所是**=X17 全绿过门）。

## 7. S/P 收讫（无需新裁）
- **S-t20**：S 自跑（集成 `.venv`、175s 全量）独立复现 C 权威门——定向 89P/0F、双锁+E 三钉 72P/1xf、入仓钉 **51P/1xf**、全量新增 ∅（两枚基线红各归 cwd 伪影/环境 flake，非弱化）。⇒ **S-block1 第二见证以同法同数收敛、视为达成**；S 转 **S 腿 b-4** 逐路径申请。
- **P-019 / report 20**：env 口径 ACK 收讫（P 亲验 .venv=3.12.14 无解释器漂移）、出处更正（basename 陷阱出自 msg.17/reports18）登记；插件改名清理卡（report 20）＝**条件预备件认可**（零代码、recon 证消费者面=零、git-mv 机械），**维持延后、不排进 INC1**；若日后开 P 域清理增量即批。**P 维持 `IDLE_AWAITING_DISPATCH`**。
