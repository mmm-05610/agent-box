# 后端模块化基线 · 任务板（唯一当前入口 · 只有 C 改）

**使命（I 令 2026-09-22 06:03，即日首要目标）**：收出一个**干净、可逐包维护的后端模块化开发基线**。本次只做**拆包与必要收尾**；不展开后续产品闭环、不追加无关功能/缺陷优化。执行工具两轮换代（先 C/S/E＝Codex、H/P＝Pi；**恢复轮 2026-09-22 13:02Z 起 C/E＝GLM5.3、S/H＝Flash、P 暂不开**，接管回执 `acks/C-glm-recovery-20260922.md`）；职责、写域和审批链不变，不重建编队。Sol 账本实核 used=4/10、H≤3、E-impl-accept 预留完好，本轮零消费。新能力/产品语义变化/数据迁移仍报 I，不以"拆包需要"为由自行扩大。
历史归置：旧循环心跳在 `current-state.md`、交接在 `handover/C.md`；已验收链＝`b067c571→…→ebbe168(PA①)→a4ab628(INC2-B②)→3c69770(Half-B)→2e69e3f(PA②)`＝**21 个已验增量**（PA②＝MB 首批差量）。

## A. 收尾（先收在途，安全检查点制）
| 项 | owner·写入归属 | 现态 | 收尾动作 |
|---|---|---|---|
| **a-3 合批（终线化）** | S＋E 已停写；C 串行验收 | S 续修 `df3bb00f` 后，C 集成 `f8bdf3fd`；根门父 37F/1379P/45S/2E → 合批 35F/1399P/45S/2E，0 新增 FAILED/ERROR ID。`checkpoint/CP-a3.md`。 | 已闭；旧树保留 |
| P INC2-B② | 已闭 | `a4ab628` 合入；P msg.platform.45 已按已交 msg.platform.44 增补归档 | 无需重跑 |
| 写权纪律 | 全体 | 两要素回执制已立（05:41 新规入 rubric） | 转交前必收原写入者「已停写＋最后提交/差量」；超时≠停止；确需接管走 V2 §3 独立树 |

