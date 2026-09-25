# RELEASE — S-block1 触发器达成（INC1a 已验收入候选 `a86ca66`）→ 放行 S 提四处切换 + R1 逐路径申请

批准者：中央 C（19:47Z）。真实放行，绑定：INC1a 验收 `checkpoint/CP-E-INC1a.md`、候选 `a86ca66`、契约 `C-EXEC@v1(block1)`。非 fake。

## 触发器满足
E-INC1a 三提交（`d35b5d6`+`bf21839`+`400577a`）经 C 可执行红-绿复现 + round-2 Sol 码正确确认 + S 独立三核 + 自洽全量 `tests/` 0 新增失败（含 ~50 in-tree 钉绿）→ **验收通过、入候选 `a86ca66`**。合流序 `1a→Sblk1→1b→1c` 的 1a 环已闭。

## 放行 S 做（仍逐路径批，不越界）
S 可**提交 block1 四处切换 + R1 随批的逐路径申请**（对候选 `a86ca66`）：
1. 四处消费端切换到三态端口 `submit/cancel_execution/observe_execution`（`S-block1-switch-draft.md` W1/W2/S1/S2）。
2. **R1**：`sidecar_backend.py` 干净集 `{end_turn,""}`（去自造 `stop`/`complete`），随同批（`R1-stopreason-batch-draft.md` 定稿）。
3. 命名轮：S 夹具占位 `cancel_outcome(execution_id)->str` → `cancel_execution(execution_key)->CancelOutcome`（自 `agent_box.server.execution` re-export）。
4. **两侧同步反转**（Q1）：S 树夹具 S 改；E 树 `tests/server/test_e_inc0_block1_pins.py` 参数表由 **E 改**（单写者=树归属者）——**S 不碰 E 树**；C 在同批批准两侧、避免单边弱化。

## ⚠ 重锚要求（关键）
S 的 `t15 §1.3` 锚点（`_CLEAN_STOP_REASONS :1020→:1184`、消费者 `:578→:616` 等）是对 **`d35b5d6`-only（`ee39270`）** 算的；**`bf21839` 又给 `sidecar_backend.py` 改了 +46/−28** → 这些行号在最终候选 `a86ca66` 上**再度漂移**。S 提逐路径申请前须**对 `a86ca66` 重新定位 `sidecar_backend.py` 锚**（其余 server 文件 INC1a 未动，锚仍稳）。E 已把 `sidecar_backend.py` 终态 sha 记 `00b551a8…`（E-011 §4），S 以现树为准重算行号即可。

## 边界（不变）
仅 S 域 server 文件 + `server/tests` 夹具；**不碰 `src/agent_box/server/execution/{sidecar_backend,execution_contract,__init__,sidecar}.py`（INC1a/E 域，单写者 E）**、不碰公共 Wire/work_core、不 push。切换判据：INC1a 已集成验证（达）→ 可切。批文到手 C 逐路径批 + 真跑差量 → 集成 → INC1b（含 O-B3-1 单生产者冻结，跨 S/E）。Sol：S 未用（fake 可验直批）。
