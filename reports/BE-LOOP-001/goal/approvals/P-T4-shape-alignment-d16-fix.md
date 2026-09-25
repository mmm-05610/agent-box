# APPROVED — P-T4 释放/清理回执形状对齐（D10/D11）+ D16 异常真因保全修复（platform）

批准者：中央 C。回应 `goal-platform-P-AUDIT-CHECKPOINT-006`（§2 自审 D10–D15 + D16）。真实批准，未用 Sol。基线候选 `4917f56` · 分支 `work/be-goal-platform-0` · 契约 `C-RUNTIME@v1` §1/§2。

## 0. C 亲验（读码，非采信自报）
- **D16 属实**：`plugins/agent-box-terminal-session/src/agent_box_terminal_session/tmux.py:109-125` `allocate` 的 `except BaseException` 补偿——`:117` 注释自陈「compensation must not replace the original failure」，但 `:123` `kill-session` 用 `check=False` **只压 `CalledProcessError`（非零退出）**，若该调用抛 **`OSError`（spawn/二进制/socket 级）则在 `:125` 裸 `raise` 之前逃逸 → 原始真因被吞**（P 实测 `exc is ORIGINAL == False`）。**这与已批准收「best-effort … 原样重抛」不符**，且与 P 自己在 D3 的 `try/except: pass` 写法不一致。
- **D10 属实**：`agent-box_git/provider.py:116 def cleanup(self, execution_id)->None`（`:128 return`）→ git 属**清理族**（§2 明列 bwrap/git/coordinator），却返回 `None`，不合 `{status: cleaned|already_cleaned|{error}}`。
- **D11 属实**：direct-stdio `release` 缺 `managed`（§2 三态族须含）。
- **D12 无需另批**：C 见 `agent-box-runtime-local/.../provider.py:302-307`（P-T3 在途）已把 `cleanup` 回执由自造 `{…,owned:False}` 改为 **`{released,destroyed,managed}` 三态族**并注明「`owned` removed」→ **D12 由 P-T3 形状收敛覆盖**，本批不动。
- **D13 属公共区，非 P**：`src/agent_box/extensions/runtime_composition/coordinator.py`（:129/163 顶层无 `status`）→ **归单写者线（E 的 C-RUNTIME 动词/公共区批）**，P 只报不修正确。登记为契约合规缺口。
- **D15 延后**：skills 无释放动词不违 §2（可合法无动词），「保守按可产生副作用」处理为可接受债务，本轮不立案。

## 1. 批准范围（逐路径，插件内，加性向后兼容，**不改公共出口/签名/capability/`protocol.py`/`sandbox_port.py`/`resource_contracts`/`src/agent_box/**`；M-1 公开面不动；不申请 Sol**）
1. `plugins/agent-box-terminal-session/src/agent_box_terminal_session/tmux.py` — **D16**：`allocate` 补偿 `:118-124` 的 `kill-session` 包 `try/except BaseException: pass`（best-effort，与 D3 同款），确保 `raise` 重抛**原始**异常（`exc is ORIGINAL` 成立）；不改 kill 的 `check=False`、不改 `created` 门控（借来会话仍不可达）。
2. `plugins/agent-box-git/src/agent_box_git/provider.py` — **D10**：`cleanup` 由 `-> None` 改为清理族回执：实际移除 → `{"status":"cleaned"}`；目标本就不在（幂等）→ `{"status":"already_cleaned"}`；失败 → `{"status":{"error": …}}`。**取值词即 §2 词表，无新词**。护栏不放宽（无 ownership/记录但目标仍在仍拒，§2/§15）。
3. direct-stdio provider（P 精确定位文件）— **D11**：`release` 补 `managed` 键，对齐三态族。
4. **D14 卫生约束（并入上列）**：任何 `cleanup`/`release` 回执与拒绝消息**不得把调用方可控原文回声进 `spec_digest` 等可入日志字段**；须为摘要（`sha256:` 前缀那类）或固定 status 词。P 命名具体回声点后改，并加「回执/拒绝不含调用方可控原文」钉（同 `2c7a925` 里 D7 那条纪律钉）。
5. `tests/**`（本组自有）：D16 新钉（现红→修复转绿：`set-option` 抛 + `kill-session` 抛 `OSError` → `allocate` 上抛 `exc is ORIGINAL`）+ D10/D11 形状钉 + D14 回声钉。**须证不弱化既有**（重放/单用/所有权守卫、`ambiguous_semantics` 不顺手改绿）。

## 2. 时序（避免与在途 P-T3 并行越界）
- P **先交 P-T3 CHECKPOINT**（D9 runtime-local 令牌台账回收 + D12 形状，`_consumed` 重放守卫绝不削弱）→ C 核+集成候选 `4917f56` 续接。
- **再交 P-T4 CHECKPOINT**（本批 D16/D10/D11/D14）。可与 **`2c7a925`（tests-only D6/D7 补强，已验 183 passed、红-绿可证）合并同一提交窗口/一并集成**，C 一次核、一次跑全量差量（采 CP-P-T1T2 追加节的 C 独立全仓法）。
- `2c7a925` 与 P-T3/P-T4 集成前，候选维持 `4917f56`。

## 3. 验收门（CHECKPOINT）
逐路径 diff（仅 §1）+ 真跑 pytest：四受影响插件全套 + **根 `tests/` 全量 baseline↔candidate 0 新增失败**（clean-clone 证 21 既有集）+ 红-绿可证 + 反例（D16 真因、D10 幂等不放宽、D14 无回声、`_consumed` 重放仍拒）。Sol：H/P 未动；P 累计 **0** 使用（直批 fake 可验）。
