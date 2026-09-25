# LNX-001 · parts/linux-chain — Linux 原生运行链证据调查

- 任务：LNX-001 §D（Linux 运行链与验证入口），只读证据收集。
- 采样时间：2026-09-21。调查开始与结束时各仓库 HEAD 与基线计划一致：
  desktop chat `agent-box-desktop-next-wsl-round1` @ `08b4eac7`（feature/agentbox-desktop-product）、
  desktop settings `agent-box-desktop-settings-round1` @ `01083212`（feature/agentbox-desktop-settings）、
  后端 service `agent-box-env-provider` @ `003b52b2`（feature/env-provider-v1）、
  后端 runtime `agent-box-runtime-round1` @ `a7b7b6ff`（feature/env-provider-runtime）、
  退休调度树 `agent-box-server-round1` @ `577b47ad`（feature/server-harness-extension-v1，活运行时基础设施，只读）。
- 全程未构建、未运行、未启动/连接任何服务、未读取凭证与用户数据目录内容（只登记路径与存在性）。
- 路径缩写：
  - `RT:` = `/home/maoqh/projects/agent-box-runtime-round1`
  - `EP:` = `/home/maoqh/projects/agent-box-env-provider`
  - `DC:` = `/home/maoqh/projects/agent-box-desktop-next-wsl-round1`
  - `DS:` = `/home/maoqh/projects/agent-box-desktop-settings-round1`
  - `SR:` = `/home/maoqh/projects/agent-box-server-round1`（调度树，退休但含活脚本）

---

## §1 端到端调用链（分跳）

