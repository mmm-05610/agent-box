# 环境 provider：local 与 ssh 两种放置端到端可跑（工单 44）

2026-09-17。执行者：环境 provider 会话（worktree `/home/maoqh/projects/agent-box-env-provider`，
分支 `feature/env-provider-v1`，基线 `47895e4`）。真实模型调用 **0** 次，费用 **¥0**。

## 0. 结论

**ENV_PROVIDERS_DONE**（6 件 DoD 全部有第一手证据；未做项见 §7，均不在本单范围）。

| 验收项（工单 §0） | 结果 |
| --- | --- |
| 1 local：产品路径 open → 会话 → 流式答复 → 捕获 → 清理 | ✅ `LOCAL_ENV_GATE_OK` exit 0 |
| 2 ssh：同一流程在实验机执行（Worker/bwrap 在远端） | ✅ `SSH_ENV_GATE_OK` exit 0 |
| 3 四家既有假端点门不退化 | ✅ 四门全部 exit 0（§4） |
| 4 全量套件不退化（基线 886 passed / 6 skipped） | ✅ **915 passed / 5 skipped / 0 failed**（§5） |
| 5 两份新证据文档 + status 分账 | ✅ 本文 + 两份门报告 JSON；status 已增行 |

## 1. 第一优先级：Worker 在 SSH 实验机上起来（§4 三条路）

工单 §4 实测：远端 glibc 2.32，原 Worker 二进制需要 GLIBC_2.39。**走通了第 1 条路
（musl 静态构建），无需第 2/3 条。**

- `rustup target add x86_64-unknown-linux-musl` 后
  `cargo build --locked --release --target x86_64-unknown-linux-musl`：一次通过
  （依赖全为纯 Rust：base64/libc/serde/serde_json/sha2/thiserror/tokio）。
- 产物：static-pie ELF，`file` = "statically linked"，
  `sha256:163e6d3e697ef946a6a16d7423509d590080de7bd4b14aebc2f9a600b5b12303`。
- 远端最小验证（§4.3）：scp 到 `root@121.40.184.111:/root/agentbox-worker/agent-box-worker`，
  `--version-json` 应答 `{"wireVersion":1,"workerVersion":"0.1.0"}`；随后用**真实
  `WorkerClient`**（ABW1，control protocol 3）经 ssh 驱动 `handshake`，Worker 回显
  `workerDigest`/`capabilities`/`limits`，探针结果 `SSH_WORKER_HELLO_OK`。
- 该 Worker 以 **同一份 c8 源码**构建（本 worktree 无 `workers/` 改动）；与父工作树
  历史摘要 `514f48a9…` 不同是 Rust 把构建路径嵌入二进制所致——本工作树路径不同、
  摘要必然不同。四家门在本工作树用本工作树的 bundle（`sha256:b4b58db1…`）复跑通过。

### 1b. 第一手发现：实验机 bwrap 0.4.0 跑不了房间（已解决，未放宽任何断言）

工单 §4 记载 "bwrap 可用、实测 BWRAP_OK"。本轮第一手实测**推翻了"房间可建"的推断**：
`/usr/bin/bwrap --version` = **bubblewrap 0.4.0**，不支持房间的 `--clearenv`
（Worker 终端帧 stderr：`bwrap: Unknown option --clearenv`，exit 1）。房间命令行是沙箱层的
产物，`--clearenv` 是环境卫生的一部分，**不得为迁就旧版本删改**。

处置（在实验机上解决，不降低门）：
1. 发行源（alinux3）最高只有 0.4.0；GitHub 出网被拒（api/download 均 404）。
2. 改用 Debian 源码包 `bubblewrap_0.11.0.orig.tar.xz`
   （sha256 `988fd6b232dafa04b8b8198723efeaccdb3c6aa9c1c7936219d5791a8b7a8646`，deb.debian.org），
   scp 到实验机，`dnf install meson ninja-build libcap-devel` 后 meson/ninja 构建。
3. 先用新二进制手跑含 `--clearenv` 的房间形状命令验证，再切换：
   原 0.4.0 备份为 `/usr/bin/bwrap-0.4.0.dist`（回滚：`install -m755
   /usr/bin/bwrap-0.4.0.dist /usr/bin/bwrap`，或 `dnf reinstall bubblewrap`）。
4. 切换后房间在远端可建，`ssh-env-gate` 全绿（§3）。

## 2. 本机 provider（local，§2）

新模块 `src/agent_box/server/workspaces/local_environment.py`：

- `open_environment(kind="local", path)`：校验（存在/是目录/可读/绝对路径/规范路径）→
  upsert `env_kind="local"` 记录。取值与理由：
  - `env_host=None`、`remote_user=None`：本机没有"远端身份"，伪造一个就是记一条假事实；
  - `connection_id` 由 `upsert_by_location` 自行生成（产品身份不是 connector 的环境 id，
    该函数本就 `del connection_id`）——**没有为本地行伪造 WSL 连接 id**；
  - `normalized_path = os.path.realpath(path)`：房间实际 bind 的目录，两个别名一个身份；
  - 旧列 `distribution NOT NULL` 落 `"local"`（放置自己的名字，不是借用的发行名）。
