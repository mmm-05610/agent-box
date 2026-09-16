# Work Order 44 — Environment providers: local and SSH

状态：**READY_FOR_EXECUTION**。基线：本工单所在提交（见 `manifest.json` 的 44 条目）。
依赖：42（全栈交付）与 43（Harness 扩容）已交付的接缝；本单不重做它们。

本单把**环境层**（placement）里两个"声明了取值、没有实现者"的位置补齐：

```
环境层取值     今天的实现者                      本单要求
local          无（open_environment 直接拒绝）   本机 provider（经放置解析端到端可跑）
wsl            runtime-wsl + sandbox-bwrap     不变（回归门必须继续绿）
ssh            无（PLACEMENT_UNIMPLEMENTED）     SSH provider（connector + channel）
```

## §0 目标与验收

**目标**：同一份部署文档（已零宿主路径）、同一份房间、同一条命令，在 `local` 与 `ssh`
两种放置上都能跑通一轮对话；放不下来就**类型化拒绝**，绝不静默换地方。

**验收（全部要第一手证据）**：

1. `local` 放置：从**产品路径**创建本机工作区（API）→ 建会话 → 发一条消息 → 收到流式答复 →
   捕获状态 → 清理干净；
2. `ssh` 放置：同一流程，在实验机 `121.40.184.111` 上执行（Worker 与 bwrap 在远端）；
3. 四家既有假端点全链门（Pi/Hermes/Codex/OpenCode）**不退化**；
4. 全量套件不退化（基线：`886 passed / 6 skipped`，见 §1）；
5. 两份新证据文档 + status 分账；失败项按 §8 记账。

## §0b 开发位置（先读这一段）

你的工作树是 `/home/maoqh/projects/agent-box-env-provider`，分支 `feature/env-provider-v1`。
若它不存在，用 manifest 里 44 条目的 baseline 重建：

```bash
git -C /home/maoqh/projects/agent-box-server-round1 worktree add \
    /home/maoqh/projects/agent-box-env-provider -b feature/env-provider-v1 <44 的 baseline>
```

父工作树 `/home/maoqh/projects/agent-box-server-round1` 与前端仓
`/home/maoqh/projects/agent-box-desktop-next-wsl-round1` **只读**（只允许读、跑测试；不得写）。

## §1 现状（本单撰写时的第一手事实）

- **放置解析已经存在并能路由**：`src/agent_box/server/execution/placement.py`
  （`resolve_placement(kind, has_connector)`；`local → local-process`、`wsl → wsl-worker`、
  `ssh → PLACEMENT_UNIMPLEMENTED`、缺失/未知 → `PLACEMENT_UNKNOWN`）。
  测试：`tests/server/test_placement.py`（6 项，含驱动产品 port_factory 的用例）。
- **turn 上下文已带放置事实**：`sessions/repository.py` 的 `get_turn_context()` 现在 select
  `w.env_kind, w.env_host, w.normalized_path`。
- **本机通道已存在并端到端验证过**：`src/agent_box/server/execution/local_channel.py`
  （`LocalSidecarLauncher`：落位到临时目录 → 放密钥 0600 → 合成房间 → 直接执行 argv →
  stdio 接上 → 按共享规则收获状态 → 按进程组回收）。
  门：`scripts/server-round1/host-substitution-gate.py` → `HOST_SUBSTITUTION_GATE_OK`
  （**注意**：这条门是**直接构造**通道的，没有经过放置解析——见 §7 的门要求）。
- **产品路径的放置解析已接上**：`bootstrap/runtime.py` 的 `port_factory` 按
  `resolve_placement(...)` 构造 `WslSidecarLauncher` 或 `LocalSidecarLauncher`。
- **但 `local` 没有生产者**：`src/agent_box/server/workspaces/service.py` 的
  `open_environment()` 与 `browse_environment()` 在 `kind != "wsl"` 时直接
  `ServerError("CAPABILITY_UNSUPPORTED", ..., status=503)`（注释原文：本地选择属于 Electron
  宿主、SSH 执行端未接）。所以今天**任何 API 都创建不出 local 工作区**。
