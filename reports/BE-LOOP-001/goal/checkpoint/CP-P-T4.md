# CP-P-T4 — 释放/清理回执 §2 对齐 + D16 真因保全（C 已核，集成候选 `24f4679`）

更新：2026-09-22 19:56Z（C）。批准 `approvals/P-T4-shape-alignment-d16-fix.md` + 并入 `C-notice-P-T3-accepted-P-T4-rulings.md`。交付 `2fa8b5a`（父 `3b67e96`）。真实核验，未用 Sol。

## C 独立核验
- **范围**：9 文件全落批准逐路径（tmux=D16+注释、direct_stdio=D11+D14 observe、git provider=D10、bwrap provider=D14 `_receipt_digest`、4 新钉 + `test_git_vertical:108`）；`src/agent_box/**`/protocol/sandbox_port/work_core/公共出口 **零触碰**；**未碰 runtime-local**（`_consumed` 结构上不受影响，且未动）。
- **既有测试改动亲核（P-T1 口径）**：`test_git_vertical.py:108` `assert cleanup("../outside") is None` → `== {"status":"already_cleaned"}`。亲读：**行为同（no-op 不抛）、断言更强（点名 no-op）**、containment 由同测其它断言守、非弱化。✓
- **测试（C 亲跑候选 `24f4679`）**：四受影响插件全套 **212 passed/0**（既有 192 + 新钉 20）；根 `tests/` **21F/1377P/33skip/1xfail、FAILED-ID 与 baseline `b067c571` 逐字节同 → 0 新增失败**。P 自报红-非-修（对 `3b67e96` 影子 15红/5绿，5 绿皆刻意两侧护栏）与方法（P 主动披露其首跑 awk/sed 提取写错、已重跑坐实）认可。
- 四修复语义（D16 补偿全 best-effort 不掩真因+删误导注释；D10 清理族固定词、幂等不放宽护栏、捕获面收窄 `(SubprocessError,OSError)`；D11 direct-stdio `managed:True`；D14 显示层折摘要、查表/租约键留原值故敌意串仍 miss→already_cleaned、direct-stdio observe 停回声）——读码与 §2/批准一致。

## 验收 & 后续
- **P-T4 验收通过、入候选 `24f4679`**（免 Sol）。
- **D17** 本批未动、遵裁 provider 层不自修 → 契约层待裁（execution_id/scope 字符集与归一冲突，若涉公开标识符格式则 IFR/交 I）。
- P 下一线：D4/D5→IFR-01（挂 I）、P-7/P-1 动词公共区→E 单写者、P-6 ssh→C 排期。均非现即可批。P 暂无其它已批可写产品增量，待派。Sol 0（P 未用）。
