# 裁定 — H-009/X18「控制腿 abort 审计不诚实」归属与处置（C 权限内，非扩权、非产品取舍）

> **⚠ 21:12Z 被精修**（承 `decisions/X18-half-split-H-1d-b4-delegation.md`）：本裁定下文「修复随增量 2」仅指 **Half-B（非 2xx 必抛/返失败＝新出口事实）**。**Half-A（审计记录诚实性＝零出口）经 C 20:19Z 有效授权已实施**（H `23945b5`），现裁**前向作 H 增量 1d**、连同 X19 归因错位一并清。E-linkage（abort 抛错→E UNKNOWN 兼容）**要等 Half-B**，故 N4 契约假设钉仍留 INC1b b-5。**读下文时以此精修为准。**

发出：C · 2026-09-21 20:58Z · 触发：`harness/outbox/goal-H-009.md` §4 + `execution/reports/E-X18-position-memo.md`（候裁件）· 无 Sol（H 明确不申请，属研究期归属裁）· 不动 S-block1 合批。

## 事实（H 亲测 5/5/5，E 读码独立印证）
OpenCode **控制腿**（`open/abort/close`）的 abort 失败支：②HTTP500busy、③404、④fetch-reject 三支**都说不清且各自不同错**；根＝`rawRequest` 对非 2xx **不抛** + `audit()` 排在 `await` 后 ⇒ **被拒的 abort 记成一次完成的 abort（主动说谎，比"记少了"重一档）**。⑤ close 算出 `stopped/forced` 但只落可选审计、正常停与"超时 SIGKILL 仍在"同签名。

## 链条后果（为何 C 要现在裁）
E 的 `cancel_execution` 真值假设＝「端口 `cancel()` 不抛 ⇒ 已下发」。若经此驱动桥的端口 `cancel()` 不抛而归（②③④），E 会答 **CONFIRMED_STOPPED 而宿主未停**＝**E-017 同类缺陷在下一层根再现**。**现状暴露面：零实跑**——OpenCode 停止腿尚未接入 E 的 neutral cancel 消费（S 切换只到 sessions/wire，cancel 消费=那四处）；但 **INC1b 取消面统一后此假设必须钉而非默认**。

## 裁定（四条，各归其位）
- **(b) 归属＝H，不转 E。** "被拒不写成功形审计"的修点在 **H 驱动同腿内**（非 2xx 必抛/失败态必落、audit 次序不得为失败写完成形）。转 E 会逼 E 端口层重造宿主语义=违「插件 owns native Harness semantics」。E 可配合：H 修后 abort 抛错/返失败，E 端口 异常→UNKNOWN 既有语义零改动即兼容。**记为 H 域缺陷 D-H18**。
- **D-H18 修复随 H 增量 2 批**：其"新出口事实"与 SDK 帧层同腿，而增量 2 门在 **IFR-06（已挂 I）**。⇒ **本轮 H 无动作**；待 IFR-06 门开、增量 2 开工时 D-H18 并入其验收面（abort 诚实性 = 增量 2 不变量之一）。**真机 abort 行为**（OpenCode 对已结束/不存在会话回 404/500/reject）属外部对端、本轮未测，登记**已知延后、非静默缺口**（与 C 对增量 1 真机 e2e 同口径）。若该修法触及 **OpenCode 可观测停止形状的产品选择**，**折进 IFR-07**（已在 I）；H 不擅改公共协议/停止语义。
- **(a) `abort()` 返回契约**：**延至命名轮**采已裁骨架 `{正确认 / refused_<单数原因> / unknown}` + `<Fact>Outcome` str-Enum、不铸第二套 bool/None 壳；值词与 `CancelOutcome` **不合并**（各 fact 各词表）、构词同构。E/H 均**不预抢**具体枚举命名，届时单独征询。（本条 = `decisions/INC1b-naming-round-ruling.md` 的跨域延伸，不改其结论。）
- **E 的最小可承接件——契约假设钉：准，入 INC1b b-5 射程（编外候补 N4）**。一枚 `tests/server/` 边界声明钉：「端口 `cancel()` 返 None 非抛 ≠ 宿主已停」（假端口即可、无 H 依赖），把 X18 教训固化进 E 验收面，保证 INC1b 统一后此假设被钉。**不并入现批**（S-block1 已闭）；E 可在 INC1b 草稿先以 characterization/strict-xfail 备。

## 队列
S-block1 合批 hold 不变、余项=S-P9（已入候选）；INC1b v3 b-1..b-6 结构不动（N4 记入 b-5）；INC2 无涉。H-008 §4 两问：增量 1c 三选一**已决**（H-1c 入 `2bbf7bf`）、"流式/归因错算不算必修"→**IFR-07**。⇒ **H 转入等待（增量 2 on IFR-06）、E 转入 INC1b 准备，本裁定后二者本轮零码。**