- **部署文档已零宿主路径**：`--plugin-root` + `--mount TOKEN=PATH` 由启动者绑定；
  文档出现宿主路径即 `SIDECAR_DEPLOYMENT_HOST_PATH`。
- **基线套件**：`tests` + 三家插件 = `886 passed / 6 skipped`；四家假端点门 exit 0
  （Codex/OpenCode 需要 `--worker …bundle-c8`）。

## §2 本机 provider（local）的范围

1. `open_environment(kind="local", path=...)`：在本机校验路径（存在、是目录、可读；可写与否
   如实上报而不拒绝），然后 upsert 一条 `env_kind="local"` 的工作区记录。`env_host`、
   `connection_id`、`remote_user`、`normalized_path` 取值自行决定并在证据里写明理由（要点：
   **不得为本地行伪造一个 WSL 连接 id**）。
2. `browse_environment(kind="local", path=...)`：按与 WSL 相同的条目形状列出目录
   （`name/kind/canOpen/canWrite/reason`）。
3. **类型化拒绝**：路径不存在 / 不是目录 / 不可读 / 越界（例如不允许的根）各有码；不允许
   以 500 或静默空列表作答。
4. **能力纪律**：本机房间仍用 bwrap（`agent-box-sandbox-bwrap`）。若本机跑不了 bwrap
   （例如 Server 在原生 Windows 上），必须**拒绝**并说明原因——不得假装成功。
5. 不做：前端选择器接线（前端仓只读）；Windows 原生沙箱实现（本单范围外，记录为缺口）。

## §3 SSH provider 的范围

1. **connector**（新，参照 `plugins/agent-box-runtime-wsl` 的 `WslConnector` 形状）：
   probe（连通性 + 远端用户身份）、browse（列目录）、open_workspace（校验远端路径并把
   `normalized_path/remote_user/connection_id` 落库）。
2. **channel**：把"落位 → 合成房间 → 起进程 → 收流 → 收获状态 → 回收"在 SSH 上实现一遍；
   实现方式二选一并在证据里说明：
   (a) 复用/泛化 `WslSidecarLauncher` 的传输层，把 `wsl.exe` 换成 ssh 命令；
   (b) 新增 `ssh_channel.py`，与 `local_channel.py` 同构。
   **要求**：通道不得知道 bwrap/房间语义（沿用 B/C 步的边界；本机通道就是范例）。
3. **房间**：仍是沙箱层的同一条 bwrap 命令行（远端已实测可用，见 §4）。
4. **凭据纪律**：SSH 私钥**只以 locator 形式使用**（路径由环境或部署传入），绝不复制进仓库、
   工作树、文档、argv、日志或证据；报告中只出现路径与权限位。
5. `resolve_placement("ssh", has_connector=...)` 从 `PLACEMENT_UNIMPLEMENTED` 改为解析到
   SSH 通道；**没有 connector 时仍然拒绝**（沿用现码）。
6. 不做：远端多用户/多租户、跳板机、密钥托管。

## §4 已知阻塞与资源事实（本单撰写时实测，SSH 实验机）

| 事实 | 值 | 影响 |
| --- | --- | --- |
| 主机 / 用户 | `121.40.184.111` / `root`（`ubuntu`、`maoqh` 均 Permission denied） | connector 默认用户 |
| 私钥 locator | `/home/maoqh/.ssh/maomaokingdom.pem`（0600；勿复制） | 只读使用 |
| 系统 | Alibaba Cloud Linux 3（OpenAnolis），x86_64 | RHEL 系 |
| **glibc** | **2.32** | ⚠️ **当前 Worker 二进制需要 GLIBC_2.39（实测 `objdump -T`）→ 直接跑不了** |
| bwrap | `/usr/bin/bwrap` 可用，实测 `BWRAP_OK`，`max_user_namespaces=7321` | 房间可建 ✅ |
| node / python | v22.23.2 / **python3 3.6.8** | node 够；**不要把 Server/门跑在远端** |
| 资源 | 2 vCPU / ~1 GB 内存 / 26 GB 空闲 | 只跑 Worker + sidecar + node |
| 已占用端口 | 80、443、8080 已监听 | 不要动这些服务 |
| 出网 | DNS 正常（api.deepseek.com 可解析） | 假端点可跑在远端 loopback |

