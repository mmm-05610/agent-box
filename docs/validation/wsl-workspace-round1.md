# Round 1 — Windows Desktop 添加 WSL Workspace：验收记录

工单：`docs/architecture/renderer-layer-batches/35-wsl-workspace-round1.md`
分支：`feature/desktop-wsl-round1`（工作树 `../agent-box-desktop-next-wsl-round1`）
基线：`main @ ce6c8156ace2c85c6ce9e22cb62aacc96011df81`
状态：**DESKTOP_WSL_WORKSPACE_R1_GREEN**（Windows 真机用户路径全部通过，2026-09-13）

## 检查点

| 阶段 | 提交 | 内容 |
| --- | --- | --- |
| A | `4d2da33` | WSL 宿主能力：discover（真实 `wsl.exe -l -v`，locale 容错解析）、connect（argv-only sh 探针核实 user/home）、listDirectories（`LC_ALL=C` ls 包装，路径走 argv 位置参数）、typed failure（code+安全文案+可重试）、deadline/输出上限/可取消操作、临时连接表（滑动 TTL）、save/list/reconnect（注入版本化 store）。27 个单元测试 + 真实 WSL interop 驱动全链路通过。 |
| B | `c8511c3` | `registerWorkspaceIpc`（hermes:wsl-workspace:*）+ preload `wslWorkspace` 桥 + main.ts 接线（`userData/wsl-workspaces.json`，版本化、原子写、幂等 requestId、损坏侧car）。renderer 侧 types/api/store/application 用例（保存失败零变更、刷新失败不清列表、重连 validating→validated/failed、重启重置为未验证）。 |
| C | `137d3e2` | 原位 UI：添加项目菜单（打开文件夹=既有流程 / 远程连接=向导）、四步向导（方式→配置→有界连接中可取消→真实目录浏览+隐藏目录+前往+上级）、迟到响应 latest-wins、保存失败保留选择、取消零保存；侧栏远程区块（名称+WSL 徽标+发行版+验证状态，无虚假在线态）；连接信息对话框（私有连接+重连+默认用户变化显式告警）。i18n：en/zh/zh-hant。 |
| D | `9d033bf` | Windows 验收驱动 `apps/desktop/e2e/wsl-workspace-round1-driver.mjs` + 本记录。 |

## 架构与边界

- 宿主能力在 `electron/host-capabilities/platform/wsl-workspace{,-store}.ts`，不 import
  `legacy-hermes/`；IPC 在 `electron/ipc/workspace-ipc.ts`；renderer 分层
  `types/ → api/ → application/ → store/ → features/`，层序账本守卫绿（无新增上行边）。
- 用户输入全部作为 argv 元素传给 wsl.exe（发行版、用户、路径为 sh 的位置参数），
  无 shell 插值；不读凭据；探针有 deadline 与输出上限。
- Workspace 元数据由 Electron 宿主持久化在隔离 app userData（`wsl-workspaces.json`，
  version=1），临时连接 id 只在本进程内有效；连接归 Workspace 私有，无共享连接库。
- 本轮不含：模型调用、Codex、Session、Work Core；远程项目无新建会话入口，UI 明示。

## 已验证（Linux 开发侧，真实 WSL interop）

- 真实 `wsl.exe` 全链路：discover（Ubuntu + docker-desktop，默认标记正确）→ connect
  （核实真实 user/home）→ 目录浏览（真实 Linux 树；含空格+中文目录 `/home/maoqh/wsl-round1-验收 目录/子目录`）→
  未知路径 → `WSL_DIRECTORY_NOT_FOUND` → save 幂等（requestId 重放不重复、同位置复用记录）→
  reconnect 成功。驱动：`/tmp/wsl-round1-probe.ts`（一次性，未入库）。
- Desktop typecheck（renderer/electron/e2e 三个 tsc 项目）全绿；eslint 变更文件 0 问题；
  `git diff --check` 干净。
- 全量测试（最终）：9608 通过 / 5 失败，5 个失败均为基线或工作树环境问题（见下），
  与本轮改动无关；层序账本守卫绿（未新增上行边）。

