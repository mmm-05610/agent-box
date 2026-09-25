# APPROVED — E-INC0 pinning tests (execution)

批准者：中央 C。**真实批准**，绑定：组 execution · 任务 E-INC0 · 方案版本 design v0 · 契约 C-EXEC@v1(block1) · 基线 `b067c571` · 分支 `work/be-goal-execution-0` · Sol：未用（本增量仅测试，非定稿核验）。

## 范围（仅此；越界即驳）
- **只写本组 `/tests`**（`worktrees/backend-loop/execution/tests/`）：五攻击「钉住测试」回归网。
- **不写** `server/` 产品源码、**不改** 任何公开签名/协议、**不碰** bootstrap/work_core/`execution/protocols.py`/`extensions/api.py`。
- 不改产品行为——这是实现前的安全回归网，风险为零，无需等 E design-final Sol#1。

## 须覆盖（对齐 block-1 反例 + E-P1 五攻击）
1. 取消三态可分辨：无在飞→`refused_no_active_run`；abort 应答→`confirmed_stopped`；超时/通道断→`unknown`；断言无任何路径把 refused 压成 unknown 或反之。
2. 未知不盲重放：同 `Idempotency-Key` 重放 cancel → 返回原回执，不二次下发 abort。
3. 终态权威在 S：E 不读业务 ledger 判终态（结构约束/契约测试）。
4. stopReason 纯透传：非 clean 任意字符串原样上抛，E 侧不闭集枚举丢真值（**不得**按旧任务卡四值限制）。
5. 无静默降级：sandbox 端口名不匹配 → 类型化拒绝（fake 端口注入，不触真进程）。

## 验收（CHECKPOINT）
钉住测试文件清单 + `pytest` 命令与实际结果（当前对基线实现应红/xfail 标注为「未实现语义」，实现后转绿——**不得为转绿而弱化断言**）+ 覆盖映射到上述 1–5。交 C 核对范围与结果。

## 未批 / 后续
- E-INC1（block-1 产品实施 + 去插件直 import + 失败登记）**暂不批**，等 H(C-HARNESS H-1..4)、P(C-RES/C-RUNTIME P-1..6) 确认 → E design-final → **预留 Sol#1 真核验**通过后再逐路径批。
- S-block1 切换四处调用点：等 E block-1 检查点经 C 集成后批。