- `browse_environment(kind="local", path)`：与 WSL 同一条目形状
  （`name/kind/canOpen/canWrite/reason`），只读目录如实报 `canWrite=false`，非目录条目带
  `reason="not_a_directory"` 不静默丢弃。
- **类型化拒绝**（各有码，不 500、不静默空表）：
  `LOCAL_PATH_INVALID`(422)/`LOCAL_PATH_MISSING`(404)/`LOCAL_PATH_NOT_DIRECTORY`(422)/
  `LOCAL_PATH_NOT_READABLE`(403)/`LOCAL_PATH_FORBIDDEN`(403，根 `/` 不可作为工作区——房间把
  workspace 可写 bind 进房间，收下 `/` 等于把整台宿主机交给 guest)/
  `LOCAL_PATH_UNAVAILABLE`(503)/`LOCAL_SANDBOX_UNAVAILABLE`(503)。
- **能力纪律**：open 前问沙箱层（`BwrapSandboxProvider.probe()`，即生产只读系统根试跑）；
  跑不了 bwrap 的宿主（如原生 Windows）`open` 类型化拒绝，`browse` 不需要房间、不拒。
  probe 结果按进程记忆（`server.hello` 每次连接都会问）。
- 附件读取不再绕道 WSL connector：`WorkspaceService.read_workspace_file` 按记录的
  `env_kind` 分派；local 直接读本机（有界 8 MiB、`O_NOFOLLOW`、只读普通文件、路径不出
  已记录的 workspace）。

## 3. SSH provider（§3）

- **connector**：新 `src/agent_box/server/execution/ssh_connector.py`，形状与
  `WslConnector` 对齐（`probe`/`browse`/`open_workspace`/`client_for_workspace`/
  `read_workspace_file`）。probe 做三件事：远端 `id -un`（默认用户）、`sha256sum` 远端
  Worker 并与 manifest 摘要比对（不符 → `SSH_WORKER_DIGEST_MISMATCH`，一个被换过的
  Worker 不许上岗）、真实 `WorkerClient` handshake。
- **channel**：选择 §3.2 的 **(a) 复用/泛化传输层**——`WslSidecarLauncher` 改名
  `WorkerSidecarLauncher`（`WslSidecarLauncher = WorkerSidecarLauncher` 别名保留，四家门
  与既有测试零改动），它本就"向 connector 要 client、向沙箱层要房间"，换一台机器不改一行
  房间/捕获逻辑；`placement.py` 新增 `SSH_CHANNEL="ssh-worker"`，
  `resolve_placement("ssh", has_connector=…)` 有 connector 即解析、无 connector 拒绝
  （`SSH_CONNECTOR_UNAVAILABLE`，与 WSL 对称；`PLACEMENT_UNIMPLEMENTED` 从此无人认领，
  所有命名放置都有实现者）。
- **凭据纪律**：私钥只以 locator 使用。locator 由进程环境 `AGENT_BOX_SSH_IDENTITY_FILE`
  传入，connector 把它写进 **0600 的私有 ssh config**（`ssh -F`），**argv 里只有
  config 路径**，私钥内容与路径都不进 argv/日志/证据/Git；known-hosts 也在 connector 的
  0700 私有目录里（TOFU，`StrictHostKeyChecking accept-new`）；`close()` 删除该目录。
  证据只记录路径与权限位（0600）。
- 组合面：`_builtin_ssh_connector()` 从进程环境读
  `AGENT_BOX_SSH_WORKER_MANIFEST`/`AGENT_BOX_SSH_WORKER_REMOTE_PATH`/
  `AGENT_BOX_SSH_IDENTITY_FILE`（可选 `AGENT_BOX_SSH_PORT`）——与 WSL connector 同款
  "环境绑定、部署文档零字段"。

## 4. 两条端到端门（§7.4）

同一脚本 `scripts/server-round1/env-provider-gate.py --placement local|ssh`，
**同一份部署文档**（两个报告里 `deploymentDocument.sha256` 逐字节相同 =
`sha256:6026b9…`；文档零宿主路径、零新字段，受控 peer 以 plugin-relative `source`
进 reviewed bundle）。流程全部走产品路径：`server.hello` → `workspaces.open`
（**经放置解析**的 port_factory，门从不自己构造通道）→ 同一位置重开保 id →
`workspaces.browse` → profile → 会话一（流式 delta 先于 completed）→
会话二（附件，`image:text/plain:<sha256>` 证明房间看到的就是目标机 workspace 里的那几个字节）→
capture/cleanup 状态与清理核验。

| 门 | 结果 | 报告 |
| --- | --- | --- |
| local | exit 0，`LOCAL_ENV_GATE_OK`，channel=`local-process` | `docs/server-round1/fullstack/env-provider-gate-local.json` |
| ssh | exit 0，`SSH_ENV_GATE_OK`，channel=`ssh-worker`（Worker/bwrap 在远端） | `docs/server-round1/fullstack/env-provider-gate-ssh.json` |

