# Work Order 48 — Windows 原生放置（AppContainer 沙箱 + Job 生命周期 + 环境物化）

状态：**READY_FOR_EXECUTION**（用户 2026-09-16 "写文档吧"；实现未开始）。
前置：**47（沙箱接缝）必须先落地**——否则又是一个"在 Server 里 import 具体沙箱"。
依据（本单不重复其论证）：
[windows-placement-provider-candidates.md](../../server-round1/windows-placement-provider-candidates.md)、
[windows-host-stack.md](../../server-round1/windows-host-stack.md)（含 §2b 重映射、§2c 物化）。

## §0 目标

在**真实的 Windows 主机**上把 Profile 方案跑起来：Server 在 Windows、harness 在 Windows、
沙箱是 AppContainer、生命周期由 Job Object 管、home 是**真实目录**、**不需要 Worker**。
能跑的家族跑通；跑不了的（例如没有 Windows 工件）**逐家如实声明**，不许"看起来能用"。

**验收（第一手证据）**：

| 门 | 断言 |
| --- | --- |
| **G1 spike 七问** | §3.A 的七个问题逐条有结论，尤其"**未授予路径的读是否被拒**"（决定能力怎么声明）与"AppContainer 进程能否同时入 Job" |
| **G2 一轮真机执行** | 在 Windows（非 WSL）上跑通一轮：Server → 沙箱 provider → AppContainer 里的 harness → 答复；home 落在真实目录；审计直接读目录完成（有界 + 截断记账 + 凭据扫描） |
| **G3 一致性门** | 47 的沙箱一致性门**对 Windows provider 通过**；**反例（把 home 做成重定向层）仍然必须失败** |
| **G4 生命周期** | 取消/停止 → Job 全灭、无孤儿进程、清理有界；45 的 G8（取消后仍连续）在 Windows 上重跑通过 |
| **G5 物化** | 配置与凭据按声明的载体到达（默认：配置走一次性目录 + 环境变量，凭据进进程环境块）；凭据不进 argv、home 零命中；兜底路径（就地 ACL 只读 / 一次性凭据文件）各有一条真机证据 |
| **G6 逐家** | 有 Windows 工件的家族逐个跑通一轮（真实模型按授权口径）；没有的逐家如实声明"该平台不可用 + 原因"，不得用假端点结果冒充 |
| **G7 不退化** | Linux 侧 44/45/46/47 的门与全量套件不退化 |

## §0b 位置与前置

工作树 `/home/maoqh/projects/agent-box-env-provider`，分支 `feature/env-provider-v1`
（44→45→46→47→48 同一执行者串行）。父工作树、扩展工作树、前端仓只读。
**阶段 A（spike）可以先跑**：它只写证据文档、不碰共享文件；**B 之后必须等 47 落地**。
不 reset/stash/clean、不 merge main、不 push；回父分支是之后单独一步。

## §1 本机第一手事实（撰写时实测，Spike 前先复核一遍）

| 事实 | 值 |
| --- | --- |
| Windows | 11 **专业版**，build **26200**（25H2），`HypervisorPresent=True` |
| Windows 沙箱 / 容器 | **均未安装**（`WindowsSandbox.exe`、`C:\Program Files\Windows Containers` 不存在） |
| Docker Desktop / Windows node | 均在（`docker.exe`、`C:\Program Files\nodejs\node.exe`） |
| 代码里的 POSIX 点 | `execution/local_channel.py:120-121`（`start_new_session=True`）、`:176/:181`（`os.killpg`/`os.getpgid`）→ 必须换成 Job |
| `runtime-local` 的 WSL 假设 | `provider.py:36 _wsl_info()`（按 `platform.release()` 判发行版）、`:75 libc_ver()` 当 ABI → Windows 分支要重写 |
| 终端层 | `direct_stdio` 是管道形态（可用）；`tmux` 在 Windows 不存在 → 如实声明不支持 |

## §2 设计决策（本单照此实现；有异议先停下讨论，不要自行改）

- **D1 形态**：`Server（Windows 进程）→ 沙箱 provider（AppContainer）→ harness 进程`。**无 Worker**、
  无跨边界通道；审计直接读目录。
- **D2 隔离**：AppContainer 能力式隔离 + **ACL 授予**（home RW、工作区 RW、配置/工件只读）。
  **不虚拟化**：home 必须是真实目录（重定向型做法由一致性门判失败）。
- **D3 生命周期**：Job Object —— 子进程经 `CreateProcess` 自动入 Job；`TerminateJobObject` 杀全树；
  `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` 保证"句柄关闭即无残留"；上限与账目（
  `QueryInformationJobObject`）顺手记入证据。
- **D4 物化**（Windows 没有 bind）：配置 → **一次性目录 + 环境变量**（首选，配置不进 home）；
  harness 只认 home 内固定文件名时才**就地写 + 该文件 ACL 只给读**（兜底）。凭据 → **进程环境块**
  （默认，不落盘）；必须落文件时落一次性目录 + ACL 只给容器 SID 读 + 用后即删。
  **临时路径**（Linux 侧的 tmpfs 遮蔽）：靠 harness 配置别写（Codex 的 `features.plugins=false` /
  `shell_snapshot=false`）＋执行后删除；审计如实标注"该子树未审计"，**不得记作已遮蔽**。
- **D5 能力声明**：读隔离**待 G1 实测**。拿得到 → 可声明读隔离；拿不到 → 如实降级为
  "写有界 + 凭据隔离"，**不许**把它当 bwrap 等价。所有能力按"声明 ∩ 观测"规则。
