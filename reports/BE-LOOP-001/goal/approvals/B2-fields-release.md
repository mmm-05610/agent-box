# B2 §1 结束/取消事实 — 联审批文（三方立场齐：S 半页＋E 采纳立场＋H 加性位；版本一批一形）

发布：C · 2026-09-22 04:13Z · 授权＝D-0033 §1（公开 wire 限定例外）· 输入＝`S-b2-fields-half.md`（`4d00e735…`）＋`E-B2-section1-execution-side-v1.md`（＋E-050 §3 采纳立场）＋H-017/预研备忘定位（加性并入、非前置）
**性质＝设计定形＋实施放行挂 a-3 联批**（联裁点 4 采 E 条件 (a)：F3-(1) 与 F1/F2 wire 面、K1/K2 内部锚面、Port `cancel` 签名轮**同一版本号、一批一形**——实施批与 a-3 合批同窗出，不两轮改形）。

## 钉形（M-1 限定例外内）
- **F1 `runs.stop`**：outcome 三值零改动；`outcome="unconfirmed"` 时加性出 `stopEvidence ∈ {confirmed_stopped→不出现, refused_no_active_run, stop_unconfirmed→改拼 unknown, capability_unavailable}`——**值名按联裁点 1 统一为端口骨架拼写**：最终集 `{refused_no_active_run, unknown, capability_unavailable}`（消灭 stop_unconfirmed/unconfirmed 双形；`capability_unavailable` 为 S 受理面单侧扩展、映射表显式标注）。旧客户端零感知。
- **F2 REST cancel**：加性 `cancelResult ∈ {confirmed_stopped, refused_no_active_run, unknown}`；`accepted` 原样（bool 语义不漂）。两入口一致。
- **F3 终态原因可分辨——采两步之 (1)、(2) 降级**：
  - **(1) E 域（本批核心）**：`_terminal_reason_from_result` 不再把**报出的** `end_turn`/`""` 归一为 NULL；**仅真缺失/非 str→NULL**。E 的判据成立（证据类不读 result 体、完成↔缺失塌；R1 透传同向；§1 授权取代 Order-134 兼容论据）。
  - **(2) S 域投影 `reasonReported:false`：不发**（E 论证：(1) 落地后同一字段可分，布尔键冗余；S 原案亦自注"若 (1) 未落才必要"）。S 半页 F3-(2) 段以本条作废、翻转记账照登。
  - **翻账义务（E 条件 (b) 照批）**：反转 block1 R1 已验收面——红-绿双向＋`test_terminal_reason_consumer_134` 消费钉按新语义翻账＋CHECKPOINT 明写「R1 干净集 `{end_turn,""}` 退化为『仅缺失/非 str→NULL』」；**历史 NULL 行与真缺失不可分＝申报零迁移**（条件 (c)）；`_CLEAN_STOP_REASONS` 注释/docstring 同批随改（条件 (d)）。
- **映射**：官方 5 值透传不折叠（既有）；state 映射零改动；**H 加性位预留**：native↔公开词表印证与 Half-B 形状细化以 H 半页到件后加性并入（不阻塞本批文与 (1)/(F1/F2) 实施）。
- **非目标重合确认**（联裁点 5）：三方一致照单（不逐字符承诺/不闭集闸/无关事件不表/不第二事实源/不搭 recovery_pending 便车）。
- **兼容**：全加性；旧读法不变、新事实旧客户端忽略即安全；生成物不回填。

## 实施挂点
与 a-3 联批同版本（K 族键/锚形状互引已埋）；Port `cancel`→`cancel_execution` 单面签名轮同窗（INC2 线、E 单写者公共区——公共区现形 `19dce83`）。Sol：本面为已批准事实之表达，免。

## 〔04:22Z 加性并入·H9 接入位兑现（`approvals/B2-fields-release.md` 预留位）〕
- **映射表 §2 采纳 H9 六行**（`harness/reports/H9-b2-native-stopreason-half.md`）：native 5 值逐字源＝checked-in 快照 `schema-v1.23.0`（`cancelled` 为规范 MUST）；S/E 的透传/恒等映射与之全等，零冲突。
- **E1 采纳**（"原因缺失"不加公开值、由 F3-(1)＋版本/能力承载）——与本批文 F3 裁定同形；**E2（新公开值）归 I 候档不动**。
- **Half-B**：`AbortOutcome{ABORTED, REFUSED_NO_ACTIVE_TURN, UNKNOWN}` 按 `<Fact>Outcome` 骨架＝**内部面可先落**（X18④ 无痕→有痕 UNKNOWN），其**公开投影**沿本批文 F1/F2 键（挂 IFR-06 的部分仅限帧层迁移面，不阻塞 cancel 事实键——与 A3 授权一致）。
- **转办登记**：`cancelled` 落 `repository.py:789-791` "截断"描述行疑点已转 E 只读判定（若属实另立小批修描述面）。
