# F1 — MAIN-FE-CONNECTOR 缺口清点（baseline1）

owner_generation: HD002-1 · 核对坐标: `d44a5f8e2ccfbbeb7c330ecb9d0ba6e72859b0f4`（FE baseline1，本树分支 `work/hd002-f1-b1`，clean）
方式: 只读核对 + 既有 HD-001 研究沿用（`../../HD-001/agents/F1/reports/{reuse.md,connect-research.md}`），未重开调研轮、未发任何真实模型请求、预算消费 0。

## 结论先说

BASELINE.md 的「后端 connector 不可凭此声称完成」需要**修正口径**：不是 connector 代码缺失，而是**端到端真实接入未验证 + 两处收口缺口**。逐条：

| # | 事实 | 证据 | 判定 |
|---|---|---|---|
| 1 | 两个 connector 已在产品清单启用并被发现式装配（含 native 入口与 lock 钉定） | `products/agent-desktop/extensions.json`（`ordessa.agent-connections`/`-codex`/`-pi`）、`extensions.lock.json:4-19`、`platform/extension-host/src/main/extensions.ts:17-70` | 已接线 |
| 2 | 原生桥真实 spawn 后端子进程：Pi 走 `RpcClient` CLI（`plugins/connectors/pi/src/native.ts:42`），Codex 走 `codex app-server --stdio`（`codex/src/native.ts:14`），IPC `agent-native:open/send/close`+`agent-native:event`（`platform/native-bridge/src/index.ts:48,73-75`），主窗口来源锁定与 1MiB 帧上限（`:19-26`） | 同上 | 已接线 |
| 3 | 两客户端方法面完整（connect/refresh/new/open/send/stop/respond/setOption/dispose），无方法级 stub；未知帧才抛 Unsupported（`pi/native.ts:108`） | `plugins/connectors/pi/src/client.ts:45-342`、`codex/src/client.ts:48-324` | 已接线 |
| 4 | 单元门全程用 fake bridge；真实子进程路径只在 `test:agent-process`（不建模调用） | `apps/desktop/renderer/agent-pi.test.ts:7-45`、`agent-codex.test.ts:4-31`、`apps/desktop/scripts/test-agent-process.mjs:14,33-35` | 真实端到端**未验证** |
| 5 | 整机模式结构性成立：所有会话操作单一投影到 `workspace.selected()` | `plugins/agent/sessions/src/model.ts:15-29` | 已接线 |
| 6 | 第一层切换闸只覆盖 `selectConnection`；**`reconnect()` 完全绕闸**，活动 run/待交互时仍会 dispose 客户端并静默丢流 | `plugins/connections/service/src/workspace.ts:61-70`（闸在 `:65`）对比 `:72-79`（无闸）；谓词定义 `contracts/connections/src/connections.ts:28-37` | **缺口 G1** |
| 7 | statusbar 只呈现 `disconnected|connecting|status`，无 pending 计数；待交互数在 interactions 视图各自重算，无单一权威值 | `plugins/connections/service/src/status.tsx:14-16`、`plugins/agent/interactions/src/view.tsx:20,52-53` | **缺口 G2**（正是 C-0002 要求的"one coherent pending-count design"） |
| 8 | 无「临时二级选择 Harness」的两步语义（当前是即时单选切换）；无第二层服务端拒绝路径存在于本树 | 本树 grep 无 `switchProfile`/`executions.list` 实现，仅注释 | **缺口 G3/G4**（G4 属 BC 域，需其确认，不在本树断言） |

## 候选包（交 FC 裁决；目录均在我写域，除标注外）

> 清点后状态更新：G1 已实现并交付（HANDOFF_READY=F1-0002，HEAD `43cb9ad60e`，typecheck 0 / vitest 68 全绿 / build 11 extensions）。G2、G3、G5 仍待 FC 点名。

**F1-G1 切换闸收口（最小、优先）**
- 目录: `plugins/connections/service/src/workspace.ts` + `apps/desktop/renderer/agent-connections.test.ts`
- 目标: `reconnect()` 走同一谓词；活动 run/待交互时给出与 select 一致的可解释拒绝，不偷偷取消。
- 非目标: 不改 wire、不动 F2 属主文件、不新增右栏。
- 验收: typecheck 0、vitest 串行全绿 + 新增 reconnect 闸真值表用例、`test:electron`/`test:agent-shell` 不退化、零真实调用。

**F1-G2 统一 pending 计数（与应用批同批）**
- 目录: `plugins/connections/**`；**跨域需 FC 裁定**：权威计数若要落 `contracts/connections/src/connections.ts` 或 `AgentWorkspaceSnapshot`（`contracts/agent`），那是共享面，单写归属由 FC 点名；`plugins/agent/interactions/src/view.tsx` 属 F3 消费方。
- 目标: 一处算，statusbar 与应用探针读同一个数。与 I-004 的 P2-2 第 4 项同批做，避免两次改探针。

**F1-G3 临时二级 Harness 选择（需产品确认后排）**
- 目标: 两步语义（选后端连接→临时二级选 Harness→确认后才整机切换），沿用 G1 的闸。
- 非目标: 会话级 Harness 选择、多 Harness 混排并行（SCOPE 明令不做）；Provider/Model 面（仅 DESIGN）。

