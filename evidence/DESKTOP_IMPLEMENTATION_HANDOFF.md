# AgentBox Desktop — 前端实现交接（DESKTOP_IMPLEMENTATION_READY）

本文件是前端 goal 交给后端/全栈集成人的唯一入口。配套证据 [`evidence/P06.md`](P06.md)（本阶段
独立验收）与既有 [`evidence/P02.md`](P02.md)、[`P04.md`](P04.md)、[`P05.md`](P05.md)、
[`P05-final-audit.md`](P05-final-audit.md)、[`P05-client-matrix.md`](P05-client-matrix.md)、
[`P07.md`](P07.md)。

## 1. 分支与 HEAD

| 项 | 值 |
| --- | --- |
| 工作树 | `/home/maoqh/projects/agent-box-desktop-next-wsl-round1` |
| 分支 | `feature/agentbox-desktop-product` |
| 本阶段起点 HEAD | `9ecf1a0a6b0b38dd8196ca263e3554061d8618d0` |
| 实现 HEAD（代码，含本阶段修复） | 见 §12 的提交列表；`eef059a9` 为第一轮修复，第二轮的连接遮罩/渲染端 legacy 门随实现检查点提交 |
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

Linux/WSL（本轮实跑，详见 `P06.md` §4）：

- 三项目 typecheck **exit 0**；`apps/shared` typecheck **exit 0**；`tests-js` **8 files / 47 tests passed**。
- 完整 Desktop Vitest：**987 files（2 failed / 983 passed / 2 skipped）、10218 tests（4 failed / 10208 passed / 6 skipped）**。
  - **UI 815 files / 7915 tests，0 failed**
  - **Electron 172 files / 2303 tests，4 failed**（`legacy-hermes/api-transport.test.ts` 1、
    `host-capabilities/credentials/mcp-oauth-callback-ipc.test.ts` 3；均为自建 loopback 服务在本
    WSL 环境 `ECONNREFUSED`，不 import 本阶段改动模块）
- 完整 lint **exit 0，0 error / 141 warning**（全部为本分支未改动文件的既有警告）。
- 层序/合同守卫 3 files / 30 tests；`IN_FLIGHT = []`。
- 构建 exit 0；`src/`/`electron/` 无 TS 影子 `.js`；dist 新于全部源码。

Windows（`C:\Users\maoqh\agentbox-wsl-round1`，tracked 源码按 `git ls-files` 同步，逐文件 SHA-256 一致）：

- `npm run build` 通过（vite + electron bundle + native deps stage）。
- loopback 裁决：`npx vitest run --project electron <两个文件>` → **2 files / 32 tests passed, exit 0**
  ⇒ WSL 的两个失败文件定性为 **WSL 环境基线**。
- P06 原应用验收驱动：**20 PASS / 0 FAIL / 0 SKIP / 0 PENDING**（`results.json`）。

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

## 7. 无服务启动方式

不提供任何 Server/Harness/凭据/模型即可直接启动（`HERMES_HOME` 指向空目录与无 provider 的
`config.yaml`）。预期：主窗口立即出现；侧栏与设置可用；不出现全屏遮罩；发送入口 fail closed；
Profiles/Models/Skills/MCP/Data 页陈述「不可用」。复现命令见 `P06.md` §6。

## 8. 产品功能矩阵

完整矩阵（含证据等级与挂载点）见 `P06.md` §2。摘要：
窗口/侧栏/设置/命令面板/Command Center/发送 fail closed/退出回收为 `CLIENT_TESTED` 或
`WINDOWS_NO_SERVICE_VERIFIED`；Workspace、Profile、Provider/Model、Session、
history/event、审批、队列为 `WAITING_FULLSTACK`（客户端完成，止于同一个 lifecycle connection 缺口）；
Skills/MCP/备份为 `WAITING_PERIPHERAL_CONTRACT`；legacy 退役面为 `NOT_APPLICABLE`。

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
- 1 处渲染端 legacy 读取（`/api/config`）在渲染端门前被拒、不产生 IPC、不触达 Hermes；
  关闭它需要 wire 偏好项或外围 MCP 合同（详见 `P06.md` §6 残余）。
- `history.snapshot` 旧页游标（`olderCursor`）已进投影但产品聊天未挂载「向上翻旧页」。
- `SessionPickerOverlay` 潜在未门控（当前不可达）。
- 未删除的 legacy 模块清单见 `P06.md` §8。
- 外围合同（Skills / MCP / Data / 备份恢复）尚未下单，页面保持诚实不可用。

## 12. 前端已停止写入

本阶段提交（分支内，不 push）：

1. `eef059a9` — `fix(desktop): keep the AgentBox shell off the legacy runtime`
   （B10 失败面板 legacy 网关设置、B11 状态栏连接切换器、B12 四个 legacy 视图与入口、preload 空白）。
2. `test(desktop): add the independent acceptance gate` — P06 Windows 独立验收驱动 + 纯 helper + 15 单测。
3. `fix(desktop): let the product runtime own the connecting overlay and the REST door` — 第二轮：
   连接遮罩 authority、渲染端 legacy REST 门。
4. `docs(desktop): record the independent implementation handoff` — 本文件 + `P06.md` + assets +
   P02/P04/P05 追加 + status 更新。
5. `docs(desktop): release the frontend implementation lease` — `status.md` 终态行，`writer_lease=RELEASED`。

`status.md` 终态：P06 = `P06_GREEN — FRONTEND_INDEPENDENT_ACCEPTANCE`、`DESKTOP_IMPLEMENTATION_READY`、
`REAL_FLOW_VERIFIED=否`、`AGENTBOX_DESKTOP_PRODUCT_GREEN=否/待全栈`、`writer_lease=RELEASED`。
**lease 释放后本前端 goal 不再写任何文件**（含文档 amend）。后端可按
`docs/desktop-product-delivery/handoff-policy.md` 的双门规则接管全栈。
