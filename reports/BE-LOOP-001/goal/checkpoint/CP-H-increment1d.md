# CP-H-1d — H 增量 1d（Half-A abort 审计诚实 + X19 订阅者归因）验收

> **✅ 验收通过（22:09Z）：入候选 `67e5c52`**（`f97e96f` ⊕ H `23945b5`+`caff4b0`+`1c7c76c`）。**免 Sol**（研究/审计面、零对外出口、C 逐件亲验红-绿）。承 `decisions/X18-half-split-H-1d-b4-delegation.md` + `H-1d-X19-attribution-fix-approach.md`。

## 内容
- **Half-A（`23945b5`）**：`abort()` 首读 `rawRequest` 返回值，2xx→`{event:"abort"}`／非2xx→`{event:"abort-failed",sessionId,status}`（判据复用 `expectJson`）；被拒 abort 不再记成完成。C 21:30 预核＝零对外面（abort 仍返 undefined、向上零事件、仅可选审计）。
- **X19（`caff4b0`+`1c7c76c` 钉）**：按 C「按来源分流」裁——`emit` **单独 try 包**（非移出外层 try），订阅者抛错→`{event:"subscriber-error",message:redact(...)}`，`stream-pump-failed` 此后仅真·泵故障触发；252 行 `opencode_subscriber_attribution.test.mjs`。
- **未做（遵裁）**：X18 ④（fetch-reject 无痕）与 Half-B「非2xx必抛」＝新出口事实 ⇒ 随增量 2/IFR-06；E-linkage 未成立 ⇒ N4 仍 characterization（INC1b b-5）。

## C 独立门（ENV-NOTICE-001 权威口径）
- **根 `tests/` 旁证**：候选 `67e5c52` 21F/1388P/1xf，FAILED-ID 集与 baseline `b067c571` 逐字节同 → **0 新增**（H-1d 纯 JS、root python 零触）。
- **`node --test`（C 亲跑候选）**：`plugins/agent-box-harnesses/tests/*.test.mjs` **35 pass / 0 fail**（含新 subscriber-attribution + control-leg audit + SSE framing）；H 自报 pristine 红侧：②③⑤红/①④⑥绿（X19 归因边界钉双向可证）。
- **读 diff 核**：driver-native.mjs emit-try + pump.catch 注释一致、audit-only 键（`abort-failed`/`subscriber-error`/`stream-pump-failed` 全在可选 `AGENTBOX_DRIVER_AUDIT`）、**无新公开事件/枚举/出口**；范围＝driver.mjs + 1 test，白名单内。

## 后续
增量 2（迁 SDK/帧层、X18 Half-B abort 抛错/返失败、④ 可见化、X17②⑥归因）→ **挂 IFR-06 交 I**；增量 3 → D5/IFR-01；增量 4 → X13/对账门。H 累计 Sol 0/3、未 push。