**F1-G5 真实接入离线验证批（不花预算）**
- 目标: 把 `test:agent-process` 扩成可复现的双 connector 离线端到端门（真子进程、零模型请求），产出「真实一次调用需要几次请求」的可验证上界证据给 BC/C 参考——**不据此申请 grant**。

## G6 — 停写后自查发现（已登记 F1-0005，未动手，等 FC 成包）

| # | 位置 | 后果 | 级别 |
|---|---|---|---|
| 1 | `plugins/connectors/pi/src/client.ts:282-283` 失败即 `activeRuns.delete`，而 `:130-132` 的 `agent_start` 只认该映射 | `prompt` 确认超时但后端真在跑时，run 无法投影也無法 `stop()`（`:285-292` 必 reject）—— 与「停止/恢复、不偷偷取消」冲突 | MED |
| 2 | `plugins/connectors/pi/src/native.ts:35-38` `transport_exit` 只 `sessions.delete` | 未 `unsubscribe()`/未 `client.stop()`，死会话监听与缓冲留存，同 id 重会另起一份 | LOW |
| 3 | `workspace.ts:26-30` dispose 不清 `clients`，`state.agent` 留最后快照 | 作用域退出后快照仍呈 `connected`；`selected()` 因 `isDisposed` 仍抛，故仅呈报诚实性 | LOW（可判否） |

G1 的两处（闸未覆盖 reconnect、闸在握手 await 前求值）已在 `43cb9ad60e` + `ba82deafd2` 修毕，负向对照确认新用例能钉住（换回旧码即 2 用例双红）。

## 阶段界重账（2026-09-23，HD002-2）——只标失效行，不重写上文

上文属 **baseline1**（`owner_generation: HD002-1`、坐标 `d44a5f8e2c`，那棵树里 `pi`/`codex` 两个 connector 仍在产品中）。桌面文本两轮 PASS 之后，四条口径必须就地更新，**否则本文件会被引成与现基线相反的结论**：

1. **行 4「真实端到端未验证」对 `ordessa` 后端 connector 已不再成立。** 选空项目 → `sessions.createAndSend` → 同 session `sessions.send` → 两次回复在 UI 呈现，已在真 Server（固定 Go ACP 桥 + 原生 Pi 0.86.1）上实机 PASS：FC-0102 / BC-0095 / C-0101。**被测内容是 `fc-functional 59856bf2`，不是产品候选**（候选 `90ca17b8cb` 的连接器仍含第一轮实机证过的崩溃行，F1-0058 §1、F1-0059）——这条限制比"已验证"本身更要紧。
2. **行 2/3 与 G6 整表（`pi`/`codex` 的 native spawn、方法面、三处 MED/LOW）转为历史记录**：那两个包已整体移出候选（F1-0021/F1-0027 §1 一手 diff；F1-0033 亦据此判 `directConnectorsAbsent` 平凡真），**不得**再作为现基线证据引用，也不得用来支持或反对任何当前判定。
3. **行 8 / F1-G3「临时二级 Harness 选择」仍开放**——charter 第二半（roles/F1.md:5「之后按新基线补真实接入与 Harness 选择」）里 **真实接入本阶段已证、Harness 两步语义未做**。我码面现状（现基线，一手行号）：`native.ts:54-69` 做的是「Server 声明的 `nativeExecution.harness` 必须存在于 hello 的注册表(`:60`)、且所选 profile 归属同一 harness(`:64`)」的**即时单选校验**，无两步确认、无第二层服务端拒绝路径。G4 仍归 BC 确认，不在本树断言。
4. **F1-G5 的必要性下降**（不撤销，理由换成可引用的数）：它要产的"一次真实调用需要几次请求"上界，现已由真机 tap 给出实例——**第二轮**（唯一公布逐方法总量的一轮，BC-0091）总量为 `hello 3 / profiles.list 2 / workspaces.open 3 / workspaces.list 3 / createAndSend 1 / sessions.list 1 / history.snapshot 1 / send 0 / approvals 0 / OTHER_HTTP 0`；第三轮 BC-0095 只公布两条增量（`createAndSend 1`、`send 1`）⇒ **第三轮逐方法总量待 BC 一票**。三条诚实界限：① FE 归因需减 BC 自发拆分（该拆分 BC 未在本批公布，F1-0031 那套差集法这次**不可**直接用）；② `connect` 条数 ≠ 调用数（TCP 复用，F1-0049 §2）；③ 计数是在 `--no-tools` 无工具、单 profile、空项目条件下取得，**不是普适上界**。
5. **PASS 未覆盖的我面清单**（与 F1-0058 §2 同口径，引用本文件时请按此读）：`sendOutcome.query` 两族调用点（`native.ts:160`、`:216-217`）、`runs.stop`/`approvals.decide`、`token-file.ts:23-50` 八条拒绝分支、跨重启历史 resume、**§25 执行侧 cwd 与所选项目一致**（BC 只证 session 身份与 READY 相符＝项目选择一致，两行必须分开）。
6. **仍等 C 一句**：F1-0046/0054/0058 的 (a)/(b)（那 5 行是否由 F1 落候选线，或回执显式署名被测内容）。未点名前本树继续停写。

## 纪律

只写 `agents/F1/**` 与本树批准包内路径；显式暂存、不 push、不动 main、不碰 root 清单/lock（lock 由 FC 集成点生成）；不读密钥、不建监视器/守护进程。
