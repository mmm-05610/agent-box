# AgentBox Desktop — 前端实现交接（DESKTOP_IMPLEMENTATION_READY）

> ## 更正（2026-09-15）：READY 曾因两个本端缺陷暂停，现建立在 r2 新证据上
>
> 本文件原先声明的 `P06_GREEN — FRONTEND_INDEPENDENT_ACCEPTANCE` 与
> `DESKTOP_IMPLEMENTATION_READY`（基于 `9fe414a2`）因**协调验收发现两个本端缺陷**而暂停：
> ①AgentBox 产品仍**发起** legacy REST 请求（四条可达控制流，不是外围合同缺口）；
> ②P06 驱动**fail-open**（真实 FAIL 可被静默丢弃，renderer 残余只记录不设门）。
>
> 两个缺陷已修复（`f47e5219`、`1ed11197`），并在**新的 Windows r2 验收**下重新声明；
> 完整记录见 [`P06.md`](P06.md) §10–§13。**r1 的失败运行与证据原样保留**
> （`P06-assets/`、`P06-assets-r2-attempt1/`）。旧结论不作为本次 READY 的理由。
>
> ## 更正（2026-09-15，r3）：r2 的 GREEN 因三个产品面缺口暂停，现建立在 r3 新证据上
>
> 上一条重新声明的两个标记（`6ddf6be9`）因协调验收发现**三个产品面缺口**而再次暂停，
> 三者均为**本端**缺陷，不是后端/外围合同缺口：
>
> 1. **Appearance 仍是活动 legacy config 路径**：`#/settings?tab=appearance` 的
>    「重开上次聊天」与「终端字体」经 `useHermesConfigRecord`/`saveHermesConfig` 读写
>    `GET|PUT /api/config`（被门拒绝，但产品仍在发起）；
> 2. **语言切换静默不持久化**：agentbox 下 locale port 的 `save()` 提前返回——切换「看起来成功」，
>    重启即丢且不报错；
> 3. **内置 `hermes-bots`（Bot Mode）仍默认启用**，而 master-plan §4 已把 Bots 群聊/原 Agents
>    管理入口列为退役项。
>
> 三者已修复（`3b22aae7`：Appearance 的必填 authority 与字面不挂载、Desktop 本地语言/resume/
> 终端字体偏好、Bot Mode 在发现与磁盘两道边界退役），并在**新的 Windows r3 验收**下重新声明：
> **28 PASS / 0 FAIL / 0 SKIP / 0 PENDING，`allOk=true`，exit 0**，两道 legacy REST 门独立成立，
> Appearance（页面可操作 + 语言/resume/终端字体本地持久化 + 本阶段残余严格 `[]`）与
> Bot Mode 退役（无 New Bot、无 Bots/Routines/群聊入口、无插件存储）都是**必需步**。
> 完整记录见 [`P06.md`](P06.md) §14。**r1/r2 的失败与通过证据全部原样保留**
> （`P06-assets/`、`P06-assets-r2-attempt1/`、`P06-assets-r2/`），新证据在 `P06-assets-r3/`。

本文件是前端 goal 交给后端/全栈集成人的唯一入口。配套证据 [`evidence/P06.md`](P06.md)（本阶段
独立验收）与既有 [`evidence/P02.md`](P02.md)、[`evidence/P04.md`](P04.md)、[`evidence/P05.md`](P05.md)、
[`evidence/P05-final-audit.md`](P05-final-audit.md)、[`evidence/P05-client-matrix.md`](P05-client-matrix.md)、
[`evidence/P07.md`](P07.md)。

## 1. 分支与 HEAD

| 项 | 值 |
| --- | --- |
| 工作树 | `/home/maoqh/projects/agent-box-desktop-next-wsl-round1` |
| 分支 | `feature/agentbox-desktop-product` |
| r1 起点 HEAD | `9ecf1a0a6b0b38dd8196ca263e3554061d8618d0` |
| 诚实性返修起点 HEAD | `9fe414a2` |
| 实现检查点（产品 authority 门 + 驱动 fail-closed） | `f47e5219` |
| 实现检查点（驱动挣得 boot 覆盖证明） | `1ed11197` |
| r3 起点 HEAD | `6ddf6be9` |
| r3 实现检查点（产品面缺口修复 + 驱动扩展） | `3b22aae7` |
| 最终交接 HEAD | `status.md` 的 release 行与 `git rev-parse HEAD` 为准（docs release 提交） |
| 发布源 | `main` **不授予写权**；本树不 push/merge |

## 2. clean 状态

交接时工作树 `git status --short` 为空、暂存区为空、`git diff --check` exit 0；
无残留 Vitest/Vite/Playwright/Electron/构建进程；子代理全部结束。未跟踪的 POC
（`apps/desktop/src/agentbox/`、`src/plugins/agentbox-lab/`）未读、未改、未 stage。