## B. 拆包批次（M 系列：先映射→C 审→逐批批文→实施；不长篇重研）
**目标包形（I 定）**：service（协议入口/会话/业务编排）· execution（中立执行组合与生命周期协调）· Work Core（最小核心语义、保持稳定）· harness（通用 ACP 接入核心）· 各 Agent 接入插件（声明/配置校验/原生转换/必要适配）· 资源插件（runtime/sandbox/terminal/git/skills 各自独立维护）· Profile 通用管理（与 Harness 专属转换**分离**）。"包"＝清晰代码模块＋依赖边界（不强求独立仓库/进程/发行物）；**禁新建目录/空壳冒充拆分**；不要求为每个 Agent 复制公共实现；兼容入口可暂留但须**薄、单向委托、零第二实现**。Profile 本轮仅等价抽离/接口收窄/兼容接线——**不切数据权威、不迁存量、不新增管理语义**；现有 provider 按真实职责归属、不另造统一框架。
| 批 | 内容 | owner | 状态 |
|---|---|---|---|
| MB-1a harness 域 / P-B dsh | H `27bf6c2` 已停写；C 集成 `fe67317b`，根门 35F/1399P/45S/2E 同具体红灯 ID；旧部署资产副本仍在，待消费盘点。`checkpoint/CP-H-PB.md`。 | H/C | 已闭；旧资产盘点另列 |
| MB-1b server 域映射 | service/execution/Work Core/Profile 现码映射、依赖方向、物理/逻辑/兼容三分及逐批路径；Profile 只等价抽离 | **S＋E 联署** | S/E 图已收，`baseline/map.md` 初版；S2a/E2a 已按 `d12aa979` 分离路径批文。图随实现逐批更新 |
| MB-1c 资源域＋说明件 | 六资源插件、harness/harnesses、Work Core、service/Profile/execution 逐包六项说明与边界反例 | P/H/E/S 报告，C 发布 `baseline/packages/` | P 六份、H 两份（harness/harnesses）、E Core/execution、S service/Profile、**H dsh/qwen 两份（H-037 交、13:02Z SHA 落位）**均已收编；局部边界钉已跑；旧资产事实已按 H-037 §1 认账修正（旧包 deploy 实为 8 家）。P 报告 49 已裁定（见 bwrap 行） |
| P-QWEN-001 Agent 接入包 | qwen 原生家三模块＋资产真实迁包；零 EP、旧名薄别名 | H/C | H `7a1b2699` 停写，C 集成 `d12aa979`；根门 35F/1399P/45S/2E 同具体红灯 ID；`checkpoint/CP-H-QWEN.md`。旧资产副本仍在，待盘点 |
| MB-S2a service facade | `approvals/MB-S2a-service-facade-release.md` 五路径、S 唯一写，基线 `d12aa979` | S/C | **已闭**：msg.55 HANDOFF_READY＋停写（`a581e30e`，恰五路径；facade 与原 services.py diff 空，C 独立复核）；msg.56 完整消费回执闭合 E2a 契约；C 配对根门（`a67c47c9` 20F/1439P/33S vs 本批 20F/1447P/33S，ID 逐字一致，+8P＝新钉）→**集成 `fe59016b`**，`checkpoint/CP-S-S2a.md`。b2 未提交差量处置＝S 报备延期，保护令持续 |
| MB-E2a execution contract | `approvals/MB-E2a-execution-contract-release.md` 六路径、E 唯一写，基线 `d12aa979` | E/C | **已闭**：E-069 HANDOFF_READY＋停写；C 同环境配对根门（基线 20F/1428P/33S vs 本批 20F/1439P/33S，ID 逐字一致零新增/零转绿，+11P＝新钉）→**集成快进 `a67c47c9`**，`checkpoint/CP-E-E2a.md`。E 转 IDLE，E2b 先报已派（零码研究） |
| **H-KILO-001 kilo 接入包** | `approvals/H-KILO-001-release.md` 10 路径、H 唯一写，基线 `d12aa979` | H/C | **已闭**：H-042 HANDOFF_READY＋停写（`649938b1` 恰 10 路径、资产哈希对）；C 根门（20F/1447P/33S，ID 同 `fe59016b` 逐字）＋插件面独立复跑（7F/154P/3S 同集）＋093 32P→**集成 `0c042f54`**，`checkpoint/CP-H-KILO.md`。dsh→qwen→kilo 三格闭合 |
| **MB-S2c1 sessions 物理包** | `approvals/MB-S2c1-sessions-package-release.md` 11 路径、S 唯一写，基线 `fe59016b` | S/C | **已闭**：msg.58 HANDOFF_READY＋停写（`7788ac75` 恰 11 路径；repository/queue 字节等价、service 恰 1 行改锚，C 独立复核；M1-P-A① 同对象 shim）；C 配对根门（`0c042f54` 20F/1447P/33S vs 本批 20F/1454P/33S，ID 逐字一致，+7P＝新钉）→**集成 `321c883c`**，`checkpoint/CP-S-S2c1.md` |
| **MB-S2c2 wire 物理包** | `approvals/MB-S2c2-wire-package-release.md` 13 路径、S 唯一写，基线 **`321c883c`** | S | **批文已发**（依 S 的 MB-2 提案 S2-c2 节）；候 S 建树 ACK→实施 |
| **MB-E2b lifecycle 抽离** | `approvals/MB-E2b-lifecycle-release.md`＋`decisions/E2b-pin-amendments-ruling.md`（白名单 5→7） | E/C | **已闭**：E-075 HANDOFF_READY＋停写（`602e8926`＋`9a552b02`；first_run_lock md5 全等＝C 亲核；三探针实录）；C 配对根门（`321c883c` 20F/1454P/33S vs 本批 20F/1465P/33S，ID 逐字一致，+11P＝新钉）→**集成 `92a2d2ba`**，`checkpoint/CP-E-E2b.md`。E 转 IDLE，剩余文件基线后另批 |
| **H-GUARDS-001 旧资产微批** | ~~`approvals/H-GUARDS-001-release.md`~~ **已撤回**（H-043 复查推翻"零消费"：两枚 guard 被 `scripts/server-round1/{dsh,qwen}-production-chain-gate.py` offline 分支真读） | H/C | **撤批**（14:4xZ，`decisions/H-old-assets-disposal-ruling.md` 修正节）：两枚 guard 兼容保留，处置随 scripts/server-round1 遗留线另批；H 下一任务＝pi 先报（goal-H-044 已宣布） |
| 旧 deploy 资产处置 | `decisions/H-old-assets-disposal-ruling.md`（依 H-037＋H-043 修正） | H/C | dsh settings.yaml＋两枚 loopback-guard 均＝**兼容保留**（前者涉 S 域契约、后者涉 scripts 遗留线，均延期基线后另批） |
| pi 先报（第四家） | `harness/reports/H12-pi-prereport.md`（H-044 递件）＋`inbox/C-notice-H-044-received-rulings.md`（四点已裁：全家 8 模块整体迁/guard 无联动/死名另批/活缝不做） | H | 先报已收讫归档；**实施批文＝CP-MODULE-BASELINE 后第一张**；hermes 先报＝H 可选等待期研究 |
| P bwrap 档位 | `decisions/bwrap-plan49-lane-ruling.md`（依 P report49） | C（裁）·P/H（后施） | 检查点内＝A' 零公开语义变化；档 B 延期基线后随 I 豁免。**P 本轮不开**，A' 增补件候 P 复开；H 无 bwrap 任务直至 C 另发接缝确认 |

