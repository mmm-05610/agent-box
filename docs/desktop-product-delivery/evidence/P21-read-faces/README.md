# P21 真实环境证据：构建产物真跑 + 服务在环的读面（2026-09-18）

工具链：Node v22.23.2 / Electron 40.10.2（本轮补装，见下）/ Xvfb / playwright-core（CDP 附着）。
服务：`agent_box.server`（`/home/maoqh/projects/agent-box-env-provider`，PYTHONPATH 运行，未安装包）。

## 0 为什么能跑起来（三处环境缺口与处置）

| 缺口 | 现象 | 处置 |
| --- | --- | --- |
| Electron 二进制未下载 | `apps/desktop/node_modules/electron/path.txt` 空、`dist/` 不存在 ⇒ electron 项目的 3 个 0-test 文件失败 | `node install.js` 5 分钟超时；改为直接 `curl` GitHub release 的 `electron-v40.10.2-linux-x64.zip`（115 MB，实测可达）解到 `node_modules/electron/dist` + 写 `path.txt`。**未改任何仓库文件**（node_modules 不入库） |
| playwright `_electron.launch` 在本机失败 | `Process failed to launch!`（应用的 dbus/GPU 噪声淹没握手） | 驱动自己 spawn Electron + `--remote-debugging-port`，用 **CDP 附着**取到同一个窗口 |
| 服务侧"本地工作区"被拒 | `workspaces.open` → `UNAVAILABLE: this host cannot run the sandbox room a local workspace needs` | 根因实测：bwrap 本身可用（`bwrap --ro-bind / / --dev /dev true` exit 0，`BwrapSandboxProvider().probe()` = `available`），是**服务进程缺插件根**：补 `PYTHONPATH` 四个根 + `AGENT_BOX_SANDBOX_MODULE=agent_box_sandbox_bwrap.port`（PYTHONPATH 运行时没有 entry point，必须显式指名） |

## 1 构建产物真跑（DoD-3）

驱动：`apps/desktop/e2e/p21-built-app-smoke.mjs`（无服务场景）

```bash
cd apps/desktop && xvfb-run -a node e2e/p21-built-app-smoke.mjs <outDir> --port 9444
# [p21-smoke] 7/7 PASS
```

| 步骤 | 观测 |
| --- | --- |
| build-present | `dist/electron-main.mjs` 存在 |
| app-spawned / devtools-ready | Electron 进程起、DevTools 端口可连 |
| window-opened | 窗口标题 **Ordessa** |
| renderer-mounted | `root children=1 chat=true phase=unavailable` |
| screenshot | `p21-built-app-boot.png`：横幅 "Pacthold service is unavailable"、空态 "Waiting for the Pacthold service…"、输入框 "Sending is on hold — choose a project (and a role) to start"、页脚 "Service ● Gateway is not connected" |
| 日志事实 | 主进程日志有 `install stamp: 3545335b3bf9 (feature/agentbox-desktop-product) from local`（即 P21 阶段 3 的提交）；渲染层反复调 `agentbox:wire:request` 得到 `AgentBoxWireHostUnavailableError: UNAVAILABLE`——**这正是本单 4b 修的那条路径**：失败带类型化原因，而不是消失 |

**结论**：构建产物真的能跑；没有服务时它说的是"没有服务"，不是假装连上。

## 2 服务在环的读面（真实后端 + 真实 git 仓库）

驱动：`apps/desktop/e2e/p21-read-faces-driver.mjs`

```bash
cd apps/desktop && AGENTBOX_SERVER_SOURCE_ROOT=/home/maoqh/projects/agent-box-env-provider \
  xvfb-run -a node e2e/p21-read-faces-driver.mjs <sandboxRoot> <outDir> --port 18757
# [p21-read] 13/13 PASS
```

| 步骤 | 观测（真实值） |
| --- | --- |
| fixture-repo | 真 git 仓库：`branch=fixture-branch`、改动 2 行/删 2 行、1 个未跟踪文件、**无 upstream** |
| server-live | 服务答 `/live` |
| service-connected | 应用 `data-agentbox-service-phase=ready`（不再是 no-service 外壳） |
| workspace-registered | `workspaceId=ws_507ebb776f324ef8ab5189a1bbc3b1d6` |
| **git-face-truthful** | `workspaces.gitStatus` 答 `{branch:"fixture-branch", changedFiles:2, additions:2, deletions:2, ahead:null, behind:null, reason:null}`——**与 `git` 自己算的一致**（驱动先跑真 git 取期望值再比对），`ahead/behind` 是真的拿不到 |
| profile-created / session-created | 角色与会话真实建立（id 见结果 JSON） |
| inventory-answered | `executions.list` 答 `rows=0`（本机没有在跑的执行） |
| session-opened | 真聊天视图打开该会话（sidebar 行在本机没有 shell 行可挂，走 `#/<sessionId>` 路由——仍是产品自己的视图） |
| **panel-shows-git** | 面板展开后 Git 卡文本逐字：`Branch fixture-branch / Changed files 2 / Additions 2 / Deletions 2 / Ahead Not obtainable (unknown) / Behind Not obtainable (unknown)` + `Refresh` 控件；折叠行 = `Failed fixture-branch 0:00` |
| panel-inventory-card | 台账 0 行 ⇒ **执行卡不渲染**（无事实不画卡） |

截图：`01-panel-collapsed-with-branch.png`、`02-panel-expanded-git-card.png`（同目录）。
结果 JSON：`p21-read-faces-results.json`（逐步 status + detail）。

## 3 这轮**没有**验到的（如实登记）

1. **执行清单卡带真实行**：本机 `executions.list` 恒为 0——本机 placement 是 `local`，而本地执行需要 bwrap room + worker/harness 物化，本轮把服务跑通后那条 turn 以 `Failed` 结束（面板进程卡里可看到）。要在真实行上看到 `pid` / `PID_NOT_REPORTED`，需要在支持 placement 的宿主（Windows + WSL，即既有验收驱动那台）跑。
2. **记忆分区与角色页增量**没有在驱动里导航到角色页截图：它们的诚实规则由纯函数测试（9 条）与角色页渲染测试（7 条）覆盖，服务侧形状由合同测试与后端代码第一手核对覆盖；真实服务上的角色页截图留给下一单的 UI 门。
3. **真实模型调用**：本轮 0 次（R-0011 已授权，但这条驱动用的是**假 ACP peer** fixture，不需要模型）。真实端的 UI 门按 R-0011 归"P21 之后的真实 UI 门"。

## 4 复现命令（主机侧同样适用）

```bash
# 1 构建
npm run --workspace apps/desktop build
# 2 无服务冒烟
cd apps/desktop && xvfb-run -a node e2e/p21-built-app-smoke.mjs /tmp/p21-smoke --port 9444
# 3 服务在环读面（Linux/WSL；Windows 侧把 xvfb-run 去掉、python3 换 py.exe -3.12）
cd apps/desktop && AGENTBOX_SERVER_SOURCE_ROOT=<env-provider checkout> \
  xvfb-run -a node e2e/p21-read-faces-driver.mjs /tmp/p21-read /tmp/p21-read --port 18757
```

两个驱动都会 `server.kill()` / `app.kill()` 收尾；沙箱目录在 `--outDir` 同级，删掉即可。