## 3. 合同版本与两个完整 SHA-256

- 语义：`core-semantics/1`，`APPROVED_SEMANTICS`（2026-09-14）。
- wire：`wire-v1`，**`WIRE_LOCKED_FOR_IMPLEMENTATION`**（双方登记：前端 `backend-response.md`，
  后端 `…/agent-box-server-round1/docs/server-round1/wire-review.md` 12:15 条目）。

| 工件 | 完整 sha256 |
| --- | --- |
| TS 权威 `apps/desktop/src/types/wire/wire-v1.ts` | `11e3b3e70d332585d31900c09ba063d95aa6b72b1904921c665fb72f81c10035` |
| 生成工件 `docs/desktop-product-delivery/contracts/wire-v1/generated/wire-v1.schema.json` | `5d4fa3bfeec6c3273c6073b37794e4ab2aca6e07e48184bc3a2b878c1fe5e4ed` |

工件可由 TS 权威按 `contracts/wire-v1/README.md` 的命令流式复现且逐字节相同。

## 4. 28 方法摘要与事件流

`WireMethods`（`wire-v1.ts:896-924`）恰 **28** 键，与 `evidence/P05-client-matrix.md` 表集合 diff 为空：

```
server.hello
workspaces.open | workspaces.list | workspaces.browse | workspaces.archive
profiles.list | profiles.create | profiles.update | profiles.archive | profiles.updateConfig
providerModels.list | providerModels.create | providerModels.update | providerModels.archive
config.describe | config.resolve
sessions.list | sessions.update | sessions.archive | sessions.switchProfile
sessions.createAndSend | sessions.send | sendOutcome.query
queue.get | queue.withdraw | runs.stop | approvals.decide
history.snapshot
```

28 个方法在 AgentBox 产品组合中**全部有生产调用者**（`evidence/P05-client-matrix.md`，28 reachable /
0 前端缺口）。注意：该计数是**前端调用点**计数；每个调用点都终止于同一个外部缺口（§9），
不代表真实服务可用。

**事件流（九跳全部生产接线）**：renderer 订阅（`wiring/agentbox-main-chat.ts:302-337`）→ preload
（`electron/preload.ts:20-35`，listener 按 subscriptionId 过滤）→ main sender-owned 订阅表
（`electron/ipc/workcore-wire-ipc.ts:118-168`）→ main-only token/WS 头
（`electron/security/agentbox-wire-event-transport.ts:92-135`）→ 帧 schema 校验
（`agentbox-main-chat.ts:340`）→ reducer（`application/session/wire-session-control.ts:122-159`）→
缺口退订补水重订阅（`:352-364`、`:160-190`）→ route 卸载/`will-quit` cleanup
（`main.ts:817` → `workcore-wire-ipc.ts:181-203`）。
endpoint 与 `sessionToken` 只存在于 main 进程闭包与 HTTP/WS 头，renderer 侧 **0 次**出现。

## 5. 测试与构建结果

Linux/WSL（r3 实跑，详见 `P06.md` §14.3）：

- 定向面（Appearance/locale/terminal 偏好 + 插件发现与 product authority + settings +
  composition + 命令面板 + i18n）**71 files / 635 tests passed**；P06 驱动单测
  **1 file / 52 tests passed**；渲染端全量 **823 files / 7970 tests passed（0 failed）**
  ——全部 exit 0。
- 三项目 typecheck **exit 0**；33 个改动文件 ESLint **exit 0 / 0 error**；`git diff --check`
  **exit 0**；`apps/desktop build` **exit 0**。
- 自校验 CDP 探针（临时，未入库）沿驱动同一套页面交互得到 renderer 残余 **`[]`**、
  main refusals **0**，并抓到驱动自身的两个缺陷（resume 行钩子缺失、语言选项指针点击被列表容器
  拦截）——两者在 Windows 轮之前修掉。
- r1 的全量门（987 files / 10218 tests、UI 815 files / 7915 tests、lint 141 warning）与 r2 的
  组合根门（13 files / 171 tests）保留于 `P06.md` §4、§11.8 作为历史。

Windows（`C:\Users\maoqh\agentbox-wsl-round1`，本轮同步 `6ddf6be9..3b22aae7` 的 33 个 tracked
文件，先 dry-run，逐文件 SHA-256 **33/33 逐字节一致**，未重装依赖）：

- `npm run build` 通过（vite + electron bundle + native deps stage），**exit 0**
  （日志 `P06-assets-r3/windows-build.log`）。