- **D6 不做**：Windows 沙箱（VM 形态不合 + 映射目录是重定向文件系统）、Windows 容器（client SKU
  代价最高）、Sandboxie（R5 冲突）、微过滤驱动、以及重映射（junction / 每进程盘符）——
  **除非**某家 harness 硬编码路径且不认环境变量，那时按整栈文档 §2b 用它，并记录原因。
- **D7 平台差异显式化**：`tmux` provider 在 Windows 声明不支持；`runtime-local` 加 Windows 身份分支
  （不要把 libc 当 ABI，否则身份摘要漂、亲和算错）。

## §3 阶段

### A spike（无模型，只写证据）

七个问题，逐条给结论 + 命令 + 观察（写进 `docs/server-round1/fullstack/windows-spike.md`）：

1. 非管理员能否 `CreateAppContainerProfile` 并启动进程；
2. **未授予路径的读是否被拒**（官方只说"读这一侧更松"，必须实测）；
3. AppContainer 进程能否同时入 Job（继承 / CREATE_SUSPENDED 两条路都试）；
4. `node.exe` + 一家真实 adapter（Pi 最省）能否在容器里起来并读到只读工件树；
5. 授 `internetClient` 后能否访问 `https://api.deepseek.com`（**只测连通性，不调模型**）；
6. ACL 只读（D4 兜底路径）能否真的挡住容器内的写；
7. 逐家核实 Windows 工件（门槛 B；查不到就逐家声明不支持）。

### B 沙箱 provider（新插件，形态照 47 的接缝）

- 实现 `agent-box.sandbox@1`：消费上层给的**需求**（home/工作区 RO-RW、只读输入、临时路径、
  凭据、网络姿态），产出隔离进程规范（argv + 环境 + 句柄）；
- ACL 授予与回收要做成幂等、可审计（授了哪些路径、给哪个 SID）；
- 启动器（`CreateAppContainerProfile` + `CreateProcess` 带令牌 + Job 绑定）是**唯一**的 Win32 层，
  其它层不得出现 Win32 调用；
- 能力声明按 D5，一条不许自报。

### C 宿主栈

- `local_channel` 的 Windows 路径：Job 取代进程组（`local_channel.py:120-121`/`:176`/`:181`），
  清理有界（Job 关闭 + 一次性目录删除）；
- 环境物化按 D4；`runtime-local` 的 Windows 身份分支；`tmux` 声明不支持。

### D 一致性门

- 47 的 `sandbox-conformance-gate.py` 增一个 Windows provider 的跑法；**反例仍必须失败**；
- 45 的 G8（取消后仍连续）在 Windows 上重跑。

### E 逐家与回归

- 有 Windows 工件的家族逐家跑一轮（真实模型按授权口径、逐笔记账）；没有的逐家声明；
- Linux 侧全部门 + 全量套件复跑（G7）；status 与文档收口。

## §4 硬性规则

- **不碰 wire**（28 方法、`wire/1`、事件 kind 与载荷）；**前端仓只读**。
- **真实模型**：沿用用户 2026-09-16 的 DeepSeek 授权口径（逐笔记账）；若届时口径有变，以用户当次
  指示为准。凭据只作 locator（`/home/maoqh/.agentbox-acceptance-secret.CnsAonj6/deepseek-api-key`，
  只写路径与权限位）；**绝不**读真实 `~/.codex` 等登录态；绝不打印/落盘到仓库/进 argv/日志/证据/Git。
- **能力不自报**：每条能力都要有一致性门或真机观测做依据；拿不到就声明 false。
- **不许把降级说成等价**：Windows 上若读隔离不成立，报告里必须显式写"低于 Linux 侧"，并在产品能力
  视图里如实反映。
- 不 reset/stash/clean、不 merge main、不 push；父/扩展/前端仓只读。

## §5 六件套 DoD

1. 实现（B/C 的提交）；2. 定向测试 + 反例（重定向型假 provider 必须被门判失败、ACL 只读反例、
   Job 全灭反例）；3. 真机证据（spike 七问、一轮执行、逐家矩阵）；4. 回归计数（Linux 侧全门 +
   全量套件）；5. status 分账；6. 清理证据（临时目录、注入值、进程、Job 句柄、Git 状态、
   `git diff --check`）。

## §6 阻塞账格式

与 46 §7 相同（现象 / 第一手证据 / 影响面 / 已尝试 / 为什么复杂 / 建议 / 当前状态）。
**spike 第 2 问若结论是"读不被拒"**，不要停下整单：按 D5 降级继续，并把结论写在报告最前面。

## §7 报告格式

```text
结果：WINDOWS_PLACEMENT_DONE 或 WINDOWS_PLACEMENT_PARTIAL
spike：七问逐条结论（命令 + 观察）；读隔离的结论单独置顶
能力声明表：每条能力 {supported | false} + 依据（门/观测）
真机一轮：Server/进程/home 各在哪、审计怎么读的、清理证据
逐家矩阵：家族 | 有 Windows 工件? | 跑通? | 请求数 | 费用 | 问题编号
一致性门：Windows provider 通过项 + 反例失败证据
不退化：Linux 侧各门 + 全量套件计数
未做项与阻塞项：逐条
清理与费用：临时目录、进程、Job、Git 状态；模型请求数 / 金额
```

## §8 边界

- **47 是前置**：接缝没落地前不许开 B（阶段 A 可以先跑）。
- **不做 Windows 的 UI 路径**（前端改造、Windows 上的完整人手路径）——那是更后面的单。
- **不做 Windows 侧的多用户/多机器**（一台机器一个 home 根这一条沿用 45 的结论）。
- 回父分支：之后单独一步。
