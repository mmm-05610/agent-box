# 四家 Harness 原生 HOME 双重收敛隔离（架构决策）

日期：2026-09-14。分支 `feature/server-harness-extension-v1`。状态：

```text
PROFILE_NATIVE_HOME_ISOLATION_DESIGN_LOCKED
implementation = PENDING_HARDENING
```

本文只**锁定设计**，不代表任何一家已实现、已迁移或已复验。它不构成
`BACKEND_IMPLEMENTATION_READY`，不提高 `workbench_model_verified_count`，也不替代四家真实模型门。
四家的现有假端点全链门在本设计实施前保持**历史有效**；完成目录迁移后**必须重跑**，不得用旧门
为新区局背书。

## 1. 核心决策（锁定）

1. **安全边界由 bwrap 的 mount namespace 提供**：进程能看见哪些目录是挂载决定的。**环境变量本身
   不是隔离边界**——把变量指对，不等于把目录换掉；把目录换掉而变量未收敛，则原生程序会去它自己
   的默认路径找状态，两者必须同时成立。
2. **Windows Server 保持 Profile/Session 权威**：Windows 侧仍是 Profile 与 Session 的唯一权威；
   **不得**把 Windows 权威 Profile 根长期直接 RW 挂给 Worker（那等于把权威数据面暴露成远端可写）。
3. **Server 为每次 execution 生成有界 WSL Profile view**：Worker 校验该 view（路径、摘要、边界）后
   由 bwrap 映射到 guest 的 `/runtime/home`；execution 结束时**只回收批准的状态子树**，其余按声明
   丢弃。
4. **双重收敛**：每家**同时**设置隔离 `HOME` **与其原生专用变量**，让"原生默认路径"与"显式路径"
   指向**同一份投影**（同一目录的两种寻址方式，而非两份拷贝）。
5. **用户真实 HOME 与登录态不得进入 guest**：用户的真实 `~`、真实原生配置目录（如 `~/.codex`、
   `~/.hermes`、`~/.pi`、`~/.config/opencode`）以及任何登录态/凭据文件都不挂载、不复制、不读取。
6. **权限按内容分级**：配置/模型目录默认**只读**；session/database 为**有界可写**；cache/log 为
   tmpfs 或**有界可写**；credential 只走**临时 secret 投影**，结束即清除。
7. **不新增品牌分支**：Server/Core/Worker/bwrap 继续只见通用字段（`runtimeArtifactMounts` /
   `projectionFiles` / `stateProjection` / `adapter` / `executableMounts` / credential 声明）；
   各家的路径语义与变量名由 **Harness 插件的 deployment 声明**，与既有
   [原生 driver 接缝](native-driver-seam.md) 同一条中立路线。

## 2. 目标布局

### 2.1 AgentBox Profile（逻辑示例，权威在 Windows）

```text
.agent-box/profiles/<profile-id>/
└── home/
    └── <Harness 原生目录>          # 例：.codex / .hermes / .pi/agent / .config+/.local/share
```

`home/` 之下按各家原生语义再分子目录；Profile revision 是配置权威，Session checkpoint 是会话权威。
WSL 侧的 view 是该权威的**有界投影**，不是第二份权威。

### 2.2 运行时 guest 约定

```text
HOME=/runtime/home
```

`/runtime/home` 由 bwrap 挂载为本次 execution 的隔离 home（见 §3）。以下每家的"默认路径"与
"显式变量"必须落到同一目录。

### 2.3 Codex

| 项 | 目标 |
| --- | --- |
| 原生默认路径 | `/runtime/home/.codex` |
| 显式变量 | `CODEX_HOME=/runtime/home/.codex` |
| 只读 | `config.toml`、`models.json`（Profile 投影） |
| 有界可写 | `sessions/`、`log/`、`state/`（按批准范围） |
| 凭据 | **不提供**用户真实 `auth.json`；需要时只经临时 secret 投影 |

官方说明（本轮实测抓取，`https://developers.openai.com/codex/config-advanced/`，页面重定向到
`https://learn.chatgpt.com/docs/config-file/config-advanced`）原文：

