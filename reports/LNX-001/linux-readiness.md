# LNX-001 · Linux 原生运行就绪度

调查边界：只读。未构建、未测试、未启动/连接任何服务、未读凭证或用户数据内容。
逐跳全表与逐项证据在 `parts/linux-chain.md`（子调查）与 `parts/host-facts.md`（宿主实测），
本文件是给 I 的决策摘要。**〔复核〕** = 主会话用只读命令独立验证过该断言。

## 1 一句话结论

**Linux 主干代码是存在的、而且是默认分支；缺的是两端各一环。**
中段（本地 placement → `LocalSidecarLauncher` → bwrap 房间 → node sidecar → harness 适配 → 事件回流 →
UI 投影）在 runtime 线里逐跳可追，非 Windows 默认即 `sandbox-bwrap`
（`feature/env-provider-runtime:src/agent_box/server/bootstrap/runtime.py:1255`）。
断点在：**第 1 跳没有任何产品内手段启动/发现 Server**，**第 6–7 跳在 Linux 上没有可用的 SecretStore**。

## 2 链路（12 跳，详表见 `parts/linux-chain.md` §1）

```
桌面 main.ts:841 installAgentBoxServerConnection
 → electron/workcore/agentbox-server-connection.ts:74,100-112  读 ORDESSA_/AGENTBOX_SERVER_ROOT+PORT（默认端口 8732）
    ↳ 桌面不启动服务；无 env ⇒ root_unset，整条线"无服务"
 → preload.ts:28 wire.request → ipc/workcore-wire-ipc.ts:88 → agentbox-service-composition.ts:59
 → security/agentbox-wire-transport.ts:49  POST 127.0.0.1:<port>/wire/v1/<method>（Bearer token 来自 <root>/secrets/http-token）
 → 服务端 transport/http/app.py:132 路由、:110-115 恒时鉴权、:330-358 WS 事件流（仅 loopback Host/Origin）
 → wire/handlers.py:125,345 sessions.send → sessions/service.py 队列/事件
 → execution/sidecar_backend.py:168,210 SidecarExecutionBackend.accept()（冻结 profile+权限）
 → bootstrap/runtime.py:826-889 factory（deployment 查找 / 凭据读取 / placement / resolve_sandbox_port）
 → execution/local_channel.py:420-533 组房间并 Popen（start_new_session 于非 nt；Job Object 仅 nt）
 → plugins/agent-box-sandbox-bwrap/…/provider.py:207-381 compile_remote_sidecar_bwrap_argv → bwrap 内 /usr/bin/node worker-entry.mjs
 → sidecar.py:717,1125 chunk 流 → EventNotifier → WS 帧 → agentbox-main-chat.ts:311,343 消费
```

## 3 阻碍清单（按"会不会挡住第一次可运行"排序）