| # | 跳 | 证据（repo + 分支 + path:line） | Linux 上的实际形态 |
| --- | --- | --- | --- |
| 1 | 桌面主进程组装连接 | DC@product `apps/desktop/electron/main.ts:841` 调 `installAgentBoxServerConnection`；`electron/workcore/agentbox-server-connection.ts:74` 读 `ORDESSA_SERVER_ROOT`/`AGENTBOX_SERVER_ROOT`，`:100-112` 端口（默认 `8732`，`:51`），`:46` token 路径 `<root>/secrets/http-token`，`:145` endpoint `http://127.0.0.1:<port>` | **桌面从不启动服务**。缺 env / 缺 token → 记由 `root_unset`/`token_unavailable` 类原因后整条线"无服务"（`:186-200`）。`electron/workcore/lifecycle.ts:44-49` 明文："No Work Core is implemented in this repository and none is wired into boot"；`electron/app/product-runtime-policy.ts:1-5` runtime=agentbox，legacy-hermes 不自启 |
| 2 | 用户选工作区 | DC@product `src/app/composition/wiring/agentbox-main-chat.ts:132-153`：WSL 行→`{kind:'wsl'}`，项目树节点→`{host:null,kind:'local',user:null}`；`src/application/workspace/wire-workspace-catalog.ts:72` `workspaces.open` | "local" 环境种类在 UI 已存在（`wire-workspace-catalog.ts:144-146` 也按 local 匹配既有 workspace）。但工作区向导 UI 只有 WSL 版（`src/features/workspace/wsl-workspace-wizard.tsx:181`），本地项目走项目树路径 |
| 3 | 渲染进程 → 主进程 IPC | DC@product `apps/desktop/electron/preload.ts:28-30`（`wire.request`/`subscribeEvents`）→ `electron/ipc/workcore-wire-ipc.ts:88`（`agentbox:wire:request`）→ `electron/composition/agentbox-service-composition.ts:59-68` | 平台无关 |
| 4 | wire/协议客户端 | DC@product `electron/security/agentbox-wire-transport.ts:49`（`POST <endpoint>/wire/v1/<method>`，loopback 策略）；`agentbox-wire-event-transport.ts:61,130`（WS `/wire/v1/event-stream`，`authorization: Bearer`） | 平台无关；token 文件由同机同用户读取，Linux 上语义成立 |
| 5 | 服务端鉴权与路由 | RT@runtime `src/agent_box/server/transport/http/app.py:132`（`/wire/v1/{method}`）、`:110-115`（Bearer 恒时对拍）、`:330-353`（WS，`:66` 仅允许 loopback Host/Origin）、REST `:283-302` sessions/turns、`:377` cancel | 服务绑定 `127.0.0.1`（`__main__.py:59`），Linux 原生可用 |
| 6 | 服务端会话与 turn 生命周期 | RT@runtime `src/agent_box/server/wire/handlers.py:125,345`（`sessions.send`）、`:129`（`runs.stop`）→ `server/sessions/service.py`（队列/事件追加）→ `server/execution/sidecar_backend.py:168` `SidecarExecutionBackend`、`:210` `accept()` 冻结 profile+权限 | 平台无关；`secret_store is None` 时凭据分支即断（见 §2-B） |
| 7 | 每回合装配：placement → harness → sandbox 选择 | RT@runtime `bootstrap/runtime.py:826-889`（factory：`:830` deployment 查找、`:837-846` 凭据读取、`:863-869` placement 解析、`:886` `resolve_sandbox_port(_sandbox_provider_name(...))`）；`execution/placement.py:44-74`（local→`local-process`；wsl/ssh 需 connector）；`bootstrap/runtime.py:1236-1255`（`:1255` 非 Windows 默认 `sandbox-bwrap`） | 本地 Linux：`env_kind=local` → `LocalSidecarLauncher`（`runtime.py:1122`）。WSL/SSH 分支在 Linux 上因 `_builtin_connector` 仅 `nt` 组合（`runtime.py:141-146`）而 typed-refuse（`placement.py:53-56`）——语义正确 |
| 8 | sidecar 启动（本地通道） | RT@runtime `execution/local_channel.py:420-533`：staged view 写入 bundle（`:432-436`）、secret 0600（`:438-443`）、home prepare（`:447+`）、`sandbox_port.compose_sidecar_room`（`:497`）、`subprocess.Popen(room.argv, start_new_session=(os.name!='nt'))`（`:526-528`）；Windows Job Object 仅在 `nt`（`:518`） | POSIX 路径为主干，Linux 原生代码存在且为默认分支 |
| 9 | bwrap 房间（sandbox 插件） | RT@runtime `plugins/agent-box-sandbox-bwrap/src/agent_box_sandbox_bwrap/sidecar_room.py:35-51`（guest env：`HOME=/runtime/home`、XDG 派生、`PATH=/usr/bin:/bin`、`LANG=C.UTF-8`）、`:124` → `provider.py:207-381` `compile_remote_sidecar_bwrap_argv`；最终 `argv = ["/usr/bin/bwrap", "--unshare-user","--unshare-pid",...] … ["--","/usr/bin/node","/runtime/view/agentbox-sidecar/runtime/worker-entry.mjs"]`（`provider.py:330-334,381`） | 模板自称"remote/WSL 模板"，但 local channel 复用它：guest 内 ro-bind `/usr /bin /lib /lib64 /etc`（`provider.py:43`），并 ro-bind `/etc/resolv.conf → /mnt/wsl/resolv.conf`、`--dir /mnt/wsl`（`provider.py:339-351`）——WSL 形状，Linux 上多半无害但见 §2-D/§5 |
| 10 | harness 适配器与选择 | bundle 来源 RT@runtime `bootstrap/runtime.py:787` `sidecar_bundle_files(root,...)` → `execution/sidecar.py:217-258`：读 `<plugin-root>/runtime/*.mjs` + `third_party/harness_remote`（EP@service `plugins/agent-box-harnesses/third_party/harness_remote/SOURCE.json` 钉 upstream harness-remote v3.0.2）；adapter 命令强制 `/usr/bin/node`（`bootstrap/runtime.py:550-558`）；harness 可执行文件经 `executableMounts` token 绑定到 `/runtime/bin/*`（`runtime.py:599-616`），runtime artifact 目录绑定 `/runtime/artifacts/*` | 工件全部来自 plugin-root 目录 + 操作者 `--mount TOKEN=PATH`（`__main__.py:20-24`）；EP@service 树 `plugins/agent-box-harnesses/runtime/` 含 mjs+node_modules+vendor tgz，RT@runtime 同目录缺 node_modules（整合时须带）|
| 11 | 流式回复消费 | RT@runtime `execution/sidecar.py:717,1125-1141`（channel chunk 流）→ 事件持久化+`EventNotifier`（`server/events/notifier.py:7`）→ WS 帧推送 `app.py:353-358` → DC@product `agentbox-main-chat.ts:311,343` `subscribeEvents` 消费投影 | 平台无关 |
| 12 | 错误/截断可见性 | RT@runtime `execution/sidecar.py:684-685`（`SIDECAR_OUTPUT_TRUNCATED` typed error 入流）、`bootstrap/runtime.py:842/846`（`CREDENTIAL_STORE_UNAVAILABLE`/`CREDENTIAL_NOT_AVAILABLE`）、`workspaces/local_environment.py:75-78,122-129`（`LOCAL_SANDBOX_UNAVAILABLE`）、`placement.py:52-74`（connector typed refuse）、cancel `app.py:377`+`handlers.py:129`；DC@product 渲染侧 `src/components/assistant-ui/thread/agentbox-turn-failure.test.tsx`（`TurnFailure` 于 `src/lib/chat-messages`） | 错误以稳定 code 贯穿到 UI；Linux 新增 code：`LOCAL_SANDBOX_UNAVAILABLE`、`CREDENTIAL_STORE_UNAVAILABLE` |