**第一个要解决的事（先做，别写 provider）**：让 Worker 能在远端起来。建议顺序：

1. 先试 **musl 静态构建**（`workers/agent-box-worker` 用 `--target x86_64-unknown-linux-musl`
   构建 release；若依赖不允许，记录原因）；
2. 或找/造一个 glibc ≤2.32 的构建环境（容器内构建，工单允许在本地用容器，但产物要过门）；
3. 起来之后的**最小验证**：远端 `--version` 或控制协议 hello 能应答，再继续 §3；
4. 若三条都不可行：**停在这里**，按 §8 记账并跳过 ssh，把 local 做完（不得为了凑数放宽门）。

## §5 实验与复现

- 本机（门运行的机器）：Server 在 Linux/WSL 侧运行最省事（既有替换门就是这么做的）。
- 远端的只读探测（示例，勿把密钥内容写进任何文件）：

```bash
ssh -i /home/maoqh/.ssh/maomaokingdom.pem -o BatchMode=yes root@121.40.184.111 \
  'uname -m; node --version; bwrap --unshare-user --ro-bind / / /bin/echo OK'
```

- SSH 门建议把**假端点跑在远端 loopback**（远端入口起一个小 http server），或 `ssh -L` 隧道；
  两条路都要在证据里写明选择了哪条、为什么。

## §6 纪律（违反即返工）

- 真实模型调用：**默认零**。全部用 loopback 假端点；若确需真实调用，必须先取得用户对该阶段/上限的
  明确授权，并受全局 ≤¥10 约束。
- 凭据（SSH 私钥、模型 key）：只读注入、**绝不进 argv/日志/证据/截图/Git**；报告只写路径与权限位。
- 不 reset/stash/clean、不 merge main、不 push；只显式 stage 自己的路径。
- 父工作树与前端仓只读；不写前端文件。
- 不确定就走 §8（记账 + 跳过），不得伪造或放宽断言。

## §7 六件套 DoD（每家/每项都要齐）

1. **放置解析**：`ssh` 不再是 unimplemented（有 connector 时解析成功，无 connector 时仍拒绝）；
2. **provider 实现**：workspaces 的 open/browse 对 `local`（和 `ssh`）按 §2/§3 实现；
3. **部署文档零改动**：新放置必须用**同一份**部署文档跑通（不得为它们加宿主路径或新字段）；
4. **两条端到端门**：
   - `local-env-gate`：**经放置解析**（不是直接构造通道）创建 local 工作区 → 一轮对话 → 捕获 → 清理；
   - `ssh-env-gate`：同一流程在远端执行（Worker/bwrap 在远端）；
   两条门都要输出报告 JSON，并在报告里区分**机制证据**与（若有）真实模型证据；
5. **证据文档**：`docs/server-round1/fullstack/local-ssh-env-providers.md`（接入事实、门结果、阻塞账）；
6. **status 分账**：`docs/implementation/status.md` 增行，写明过了哪些门、哪些没观测。

## §8 阻塞账格式

| 项 | 卡在哪一步 | 命令 | 退出码 | 脱敏错误/现象 | 已排除的可能 | 下一步 |
| --- | --- | --- | --- | --- | --- | --- |

## §9 最终报告格式（必须给全）

- **过门 N 项**（local 门 / ssh 门 / 回归门各算一项）、**部分完成 M 项**、**阻塞 K 项**（逐条原因）；
- 四家既有门的回归结果；全量套件计数；
- 费用（真实调用次数；无授权则写 0）与请求数；
- 清理证据（临时目录、远端残留、进程）；
- 未做项与缺口（例如 Windows 原生沙箱、前端选择器）；
- 一句话结论：`ENV_PROVIDERS_DONE` 或诚实的 `ENV_PROVIDERS_PARTIAL`。