> "Config and state locations — Codex stores its local state under `CODEX_HOME` (defaults to
>  `~/.codex`). Common files you may see there: `config.toml` (your local configuration),
>  `auth.json` (if you use file-based credential storage) or your OS keychain/keyring,
>  `history.jsonl` (if history persistence is enabled) …"

以及：

> "By default, Codex saves local session transcripts under `CODEX_HOME` (for example,
>  `~/.codex/history.jsonl`)."

**文档不足以作为验收**：仍必须以真实 `codex-acp` → Codex `app-server` 的**黑盒**运行验证继承行为
（子进程实际读写的目录、`CODEX_HOME` 是否被子进程继承、默认路径在未设变量时是否回落到隔离
`HOME`）。文档只用来提出假设与检查点。

### 2.4 Pi

| 项 | 目标 |
| --- | --- |
| 原生默认路径 | `/runtime/home/.pi/agent` |
| 显式变量 | `PI_CODING_AGENT_DIR=/runtime/home/.pi/agent` |
| 只读 | `models.json`、`settings.json`（Profile 投影） |
| 有界可写 | `sessions/`（Pi 的 journal），按既有 state 回读边界回收 |

### 2.5 Hermes

| 项 | 目标 |
| --- | --- |
| 原生默认路径 | `/runtime/home/.hermes` |
| 显式变量 | `HERMES_HOME=/runtime/home/.hermes` |
| 只读 | `config.yaml`（Profile 投影） |
| 有界可写 | `state.db`、`state.db-wal`、`state.db-shm`（SQLite 三件套） |

**明确这是目标布局，尚未迁移**：当前生产封装使用 `/tmp/agentbox-home/state`（`HERMES_HOME`）并把只读
投影的 `config.yaml` 由工件的 bootstrap 物化进该目录（见
[Hermes 证据](hermes-production-packaging.md)）。该实现属**过渡实现**，不得写成已经与 `~/.hermes`
收敛。

### 2.6 OpenCode

| 项 | 目标 |
| --- | --- |
| `HOME` | `/runtime/home` |
| `XDG_CONFIG_HOME` | `/runtime/home/.config` |
| `XDG_DATA_HOME` | `/runtime/home/.local/share` |
| 显式配置 | `OPENCODE_CONFIG=/runtime/home/.config/opencode/opencode.json` |
| 只读 | 上述 `opencode.json`（Profile 投影） |
| 有界可写 | `/runtime/home/.local/share/opencode` 下的数据库状态（SQLite 三件套） |

## 3. "目录替换"与"环境变量"的关系（必须写清）

| 机制 | 决定什么 | 谁负责 |
| --- | --- | --- |
| bwrap mount namespace（`--bind` / `--ro-bind` / `--tmpfs`） | 进程**能看见**哪些目录、可读写还是只读 | Worker/Sandbox 层（通用，无品牌） |
| `HOME` / `XDG_CONFIG_HOME` / `XDG_DATA_HOME` / 各家专用变量 | 原生程序在**可见范围内选哪个目录** | Harness 插件 deployment 声明 |
| Profile view 投影 | 两个寻址方式**指向同一份数据** | Server 生成、Worker 校验、bwrap 映射 |

结论：**两者必须收敛到同一路径**。只有目录替换 → 变量仍指向用户真实路径（或不存在），程序会在
guest 里找不到状态或写失败；只有变量 → 目录仍是宿主真实目录，隔离形同虚设。
**任何一项都不能单独充当完整验收**：验收必须同时断言"可见目录集合"与"两个寻址方式的 resolve 结果
相同"。

## 4. 权限矩阵（至少包含）

| 内容 | guest 权限 | 是否回收 | 权威来源 |
| --- | --- | --- | --- |
| 配置/模型目录 | RO | 否 | Windows Profile revision |
| session/database | RW bounded | 是 | Windows Session checkpoint |
| cache/log | tmpfs 或 bounded RW | 通常否／按声明 | execution |
| credential | 临时只读或环境注入 | 否，结束清除 | Server SecretStore |
| runtime artifact | RO + digest | 否 | 部署工件 |

沿用既有边界：可写投影回读受 256 文件 / 8 MiB 上限约束；runtime artifact 走摘要固定的只读挂载
（`/runtime/artifacts/<name>`）；凭据只经 Worker `secret.put` 帧物化到一次性路径。