| # | 阻碍 | 判定 | 证据 |
| --- | --- | --- | --- |
| H1 | **Linux 没有持久 SecretStore** | 〔缺〕〔复核〕 | 组合根 `bootstrap/runtime.py:318-320`（EP）/`:319-320`（RT）`if secrets_store is None and os.name == "nt": WindowsDpapiSecretStore`；`storage/secrets.py` 只有 Protocol / DPAPI / 进程内 Memory 三形，全树无 keyring/kwallet/libsecret/文件 store。后果：`POST /api/v1/credentials` → `sessions/service.py:195-196` `CREDENTIAL_STORE_UNAVAILABLE`〔复核：源码逐字命中〕；deployment 带凭据启动即 `SIDECAR_DEPLOYMENT_CREDENTIAL_STORE_MISSING`（`runtime.py:1378-1383`）；订阅账号 `account_assets=None` → `ACCOUNT_STORE_UNAVAILABLE`。桌面凭据录入链（`electron/workcore/agentbox-credentials.ts:128-148` 写 0600 临时文件再交 Server import）在 Linux 上全部落进这个 refuse |
| H2 | **产品内没有 Linux 的 Server 启动/发现方式** | 〔缺〕 | `electron/workcore/lifecycle.ts:44-49` 原文："**No Work Core is implemented in this repository and none is wired into boot**"〔复核〕；唯一活脚本 `trial-serve-linux.py` 在退休调度树，两棵后端产品树 `*trial-serve*` 均无〔复核：`git cat-file -e` 一线 ABSENT〕。产品自带 CLI 存在（`src/agent_box/server/__main__.py`，64 行，`--data-root` 必填、默认 `--port 8732`〔复核〕）但它**没有凭据参数、不注 MemorySecretStore**（该文件 `credential` 命中 0〔复核〕）⇒ 与 H1 叠加后仍然起不了带凭据的回合 |
| H3 | **默认安装组合不装沙箱插件** | 〔缺〕〔复核〕 | `pyproject.toml` 的 `server` extra 只有 `fastapi/uvicorn/agent-box-harnesses`；带 `agent-box-sandbox-bwrap`/`agent-box-runtime-local` 的是 `preview` extra。后果：`resolve_sandbox_port("sandbox-bwrap")` entry point 失败 → 未设 `AGENT_BOX_SANDBOX_MODULE` 即 `SANDBOX_PROVIDER_UNRESOLVED` → 打开本地工作区被 `LOCAL_SANDBOX_UNAVAILABLE` 拒（`workspaces/local_environment.py:208-226`）。现存试用服务正是靠 env 变量手工兜底（`control/environments.md` §3） |
| H4 | **bwrap 房间沿用"remote/WSL 形状模板"，且二进制路径两处不一致** | 〔有(能跑)-存疑〕〔复核〕 | 房间 argv 硬编码 `"/usr/bin/bwrap"`（`provider.py:127,331`）而 provider 探测用 `shutil.which("bwrap")`（`:425`）——which 到别处则 probe 绿、房间拒；`--dir /mnt/wsl` + `--ro-bind /etc/resolv.conf /mnt/wsl/resolv.conf`（`:137-138`）与 `/usr/bin/node` 强校验（`:381`、`runtime.py:552`）。本主机 `/usr/bin/bwrap` 与 `/usr/bin/node` **确实存在**（bwrap 0.11.1、node 22.22 apt），但这是环境巧合不是契约 |
| H5 | **deployment 文档与 harness 工件全靠外部现场组装** | 〔缺〕 | 无 deployment 文档则 `HarnessRegistry` 为空（`runtime.py:310-311`）→ hello 无 harness、`HARNESS_DEPLOYMENT_UNAVAILABLE`；harness 可执行文件与 runtime artifact **不在仓库**，靠 `--mount TOKEN=PATH` 绑定（`runtime.py:599-621`），安装集由 `scripts/server-round1/harness-install-set.py` 产出。现存那份 deployment.json 在 `/mnt/c/...`（Windows 侧目录，本次按约束未读） |
| H6 | **Worker 工件承重但本机不可重建** | 〔缺〕〔复核〕 | `workers/agent-box-worker/` 下 `.acceptance-bundle-{c4,c8,c9,c10,c11,c12,musl}` 是 **ELF x86-64 可执行文件**（c11 2 260 784 B、musl 2 286 192 B，manifest 身份 `wireVersion 1 / workerVersion 0.1.0 / sha256 c1e353c8…、ce7fdeb2…`），并有 `target/x86_64-unknown-linux-musl/` 残留 ⇒ 本机做过 Linux musl 构建。**但全部在 git-ignore 目录、不在任何分支**，且本机 `cargo` **缺失** ⇒ 新主线只能继续依赖"原目录存在"。`.acceptance-bundle-c4/-c8` 已被用户裁定不得当缓存；在跑的 Windows 腿 S-3 直接引用 c11 |
| H7 | **没有 Linux Python 锁文件** | 〔缺〕〔复核〕 | 全树只有 `lockfiles/server-windows-py312.txt`（自述 validated on Windows CPython 3.12.10）。本机 Python 是 **3.14.4**，仓库声明 `requires-python >= 3.9` ⇒ 3.14 从未被任何 CI/门验证过 |
| H8 | **唯一贯穿全链的验证驱动是 Windows 专用** | 〔缺〕〔复核〕 | `apps/desktop/e2e/p42-fullstack-integration-driver.mjs` 含 `wsl.exe`/`py.exe` 共 5 处命中〔复核〕，步骤表覆盖 turn/queue/stop/resync/approval/shutdown；仓库内无 Linux 等价物。Playwright e2e 虽在 ubuntu 跑，但 mock server 未实现 `/wire/v1` ⇒ 覆盖的是 legacy-gateway UI，不是 agentbox 链 |
| H9 | service 线的沙箱默认按**宿主**而非 placement 解析 | 〔有差〕 | `EP:bootstrap/runtime.py:861,1249` 按 host；RT 线已在 `:1250-1255` 修正为按 placement。⇒ 若以 service 为基座会把一个已知错误形状带进 Linux 主线（与 `integration-analysis.md` §1.1 的方向一致） |

