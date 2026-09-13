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

## 定向返修（同分支第二轮，2026-09-13）

提交 `d010d48` + 证据更新提交。测试先行：4 个新测试先在旧实现上红，修复后绿。

1. **并发保存安全**：目录验证（远程读）移到提交区外；提交区经 promise 链串行化，
   区内"重新 load → requestId 幂等 → 同位置去重 → persist"。行为测试（门控 ls
   强制两者都持有旧快照后依次提交）：
   - 并发保存不同 Workspace → 两条均保留 ✓
   - 相同 requestId 并发重试 → 同一记录 ✓
   - 不同 requestId 并发保存同一位置 → 单条 ✓
   （配套：内存假 store 的 load 改为每次深拷贝，对齐磁盘语义，否则竞态不可观测。）
2. **新版存储保护**：`version > 1` 的存储文件读取抛
   `WslWorkspaceStoreFutureVersionError`，service 全部读路径经 `readStore()`
   返回 typed failure `WSL_STORE_FUTURE_VERSION`（不可重试），保存被阻止；
   测试断言读取+尝试保存后原文件字节不变。Renderer：新增错误文案（en/zh/zh-hant）、
   向导映射；侧栏刷新失败保留现有行并以 typed 原因告警（不再可能伪装成空列表）。
3. **验收断言修正**：驱动"取消不新增"改为比较 `data-wsl-workspace-row` 行身份
   集合 + 宿主 `wsl-workspaces.json` 记录集合前后一致（不再统计区块内全部 button）。
4. **手动验收入口**：文档重写为真实可执行步骤（网关启停脚本、通过启动门的操作
   顺序、精确退出与回收）；删除 home\dummy 占位命令。token 由网关运行时生成
   （首启生成、重启复用，权限 600），驱动经 UNC 直接读取、不经手不打印；
   明确标注依赖外部 Hermes 网关通过启动门是本轮已知限制，未修复启动架构。

### 本轮新验证 vs 沿用证据

- 本轮新验证（返修后）：
  - 定向测试 `wsl-workspace.test.ts` 31/31（含 3 个并发行为 + 新版本字节不变），
    `wsl-workspace-usecases` 11/11；
  - Desktop typecheck（3 个 tsc 项目）绿；变更文件 eslint 0 问题；`git diff --check` 干净；
  - Windows 真机：重建 dist 后驱动全量 15/15 两次（其中一次不注入 token 环境变量，
    端到端验证驱动经 UNC 自动读取网关生成的 token）；取消断言输出
    `rows before=[wsl_ws_66fa0e088b498d61] after=[…] ; host records unchanged=true`。
    `windows-acceptance/` 内截图与 log 已被本轮运行刷新。
- 沿用历史证据：首轮 15/15 的原始过程（首跑门连接、发现、浏览、保存、重开）与
  本轮运行覆盖相同路径；差异仅在断言方式与返修后的实现，上表逐步含义不变。

### 验收中发现并修复的真实缺陷

1. 默认发行版只显示未写入 state，Connect 永久禁用（驱动第 7 步超时暴露）。
2. 空白态（零项目 fresh install）无法到达添加项目菜单——远程入口补进空白态。
3. REMOTE 区块原来放在 `showSessionSections` 条件内，空白侧栏不渲染，保存后行不可见。
4. 单行 flex 行中名称被徽标压缩为零宽，行读作"发行版"而非项目——改两行布局。
5. 连接后 $HOME 首列表的路径回显覆写用户正在输入的路径（竞态）——回显仅在用户未改动时生效。


<!-- WSL_R1_WINDOWS_RESULT -->

## 复现手动验收步骤（Windows，可直接照做）

**已知限制（本轮如实声明）**：当前应用在 Windows 无本地 Hermes 运行时会停在
首跑安装门，因此验收需要先启动一个外部 Hermes 网关让应用通过启动门。这只是让
应用达到可操作状态的手段——本轮不修复启动架构、不宣称脱离 Hermes，也绝不经过
该网关发送模型请求。应用侧的 WSL Workspace 能力本身只走 Electron IPC，与网关无关。

### 一次性准备（本机已完成，重现时才需要）

```bat
git clone <本仓任意检出> C:\Users\maoqh\agentbox-wsl-round1
cd C:\Users\maoqh\agentbox-wsl-round1
npm install --engine-strict=false --no-audit --no-fund
cd apps\desktop && npm run build
```

### 每次验收

**第 1 步 — WSL 内启动隔离网关**（HERMES_HOME 隔离、无 provider；token 由网关
运行时随机生成，写入仅网关目录可见的 session-token.txt，权限 600；不硬编码、
不打印、不入库）。在 WSL 终端执行：