## 5. 当前差距（不得写成已收敛）

| 家 | 现状 | 差距 |
| --- | --- | --- |
| Codex | 已有 `CODEX_HOME` 配置代码（composition/remote 指向 `/runtime/home`） | 完整 `codex-acp` → `app-server` 子进程链与 `HOME` 双重收敛**未验** |
| Pi | 使用 `/tmp/agentbox-home`（`PI_CODING_AGENT_DIR` 同值） | 尚未与 `~/.pi/agent` 收敛 |
| Hermes | 使用 `/tmp/agentbox-home/state` + 工件 bootstrap 物化配置 | 尚未与 `~/.hermes` 收敛（过渡实现） |
| OpenCode | 依赖 `OPENCODE_CONFIG` / `XDG_DATA_HOME` 指向 `/tmp/agentbox-home/*` | 尚未完成默认 `HOME`/`XDG` 双重收敛 |

三家（Pi/Hermes/OpenCode）假端点全链门在迁移前保持历史有效；**迁移后必须重跑**，并新增"默认路径与
显式变量 resolve 相同"的断言。Codex 家尚无同级生产封装，随其封装一并实施。

## 6. 验收设计

1. 在**用户真实原生 HOME** 放一个无秘密 sentinel 文件；
2. 在 **AgentBox Profile** 放**另一个**同名/等价 sentinel；
3. 真实 adapter / 子进程**只能看到 Profile sentinel**（真实 HOME 的 sentinel 不可见）；
4. **默认路径**（不设专用变量时程序自己算出来的路径）与**专用环境变量路径** resolve 到**同一目录**；
5. **受控反例**：故意不设置专用变量时，程序仍回落到隔离 `HOME`（`/runtime/home`），**不得**触及宿主
   HOME；
6. 对只读配置目录的**写入被拒**；
7. session/database **写入成功**，且结束后能被**回收**（checkpoint 内含批准子树）；
8. **越界文件不进入 checkpoint**（未被声明的路径不得被回读）；
9. **secret 不进入**配置、状态、日志或 Git；
10. 退出后 **view / secret / 临时根 / 进程**无残留（有界等待后断言消失）。

## 7. Harness 配置阻塞规则（沿用本阶段硬性要求）

若某家出现下列任一情况，**暂停该家**并立即由主执行者向用户提问（附精确版本、已检查的原生配置入口、
已尝试配置、脱敏错误与失败层级、是否需要 patch 第三方、2–3 个方案及影响）：

- 不支持预期的环境变量，或其语义与预期不同；
- 原生默认目录与文档/实测不符，无法与显式变量收敛到同一路径；
- 需要把**整棵** Profile 根 RW 才能运行；
- 需要 patch/monkeypatch 第三方 Harness 内部实现；
- bwrap 当前合同（`projectionFiles` 单文件、单个可写 state 目录、`/runtime/artifacts` 只读树）
  **无法表达**所需的嵌套 RO/RW 布局。

不得静默降级、不得删除断言、不得自行修改第三方语义。**其他独立任务继续**（例如 Worker 租约修复）。

## 8. 与既有合同的关系

- 不新增品牌分支：本设计全部落在 deployment 数据与插件层；Server/Core/Worker/bwrap 的通用字段与
  校验规则不变。
- 与 [运行时工件投影](../../server-round1/fullstack/runtime-artifact-projection.md)、
  [原生 driver 接缝](native-driver-seam.md) 同一底座：只读投影、摘要校验、可写 state 回收的既有
  机制是它的实现基础。
- **Worker 5 秒租约缺陷与本设计无关**（见 native-driver-seam.md §5）：它是"活跃 attempt 的帧来源"
  问题，独立修复；本设计不改变租约语义。

## 9. 未完成声明

- 本文**未实现**任何一家的目录迁移（`implementation = PENDING_HARDENING`）。
- 不得据此登记 `BACKEND_IMPLEMENTATION_READY`；`workbench_model_verified_count` 仍为 0。
- 四家真实模型门、Codex 生产封装、Worker 租约修复、c4 的 Windows 复验各自独立推进，本设计不是它们
  的前置或替代。
