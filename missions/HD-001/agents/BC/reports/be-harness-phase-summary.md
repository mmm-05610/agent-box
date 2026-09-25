# BE-HARNESS Phase 督导复盘（pi＋codex 两批，BC 侧，2026-09-23）

> 用途：后续 harness 批（如 opencode/hermes 族或 R2 线）督导开工前的复用底账。权威细节以各批 checklist（`pi-batch-integration-checklist.md`／`codex-batch-integration-checklist.md`）与中央消息为准，本件只沉淀可迁移模式。

## 1. 两批终态

| 批 | HEAD | root 门 | 状态 |
|---|---|---|---|
| B-HARNESS-PI-001 | 67049283 | 20F/1465P/33S 逐字节 PASS（log `86f7de25…`） | VERIFIED（HD-001-C-017/C-0043） |
| B-HARNESS-CODEX-001 | 60d868ef | 20F/1465P/33S/183.36s 逐字节 PASS（log `5110c14c…`） | VERIFIED_AWAITING→候 C 登记（C-0044/BC-0022） |

## 2. 可迁移督导模式（两批验证有效）

1. **批前哈希基线**：批文签发即登记全批准文件 sha256＋禁触面文件（门文件）哈希；HANDOFF 核账＝批前恒等＋批后等值表双查。
2. **先验要点前授**：上一批全部踩坑（REST snake_case、禁 `sessions.createAndSend`、CLI 旗标名实不符、`/runtime` 命名空间≠宿主路径、data/ 勿预建、端口禁段）在批文落地当轮以 BC→H 消息前授，本批 H 全部吸收＝零预警成本。
3. **子集复算超集法**：不追执行者选面原文，以 glob 超集复算＋基线树同形对照，把"申报数不可复现"降级为措辞差核验（本批 127≠"6 文件"即此法核清）。
4. **外部 bundle provenance 三件套**：路径＋sha256＋与源树 cmp 证据；门报告自证回声为最佳形（c12 bundle 两批复用同一枚 `9d8df86d…7088`）。
5. **root 门纪律**：仅经 C 槽批准行使（pi＝C-0040、codex＝C-0044）；配方逐字入 RECEIPT；配对＝FAILED-ID 排序归一 diff 空集；用毕即释放不自占。
6. **环境注**：本机权威解释器＝`worktrees/integration-linux/backend/.venv/bin/python`（3.12.14/pytest 9.1.1）跨树复用＋`agent_box.__file__` 归因双检；默认 prepend 导入模式，勿 `--import-mode=importlib`。

## 3. 家族缺陷档案（本 Phase 发现并修复）

- `pi/production.py` 与 `codex/production.py` CLI 同型缺陷：argparse 注册 `--artifact-source` 而 `main()` 消费 `options.artifact_token`＝必崩 AttributeError 先于写出（dsh 先例形）。两批各修两行。
- 文档漂移：`harnesses.toml` 头注与 `harness-capability-matrix.md` 残留行均含"无生产封装"过期断言——后续批若涉他族，先 grep 同类断言行入 (a) 靶单。
- 已知环境红底账＝20F 名册（`root-red-ids-92a2d2ba.md`，归一名册文件 `/tmp/hd001-rootgate-bc/roster-sorted.txt`，其双份归档在 evidence/）；批后任何名册变动＝越界信号。

## 4. 未结线（候 C，非 BC 动作）

- R2/luna 真实轮：pi＋codex 各候 grant（G5 显式模型条款；H-0009 界形"每 run ≤2 请求"＋seam-facts 在册）。
- FE-PREP-001 线归 FC/F 系（BC 仅 cc）；Phase 2 提案坐标按 C-0042 A3。