## 基线失败（与本轮无关，均可复现）

1. `electron/legacy-hermes/api-transport.test.ts` 1 例（live loopback 重试），
   main@ce6c815 同样失败（网络环境）。
2. `electron/host-capabilities/credentials/mcp-oauth-callback-ipc.test.ts` 3 例
   （loopback listener fetch），main@ce6c815 同样失败。
3. `src/dev/contracts/renderer-layers.test.ts` "leaves no in-flight exclusion stale"
   1 例：守卫的 `IN_FLIGHT` 引用未提交的未跟踪 POC 目录（`apps/desktop/src/agentbox/`），
   在不含该目录的干净工作树/克隆中必然失败。工单禁止为此删除守卫或复制 POC；在
   main 检出（存在该未跟踪目录）上该测试通过。

## Windows 真机验收

## Windows 真机验收

环境：Windows 11 + WSL2（Ubuntu 运行中），Windows Node v22.12.0（低于 engines
`^22.22.0`，以 `--engine-strict=false` 安装）、npm 10.9.0、git 2.50.1。

隔离实例：`C:\Users\maoqh\agentbox-wsl-round1`（分支克隆，HEAD `main` 分支
`feature/desktop-wsl-round1`），sandbox `C:\Users\maoqh\agentbox-wsl-round1-sandbox\{hermes-home,user-data}`，
应用名 `HermesWslRound1`（不与真实安装争单例锁）。

### 首跑门与真实网关

Windows 侧没有 Hermes 运行时，应用按设计停在首跑安装门（"Set up Hermes Desktop"）。
驱动走产品的"连接到已有 Hermes"路径：在 WSL 内以隔离 `HERMES_HOME`
（`/home/maoqh/wsl-round1-gateway-home`，无 provider 配置）启动真实
`hermes serve --host 127.0.0.1 --port 9127`（token 经环境注入，见下"回收"），
Windows Desktop 连接该真实网关后完整启动（状态栏 client v0.17.2 / backend v0.19.0）。
全程未发起任何模型请求，未读取用户凭据。

### 用户验收路径（驱动自动执行，15/15 通过）

驱动：`apps/desktop/e2e/wsl-workspace-round1-driver.mjs`；产物：本目录
`windows-acceptance/`（编号截图 + `acceptance-log.json` + `driver-run.log`）。

| # | 用户路径 | 结果 | 截图 |
| --- | --- | --- | --- |
| 1 | 应用在隔离实例打开（标题 Hermes） | PASS | 01-boot |
| 2 | 首跑门 → 连接真实 WSL 网关（Test connection 成功 → Apply and reconnect） | PASS | 02-gateway-tested |
| 3 | 侧栏项目入口可见 | PASS | 04-projects-overview |
| 4 | 添加项目 → 远程连接（空白态直连入口；有项目时为 "+" 菜单） | PASS | 05-add-project-menu |
| 5 | 向导·方式：仅 WSL 卡片 | PASS | 04-wizard-method |
| 6 | 向导·配置：真实 `wsl.exe -l -v` 发现，Ubuntu 为默认；用户留空=发行版默认 | PASS | 05-wizard-config |
| 7 | 向导·连接中：有界进度（真实 wsl 探针核实 user/home） | PASS | 06-connecting |
| 8 | 向导·目录：真实 Linux 树（/home/maoqh） | PASS | 07-browse-home |
| 9 | 前往含空格+中文目录 `wsl-round1-验收 目录`，进入 `子目录` 再返回上级 | PASS | 08/09 |
| 10 | 选择此目录 → 保存 → 侧栏 REMOTE 区块出现同级项目（名称/发行版+路径/未验证态/WSL 徽标） | PASS | 10-saved-sidebar |
| 11 | 连接信息（私有连接：发行版/用户/已核实身份/根目录）+ 重新连接 → Verified | PASS | 11/12 |
| 12 | 未知路径 `/definitely/not/here-9137` → 类型化错误"该目录不存在"，无保存 | PASS | 13-unknown-path-error |
| 13 | 取消第二次向导 → 侧栏行数不变（无假项目） | PASS | 14-after-cancel |
| 14 | 退出重开同一隔离实例 → 项目仍在，状态"未验证" | PASS | 15-reopen-unverified |
| 15 | 重开后重新验证 → Verified | PASS | 16-reopen-verified |