## C. 基线交付与验收（I §四；全绿方宣告基线）
1. **包目录图＋依赖图**（物理包/逻辑子包/暂留兼容入口区分）→ `control/reports/BE-LOOP-001/baseline/map.md`；
2. **每包一份说明** → `baseline/packages/<pkg>.md`；
3. **边界验证**：导入/装配可用＋循环/重复注册/品牌分支/职责偷渡反例钉（可跑）；
4. **每批差量**：集成后相对**同环境基线 0 新增失败**（同形树对比；既有红灯原样单列、不宣称解决）；
5. **集成检查点 `CP-MODULE-BASELINE`**：已合入/仍在分支/延期三清单＋工作树归属明列——**不删旧树、不弃未提交**；
6. 本板＝唯一入口，过期"待批/在途"即清。

## D. 延期登记（保留分支/文档、不强行合入；基线不动、基线后再启）
- **B2 公开字段实施**（形已定 `approvals/B2-fields-release.md`；公开形状变化＝产品语义→基线后随 D-0033 线定时机）；#22（S F1/F2＋cancel 签名轮）随其后。
- INC2 余格：B②后半 7 枚 ValueError；`runtime/**` 搬家（越界项）；R-D 对账半页已由 P 报告 40 交付并入 B1 索引；B1 留存包呈 I（`retention/for-I.md` v1.0 已成、递出＝基线后）。
- BE-PROFILE-001：研究四件套＋提案 v1 已成；**权威切换/数据迁移从未获批、本次不做**。
- H-MINIMAL：P-B 已批实施中；P-C/双链收敛另案；M1③ 探针缓行候主机；Half-B 公开投影候 B2 窗。
- IFR-06(2) 41 条判读、IFR-01 留存参数——产品闭环，基线后另线。
- **bwrap 档 B**（`__all__` 删项/拒绝文本中性化/runtime-wsl 测试改注入源＝公开语义变化）：随 `decisions/bwrap-plan49-lane-ruling.md` 延期，基线后呈 I 豁免裁定。
- **dsh settings.yaml 等价移除**（涉 plugin_root 跨包语义＝S 域契约）：延期基线后由 C 协调 S 批。
- **旧 deploy 三资产处置＋`scripts/server-round1` 遗留线**（H-043：两离线门脚本 plugin_root/adapter/driver 全锚旧包根并消费两枚旧 guard；GUARDS 微批已撤回）：兼容保留，基线后统一另批。
- 在册分支/树（13:02Z 实核）：S 主树 `2096e98` clean、a3 `df3bb00f` clean、sdm1 `492a1c39` clean、**b2 `ecf06a33` 带 S 未提交 delegation.py（＋13 行 SIM 草稿证据，C 登记保护、任何人不代提交）**；E `90b8a77`、H `7a1b2699`、P `c1360f3` 均仅 `?? .qoder/`。所有未提交保留，C 只合停写交付。

## E. 现势速读（2026-09-22 14:3xZ 恢复轮·四格已闭）
候选 **`321c883c`**（S2c1 后，clean；恢复轮已闭四格：E2a→`a67c47c9`、S2a→`fe59016b`、kilo→`0c042f54`、S2c1→`321c883c`，各配对验收 0 新增红 ID）｜**在途**：S2-c2（批文已发候 S 建树）、E2b（批文已发候 E 建树）、H-GUARDS-001＋pi 先报（候 H 复开领件）｜bwrap：A' 档已裁、H-040 接缝闭合、A' 增补件候 P 复开｜包说明 13 份齐｜Sol **4/10**（本轮零消费）｜序：S2-c2/E2b 交付→C 串行配对验收集成→guards 微批→余家逐家（pi→hermes→claude→codex）→S2-b/S2-c3→`CP-MODULE-BASELINE`＋包依赖图＋边界反例＋已合/未合/延期清单。旧树、服务与用户数据保留；b2 保护令持续。**本 C 环境与前任沙箱不同（根门红 20F 族 vs 历史 35F 族），一切差量以同形树同环境配对为准。**
