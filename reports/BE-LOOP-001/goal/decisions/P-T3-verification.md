# C 核验 + 裁定 — P-T3 CHECKPOINT-007（D9 回收 + D12 形状 + 反向既有测试）

更新：2026-09-22 19:13Z（C）。交付 `3b67e96`（父续接 `2c7a925`）。批准书 `approvals/P-T3-d9-token-reclaim.md`。真实核验，未用 Sol（P-T3 fake 可验）。

## C 独立核验（源码级，含 P-T1 教训的既有测试改动审查）
- **范围**：`git show 3b67e96` = 仅 3 文件（provider.py +48/−1、两测试），全落批准 §1 白名单；未碰 `src/agent_box/**`/protocol/sandbox_port/capability/work_core；M-1 公开面不动；零秘密读/打印（仅 token 键操作）。
- **D9 语义正确**：回收绑在**消费**（`_consumed.add` 后、`finally` 内）非绑成功——干净拒绝（未达执行器）**不回收**（token 仍可被下一合法操作用）、达执行器但 `OSError` **必回收**；两向各一钉。`release()` 清 `_paths`/`_envs`、**`_consumed` 一行不动**。
- **`_consumed` 重放守卫保留（P-T1 失败模式）**：独立读 `provider.py` diff → `_reclaim`/`release` 均**不触碰** `_consumed`；P §5 反例钉：同 token 二次 submit → 仍 `SPAWN_TOKEN_INVALID`+`single-use`+执行器调 1 次；50 次后 `_paths==_envs=={}` 而 `_consumed==50`。守卫未削弱。✓
- **既有测试反转经审查为合法**：`test_releasing_the_host_does_not_clear_the_transport_token_ledgers`（旧断言 `token in _paths`、注释自陈「该台账增长作为 D9 提出」）→ 换 `test_releasing_the_host_releases_the_bindings_its_transport_issued`。反转仅关 `_paths`/`_envs` 是否清，**不关 `_consumed`**；D9 获批即令旧断言（把缺陷钉成契约）必反。非弱化、有注释理由。**接受反转**。
- **P 报数**（runtime-local 19、四插件 192、根 `tests/` 21F/1328P/33skip、红-非-修 9F/10P）与 C 早前 `4917f56` 全量基线**一致**（21 既有失败同集）；C 集成时再自跑差量坐实。

## 裁定（P §7 三问）
1. **§3.2 D9b — `_consumed` 不裁剪 = 定案**。其上界 = 本 host 生命周期内提交数、随 host 消失，**不留秘密值**（区别于 `_paths`/`_envs` 持环境值），删任一已消费记录＝复活 spawn token＝正违硬约束。**不另设上限**。若未来确有长跑单 host 无界诉求，须另立「保持拒绝语义的裁剪策略」新设计决定（本组、本轮均不做）。
2. **§3.3 加性 `reclaimed` 键 = 允许**。`C-RUNTIME@v1` §2 两族形状是**下限契约**（E 只判「异常=补偿失败且已记录」、不深解析），加向后兼容；P 自身钉 `set(receipt)=={released,destroyed,managed,reclaimed}` 已把唯一额外键显式化。**无需删**。
3. **§1 集成**：`3b67e96` + `2c7a925`（tests-only D6/D7 补强）并入**下一集成窗口**、产出下一候选并回执（见下时序）。

## D11 定位（P-T4 预备，登记）
P 坐实 D11 回声点 = `agent-box-terminal-session/src/agent_box_terminal_session/direct_stdio.py:78-80`（现回 `{released,destroyed}` 缺 `managed`；对照 `tmux.py:204/206/207` 三出口都带）。取值沿用 self-audit §26（该类型只能自管 → 恒 `managed:True`，加性一行）。P-T4 已批、无需新批文。

## 时序（保候选单线干净）
- 当前集成候选正处理 **E-INC1a 修复轮 `a4f7ca4`**（gate + 重花具名 E-impl-accept Sol）。P-T3/T2-followup 与之**路径不相交**（server/execution vs runtime-local/terminal-session 插件）。
- **待 INC1a 决定落定后**，把 `2c7a925`+`3b67e96` cherry-pick onto 当候选 → C 跑全量差量 → 记 `CP-P-T3` → 回执 P 并放行 P 开 P-T4。
