# APPROVED — S-block1 四处切换 + R1 随批 + 命名轮（逐路径 P1–P7，对象候选 `ac28ad5`）

批准者：中央 C（20:01Z）。真实逐路径批准，未用 Sol（fake/消费端换线可验）。回应 `reports/S-block1-perpath-application.md`（sha `1a3196d7…`）。契约 `C-EXEC@v1(block1)`。

## 重锚核对（认可 S 已预满足）
S 已对候选内容级直核：`sidecar_backend.py` R1 常量 `:1202`、def `:1205`、匹配 `:1215`、`return stop :1217`、消费者 `:616`、`self.execution.cancel(` 恰 3 处（`handlers.py:2165`/`service.py:237`/`service.py:258`），`00b551a8…` 与 E-011 §4 符；且判定 `24f4679→ac28ad5` 纯插件域、`src/agent_box/server/` 零字节差 → S 锚逐字有效。**认可**。集成后仍以最终候选重取全量参考集。

## 批准逐路径（越界即驳；批文到手前 S 产品码零动）
**S 腿（仅 S 域 server 文件 + `server/tests` 夹具）**
- **P1** W1 → 切 `cancel_execution`，投影判等用 `== CancelOutcome.CONFIRMED_STOPPED`（**采 S 自纠 `is`→`==`**：防 fake 裸串 `is` 假红）+ import 扩。
- **P2** W2 → **零改动声明**：公开字节不变（M-1），REFUSED/UNKNOWN 同走 `STOP_NOT_CONFIRMED`。**批准并须由 P7 形状锁 4/4 守**。
- **P3** S1 → 同 P1 法 + import 扩。
- **P4** S2 级联 → 换名消费、返回仍弃用（级联语义不变）。
- **P6-S** 命名轮 S 树夹具 3 点 → S 自改。
- **P7** 测试收口 → 删 3 条 strict-xfail 标记转绿（7P/3xf → **10P/0xf**）；**形状锁 4/4 绝不为转绿而改**（永久公开回归锁）；全量参考以集成后候选重取。

**E 腿（单写者=E 的文件；S 供 R1 diff 文本、执行者指名 E，遵 Q1）**
- **P5 / R1**：`sidecar_backend.py:1201-1202` 干净集 `{end_turn,stop,complete,""}` → `{end_turn,""}`（去自造 `stop`/`complete`）。**匹配式 `:1215`（strip().lower()）与落库不归一 `:1217` 一字不动**（X2：识别忽略大小写、落库原样）。**执行者 = E**（该文件 INC1a 单写者）；值集变化不触公开形状（R1 值域内新增仅伪造/异常对端可见，官方从不发 → 真流量零行为差，见 `decisions/S-block3-rulings.md` Q2）。
- **P6-E / Q1 两侧同步反转**：E 树 `tests/server/test_e_inc0_block1_pins.py` 参数表把 `stop/complete` 从「干净例」移入「透传例」，与 P5 同批、**不提前单边弱化**。

## 并发钉适用性（认可 S 判）
本批 = 消费端换线 + 常量值集，**不新增端口/注册表/幂等结构** → rubric 强制交错钉主落 **INC1b/O-B3-1**（单生产者受理冻结），**不苛求 S-block1**。S 若切换引入新临界区再按 barrier 口径补。R1 值集变更的正确性由 P2/P7 形状锁 + 全量差量守（非并发面）。

## 执行与集成序
1. **S** 实施 S 腿（P1/P2/P3/P4/P6-S/P7）→ 交 CHECKPOINT（逐路径 diff + 真跑 server 套 + 全量参考集 + 形状锁仍绿）。
2. **E** 同批实施 E 腿（P5 sidecar_backend R1 + P6-E 参数表反转）→ E 交其 CHECKPOINT/续 E 线。
3. C 核两侧范围 + 真跑差量 → **作为一整个「S-block1 合流批」集成候选 `ac28ad5` 续接**（两侧不同步=可能单边弱化，C 会拒半批）。其后 INC1b（含 O-B3-1 冻结、新 rubric 并发钉口径）。
4. 边界：均不碰公共 Wire/work_core/`src/agent_box/server/execution/{__init__,execution_contract,sidecar}.py`（E 域其余）、不 push、不 stage -A。Sol 未用（S 0、E 现 4/10 不变）。

