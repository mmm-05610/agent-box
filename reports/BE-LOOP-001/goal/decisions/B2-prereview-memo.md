# B2 联审预研备忘（S+E 两半先行；H 半页定位改判评估中）

C · 2026-09-22 03:45Z · 输入＝`S-b2-fields-half.md`（`4d00e735…`）＋`E-B2-section1-execution-side-v1.md`（＋03:29 联审注记）· H 半页因 H 疑似停滞悬置（`OPS-H-session-idle.md`）
**定位改判评估**：S/E 两半的映射段各自已锚既有权威词表（S：C-HARNESS 官方 5 值透传＋R1 干净集；E：恒等映射＋EvidenceClass 分层）——**H 半页的增量价值收窄为"native 侧印证与 X18 形状补漏"，非联裁前置**。若成立，B2 批文可先出、H 醒来后以加性更正并入（不堵 INC2 线）。

## 联裁点清单（批文须逐一钉死的形状问题）
1. **值名拼写归一（命名轮）**：S F1 `stopEvidence ∈ {refused_no_active_run, stop_unconfirmed, capability_unavailable}` vs 端口 `CancelOutcome {confirmed_stopped, refused_no_active_run, unknown}` vs S F2 `cancelResult ∈ {stopped, refused_no_active_run, unconfirmed}`——三处三形。预裁：**公开面取 S 案（stopEvidence/cancelResult 两键），值名统一为 `confirmed_stopped|refused_no_active_run|unknown`（与端口/`<Fact>Outcome` 骨架同拼写，消灭 stop_unconfirmed/unconfirmed 双形）；`capability_unavailable` 保留为 F1 第四值（端口无此态、系 S 受理面特有——映射表须显式标注该单侧扩展）**。E 已言"F1/F2 值名随命名轮统一"，无冲突。
2. **F3 两步成对硬序**：E 立场未回（03:29 注记，行级 `{end_turn,""}→无因` 归一是否改原样落）。预裁形状：**(1)E 半先行＝`_terminal_reason_from_result` 不再把报出的 `end_turn`/`""` 归一为 NULL（仅真 missing→NULL，不伪造纪律不破）；(2)S 半＝投影在终态且双缺时出 `reasonReported:false`**。若 E 申辩成功（EvidenceClass 已足），则 S 半降级为可选——**联裁真值取决于 E 回复，此点不可先裁**。
3. **正交布尔 vs 词表**：双方一致——不注入 `"not_reported"` 伪值、布尔键承载"未报"。直接采。
4. **版本与实施位**：E「一次批文一版本、随 `execution_contract@1` 加性演进」＋S「wire schema 版本递增随 INC2 一次批文定」——**同一批文须同时含：F1/F2/F3 wire 面＋K1/K2 内部锚面（a-3 已放）＋Port cancel 签名轮**，一个版本号钉死，防两轮改形（a-3 批文联动硬注已埋）。
5. **非目标重合检查**：S（不承诺逐字符/不搭 recovery_pending 便车/无闭集闸）⊂ E（不扩能力/不表无关事件）∩ D-0033 §1 原文——一致，无冲突。

## 结论
联裁点 1/3/5 可先裁入批文；2 候 E 一行立场；4 需与 INC2-A 合批节奏对表（E CHECKPOINT 即知）。**待 E-047 类立场或 INC2-A CHECKPOINT 到→出 `approvals/B2-fields-release.md`（含 H 加性位预留）。** 候 P ACK 期间完成，不占他线。