正确降级已在位、**不需要**新做的部分〔复核其中数条〕：WSL connector 与 `wsl.exe`/UTF-16 hack 只在 `nt` 组合（Linux 上 wsl placement 得 `WSL_CONNECTOR_UNAVAILABLE` 类型化拒，不崩）；`/mnt/c`、`C:\`、`%APPDATA%` 在两棵后端树 `src/` 无产品路径命中；legacy-hermes 的 Windows 分支由 `IS_WINDOWS/IS_WSL` 与 `product-runtime-policy.ts` 门控，agentbox runtime 下不自启；data-root 的 `fcntl.flock`、token 文件 0600、guest HOME 完全隔离于 `/runtime/home`（不触宿主 HOME）在 POSIX 成立；node-pty 有 Linux staging、electron-builder 有 linux 目标。

## 4 可用的验证入口（**均为声明来源，本任务一个都没跑**）

| 层 | 命令来源 | 覆盖 | 前置 |
| --- | --- | --- | --- |
| 后端离线单测 | `pytest -q tests --ignore=tests/integration`（`.github/workflows/ci.yml:22-28`） | 单元/协议/投影 | `pip install -e '.[dev]'` |
| **后端 Linux 原生集成** | `pytest -q tests/integration/native`（ci.yml:30-66，ubuntu runner，`sudo apt-get install bubblewrap tmux`） | **真 bwrap + 假 harness** 的形式派发垂直切片 | userns 可用；否则子集自动 skip（`tests/integration/native/harnesses/conftest.py:9-28`） |
| 后端 sidecar 假夹具 | `tests/server/test_harness_sidecar.py`（`fake_acp_peer.mjs`/`stateful_acp_peer.mjs`，`:42,125-164`、`:263-272`） | 本地通道 + `/usr/bin/node` digest 绑定，零模型调用 | — |
| 桌面 | `npm run --workspace apps/desktop typecheck`、`npm test --prefix tests-js`、`test:ui`、`test:desktop:platforms`、聚合 `check`（`apps/desktop/package.json:17-79`） | 渲染/投影/IPC，注入 stub | node `^22.22 \|\| ^24.11 \|\| >=26` |
| 桌面 Linux 产物 | `build`（含 `scripts/stage-native-deps.mjs`）、`dist:linux -- --linux AppImage deb rpm`（`package.json:43`） | 打包，**不证明可运行** | — |
| 全链活体 | `e2e/p42-fullstack-integration-driver.mjs` | 唯一贯穿链 | **Windows/WSL**（H8） |

## 5 最短可验收增量的候选路径（〔建议〕，依据是上表）

在 Linux 上把 p42 的 Windows 假设换成原生等价物，用**假 harness + 零凭据**跑通"桌面→服务→sidecar→回复"：
`pacthold-server --data-root <新建临时根> --port <临时端口> --sidecar-deployment <仿 p42 的 fixture 文档> --plugin-root <树内 runtime 目录> --mount …`
＋ 以 `AGENTBOX_SERVER_ROOT/PORT` 启动桌面；harness 侧用仓内 `fake_acp_peer.mjs`（adapter=`/usr/bin/node`）。
这样能在**不触真模型、不触在跑服务、不迁移用户数据**的前提下，把 H2/H3/H4/H5 一次性验穿，
而 H1（凭据）与真实模型回合**必然仍然红**——红要如实呈现，不能用假绿代替。
注意 RT 树的 `plugins/agent-box-harnesses/runtime/` 缺 `node_modules`（EP 树有）⇒ 工件目录以 EP 为准。

## 6 静态无法判定，必须实跑才能判定（不得当作已通过）

1. 本机 bwrap userns 是否被内核/AppArmor 放行（只有 `provider.probe()` 会诚实回答；跑它即越界）。
   宿主配置侧写：`max_user_namespaces=60432`、`unprivileged_userns_clone=1`〔实测〕——**配置允许不等于行为可用**。
2. `/etc/resolv.conf` 若为 systemd-resolved stub 符号链接，WSL 形状模板下 guest DNS/出网是否可用。
3. 未 pip 安装插件时 `pacthold-server` 的 sandbox provider 可达性（entry point 与 `AGENT_BOX_SANDBOX_MODULE` 两梯取决于安装方式）。
4. 打包后的 AppImage/.desktop 启动时，谁写 `AGENTBOX_SERVER_ROOT/PORT`（快捷方式 Exec / systemd user env 是否被读到）。
5. node-pty 与 electron 在本机图形栈（Wayland/xvfb）上的 e2e 稳定性；CI 的 xvfb 结论是否等价本机。
6. Python 3.14 对 py312 锁文件目标的兼容性。
7. 现存三个试用服务的当前健康度与其 data-root 内容（禁触）。
8. `/mnt/c/agentbox-uigate46/deployment.json` 声明了哪些 mount token/digest（按约束未读，无法与仓内 builder 对表）。

## 7 settings 线的覆盖说明

`parts/linux-chain.md` §6 记录：本轮对 settings 树只做连接面比对——
`electron/workcore/agentbox-server-connection.ts` 与 chat 树逐字节相同，settings 增量集中在
`src/features/settings|profiles` UI。**"配置持久化在 Linux 的闭环"未逐跳展开**，属本任务的剩余范围（见 `status.md`）。