**结论（链路形态）**：Linux 原生"local placement → LocalSidecarLauncher → bwrap → node sidecar"这条主干在 runtime 线代码里**逐跳存在且有默认分支**；但链路的**两端各缺一环**——第 1 跳没有任何产品内手段启动 Server，第 6/7 跳的凭据 hop 在 Linux 上没有可用 SecretStore 实现（见 §2）。

---

## §2 Linux 适配缺口清单

判定标记：【缺】已证实缺失；【有】已证实存在；【?-】无法确认（静态）。

### A. 桌面不启动/无法发现服务（无 Linux 启动方案）【缺】
- `DC:electron/workcore/lifecycle.ts:44-49`：Work Core 契约有、实现与 boot 接线**没有**；`supervisor.ts` 在生产代码无调用者（grep 仅测试与 slot 类型）。
- 唯一连接方式 = 启动桌面**的进程**注入 `AGENTBOX_SERVER_ROOT/PORT`（或 ORDESSA_ 别名）：`agentbox-server-connection.ts:30-34` 注释明说 "read by the process that starts the Desktop (the integration driver, or an operator…)"。打包 AppImage/.desktop 启动没有 env → `root_unset`。
- 服务端产品入口存在但需人工组装：`RT:src/agent_box/server/__main__.py:9-24`（`--data-root` 必填、`--sidecar-deployment`+`--plugin-root`+`--mount`）；不带 deployment 时 `HarnessRegistry` 为空（`bootstrap/runtime.py:310-311`）→ `server.hello` 无 harness、`HARNESS_DEPLOYMENT_UNAVAILABLE`（`runtime.py:1052`）。
- 现存试用服务的启动脚本 `SR:scripts/server-round1/trial-serve-linux.py`（97 行）**只存在于退休调度树**；两棵产品后端树中均无 `*trial-serve*`（find 证实）。