宿主持久化（`user-data/wsl-workspaces.json`，version=1）：单条记录
`{id: wsl_ws_66fa0e088b498d61, name: "wsl-round1-验收 目录", distribution: Ubuntu,
configuredUser: null, actualUser: maoqh, rootPath: /home/maoqh/wsl-round1-验收 目录}`；
跨多次运行的重复保存（不同 requestId）全部幂等去重到同一条。

### 验收中发现并修复的真实缺陷

1. 默认发行版只显示未写入 state，Connect 永久禁用（驱动第 7 步超时暴露）。
2. 空白态（零项目 fresh install）无法到达添加项目菜单——远程入口补进空白态。
3. REMOTE 区块原来放在 `showSessionSections` 条件内，空白侧栏不渲染，保存后行不可见。
4. 单行 flex 行中名称被徽标压缩为零宽，行读作"发行版"而非项目——改两行布局。
5. 连接后 $HOME 首列表的路径回显覆写用户正在输入的路径（竞态）——回显仅在用户未改动时生效。


<!-- WSL_R1_WINDOWS_RESULT -->

## 复现启动方法（Windows）

```bat
:: 一次性（已执行过，克隆与依赖均在）
cd C:\Users\maoqh\agentbox-wsl-round1
npm install --engine-strict=false --no-audit --no-fund
cd apps\desktop && npm run build

:: 1) 在 WSL 启动隔离网关（隔离 HERMES_HOME，token 随机生成写入 session-token.txt）
::    wsl -d Ubuntu -- /home/maoqh/wsl-round1-gateway-home/start-gateway.sh

:: 2) 隔离启动真实 Desktop（读取 session-token.txt 作为 WSL_R1_GATEWAY_TOKEN）
set HERMES_HOME=C:\Users\maoqh\agentbox-wsl-round1-sandbox\hermes-home
set HERMES_DESKTOP_USER_DATA_DIR=C:\Users\maoqh\agentbox-wsl-round1-sandbox\user-data
set HERMES_DESKTOP_APP_NAME=HermesWslRound1
set WSL_R1_GATEWAY_URL=http://127.0.0.1:9127
set /p WSL_R1_GATEWAY_TOKEN=<C:\Users\maoqh\agentbox-wsl-round1-sandbox\..\..\..\..\home\dummy 2>nul
::    （token 在 WSL 侧 /home/maoqh/wsl-round1-gateway-home/session-token.txt，手工粘贴）
npx electron .

:: 或一键完整验收驱动（截图 + acceptance-log.json）
cd apps\desktop
node e2e\wsl-workspace-round1-driver.mjs C:\Users\maoqh\agentbox-wsl-round1-sandbox <outDir>
```

说明：`hermes serve` 仅作为让 Windows Desktop 完整启动的真实网关（产品正规的
"连接到已有 Hermes" 路径）；本轮不经过它发送任何模型请求。用户也可在真实
Hermes 已安装的机器上直接启动 Desktop，跳过网关步骤。

验收用 WSL 目录（本轮创建，含空格+中文）：`/home/maoqh/wsl-round1-验收 目录/`（含
`子目录/`）。验收后该目录保留供用户复验；应用退出不关闭用户的 WSL 发行版。

## 待办与限制

- 本轮 GREEN 只证明 Desktop 的 WSL Workspace 能力；Codex、Session、Profile 隔离、
  Work Core 接入未验收。
- 目录名含换行符的场景不受支持（`ls -1` 行式输出）。
- `WSL_LIST_OVERFLOW`（目录条目超出 8MB 输出上限）返回类型化错误而非分页。
