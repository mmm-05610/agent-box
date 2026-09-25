# 裁定 — INC1a 残余「pre-port cancel → 永久 UNKNOWN 回执 → run 不可取消」泄漏：批修复 (i)，随 S-block1 合流批前置

来源：E-017 FAULT_DISCLOSURE（研究钉 `test_e_inc1a_residual_fault_pins.py` sha `3f98a83f…`）。**C 独立复现属实**（对集成候选 `ac28ad5` 亲跑：characterization 绿 / `test_desired_invariant_post_start_cancel_still_reaches_the_port` **strict-xfail 红**：`run leaked: post-start cancel never dispatched / assert 0 == 1`）。真实证据，非自报。

## 故障（bf21839 旁邻未关之窗，非回归）
`submit` 锁内认领 `port=None` 占位（`sidecar_backend.py:832-836`），锁外建 port（至 :868）。此 pre-port 窗内 `cancel_execution`：`:747` 命中占位 → `:761 target.port.cancel` 对 `None` 抛 `AttributeError` → `:762` except（本为超时/丢应答设计）折 `UNKNOWN` → `:774-775` **持 `cancel_lock` 期内永久登记该回执**，尽管从未下发 → 事后所有 cancel 命中 `:748` replay 支 → `port.cancel` 永不触达 → **run 泄漏至自然结束、不可取消**。
- **契约违背**：C-EXEC@v1「receipts guard *dispatches* / replay never re-dispatches」——此处回执守卫的是**一次不存在的下发**，把临时 `UNKNOWN`（当时不知）固化成终局判决、哑化事后可达取消。
- **与已修两窗关系**：bf21839 关的是「同窗二次 START」与「cancel 出锁重派发」（仍在绿）；这是**第三个**interleaving（cancel × submit 的 pre-port 半程），acceptance（含我 round-1/2 红-绿）未覆盖。

## 裁定：批 **修复 (i)**（E 荐·最小充分），作 **S-block1 合流批的 cancel 腿前置项**
- **(i)**：`cancel_execution` 见 `target.port is None`（或下发前异常源于「端口尚不存在」）→ **答 `UNKNOWN` 但不落账**（不 `_cancel_receipts[key]=…`）；事后 start 完成后 cancel 可达活端口。与「replay never re-dispatches」不冲突：无实际下发即无可重放、窗内重复 cancel 各答 UNKNOWN 幂等且诚实。
- **采 (i) 拒 (iii) 靠调用序不可达**：不依赖「S 只在拿到 receipt 后才 cancel」的脆弱前提（端口是公开契约、observe/重放皆可及；不可取消的 run 是资源/正确性危害）。
- **(ii)** 为次选（open 成功后作废 pre-port 回执），(i) 更简、无需定义作废×并发交错，故采 (i)。
- **不撤 INC1a**：其契约/三态/两窗修复/in-tree 钉 49 全绿，且 `cancel_execution` 现**尚未被 S 消费** → 候选实跑路径不含此泄漏；修复须在 S 接线**之前或同批**落。

## 落地与验收（并入 S-block1 合流批之 E 腿）
- E 腿 = **P5（R1 常量 `:1202`）+ P6-E（`test_e_inc0_block1_pins` 参数表反转）+ 新增 P8 = 本 cancel 泄漏修复 (i)**（同文件不同腿：R1 在常量区 :1202、本修在 cancel 腿 :739-776，不重叠）。
- **强制交错钉**（barrier 模板现成，`test_e_inc1a_matrix_pins.py` 两枚先例）：把 `test_desired_invariant_post_start_cancel_still_reaches_the_port` 从 strict-xfail **转绿**（窗内 racer cancel 后、事后 cancel 必达 `port.cancel_calls==1`）；characterization 钉随之更新为「不落账」新行为。**红→绿可证**（回打→该不变式再红）。
- 承载：可并 INC1b b-1/b-4 窗，或随 S-block1 同批；**C 判 S-block1 将消费该端口 ⇒ 前置必做**。若 E 修复精细、C 亲跑红-绿 + 全量差量可自证（本窄修不必然第 5 次 Sol；若 C 读码存疑再用余留的 impl-accept 预留）。
- **入 rubric**：并发验收第三枚必查交错 = **cancel × submit 的 pre-port 半窗**（除「双 START」「replay 重派发」外）；并重申「验收非终态，post-acceptance fault-attack 仍要续攻」——E 此披即证。