```bash
GATEWAY_HOME="$HOME/wsl-round1-gateway-home"
mkdir -p "$GATEWAY_HOME"
printf '# round1 acceptance gateway: intentionally provider-less\n' > "$GATEWAY_HOME/config.yaml"
cat > "$GATEWAY_HOME/start-gateway.sh" <<'SCRIPT'
#!/usr/bin/env bash
set -e
GATEWAY_HOME="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 首次启动生成 token；后续启动复用，桌面端保存的连接跨重启仍然有效。
if [ -s "$GATEWAY_HOME/session-token.txt" ]; then
  TOKEN="$(cat "$GATEWAY_HOME/session-token.txt")"
else
  TOKEN="$(openssl rand -hex 24)"
  printf '%s' "$TOKEN" > "$GATEWAY_HOME/session-token.txt"
  chmod 600 "$GATEWAY_HOME/session-token.txt"
fi
HERMES_HOME="$GATEWAY_HOME" HERMES_DASHBOARD_SESSION_TOKEN="$TOKEN" \
  nohup hermes serve --host 127.0.0.1 --port 9127 --skip-build > "$GATEWAY_HOME/serve.log" 2>&1 &
echo "gateway started (pid $!)"
SCRIPT
cat > "$GATEWAY_HOME/stop-gateway.sh" <<'SCRIPT'
#!/usr/bin/env bash
PIDS="$(pgrep -f 'hermes serve --host 127.0.0.1 --port 9127' || true)"
[ -n "$PIDS" ] && kill $PIDS 2>/dev/null; echo "gateway stopped"
SCRIPT
chmod +x "$GATEWAY_HOME/start-gateway.sh" "$GATEWAY_HOME/stop-gateway.sh"
"$GATEWAY_HOME/start-gateway.sh"
```

**第 2 步 — Windows 启动隔离 Desktop 并通过启动门**（三个环境变量保证与真实
安装完全隔离；独立应用名避免争单例锁）：

```bat
cd C:\Users\maoqh\agentbox-wsl-round1\apps\desktop
set HERMES_HOME=C:\Users\maoqh\agentbox-wsl-round1-sandbox\hermes-home
set HERMES_DESKTOP_USER_DATA_DIR=C:\Users\maoqh\agentbox-wsl-round1-sandbox\user-data
set HERMES_DESKTOP_APP_NAME=HermesWslRound1
npx electron .
```

应用打开后停在 "Set up Hermes Desktop" 门 → 选 **Connect to existing Hermes** →
Gateway URL 填 `http://127.0.0.1:9127` → 出现 token 输入框后，把 WSL 侧
`~/wsl-round1-gateway-home/session-token.txt` 的内容粘贴进 Session token →
**Test connection**（应显示 Connected to …）→ **Apply and reconnect**。

**第 3 步 — WSL Workspace 验收路径**（对应上表 3–15）：项目侧栏 → 远程连接
（空白态直连按钮；有项目时经 "+" 菜单）→ WSL → Ubuntu（用户留空）→ Connect →
前往 `/home/maoqh/wsl-round1-验收 目录` → 进出 `子目录` → **Use this directory** →
侧栏 REMOTE 行 → 连接信息 → Reconnect → 关闭应用重开复验。

### 精确退出与回收

1. 退出应用：关闭 HermesWslRound1 窗口（数据保留在隔离 userData，供重开复验）。
2. 停隔离网关（WSL 终端）：`"$HOME/wsl-round1-gateway-home/stop-gateway.sh"`
   —— 只杀 9127 上这一个 `hermes serve`，**不关闭你的 WSL 发行版**。
3. 或者一键完整验收驱动（自动经 UNC 读取网关自行生成的 token，无需经手；
   截图与 acceptance-log.json 落盘到输出目录）：

```bat
cd C:\Users\maoqh\agentbox-wsl-round1\apps\desktop
node e2e\wsl-workspace-round1-driver.mjs C:\Users\maoqh\agentbox-wsl-round1-sandbox C:\Users\maoqh\agentbox-wsl-round1-sandbox\acceptance-out
```

验收用 WSL 目录（含空格+中文，保留供复验）：`/home/maoqh/wsl-round1-验收 目录/`（含 `子目录/`）。

## 待办与限制

- 本轮 GREEN 只证明 Desktop 的 WSL Workspace 能力；Codex、Session、Profile 隔离、
  Work Core 接入未验收。
- 目录名含换行符的场景不受支持（`ls -1` 行式输出）。
- `WSL_LIST_OVERFLOW`（目录条目超出 8MB 输出上限）返回类型化错误而非分页。
