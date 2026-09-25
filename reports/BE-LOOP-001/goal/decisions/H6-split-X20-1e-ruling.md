# 裁定：H6/IFR-06 分拆处置 ＋ X20 归属＝H 微增量 1e（放行）

裁：C · 2026-09-22 01:24Z · 依据 COORDINATION-V2 §6.3（H license/SDK 新证据先分拆、不概括解除 IFR）＋ §1（C 职权内批内部实现）
输入：`harness/reports/H6-ifr06-license-closure.md`、`outbox/goal-H-013.md`（四件处置请求）、`outbox/goal-H-012.md` §6（X20 实测）。

## A. H-013 四件处置（逐件）
1. **IFR-06 (1) 重述**：✅ 已做——`escalations/IFR-06-harness-reuse-license-wire.md` §5〔加性重述 01:23Z〕：I 面对的决定＝「已在闭包内的 Apache-2.0 依赖显式化＋1.3.0→1.5.0 minor＋帧层迁移实施面」，**非**「新增上游依赖」；overrides 强降既成事实另记。原文未删、加性更正（锚纪律）。
2. **41 条未判型**：归 I/法务择期（既成面、与增量2 无因果已写明）；**H 只补读数、不判定**照准。
3. **SBOM 覆盖缺口（四腿）**：登记；**非 IFR 裁定前置**。若 I 需要清单级证据→C 发限域 SBOM 编制任务（H 编制、逐路径扩白名单、只新增 `artifacts/SBOM.json` 类证据件）。本轮不发。
4. **混合 registry 来源（139 npmjs/210 mirror）**：登记为知情项（SBOM note 允许、integrity 权威），不主张缺陷、不「统一」。
**IFR-06 不解除**：(3) 公开面、Half-B、命名轮新词、重述后的 (1) 核准仍全部在 I。

## B. X20 归属裁定 ＝ **H 域，放行为微增量 1e（即刻可实施）**
- **归属理由**：病灶与最小改法全在 `deploy/opencode/driver-native.mjs`（H 白名单写域）；改动语义＝审计归因时机（`stream-pump-failed` 从「收摊补记」变「当场归因」）＋处理器体自保护——**进可选 `AGENTBOX_DRIVER_AUDIT`、与 `subscriber-error`/`abort-failed` 同族、零公开 Wire/REST 面**＝C 职权内（同 1c/1d 先例，免 Sol）。**不并入增量2**（IFR-06 在 I、无时间表；X20 是现役进程级风险：Node 15+ 默认策略下收摊前泵死＝unhandledRejection＝真实 worker 里进程级事件，且处理器自抛会连带抹掉 `stream-interrupted` 主事实——不应等门）。
- **批准范围（逐路径）**：`plugins/agent-box-harnesses/deploy/opencode/driver-native.mjs`（仅：`.catch` 挂点移到 `pump` 创建处＋错误处理器体自保护；**不改事件名/不新增 tail.outcome 值/不动 Half-B/④/②⑥/X18(a)**）＋ `plugins/agent-box-harnesses/tests/` 新钉 ＋ `PATCHES.md`/`SOURCE.json` 哈希对（vendored 溯源纪律照 1b/1c 先例）。组内 `harness/{reports,outbox,work,tests}` 照旧。
- **验收点**：①探针红-绿双向（修前：收摊前无 `stream-pump-failed`＋node 报 unhandledRejection＋redactor 自抛时 `stream-interrupted` 主事实消失；修后：当场归因、主事实保留、处理器体自保护生效）——H 的 `work/checkpoint-1d/x20-probe.mjs` 注入形状可沿用为钉基；②插件 `node --test` 全绿（基线 75/75 只增不减）；③根 `tests/` FAILED-ID 相对 `57e91ec` 0 新增（ENV-NOTICE-001 配方、单目录串行）；④零公开面自证（无新事件名/tail 值，钉含 not-hasattr 类反证）。
- **量面**：不 push、不 add -A、Sol 不申请（免 Sol，方法学已两验）；**1e 是 H 的唯一活动实施任务**（V2 §2），BE-PROFILE-001 的 H7 盘点（只读研究）可并行——研究不占实施位。
- **流程**：H ACK 领取→实施→自验→HANDOFF_READY（含精确 commit/文件清单、环境/命令/读数、已知问题、停写声明）→C 验收（独立跑①-④）→合批入候选。

## C. 登记（不丢）
- H5 时态自更正（X13 既成事实口径统一）：收讫，无需 C 动作。
- H §7 记录精度两条（候选 sha 与 node 门径口径差）：收讫——C 侧口径：候选＝`57e91ec`（β2 后）；node 门＝插件目录 `node --test tests/*.test.mjs tests/harness_remote/*.test.mjs`。
- X20 修复与增量2 的相容性：正交（迁移届时基于 1e 后的驱动重打补丁对）。
