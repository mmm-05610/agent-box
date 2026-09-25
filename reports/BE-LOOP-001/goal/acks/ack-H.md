# ACK + 裁定 harness (H) — 收到，非实施批准

收到：H 研究四图（H1 规范地图 / H2 现状地图 / H3 复用对照 / H4 能力矩阵）+ `goal-H-001`。研究深、固定版本、区分实测/引用，认可。H 此前静默系首轮长研究，非故障。

## C 裁定 H 提的 D-0010「复用」含义
- 本仓 vendored `harness-remote` v3.0.2（sha256 溯源 + 运行时哈希校验 + PATCHES 升级）**是真实的第三方接入复用**，此项满足 D-0010。
- 但 **ACP 帧层手写 JSON-RPC、对官方 `@agentclientprotocol/sdk` import=0** → 任务卡/D-0010 明确「引用的自写 shim 不算复用」。故**复用义务对 ACP 协议帧层尚未达成**。
- 裁定：H 的**首个可验收增量**须以「**采用官方生态**」为复用标准去评估并给出方案（非 C 硬指定实现）：在插件内评估接入官方 `@agentclientprotocol/sdk` 与/或 `claude-agent-acp`/`codex-acp` 适配器来承载 ACP 帧层，**或**以证据说明为何保留现手写帧且需补的最小一致性（版本/来源固定、能力对齐表）。不得把整后端预先暴露为 ACP Agent。
- 三型不混同：系统 ACP Client / 适配器 ACP Agent 端点 / 额外对外 ACP 网关分开；暴露≠执行权限；文件/终端回调委托 E/P、用户审批交 S。
- **stopReason 不锁旧四值**：以当前 ACP 规范为准（E design v1 的 U1/H-1..4 依赖此，见 `sol/E-design-final-001-decision.md`）。
- 若「采用官方 SDK/适配器」将改动公共出口/凭据面或产品面 → 走 C 契约发布 / 必要时交 I；插件内实质重构允许。

## Sol / 时序
- H 累计 0/3，**本阶段不申请、C 暂不分配**；待 H 交 DESIGN_READY（含首增量方案+反例）后 C 先审，再决定给 Sol 或直批。
- H 下一步：出 `DESIGN_READY`（五图补全 + 首增量：官方 SDK/适配器接入评估结论 + 反例）；更新 `status-goal.md`。C-HARNESS@v1 待 H↔E 确认由 C 发布。
- 非阻塞的组内研究/能力矩阵完善继续。

## 更新 18:01 — H-003 证据收讫 + 增量1 放行确认
- 收到 `goal-H-003` CHECKPOINT：X1/X2/X3/X5 由「推断」升级为**基线代码上可重复测量**（只读 import bridge `AcpService`、S `sidecar_backend` 分类器；stub 对端；不 spawn 真 Harness、不读凭据、不计费、零源码改）：`acp-defect-evidence.test.mjs` 5 passed、`test_acp_stop_reason_evidence.py` 6 passed。**接受为 measured 证据**（分级：机制/stub ≠ 真机，H 已自律标注）。X1（`settleMs=0` 腿永不关门、"完成"后会话仍被改写）与 X3（`abort()` 代际守卫吞掉 `cancelled`→出口与"干净完成"不可分）实锤增量1 的必要性。
- **D1–D5 状态（H 勿等重复批准）**：D1 stop 值=官方5值含 `cancelled`（已裁）；D2 复用落点方向批准、增量2 换帧层/license/公开 wire → **已升级 I（IFR-06）**；D3 白名单已修正扩列（`runtime/**`、`deploy/opencode/**`、`third_party/harness_remote/**` 经 PATCHES+SOURCE.json、`tests/**`）；D4 **增量1 已批准**（`approvals/H-increment1-truncation.md`）。→ **H 可直接实施增量1**，交 CHECKPOINT（真跑 node --test + 现 112 例不回归、公共断言不弱化、已知红 `ambiguous_semantics` 不顺手改绿）→ C 核+集成。
- **D5（接口前置）**仅增量3 需要：向 P 要 `C-RES` 文件读/写执行面、向 E 确认 `C-EXEC` 委派停止语义（取消≠已停=block1 三态，已定义）。**不阻塞增量1**，H 勿等。
- Sol：H 仍 0/3，增量1 fake 可验直批；H 提议增量2 用 1 次 Sol 做实施验收（届时按 I 对复用边界/license 的决定再定）。

## 更新 18:40 — goal-H-005（X14）收讫 + 裁定
- 收到 X14 CHECKPOINT（手写帧层静默失败面 + 跨重启 stdout 残缓冲）。**C 亲读 `acp-client.js` 逐条核实属实**（`#buffer` 仅 `:32`/`:268` 赋值、`#start:136-139` 不重置且注释自认 stderr 同类半修、close/exit `:252-261` 不冲刷、`:290-306` 三静默分支）。measured/推断分级自律，认可。
- **纠过时判断**：H-005 §4 称 acp-client.js 不在白名单/D3 硬阻塞——**已过时**（修正白名单含 `third_party/harness_remote/**`，见上 18:01 更新）。
- **批准增量1b（仅 ⑤⑥）**：`#start` 重置 `#buffer` + close/exit 冲刷残帧，纯内部帧生命周期、fake 可验、不申请 Sol、不触公开投影形状/Wire → 不需 S 会签/不交 I。可与增量1 合为一个提交窗口交 CHECKPOINT。全文 `approvals/H-increment1b-framebuffer.md`。
- **③④ 不批延后**（新增对外可见出口 = 增量2「不回退不变量清单」事项，随迁 SDK 统一处置）。D1–D7 维持原裁定；增量2/license/message.final 仍挂 IFR-06 等 I。

## 更新 19:31 — goal-H-006（ACK/自纠）收讫
- 收到你对 C 两纸（`C-notice-004`/`C-notice-inc1b`）的回执 + **正式撤回**「acp-client.js 受 D3 阻塞」过时判断（改采「取料双路径：`inbox/` ⊕ `control/reports/BE-LOOP-001/goal/`」为组规程）。**认可此自纠与纪律**——正是我此前点名的协调失灵，你已闭环；后续我继续双落（中央 + 组 inbox）。
- 回执表逐条合规（D7 分层重算 7/11｜7/16、③④ 未做且写成「不得无裁定把孤儿事件 2→0/4」约束、X13 入增量4、pi-acp 负结果不硬造、增量2 未动待 IFR-06、`ambiguous_semantics` 未顺手改绿、Sol 0/3）——全对，C 无更正。
- **X15/X16 自律尤其认可**：增量1 令 `AcpService` 跨重启集合 30→32，你在三 teardown 点 `.delete()` + 断言计数不串味，**且把 30→32 写进 CHECKPOINT 已知缺陷而非改掉仪器读数**；「某轮真串味」仍标推断、不造假场景证明未观察结论——分级诚实，记为范本。
- 候 **`goal-H-007` CHECKPOINT**：核逐路径 diff（仅批准清单内）+ 真跑 `node --test` baseline↔candidate **差量 0 新增失败** + 现 112/新钉不回归 + 公共断言不弱化 + 已知红不顺手改绿 → 集成候选 `28b5f70` 续接、记 CP。你计划的两件非审批工作（OpenCode SSE fake 化接缝清单、增量4 对账门脚本形状）**批准进行**（不启停服务/不调模型/不加 D7 外口径）。Sol 0/3 不变。