- **P06 原应用验收驱动（r3，权威门）**：
  **28 PASS / 0 FAIL / 0 SKIP / 0 PENDING，`allOk=true`，exit 0**（`P06-assets-r3/results.json`）。
  两道 legacy REST 门独立成立：main refusals **0**；renderer `residualLegacyPaths` **严格 `[]`**。
  6 条新必需步（Appearance ×5 + Bot Mode 退役 ×1）全部 PASS，原 20 条必需 id 一条未删。
- r1 失败证据 `evidence/P06-assets/`、r2 第一次运行失败证据 `evidence/P06-assets-r2-attempt1/`、
  r2 通过证据 `evidence/P06-assets-r2/` 全部**原样保留未动**；r3 新证据在
  `evidence/P06-assets-r3/`。
- r1 的 loopback 裁决（`npx vitest run --project electron <两个文件>` → 2 files / 32 tests passed）
  仍有效，本轮未复跑亦未改动相关模块。

## 6. Windows 启动方式（原应用，非安装包）

```powershell
cd C:\Users\maoqh\agentbox-wsl-round1\apps\desktop
npm run build
npx electron .        # 或 npm run test:e2e 之前先 build
```

隔离验收（推荐，绝不使用真实 `HERMES_HOME`/userData）：

```powershell
$env:HERMES_HOME="C:\Users\maoqh\agentbox-p06-sandbox\hermes-home"
$env:HERMES_DESKTOP_USER_DATA_DIR="C:\Users\maoqh\agentbox-p06-sandbox\user-data"
$env:HERMES_DESKTOP_APP_NAME="HermesP06Acceptance"
npx electron .
```

独立验收驱动（r2 实际使用的命令与全新沙箱）：

```powershell
cd C:\Users\maoqh\agentbox-wsl-round1\apps\desktop
node e2e\p06-independent-acceptance-driver.mjs `
  C:\Users\maoqh\agentbox-p06-sandbox-r2b `
  C:\Users\maoqh\agentbox-p06-evidence-r2-final
# exit 0；allOk=true
```

## 7. 无服务启动方式

不提供任何 Server/Harness/凭据/模型即可直接启动（`HERMES_HOME` 指向空目录与无 provider 的
`config.yaml`）。预期：主窗口立即出现；侧栏与设置可用；不出现全屏遮罩；发送入口 fail closed；
Profiles/Models/Skills/MCP/Data 页陈述「不可用」。复现命令见 `P06.md` §6。

## 8. 产品功能矩阵

完整矩阵（含证据等级与挂载点）见 `P06.md` §2。摘要：
窗口/侧栏/设置/命令面板/Command Center/发送 fail closed/退出回收为 `CLIENT_TESTED` 或
`WINDOWS_NO_SERVICE_VERIFIED`；**Appearance 是 r3 起的产品页**（主题/缩放/通知/快捷键等中立能力 +
语言/resume/终端字体三个 Desktop 本地偏好，均为 Windows r3 必需步，`WINDOWS_NO_SERVICE_VERIFIED`）；
Workspace、Profile、Provider/Model、Session、
history/event、审批、队列为 `WAITING_FULLSTACK`（客户端完成，止于同一个 lifecycle connection 缺口）；
Skills/MCP/备份为 `WAITING_PERIPHERAL_CONTRACT`；legacy 退役面为 `NOT_APPLICABLE`
（**其中 Bot Mode 自 r3 起在产品中真正退役**：发现边界与磁盘门双重拒绝，不再是「默认启用但列为退役」）。

## 9. `REAL_FLOW_VERIFIED = 否`

原因：无真实 Server/Harness/模型链路证据。前端生产组合启动于 `activeConnection = null`
（`electron/composition/agentbox-service-composition.ts:31,58`），`workcore/slot.ts` 无生产安装者，
`agentbox-wire-transport.ts:98` 返回 typed `UNAVAILABLE`。因此：
`UI_READY` 成立；`CONTRACT_CLIENT_READY` 成立（wire-v1 客户端/fixture 锁定且 28 方法均有生产调用者）；
`REAL_FLOW_VERIFIED` **不成立**。三者不互相替代。

## 10. 后端集成人下一步（不需要前端重新取得写权）

1. **安装 lifecycle connection**：由后端在 `workcore` slot 安装
   `{ endpoint, sessionToken }`（唯一生产安装点目前为空），满足 loopback 判据与 token 交付要求。
2. **无模型联调**（按此顺序）：`server.hello` → `workspaces.*` → `profiles.*` /
   `providerModels.*` → `config.describe` / `config.resolve` → `sessions.*` → 事件流
   （`history.snapshot` → 订阅 → 缺口 resync）→ `queue.*` / `runs.stop` → `approvals.decide`。
   重点反例：同 `requestId` 幂等回查、双游标语义（顶层 `cursor` 仅续点、`page.cursor` 仅向旧翻页）、
   队列终态（`completed/failed/cancelled` 移出活动投影）、审批失效族、发送 rejected 保留草稿。