- 清理证据：local——本机无 `agentbox-local-channel-*` 残留（对照运行前快照取差集）；
  ssh——远端 `/tmp/agentbox-worker-r1` 下除 Worker 自身 root 标记外 **0 个文件**、
  `pgrep -x agent-box-worker` = **0**、门用远端 workspace 已删除。
- **机制证据 vs 真实模型证据分账**：两门均为 **no-model fixture**（受控 ACP peer，
  `fake_acp_peer.mjs`）；报告 `model.realModelRequests=0`、`cost={authorizedRealModelCalls:0,
  estimatedCny:0}`。本门主张的是放置与通道，不主张任何模型验收。

### 四家既有门回归（同为 exit 0）

| 门 | 结果 | Worker |
| --- | --- | --- |
| Pi | `PI_PRODUCTION_CHAIN_GATE_OK`（两轮、第二轮带上下文、重开、凭据/出网守卫全绿） | c8 bundle `sha256:b4b58db1…` |
| Hermes | `HERMES_PRODUCTION_CHAIN_GATE_OK` | 同上 |
| Codex | `CODEX_PRODUCTION_CHAIN_GATE_OK` | 同上 |
| OpenCode | `OPENCODE_PRODUCTION_CHAIN_PREPARED`（现行通过标记） | 同上 |

工件复用本轮联调已有的固定外部工件（`/tmp/agentbox-*-ui-artifact`，摘要与登记一致：
Pi `afe238d3…`、Codex `9051b844…`）。

## 5. 全量套件

`tests` + harnesses + sandbox-bwrap + runtime-wsl（与基线同一口径）：
**915 passed / 5 skipped / 0 failed**（基线 886/6/0）。增量全在本单方向：
`tests/server/test_environment_providers.py`（22 项：local 校验/拒绝/沙箱纪律、记录不伪造
host、locator 不进 argv、摘要不符拒绝、目标/端口校验等）+ placement/wire 契约改写 +
**两条因基线环境缺 release Worker 而一直被 skip 掩盖的既有用例修复后转绿**
（`runtimeArtifactMounts` 的 fixture 仍用已废弃的 `source` 键，改为现行 `token`+绑定）。

修复过程中顺手修掉的两个真实缺陷：

1. **本机通道零凭据即崩**：`LocalSidecarLauncher.launch` 无条件 `self.credential.strip()`，
   无凭据执行（本门正是这种形状）必然 `AttributeError`。改为 `(credential or b"").strip()`
   （空 forbidden-content 在 state 扫描里本就是 no-op）。
2. **`_connector_call`/`_ssh_call` 丢关键字参数**：分派 `read_workspace_file` 时
   kwargs 被吞（`method(*args)`），附件路径 100% 失败。改为 `method(*args, **kwargs)`。

能力诚实性变化：`workspaces.*` 能力从"有 WSL connector 才 True"改为
`WorkspaceService.readiness_blockers()`（connector（wsl/ssh）任一在位，或本机沙箱可用）；
无任何 provider 时如实报 `LOCAL_SANDBOX_UNAVAILABLE`/`WSL_CONNECTOR_UNAVAILABLE`。
wire 未动：28 方法、`wire/1`、错误 12 族不变，仅内部码 → 族映射新增本单的类型化码
（`LOCAL_PATH_*`、`SSH_*` 等，未知内部码仍落 `UNAVAILABLE` 族并在
`details.internalCode` 保留原名）。

## 6. 运行命令（复现）

```bash
PYTHONPATH=src:plugins/*/src python3 scripts/server-round1/env-provider-gate.py --placement local
AGENT_BOX_SSH_WORKER_MANIFEST=$PWD/workers/agent-box-worker/.acceptance-bundle-musl/manifest.json \
AGENT_BOX_SSH_WORKER_REMOTE_PATH=/root/agentbox-worker/agent-box-worker \
AGENT_BOX_SSH_IDENTITY_FILE=<locator> \
PYTHONPATH=src:plugins/*/src python3 scripts/server-round1/env-provider-gate.py --placement ssh
```

实验机现状（清理后）：`/root/agentbox-worker/agent-box-worker`（部署的 musl Worker）、
`/usr/bin/bwrap` = bubblewrap 0.11.0（原 0.4.0 备份于 `/usr/bin/bwrap-0.4.0.dist`）、
`/root/bubblewrap_0.11.0.orig.tar.xz` 与构建目录 `/root/bw-build`、`/root/bubblewrap-0.11.0`；
`/tmp/agentbox-worker-r1`、`/tmp/agentbox-env-gate` 已清空，无残留 worker 进程。

## 7. 未做项与缺口（均在工单明示的范围外）

- 前端选择器接线（前端仓只读，工单 §2.5 明示不做）。
- Windows 原生沙箱实现（§2.5 明示不做；本机 provider 在该宿主会类型化拒绝）。
- SSH 远端多用户/多租户、跳板机、密钥托管（§3.6 明示不做）。
- `experimental` 置换：无。三条未放宽：只读配置 / tmpfs 遮蔽 / 受保护路径原样保留；
  两条门没有为通过而放宽任何断言。
