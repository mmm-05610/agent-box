# ALLOWLIST 修正 + APPROVED — H 增量1（D-0011 截断可见性）

批准者：中央 C。H 实测证明 ACP 帧层不在 `plugins/agent-box-harnesses/src`（在 `runtime/`、`third_party/harness_remote/bridge/`、`deploy/opencode/`）——原 allowlist 不足。据 GOAL-START §44-47 修正，**仍在插件根 `plugins/agent-box-harnesses/` 内**，公共出口仍排除。

## H 实施允许清单（修正·插件内，逐路径；越界即驳）
- `runtime/**`（profile_extensions.mjs、package.json/lock、SBOM 等插件内产物）
- `deploy/opencode/**`（driver-native.mjs 等）
- `third_party/harness_remote/**`（**仅经既有 PATCHES.md + SOURCE.json 溯源模型**改，补丁必成对更新，X11 锁；不得绕过哈希校验）
- `tests/**`、`tests/harness_remote/**`（本组自有）
- 仍**冻结/排除**：`pyproject.toml` entry-points、`__init__.py`/`plugin.py`、`resource_contracts/**`、`{family}/production.py` 的 capabilityClaims/deployment 形状、`runtime/capability_declarations.json`、`wire/**`、`docs/boundary.md`（记录交 C）。

## 批准：增量 1（截断可见性闭环，全 fake 可验，不申请 Sol）
路径：`runtime/profile_extensions.mjs`（5 profile `promptSettleMs`）· `third_party/.../bridge/src/acp-service.js`（补丁#5）· `deploy/opencode/driver-native.mjs`（尾不匹配可见化）· 各 `tests/**`。
验收（对齐 H §6 X1–X4）：ack 后尾 chunk 到齐或**明确报告丢量**；缺 stopReason 记 `stop_reason_not_reported`（不等同 end_turn）；`max_tokens`+截断全链到 `execution_state().reason`；OpenCode 尾不匹配成为可呈现事实；`node --test`/现 26+112 例不回归、公共断言不弱化、已知红 `test_harness_sidecar.py::...ambiguous_semantics` **不得顺手改绿**（H 单列）。
交付 CHECKPOINT：逐路径 diff + 测试命令/结果 + 已知缺陷 + 交 S/E 的投影说明。C 核范围+跑测试→集成候选（现 `4674a2a` 续接）→记录。

## C 裁定（H §9 需决定项）
- **D1 stop 值口径**：采官方 **5 值（含 `cancelled`）** 解释，**不用旧四值枚举**（GOAL-START 明示）。H 在插件内按此实现；对外投影口径由 S 定。
- **D-0010 落点（D2）**：H 方案「保留 bridge 非 ACP 价值 + ACP 腿迁官方 SDK/适配器」符合我的复用裁定 → 方向批准。**但增量 2（替换 vendored 帧层 + 引入 `@agentclientprotocol/sdk` + lock/SBOM + 上游 license 面）暂不批**：属复用边界 + 第三方再分发/license（claude 非 OSI 依赖、codex 捆 `@openai/codex`）→ 见升级 I；且 H 自请增量2 用 1 次 Sol 做实施验收，保留额度。
- `_CLEAN_STOP_REASONS`（`sidecar_backend.py:1020`，含非 ACP 值）→ **属 S 树/产品解释语义**，转 S 采用 H 的映射表（地图4 §1.3），不由 H 改。
- `message.final` 不带 stopReason → **公开 Wire**，冻结；确需改 → **交 I**（已并入下方升级）。
- 上游适配器 license/再分发合规 → **交 I**（不由 H/C 判定）。

## Sol
H 累计 **0/3**，本轮未申请、C 未分配（增量1 fake 可验，直批）。增量 2 实施验收时 H 可请 1 次。