### B. Linux 没有持久 SecretStore（整条凭据/订阅 hop 断）【缺】
- 组合根：`RT:bootstrap/runtime.py:319-320` `if secrets_store is None and os.name == "nt": WindowsDpapiSecretStore`（EP 线同逻辑 `:318-320`）→ Linux 默认 `secret_store=None`。
- 实现清单：`RT:src/agent_box/storage/secrets.py` 仅 `SecretStore`(Protocol `:19`)、`WindowsDpapiSecretStore`(`:72`，ctypes DPAPI)、`MemorySecretStore`(`:166`，进程内)。全树 grep 无 keyring/kwallet/libsecret/文件加密 store（EP/RT/SR 三树同）。
- 后果调用点：`POST /api/v1/credentials` → `RT:server/sessions/service.py:195-196` `CREDENTIAL_STORE_UNAVAILABLE`；回合内凭据读取 `bootstrap/runtime.py:839-846`；deployment 声明凭据启动即失败 `runtime.py:1378-1383`（`SIDECAR_DEPLOYMENT_CREDENTIAL_STORE_MISSING`）；订阅账号 `account_assets=None`（`runtime.py:354-358`）→ `ACCOUNT_STORE_UNAVAILABLE`（`runtime.py:1066-1068`）；一次性 CLI 硬编码 DPAPI（`server/credential_cli.py:31-34`）。
- 桌面侧凭据录入链（写 0600 临时文件→把路径交给 Server import：`DC:electron/workcore/agentbox-credentials.ts:128-148` + `ipc/agentbox-credentials-ipc.ts`）在 Linux 上全部落在上述 refuse。
- 现存活服务是**调度器工具注入 MemorySecretStore**绕过的：`SR:trial-serve-linux.py:4-9,57-61`（docstring 自述"Linux Server 没有 secret store，acceptance gates 正为此注入 MemorySecretStore；Nothing here is a product path"）。真实模型 API-key 路径在 Linux 上目前无产品化落点。

