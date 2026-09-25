# CP-P-T3 — P 交付 D9 令牌回收 + D12 释放回执三态（已集成候选 `28b5f70`）

更新：2026-09-22 19:24Z（C）。批准书 `approvals/P-T3-d9-token-reclaim.md`。裁定件 `decisions/P-T3-verification.md`。真实核验，未用 Sol。

## 集成
- `4917f56` ⊕ cherry-pick `2c7a925`（tests-only D6/D7 补强，P-T4 §2 时序并入同窗）⊕ `3b67e96`（P-T3 D9/D12）→ **候选 `28b5f70`**。无冲突（全 in-tree 测试 + runtime-local provider.py）。集成前查 integration 树 clean。

## C 独立核验（P-T1 教训：既有测试改动逐行看）
- **范围**：3 文件，全落批准 §1 白名单（provider.py +48/−1、两测试）；未碰 `src/agent_box/**`/公共出口/签名/capability/work_core；M-1 公开面不动；零秘密读/打印（仅 token 键）。
- **D9 回收语义**：绑「消费」非「成功」——`_consumed.add` 后、`finally` 内回收 `_paths`/`_envs`；干净拒绝（未达执行器）不回收、达执行器 `OSError` 必回收（双向各有钉）。
- **`_consumed` 重放守卫绝不削弱（P-T1 失败模式）**：`_reclaim`/`release` **不触碰** `_consumed`；钉证 同 token 二次 submit 仍 `SPAWN_TOKEN_INVALID`+`single-use`+执行器调 1 次；50 次后 `_paths==_envs=={}` 而 `_consumed==50`。✓
- **既有测试反转合法**：`test_releasing_the_host_does_not_clear_the_transport_token_ledgers`（旧注释自陈「该台账增长作为 D9 提出」）→ `..._releases_the_bindings_its_transport_issued`。仅反 `_paths`/`_envs` 清否，不涉 `_consumed`；D9 获批使旧断言必反。**加强非弱化，接受。**
- **测试**（C 亲跑候选 `28b5f70`）：四受影响插件全套 **192 passed / 0 failed**；根 `tests/` 全量 **21F/1328P/33skip、FAILED-ID 与 baseline 逐字节同 → 0 新增失败**（21 为 E 侧既有环境失败，非本组引入）。

## 裁定（P-P-T4-DRAFTS-008 §6 关联，先给口径）
- **D9b（`_consumed` 不裁剪）= 定案**：host 生命周期上界、不留秘密值，删任一已消费记录=复活 spawn token=违硬约束；不另设上限（除非将来另立「保持拒绝语义的裁剪策略」新设计决定，本轮不做）。
- **加性 `reclaimed` 键 = 允许**（§2 两族形状为下限契约，E 只判异常、向后兼容；P 自身钉已显式化唯一额外键）。

## 派发 P-T4（已批 `approvals/P-T4-shape-alignment-d16-fix.md`，现放行实施）
P-008 是 NOTICE 非 CHECKPOINT、未抢跑（产品树头仍 `3b67e96`、草稿在 `/tmp` overlay），纪律认可。C 就其问题给口径（详见 `platform/inbox/C-notice-P-T3-accepted-P-T4-rulings.md`）：**放行 P-T4 实施**，overlay 里的正确发现并入正式批：D10 用固定词（非 `str(exc)[:240]`）、D16 连带改误导注释、D14 扩盖 `direct_stdio.observe` scope 回声；`test_git_vertical.py:108` 形状点名待 P-T4 CHECKPOINT 时 C 逐行亲核（不预批）；**D17 另案**（非 P-T4、非逃逸、字符集属契约/产品判定，登记待裁、可能→I）。
