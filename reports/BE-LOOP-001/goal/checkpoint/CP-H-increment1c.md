# CP-H-increment1c — H OpenCode SSE 帧可见性/收敛(X17①④⑦)（已验收入候选 `2bbf7bf`）

> **⚠ 21:12Z 记录更正（C 自纠）**：本 checkpoint 原把 **X18(b)（被拒 abort 审计诚实）** 记为 1c 落地项。C 亲验 `2bbf7bf` diff（`ac28ad5..2bbf7bf`）：`abort()`(:573-582) **未动**、`abort-failed` **不在树**——1c 两 commit（`ba6ac21`+`61c1c5f`）实为 **SSE 帧修复**（driver-native.mjs +90/−23）+ `opencode_stream_framing.test.mjs`，即 X17 全集，**不含 X18(b)**。X18(b)/Half-A 是 H 组内分支 `23945b5`，经 `decisions/X18-half-split-H-1d-b4-delegation.md` 裁**前向作 H 增量 1d**（非回填本 checkpoint、非违例，系 C 20:19Z 授权 vs 20:58Z 裁定自相矛盾所致）。**本候选对其实际所是（X17）全绿过门、正确性不受影响**（仅我的范围账写多了一项）。

更新：2026-09-22 20:42Z（C，21:12Z 更正范围账）。批准 `approvals/H-increment1c-sse-framing.md`。交付 H `ba6ac21`(driver-native.mjs SSE 帧)+`61c1c5f`(opencode_stream_framing.test.mjs 264 行钉)。真实核验，免 Sol（H 0/3）。

## C 独立核验
- **范围**：2 commit 仅 `deploy/opencode/driver-native.mjs`(+90/−23)+ 1 新 test（H 域、允许清单内、无新公开枚举/事件、不触 third_party/依赖、不挂 IFR-06）。commit message 自陈「no new tail.outcome values」=子集 (b) 兑现。
- **node --test（C 亲跑）**：H 树 **64 passed / 0 failed**（原 59 + 1c 新钉）。
- **非假绿反证（C 亲跑）**：把 `opencode_stream_framing.test.mjs` 投进一次性 pristine `f896fe8`（pre-1c）worktree → **3 fail / 2 pass**（3=修复闭合的 X17 帧面，2=刻意两侧皆绿的护栏/正向对照）→ 钉**证伪有效**。worktree 用后即删。
- **全量回归**：合 `2bbf7bf` 根 `tests/` = **21F/1377P/33skip/1xfail、FAILED 与 baseline `b067c571` 逐字节同 → 0 新增失败**。

## 判定
- **增量1c 验收通过、入候选 `2bbf7bf`**（免 Sol）：**X17①(done 冲刷 SSE buffer)/④(pump 错误不吞不无界清)/⑦(残帧不跨轮) 落地**。（X18(b) 经 21:12Z 更正移入 H 增量 1d，见文首。）
- **X18(a)**（abort 返回契约/停止三态判别，需新 tail 出口）**仍归增量2** + S/E（C-EXEC 委派停止、M-1）；登记为 C-HARNESS/C-EXEC 增量2 需求，本批未做=遵裁。
- H 分级诚实（不主张上游真发、正向对照防探针坏）续认。

## H 下一线
- 增量2（迁 SDK/帧层、license/再分发、公开 message.final、X17②⑥+X18(a) 归因判别）→ **挂 IFR-06 等 I**，未决不动。
- 增量3 → 等 D5/P 的 `C-RES` 执行面 + E 的 `C-EXEC` 委派停止语义。
- 可续（非审批）：把 SSE/ACP 两腿基线不变量清单并列入地图5增量2（H-009 在做）。Sol 0/3 不变。