### C. Windows/WSL 硬编码清单及 Linux 分支走向
- `wsl.exe`/UTF-16 解码 hack：仅 `RT:plugins/agent-box-runtime-wsl/src/agent_box_runtime_wsl/connector.py:44,155-199,231-233`；该 connector 只在 `os.name=='nt'` 且 env 绑定时组合（`bootstrap/runtime.py:141-146,119-121`）→ Linux 上 wsl placement 得到 `WSL_CONNECTOR_UNAVAILABLE`（typed refuse，非崩溃）。【有正确降级】
- SSH 通道 import 了 WSL 插件的 `WorkerClient`（`RT:execution/ssh_connector.py:37`）：Linux 若走 SSH placement 仍需 runtime-wsl 包可导入——跨插件依赖，整合时注意。
- `/mnt/c`、盘符、UNC、`%APPDATA%`：两棵后端树 `src/` 无 `/mnt/c`、`C:\`、`%APPDATA%`（grep 无产品路径）；桌面 legacy 线有 WSL 字体修复 `/mnt/c/Windows/Fonts`（`DC:electron/host-capabilities/platform/wsl-fonts.ts:21`）与 git-bash（`find-git-bash.ts`），全部 IS_WINDOWS/IS_WSL 门控（`platform-facts.ts:17-24`；`bootstrap-platform.ts:15` 靠 `/microsoft|wsl/i` 判 WSL，原生 Linux 为 false）→ agentbox runtime 下不执行。legacy-hermes 启动链（`composition/bootstrap-env-composition.ts` 的大量 IS_WINDOWS 分支、`powershell.exe` `:1446`、venv `Scripts` `:1909`）因 `product-runtime-policy.ts:3-5` 不自启。【有】（legacy 线不阻断 agentbox 链）
- `subprocess.creationflags`/Job Object：`RT:execution/local_channel.py:518,528` `start_new_session=(os.name!='nt')`、`_new_process_job()` 仅 nt；后端源码无 `creationflags`（grep 零）。桌面有 `windowsHide`（POSIX 无害 no-op）。【有】
- GBK/编码 hack：仅 Windows 分支 `RT:bootstrap/runtime.py:118-141`（icacls/whoami 的 `errors="replace"`）；guest 侧 `LANG=C.UTF-8` 固定（`sidecar_room.py:45`）。【有】
- 真正的 Linux 侧硬编码（会咬人）：`/usr/bin/bwrap`（`provider.py:331` 模板字面量，而 `BwrapSandboxProvider` 探测却用 `shutil.which("bwrap")`，`provider.py:425`——两者可分裂：which 到别处则 probe 绿、房间拒）；`/usr/bin/node`（`provider.py:381` 房间末段 + `runtime.py:552` deployment adapter 强校验 + 桥 `runtime.py:1009-1011`）。本主机 `ls` 实测二者存在于 `/usr/bin`（node=apt 22.22），路径当前成立，但这是环境巧合不是契约。【有(存在)-存疑(契约)】
- WSL 模板形状进入 local 房间：`--dir /mnt/wsl` + `/etc/resolv.conf→/mnt/wsl/resolv.conf` ro-bind（`provider.py:339-351`，注释自认"The remote template is WSL-specific"）。原生 Linux 若 `/etc/resolv.conf` 是 systemd-resolved stub 符号链接，经 ro-bind `/etc` 后 guest DNS 是否可用——静态无法判定（§5）。【?-】

### D. 路径假设与数据根
- Server data-root：无默认、必填（`__main__.py:10`）；所有权锁 marker + `fcntl.flock` 在 POSIX 走 `runtime.py:66-68`（`RT:bootstrap/runtime.py:55-72`）【有】；token 文件 `secrets/http-token` chmod 0600（`:119-121`）【有】；objects/assets/accounts 均派生自 data-root（`:347-354`）。
- profiles（Profile native home）根：`RT:bootstrap/runtime.py:800` `local_home_root = <data-root>/profiles`（EP 线等价 `:787`），会话库 `_sessions/<harness>`（`:807-810`）。guest HOME 完全隔离在 `/runtime/home`，不触宿主 HOME（`sidecar_room.py:35-51`；`local_environment.py` 无 HOME 假设）。【有】
- 桌面数据根**没有配置面**，只有 env；文档锁死这一决定（`agentbox-server-connection.ts:30-34`）。整合时必须新造"谁写这两个 env"的机制（快捷方式 Exec、systemd、或产品内 launcher）。【缺】
- 登记（只登记，未读取内容）：`/home/maoqh/.agentbox-trial-chat`、`/home/maoqh/.agentbox-qa-2nd`（用户证据目录，属"不得触碰"清单）；本次 `ls -d /home/maoqh/.agentbox*` 未见同名条目，登记为"未在顶层 home 观察到，未进一步探查"。`harness-install-set.py:195` 默认输出 `/home/maoqh/.agentbox-all-harnesses`（同样未展开）。现存试用服务的 `--deployment /mnt/c/agentbox-uigate46/deployment.json` 位于 Windows 侧目录，本次按约束未读取。

### E. 运行时工件来源（哪些在仓库、哪些在外部）
- sidecar closure（node）：**在仓库**——`EP:plugins/agent-box-harnesses/runtime/{worker-entry.mjs,native-driver.mjs,profile_extensions.mjs,subagent-bridge.mjs,capability_declarations.json}` + `third_party/harness_remote`（SOURCE.json 钉 upstream commit）+ `runtime/{vendor/*.tgz, artifacts/SBOM.json}`；`node_modules` 仅 EP 树有（未安装则 `npm ci`，见 §3 gates）。RT@runtime 树 `runtime/` 缺 node_modules——整合需以 EP 的工件目录为准。
- harness CLI 可执行文件与 runtime artifact：**不在仓库**——deployment 文档只带 token+digest，路径由 `--mount TOKEN=PATH` 现场绑定（`RT:bootstrap/runtime.py:599-621`），工件由 `scripts/server-round1/build-<family>-runtime-artifact.mjs` 现场构建（codex builder 自述"含平台二进制 @openai/codex-linux-x64，Linux 目标"），install-set 总装 `scripts/server-round1/harness-install-set.py:1-16`。现存 deployment.json 在 `/mnt/c/...`（外部目录）。
- Worker 包（仅 WSL/SSH 通道需要）：`.acceptance-bundle-c4..c12,-c8,-musl` 实体在 `EP:workers/agent-box-worker/`；RT@runtime 树只有 Rust 源（Cargo.toml），bundle 需 `build-worker.sh` 产出。musl 版的存在说明已有 Linux 目标意识。
- 生成协议工件：wire-v1 schema 由 `EP:scripts/server-round1/wire_artifact.py` 发布，锁版在 `EP:docs/server-round1/fullstack/contract/wire-v1.schema.registered-c4255b31.json`；桌面消费为检入的 `DC:apps/desktop/src/types/wire/wire-v1.ts`（头注 `:17` 记生成来源）。Server 运行不读 schema 文件（`AGENT_BOX_WIRE_SCHEMA` 只被 gates/driver 注入，产品源码 grep 零）。【有】
- Python 锁文件：仅 `EP|RT:lockfiles/server-windows-py312.txt`（头部自述"validated on Windows CPython 3.12.10"）。**Linux 锁文件不存在**。【缺】
- pip 依赖声明缺口：根 `pyproject.toml:45-50` 的 `server` extra 含 `agent-box-runtime-wsl` 却**不含** `agent-box-sandbox-bwrap`/`agent-box-runtime-local`（只有 `preview` extra 含 `:32-43`）→ 按 "server" 装的产品机上 `resolve_sandbox_port("sandbox-bwrap")` 走 entry point 失败（`RT:src/agent_box/extensions/runtime_composition/sandbox_port.py:232-260`），未设 `AGENT_BOX_SANDBOX_MODULE` 即 `SANDBOX_PROVIDER_UNRESOLVED` → 打开本地工作区被 `LOCAL_SANDBOX_UNAVAILABLE` refuse（`workspaces/local_environment.py:208-226`）。插件确有 entry point 声明（`plugins/agent-box-sandbox-bwrap/pyproject.toml:12`）——问题是默认安装组合没把它纳入。【缺】

### F. bwrap / 原生依赖与权限
- 依赖声明：`apt` 层（bwrap、tmux、nodejs≥20）只在 CI 与 gates 里安装（`.github/workflows/ci.yml:34-37`），两棵后端树与桌面树的 README/pyproject/package.json 均无 Linux 系统依赖清单。【缺】
- 权限要求：房间 argv 含 `--unshare-user --unshare-pid --unshare-ipc --unshare-uts`（`provider.py:331-332`）→ 需要非特权 user namespace；probe 真跑 `bwrap … /usr/bin/true`（`provider.py:473-487`），所以 Ubuntu 24+/26 的 AppArmor userns 限制会如实翻译成 `LOCAL_SANDBOX_UNAVAILABLE`。本主机 `bwrap` 在 `/usr/bin` 存在【有】；**命名空间是否放行未验证**（跑 probe 即越界，§5）。
- Python 原生依赖：无 C 扩展（ctypes DPAPI 仅 nt 分支）；Node 原生依赖：桌面 `node-pty`（`DC:apps/desktop/package.json:132`）有 Linux staging（`scripts/stage-native-deps.mjs:118` ELF 分支）+ electron-builder linux 目标（`package.json:289-298`，`dist:linux` `:43`）。sidecar node_modules 为纯 JS ACP 包（`runtime/package.json` overrides 锁 `codex-acp 1.1.14`/`pi-acp 0.5.0`）。【有】

### G. 全栈验证驱动是 Windows 专用的【缺】
- `DC:apps/desktop/e2e/p42-fullstack-integration-driver.mjs`：`:95-96` `wsl.exe`、`:54` `py.exe -3.12`、`:21-23` Windows 视角 env（`\\wsl.localhost\...`）、`:409` 建 WSL 工作区；它是唯一贯穿 §1 全链的自动化（步骤表 `:60-83` 覆盖 turn/queue/stop/resync/approval/shutdown）。仓库内无 Linux 等价驱动。
- Playwright e2e 在 ubuntu 跑（`.github/workflows/e2e-desktop.yml:23`，xvfb `:89-94`），但 mock server 未实现 `/wire/v1`（`tests-js/scripts/mock-server.ts` grep 零命中）→ 覆盖的是 legacy-gateway UI，不是 agentbox 链。agentbox 渲染链的自动化在 vitest（ui project）+ p42，前者可在 Linux 跑、后者不能。

---

## §3 仓库内已声明的构建/测试/启动命令（本任务未执行）

后端（EP、RT 两树同构；来源 `RT:.github/workflows/ci.yml`、`pyproject.toml`、各插件 pyproject）：
- 单测（跳过集成）：`pip install -e '.[dev]'` + `pytest -q tests --ignore=tests/integration`（ci.yml:22-28）——Linux runner 即 ubuntu。
- 原生集成（真 bwrap/tmux）：`sudo apt-get install bubblewrap tmux` + `pip install pytest -e . -e plugins/{agent-box-harnesses,agent-box-runtime-local,agent-box-sandbox-bwrap,agent-box-terminal-session,agent-box-skills}` + `pytest -q tests/integration/native`（ci.yml:30-66；含能力 probe 步骤）。前置：bwrap userns 可用，否则 harnesses 子集自动 skip（`tests/integration/native/harnesses/conftest.py:9-28`）。
- 插件自有测试：`pytest -q plugins/<name>/tests`（ci.yml matrix :74-81）。
- Web 插件前端：`cd plugins/agent-box-web/frontend && npm ci && npm run test:run && npm run lint && npm run build`（ci.yml:100-108）。
- 产品启动：`pacthold-server --data-root D --port 8732 [--sidecar-deployment doc --plugin-root P --mount TOKEN=PATH]`（entry point `pyproject.toml:52-60` → `agent_box/server/__main__.py`）；`pacthold` CLI（doctor/plugins list/launch，`README.md:17-30`）。前置：deployment 文档（`scripts/server-round1/harness-install-set.py --output DIR [--artifact family=PATH]`）+ 已装插件 entry points。
- Windows 侧遗留脚本（不适用 Linux，登记存在）：`scripts/server-round1/accept-*.ps1`、`bootstrap-windows.ps1`、`build-worker.sh`、各 `*-production-chain-gate.py`（内部对 `workers/agent-box-worker/.acceptance-bundle-*` 有断言，如 codex gate `:1046`）。
- 试用（Linux，调度树工具非产品路径）：`SR:scripts/server-round1/trial-serve-linux.py --data-root … --port … --deployment … --plugin-root …` + `PYTHONPATH=<4 树 src>` + `AGENT_BOX_SANDBOX_MODULE=agent_box_sandbox_bwrap`（脚本 docstring `:1-19`）。

桌面（`DC:apps/desktop/package.json:17-79`，AGENTS.md「Testing」）：
- `npm run --workspace apps/desktop typecheck`；`npm test --prefix tests-js`；vitest projects：`test`、`test:ui`、`test:desktop:platforms`；聚合 `check`（:74）。
- 构建：`build`（含 `stage-native-deps.mjs`）、`dist:linux -- --linux AppImage deb rpm`（:43）；前置 node `^22.22 || ^24.11 || >=26`（:15）。
- e2e：`test:e2e`（Playwright，CI 在 ubuntu+xvfb）；`test:e2e:visual` 用 `cage`（Wayland，Linux 专属）。p42/p32/p20… 驱动为手动 integration driver（Windows 前置，见 §2-G）。
- 隔离实例：`scripts/dev-sandbox.sh`（bash，Linux 可用）——但它只隔离 `HERMES_HOME`/userData（legacy 语义），不含 AGENTBOX_SERVER_* 注入。

---

## §4 隔离验证路径（模拟 vs 真实模型）

可在 Linux 上用隔离数据跑（不产生模型调用）：
1. `tests/integration/native/*`（tmp data-root fixture、`LocalRuntimeHostProvider`+`BwrapSandboxProvider`+fake harness：`test_bwrap_formal_dispatch_vertical.py:19-27`）——真 bwrap、假模型；CI ubuntu 已在跑，是**最强的离线端到端证据**。
2. `RT:tests/server/test_harness_sidecar.py`：`LocalProcessLauncher(["node", …])` + `fake_acp_peer.mjs`/`stateful_acp_peer.mjs` 夹具（`:42,125-164`），以及带 `/usr/bin/node` digest 绑定 + `mount_bindings` 的 sidecar 用例（`:263-272`）——无沙箱或轻沙箱、零模型调用。
3. 全后端 `pytest tests --ignore=tests/integration`：MemorySecretStore/tmp_path 注入（如 `tests/server/test_provenance_wire_098.py` 等）。
4. 桌面 vitest（ui/electron projects）：wire 客户端与投影均用注入 stub（`agentbox-main-chat.test.tsx`、`workcore/*.test.ts` 用真子进程 fixture）。
5. 手动半链（Linux 原生可行，需操作者命令）：`pacthold-server` + fixture deployment（仿 p42 的 harness 文档：adapter=`/usr/bin/node` + 仓内 `fake_acp_peer.mjs`，零凭据）+ `AGENTBOX_SERVER_ROOT/PORT` 启动桌面 `npm run dev` —— 即"把 p42 的 Windows 假设换成 native 等价物"，这是整合后第一个可验收增量的最短路径。
6. 现存试用服务（18790/18810/18830）是用户证据——本任务及后续自动验证**都不得触碰/重启**。

必须真实模型才能验（且先需用户授权 + Linux 凭据方案落地，见 §2-B）：任何 `credentialId` 绑定的 provider 回合、订阅登录态 family 的账号导入/续用、真实 CLI harness（claude/codex/qwen…）在网络沙箱内的 API 可达性、usage 探针（`_usage_probe`）。

---

## §5 静态无法判定、必须实跑才能判定的项

1. 本机 bwrap userns 是否被 AppArmor/内核放行（`provider.probe()` 是唯一诚实答案；跑它=执行，越界）。
2. `/etc/resolv.conf` 在本机为符号链接时，WSL 形状模板（§2-C 末条）下 guest DNS/HTTPS 出网是否可用——只有真实模型或 curl-in-guest 能证（本任务禁 curl/禁跑）。
3. `pacthold-server` 默认组合 + `--sidecar-deployment`（local 文档）在**未 pip 安装插件**时 sandbox provider 是否可达（entry point vs `AGENT_BOX_SANDBOX_MODULE` 两梯，行为取决于安装方式）。
4. packaged Linux 应用（AppImage）启动时 env 注入的现实路径是否存在（快捷方式/systemd user env 是否被 `agentbox-server-connection` 读到）。
5. node-pty/electron 40 在本机图形栈（Wayland/xvfb）上的桌面级 e2e 稳定性；CI 的 xvfb 结论是否等价本机。
6. 本机 Python 3.14 与锁文件目标（py3.12）之间的兼容性——CI 只证明 3.12。
7. 现存三个试用服务当前健康度与各自 data-root 的实际内容（禁触）。
8. `/mnt/c/agentbox-uigate46/deployment.json` 里声明了哪些 mount token/digest——按约束未读，无法核对与仓内 builder 的一致性。

---

## §6 阻塞与未覆盖范围

- 未执行任何构建/测试/进程（任务边界）；上述"命令清单"均为**声明**而非通过记录。
- settings 树（DS@01083212）本轮只做连接面比对：`electron/workcore/agentbox-server-connection.ts` 与 chat 树逐字节相同（diff 无差异），settings 线增量集中在 `src/features/settings|profiles` UI，未逐跳展开——若 I 关心"配置持久化在 Linux 的闭环"，需另开一跳。
- 后端两线（EP/RT）在 chain 关键模块上的差异未做逐文件 diff（属 integration-analysis 交付物范围）；本部分只记录了会影响 Linux 链的差：env-provider 的 sandbox 默认按 host 而非 placement（`EP:bootstrap/runtime.py:861,1249`，RT 线已在 `:1250-1255` 修正）、node_modules 工件只在 EP 树。
- 未读取任何 `*credential*/*secret*` 文件、agentbox 数据目录、`/mnt/c/**`、本地 agent 配置；未扫描 home。
- 退休调度树中其余 9 个 gate 脚本与 5 个 accept-*.ps1 只登记名称与 bundle 断言点，未逐个精读。
