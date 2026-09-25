# APPROVED — P-T2 failure-window leaks + runtime-local no-op (platform 第二增量)

批准者：中央 C。真实批准，绑定：组 platform · 任务 P-T2 · 方案 P-DESIGN@v1（含 `07-ifr05-p-answers.md` 新证）· 契约 C-RES/C-RUNTIME@v1（本增量**不改公共出口/签名/Protocol**）· 基线 b067c571（P 分支续 `218ef4c5`）· Sol：未用（C 直批，内部收敛）。

## 范围（逐路径；越界即驳）
仅本组六插件**内部实现方法体 + 各自 tests/**：
1. `plugins/agent-box-git/src/agent_box_git/provider.py` — **D3**：`resolve`/worktree 建立与 marker 写入原子化，失败即回滚 remove（消部分失败孤儿）。仅 `resolve`/相关私有方法体。
2. `plugins/agent-box-terminal-session/src/agent_box_terminal_session/tmux.py` — **D6**：`allocate` 自建自查——记录「本调用创建了会话」局部标志，异常路径对自己刚建会话 best-effort `kill-session`（check=False）后**原样重抛**；`new-session` 自身失败则不 kill。不改 `managed:` 判定/签名；不触 borrowed。
3. `plugins/agent-box-sandbox-bwrap/src/agent_box_sandbox_bwrap/provider.py` — **D7**：`wrap` 以局部列表累积本次已绑定 token，任一 secret 失败即按 token 键回滚自身绑定（pop `_secret_attempts`/`_secret_sources`）后重抛；**只按 token 键操作、不读/打印秘密**。不改 wrap 签名/`already_cleaned` 分支。
4. `plugins/agent-box-runtime-local/src/.../provider.py`（如适用）— **D8a**：`LocalRuntimeHost` 加**显式 no-op 释放**（加性方法，令「静默跳过」变「明确回答」），不改现有方法签名。
5. `sandbox-bwrap` 内部固定 entrypoint 字面量收敛 **D8b**（`provider.py:217` 与 `sidecar_room.py:69` 合并单常量；`sandbox_port.py:127` **不在本增量**，属公共区，见下）。
6. 对应各插件 `tests/` 新增反例回归。

## 硬约束
- 三条失败窗口修复**不得放宽**：managed/borrowed 判定、「无主即拒删」、「不可用即 `SandboxUnavailable` 不裸跑」；异常一律**原样上抛**（补偿不得吞异常或覆盖原失败）。
- 秘密：仅按 token 键 pop，绝不读/打印内容。
- 不改任何公共出口/签名/capability/`protocol.py`/`sandbox_port.py`/`resource_contracts`（P-7 的「动词写进 Protocol」与 P-4 改名属公共区，**另走 C 发布**，不在 P-T2）。

## 验收（CHECKPOINT，同 T1 口径）
逐路径 diff（仅上列）+ 真跑 pytest（集成 venv 6/6+，P 本机无 pytest 则 C 跑）+ 反例回归：
- D6：`allocate` 内 `set-option` 抛错→恰一次 kill-session 且原异常上抛；`new-session` 自身失败→不 kill。
- D7：两 secret，第二个源非常规→第一个 token 已从 `_secret_attempts` 回滚、`_secret_leases` 无该 spec、异常仍 `ProjectionRejected`。
- D3：worktree 建后 marker 写失败→回滚 remove、无孤儿。
分级声明：机制/夹具 ≠ 真机（无真 tmux/无 pytest 环境外）。完成后 C 核范围+测试→集成候选（当前候选 `4674a2a` 续接）→记录检查点。

## 并行 / 非本批准
- P-5 分级答复、P-7 动词 Protocol 化、P-4 `RoomProcessSpec` 改名 → 转 E design v1 与 C 契约发布线（见 `sol/E-design-final-001-decision.md`、E 指令）。
- P-2「是否新建 home provider」+ D4/D5 明文留存 → **IFR-01 升级 I**（秘密/产品策略，见 `escalations/`）。P-6 ssh provider 属格局/新插件，本轮不接收，C 排期。
