# C-HARNESS@v1 — Harness/ACP 契约基线（C 发布）

发布：中央 C · 基线 b067c571 · 源：H `goal-H-001..004`（一手 measured，schema 工件入 `harness/work/spec/`）+ C 裁 D1/D7/X13 + 消费方 E（`E-D2` #2/#5）/S（R1/R2）。
**这是版本化契约基线（文档），不含公共出口代码改动**；`harness_remote` vendored 帧层→官方 SDK 属**权威迁移 + 复用边界/license → IFR-06（在 I）**，未决前不实施。

## 1. 协议事实权威（D7 分层）
- **契约基线 = 官方规范 tag `schema-v1.23.0`**（sha `3c17bd6385d90cf6…`；`SessionUpdate` 11 变体、`StopReason` 5 值）。
- **实现事实 = 所 pin SDK 随包 schema**（`@agentclientprotocol/sdk@1.5.0`，16 变体）——非基线。多出的 5 变体（plan_update/plan_removed/notice/compaction_update/compaction_summary_chunk）：成为**观测事实、不静默丢**，未处理记 `unhandled_session_update`；向上投影归 S/E。
- **门禁（增量4）**：SDK 版本 ↔ 规范 tag 的 **schema 差异对账**可复跑；覆盖面按 tag 7/11、按 SDK 7/16 两层计。
- **X13**：`overrides` 不得降低任何对端的**精确 pin**；若必须降→显式记为对上游偏差 + 配验证，不得靠锁静默发生（H 本轮不改锁）。

## 2. 三种角色（任务卡强制区分，勿混同）
- **系统 ACP Client**（AgentBox⇄各 Harness）：H 本职，唯一实施面。
- **适配器 ACP Agent 端点**（`codex-acp`/`claude-agent-acp`/`pi-acp`…）：**只作依赖使用**，pin 版本 + 离线重装，不 fork/不改源码。
- **额外对外 ACP 网关**：**不做**；若要「把后端暴露为 ACP Agent」→ **I 决策**。

## 3. stopReason / 截断可见（D-0011）
- 值集以**当前官方规范 = 5 值含 `cancelled`** 为准，**不用旧四值枚举**（GOAL-START）。
- **不新增/改名任何公开协议枚举值**（公开 Wire 冻结，改则→IFR-06/ I）。
- 「缺失 stopReason / 尾丢失」须成为**可分辨观测**（`stop_reason_not_reported`、`lateEvents`/`tail-mismatch` 可见）；「干净完成」不得与「未知/截断」混淆。X1/X3/X4 已 measured。

## 4. 复用（D-0010）——诚实边界
- vendored `harness-remote` v3.0.2（sha256 溯源 + 运行时哈希 + PATCHES）**是真复用**；但 ACP **帧层手写、官方 SDK import=0** → 帧层复用义务未足，**迁移官方 SDK = 增量2，受 IFR-06（I）门**。
- **pi-acp 负结果**：官方 registry 的 `pi-acp` ≠ `@automatalabs/pi-acp@0.5.0`（两无关发行物）；`hermes`/`dsh` 不在官方 registry → 「优先复用官方适配器」对这三家**无对象**，不据此硬造复用。

## 5. 能力/委托/边界
- **exposed ≠ executable**；未声明能力继续回 `-32601`（fail-closed）。能力矩阵四态：spec / declared / advertised / observed / exposed。
- **委托**：文件读/写、终端 → **P**（`C-RUNTIME@v1`，已发）；用户审批裁决 → **S**（H 只完整送达 + 原样回传）；传输/生命周期 → **E**。
- **bundle/视图内容布局**：内容归 **H**、挂载根归 **P**、E 只持不透明 `bundle_ref`（解 E Sol#1 #2 / IFR-04）。
- **离线**：禁运行时 `npx`；依赖走 lock + SBOM。

## 6. 增量与门
- **增量1（D-0011 截断可见性）**：✅ 已验收（增量1/1b/1c 入 `ac28ad5`/`2bbf7bf`；⚠ 1c 实为 X17、X18(b) 经半拆入 1d）；fake 可验、不花 Sol。
- **增量1d（Half-A abort 审计诚实 + X19 订阅者归因）**：✅ 已验收入 `c309395`（免 Sol、零对外面；`CP-H-increment1d.md`）。
- **增量2（迁官方 SDK + X18 Half-B「非2xx必抛」+ ④ 可见化 + license/wire）**：⏸ **IFR-06（复用边界/license）待 I**；落地实施验收 H 可请 1 次 Sol。
- **增量3（clientCapabilities fs/terminal）**：依赖 `C-RUNTIME@v1`（已发）→ 可续。
- **增量4（pin 升级 + schema 对账门 + X13）**：验收含对账表 + 不降精确 pin。
- 公共出口（entry-points/`__init__`/`capability_declarations`/`wire/**`）不动；改动走契约发布 + C 指定单写者。
