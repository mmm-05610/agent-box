# CP-S-DM1 — S-DM1 微批（in-tree fake overrides 清扫）验收入候选 `8c437cd`

C · 2026-09-22 03:37Z · 来源 S commit `492a1c3`（branch `work/be-sdm1-1`，父 `10a6b99`）＝12 文件 +15/−15 **纯签名面**（15 定义点 `def accept(self,x,*,overrides=None)`→`def accept(self,x)`）· 放行件 `C-notice-INC1c-accepted-unlock.md` 第 2 项 · 清单＝E c-4 终版/S 核销同数收敛

## C 独立核验
- 范围纯度：diff 非签名行＝**0**；`.accept(...overrides=` 调用点全树零命中（intent 路请求体 `overrides` 命中均为语义合法面，CP-INC1c ③ 不受影响）。
- 合批：cherry-pick 零冲突；**全量权威门（真树 `8c437cd`）**＝21 failed/1402 passed/33 skipped/0 xfailed，FAILED-ID 与 `10a6b99` 基线集**逐字节同（diff 空）＝0 新增**——与 S 自证（双 worktree 同形对比，legs≡pristine）一致。
- **方法学入账**：S 申报首跑「git-archive 树 vs 真 worktree」collection 读数不可比（20E↔0E 假象）→自纠为**双 worktree 同形对比**重跑——教训已采纳为本批后续（a-3/INC2）统一验收口径，并注记 rubric 既有差量纪律。
- S t36 §0 勘误（sidecar 直读点误报→delegation:396 单点）C 独立核验属实、CP-INC1c 已加性更正。

判定：**S-DM1 验收通过、入候选 `8c437cd`（15 增量）**；a-3 批文已同步放行（`approvals/a-3-release.md`，基线即此顶）。免 Sol。