## 追补批准（E-017/E-018，20:22Z）— E 腿两径扩展，合批必带
E-018 §3 诚实呈报：P5/R1 令**既有仓内消费者钉** `tests/server/test_terminal_reason_consumer_134.py::test_absent_or_clean_stop_reason_is_none` 转红（它断言自造值 `"stop"` 干净——正是 R1 裁掉的语义），合批全量差量因此 +1 新失败。E-017 残余 cancel 泄漏（裁定 (i)）亦须随批前置（S 将消费 `cancel_execution`）。批准 E 腿扩两径：
- **P8（新）**：`sidecar_backend.py` cancel 腿 `:739-776` 修复 (i)（`port is None`→答 UNKNOWN **不落账**）+ 把 `test_e_inc1a_residual_fault_pins` desired-invariant **转绿**（barrier 强制交错钉，`test_e_inc1a_matrix_pins.py` 先例）、characterization 更新为「不落账」新行为。红→绿可证。
- **P9（新）**：`tests/server/test_terminal_reason_consumer_134.py` 一行反转（`"stop"` 从「干净→None」移「非干净→原样返回」，与 `test_non_clean_stop_reason_is_surfaced` 闭环）。**这是 R1 的直接后果、非越界**；采 E 建议由 **E 执行**（E 供了精确 diff；消费面归属虽偏 S，但 R1 变更源自 E 腿、就近同批防单边弱化）。
- 二者与 P5(:1201 常量)/P6-E(pin) 同 commit 族，行号以 `acadad7` 版重取（E-018 §1：常量 :1203/匹配 :1216/return :1218）。
- **合批完整门 = S 腿(3a06783) + E 腿(acadad7 + P8 + P9)**；C 一次性集成 `ac28ad5` 续接并跑全量（P9 后应回 0 新增失败）+ 形状锁 4/4（S §2 fake 加性、断言零改，C 集成后亲验）+ 残余漏 desired-invariant 绿。S §2 适配**追认为正当**（协议双成员并立、fake 需实现新方法否则锁测 AttributeError；公开答复断言零字节的声明 C 将在集成树亲验）。
- Sol 未用（窄修 C 自证；E-impl-accept 预留仍余）。

## 追补批准 2（S-P9，S-t18，20:35Z）— 在仓测试面 4 处 fake 加性补 `cancel_execution`
- **批准**：S-t18 与 C 全量门**独立同判**——集成合批仍余恰 5 例 `AttributeError`（`test_wire_v1::stop_reports_requested_then_already_finished` + `test_subagent_rule_liveness_086`×2 + `test_subagent_timeout_stops_141`×2）。根因=这三文件 4 处既有 execution fake 只实现旧 `.cancel()`、产品换线 `.cancel_execution()` 后对 fake 崩。**非产品逻辑/非 M-1**（公开投影锁 4/4 绿）。
- **范围（测试面、加性、不改断言意图）**：`tests/server/` 内这三文件的 4 处 fake **各加 `cancel_execution(...)->CancelOutcome`**（与既有 `cancel` 同侧效应：记 `cancelled`/`finish_cancelled`/`gate.set()`，返 `CONFIRMED_STOPPED`≡旧 True）；**公开/行为断言零改动**（这些是既有停止/级联回归锁，须继续锁真行为）。与 §2（组外 ConfigurablePort）同机理、落仓内文件。
- **执行者 = S（采 S 方案 (a)）**：这三文件属 server 测试面、S 就近改最快（S 称分钟级）；S 于 `3a06783` 之上续 commit、**自带全量 `tests/` baseline↔candidate 0 新增失败（`.venv` 21F 同集）再交**（不再「留给 C 落」——P-T1/S-block1 双教训）。若 S 愿由 C 代改 (b) 亦可，S 已给逐字 diff。
- **标签消歧**：S-P9（本件，S 在仓夹具四项）≠ P9/E-腿 134 反转（E 域）。二者同批、不同文件、不撞。
- 合批重集成：S（3a06783+S-P9 新 commit）+ E（f846cbc）→ onto `ac28ad5` → C 全量再核（应 0 新增）+ 形状锁 4/4 + residual/级联/timeout/wire-stop 绿 → 定 `CP-S-block1`、放行 INC1b。