3. **再按单独授权**运行真实模型闭环（需要凭据来源与预算的单独批准）。
4. 跨端修复只改必要文件，两端分别提交，不 push/merge 主分支；每次更新两端状态与定向回归证据。

前端在此期间**不再写入**（§12）：`writer_lease = RELEASED`，无新前端 writer、无子代理、无未交接修改。

## 11. 已知环境基线与外围合同等待项

- WSL loopback 基线：2 个 electron 文件在 WSL 下 `ECONNREFUSED`（Windows 同测试通过）。
- 产品不再发起任何 legacy REST 请求（r3：renderer 残余 `[]`、main refusals 0），Appearance 页面
  也在其中——**r2 时登记的两条残余现已全部关闭**（`P06.md` §14.1）：
  - **Appearance 设置页**（`#/settings?tab=appearance`）不再读 `GET /api/config`：`SettingsView`/
    `AppearanceSettings` 取得必填 `authority`，agentbox 分支**根本不构造** Hermes-config 组件
    （测试在 renderer 门**打开**时断言 0 次调用），resume 与终端字体改为 Desktop 本地偏好。
  - **`hermes-bots` session sweep 的 `/api/profiles/sessions` 读取**：该插件在 agentbox 下不再注册，
    sweep 不启动；用户机器上历史独立安装的磁盘副本也被同一策略拒绝（`hermes-bots:retired`
    仅作可见的禁用行），因此无「需活服务才可达」的残留路径。
- **Bot Mode 在产品中退役**（发现边界 + 磁盘门，非 UI 隐藏）：无 New Bot 命令、无 Bots/Routines/
  群聊入口、无 `hermes.plugin.hermes-bots.*` 存储；`hermes-bots` 实现按既有先例保留不删。
- 4 个 Bot Mode Playwright spec（`bot-roster-user-sections`、`bot-mode-tab-shows-bot-name`、
  `group-to-local-bot-handoff`、`bot-mode-row-click-mirrors-registry`）描述的是已退役的面：它们本就需要
  外部真实 Hermes runtime（无则带原因 skip），不在 P06 门内、本轮未改；若将来要保留，需要一条
  明确 Hermes authority 的组合（当前生产只有 agentbox 组合）。
- `history.snapshot` 旧页游标（`olderCursor`）已进投影但产品聊天未挂载「向上翻旧页」。
- `SessionPickerOverlay` 潜在未门控（当前不可达）。
- 未删除的 legacy 模块清单见 `P06.md` §8。
- 外围合同（Skills / MCP / Data / 备份恢复）尚未下单，页面保持诚实不可用。

## 12. 前端已停止写入

r1 提交（分支内，不 push）：

1. `eef059a9` — `fix(desktop): keep the AgentBox shell off the legacy runtime`
2. `test(desktop): add the independent acceptance gate` — P06 Windows 独立验收驱动 + 纯 helper。
3. `fix(desktop): let the product runtime own the connecting overlay and the REST door`
4. `docs(desktop): record the independent implementation handoff`
5. `docs(desktop): release the frontend implementation lease`

诚实性返修提交（用户显式重新授予有限写权）：

6. `f47e5219` — `fix(desktop): make the product shell stop asking for the legacy REST surface`
   （产品四条 legacy 控制流关闭 + 驱动 fail-closed 五处修复）
7. `1ed11197` — `fix(desktop): earn the boot-coverage proof instead of failing on the launch race`
   （含 r2 第一次运行的失败证据 `P06-assets-r2-attempt1/`）

product-surface closeout 提交（用户本派单一次性重新授予有限写权）：

8. `3b22aae7` — `fix(desktop): close the P06 product-surface gaps the r2 GREEN paused on`
   （Appearance 必填 authority 与字面不挂载、Desktop 本地 locale/resume/终端字体偏好、
   Bot Mode 在发现边界与磁盘门的退役、驱动新增 6 条必需步与 7 张截图清单）
9. docs：`evidence/P06.md` §14、本文件、`evidence/P02.md`/`P04.md`/`P05.md` 追加更正、`status.md`
   （r3 记录与 release 行）

`status.md` 终态：P06 = `P06_GREEN — FRONTEND_INDEPENDENT_ACCEPTANCE`（r3 证据）、
`DESKTOP_IMPLEMENTATION_READY`、`REAL_FLOW_VERIFIED=否`、
`AGENTBOX_DESKTOP_PRODUCT_GREEN=否/待全栈`、`writer_lease=RELEASED`。
**lease 释放后本前端 goal 不再写任何文件**（含文档 amend）。后端可按
`docs/desktop-product-delivery/handoff-policy.md` 的双门规则接管全栈。
