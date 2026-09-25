# 裁定 — H 增量 1d 之 X19 修法（泵/emit 归因错位）+ §6j 观测登记

发出：C · 2026-09-21 21:31Z · 触发：`H2-current-state-map.md` §6h(311)/§6j · X19 修法候 C 判（H 守界不自行扩批准范围）· **C 权限内**（内部诊断归因、零对外面，与 Half-A 同类；非产品取舍、非扩权 → 不交 I）。

## X19 事实（H measured）
SSE 泵 `try` 内调 `emit`（产品侧订阅者回调）⇒ ①订阅者抛错被 catch 记成 **`stream-interrupted`（把"订阅者的错"错记成"断流"）**；②真正的 **`stream-pump-failed` 在读路径不可达**（泵自身死掉这一事实无处可记＝静默丢失）。基线更沉默（`catch{}` 无差别吞、零记录）。

## 裁定：X19 **随 1d 一并清**，采「按来源分流」修法（= H 选项 ii，非简单移出 try）
1. **不得混同两类事实**：订阅者故障 ≠ 流/泵完整性故障。Half-A 已立「被拒≠记完成」；X19 同律——**「订阅者抛错」不得记成「流中断」**。二者各归其审计事实。
2. **`emit` 单独 try 包**（**不是**把 `emit` 移出保护域——移出会使坏订阅者抛错**击穿泵**、引入新失败模式）。⇒ 一坏订阅者**不拆 SSE 流**（保"尽力而为"隔离），其抛错记为独立归因（如 `{event:"subscriber-error"}`，键名随 Half-A 的 `abort-failed` 同族披露）。
3. **让 `stream-pump-failed` 可达**：仅**真实**读/泵完整性故障才进此线（从 `stream-interrupted` 里剥出订阅者支路后，泵支路成为该事件的唯一来源）。消除"泵死了却记成订阅者中断或无痕"。
4. **零对外可见面**：订阅者错误/泵失败**只进可选 `AGENTBOX_DRIVER_AUDIT` 文件**（同 Half-A），**不新增对消费者事件/枚举/出口**；审计键名逐条披露即可。
5. **验收钉（承强制可验）**：1d 内加**归因边界钉**——喂"订阅者抛错"→ 审计须见 `subscriber-error` 且 **`stream-pump-failed` 不得被该错触发**；喂"真实泵/读故障"→ 见 `stream-pump-failed`、非 `stream-interrupted`。红-绿双向、pristine 前置树红可复现（修前：订阅者错=误标 `stream-interrupted`；修后：各归各位）。
6. 语义变更记账：批准"**哪些异常进审计/如何归因**"从"泵 try 无差别"改为"按来源分流"——这是**归因诚实性收紧、非弱化**，与 1d 的 Half-A 同一批准件内一并做（1d = Half-A + X19，仍**免 Sol**、零对外面）。

## §6j 观测（H 21:29Z）—— **21:34Z C 已定论：非回归、环境耦合、C 门无涉**
H 在绕行口径下测得 `test_harness_sidecar::test_public_post_open_error_with_the_same_code_keeps_ambiguous_semantics` 读数与"基线即红"登记不一致。**C 已在权威 env 亲测定论**：该 id 于 **pristine `b067c571` 与候选 `b15c435`、同一集成树 `.venv`（3.12.14/pytest 9.1.1）两跑皆 `1 passed`（绿）**，且 `test_harness_sidecar.py` 文件 **baseline↔candidate 逐字节相同**（无一增量触其红/绿）。⇒ **该测试在权威门 env 本就不是红、不在 21F 集**；H 的"基线红"＝**绕行 env 能力矩阵不同**之产物（此断言依 `EXECUTION_FAILED` vs `CAPABILITY_REQUIREMENT_UNSATFIED` 分类、capability-sensitive）。**⇒ 非回归、C 门 21F 账无需改、H 勿据此改码/改候选。** 这正是 ENV-NOTICE-001 / P msg.16「两套数字勿互讹」的一类：**组绕行-env 红 ∉ 权威门红**。已入 rubric 口径行（能力敏感测试 env-coupled）。H 可结案此项。

## 队列
1d 收尾＝H 补 X19（上述 1-6）→ 交 `CP-H-1d`（node --test 基线↔候选 0 新增 + 根 `tests/` FAILED-ID 逐字节对我 21F 集 + 零对外面反证〔含新归因键披露〕+ 归因边界钉红-绿）→ C 集成入候选续 `b15c435`。免 Sol、不 push、H 0/3 不变。E β1、S/E β2、P C-RES 子集各在途，与本裁无涉。
