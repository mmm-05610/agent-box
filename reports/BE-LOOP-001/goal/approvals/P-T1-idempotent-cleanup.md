# APPROVED — P-T1 idempotent-release & ledger-reclaim (platform)

批准者：中央 C（D-0029 §实施：C 批准范围内即实施，无须再请用户）。**这是真实批准**，绑定如下；非旧 fake。
- 组：platform（P） · 任务：P-T1 · 方案版本：**P-DESIGN@v1**
- 基线：`b067c5718556c8efa93b054e6573ad3d186b3cf6` · 分支 `work/be-goal-platform-0`
- 契约：`C-RES@v1`/`C-RUNTIME@v1`（**草案**；本增量不改公共出口/签名/capability，故不触契约发布）
- Sol：**未使用**（C 直接批准；额度保全，留风险/价值处）

## C 独立核验（读实际源码，非二手）
- D2 git `provider.py:93-98`：二次 cleanup 因 `not marker.exists()` 抛 `refusing to clean unowned worktree` → 真缺陷；`worktree.resolve().parent!=managed_root` 是作用域护栏。
- D5 tmux `release:170-174` + `_runner(check=True:210)`：会话已亡时 kill-session 抛错 → 真缺陷；borrowed 分支已 no-op。
- D1 bwrap `cleanup:619-627`：pop `_secret_leases`→`_secret_sources`，但 `_secret_attempts`（set :529）**不回收** → 无界增长；真缺陷。

## 批准写入范围（逐路径；仅此，越界即驳）
1. `plugins/agent-box-git/src/agent_box_git/provider.py` — **仅 `cleanup` 方法体**
2. `plugins/agent-box-terminal-session/src/agent_box_terminal_session/tmux.py` — **仅 `release` 方法体**
3. `plugins/agent-box-sandbox-bwrap/src/agent_box_sandbox_bwrap/provider.py` — **仅 `cleanup` 方法体**
4. 三插件对应 `tests/`（P 新增用例，独立可写）

## 硬性约束（验收必核）
- **不得放宽两条护栏**：git「worktree 在、marker 无」仍拒绝清理；bwrap 不可用仍抛 `SandboxUnavailable`（不裸跑）。幂等只针对「目标态已达（二者皆无 / 会话已亡）」，不针对「从未拥有」。
- git：作用域/containment 检查保留；marker 缺且 worktree 亦不存在→no-op；仅当二者俱在才 remove。
- tmux：先以 `has-session -t`（**check=False** 或捕获，勿自身抛错）判存在；已亡→`{"released":True,"destroyed":False,"managed":True}`；在才 kill。不改 `managed:` 判定与签名。
- bwrap：在既有 pop 循环内 `pop(_secret_attempts, token)`；只按 token 键操作，**不读/打印任何秘密内容**。
- 一律向本仓既有幂等先例收敛，不新造抽象、不动公共契约。

## 验收条件（CHECKPOINT 须交）
逐路径 diff（仅上列）＋测试命令与实际结果＋已知缺陷＋（如消费侧可观察变化）对 E/H 交接说明；
反例回归：无主仍拒删 / 死会话幂等 / cleanup 后 `_secret_attempts` 无残留 token。
完成后 C 核查范围与测试→集成到候选→记录检查点→据任务卡派发 P 第二增量（D3）。

## 排队 / 另案（非本批准）
- **D3**（git 部分失败孤儿）：批准为 P **第二增量**，待 T1 落地后再逐路径批。
- **D4**（artifacts 明文+无 release）：**不批准 P 单方实施**；已登记为 INTERFACE_REQUEST，见 `contracts/interface-requests.md`，由 C 组织 P↔E（必要时 H）协商；若涉秘密策略/产品取舍无法在范围内定，则交 I。
