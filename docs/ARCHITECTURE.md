# agent-box 架构

> 本文档描述 **已实现** 行为。设计意图 / 规划见 `docs/ROADMAP.md` 与
> `docs/specs/`。

## 设计原则

1. **轻依赖（CLI）** — CLI 只依赖 `json5`（JSONC 解析）、`tomli-w`（TOML
   写）、`cmd2`（上下文栈 REPL）。业务层 stdlib only（`sqlite3`、`json`、
   `yaml` 手写解析）；`bwrap` 是系统工具。
2. **声明式注册表，前端/CLI 零 agent 知识** — `core/agent_types.json`
   定义每种 agent 的 identity（名字/颜色/logo）、runtime（config_dir /
   binary / data_dir / launch）、resources（provider / mcp / skills /
   hooks / prompt / permissions / plugins / rules / memories /
   instructions）。GUI 与 CLI 都不硬编码 agent 名、路径、默认值——全部
   从注册表读。
3. **模板是 package data** — `templates/<agent_type>/` 在 wheel 里分发；
   `core/library.py` 解析。`presets/` 提供初始 overlay。
4. **Profile = 模板拷贝 + 追加式覆盖** — `create` 拷贝模板到
   `~/.agent-box/profiles/<name>/`，运行时 bwrap 把 profile 目录
   bind-mount 覆盖真实配置目录做隔离。Provider 等资源以追加式文件
   （`_providers.json`）+ 写真实配置两种方式落盘（strategy dispatch）。
5. **不碰项目目录** — launch 的 cwd 由后端解析（`launch --cwd`），
   working directory 透传给 bwrap 子进程，agent-box 不做 `cd`。
6. **和 ACS 的关系** — ACS（cc-switch fork）作为**配置仓库**：
   providers / mcp servers / skills / prompts 都存在 ACS 的
   `cc-switch.db`。agent-box 通过 `adapters/acs.py` **只读**库，再经
   `resources/*/apply.py` 把选中项写入 profile 的真实配置。

## 分层架构

```
src/agent_box/
  config.py               — 路径 / 配置工具
                            agent_box_home（~/.agent-box）、profiles_dir、
                            default_projects_dir、acs_binary、home_dir、
                            provider_endpoints_file、profile_skills_dir
  launch.py               — bwrap argv 构建 + os.execvpe（cwd 后端解析）
  edit.py                 — $EDITOR 启动器（configure 命令使用）
  core/                   — 基础层
    agent_types.json          — agent 类型注册表（identity / runtime / resources）
    provider_endpoints.json   — provider base_url → /models endpoint 映射
    library.py                — 注册表读取 + template / preset 解析
    db.py                     — SQLite（profiles / sessions）
    io.py                     — 原子配置读写（JSON / JSONC / TOML / YAML）
  adapters/               — 外部数据适配
    acs.py                    — ACS 库读取（providers / mcp / skills / prompts，只读）
    models.py                 — fetch_models（provider_endpoints 驱动）
  resources/              — 资源操作（apply / CRUD / 查询）
    profile.py                — profile 生命周期（DB 行 + meta.yaml + presets）
    providers/apply.py        — provider apply（strategy dispatch：
                                json_merge / multi_file / yaml_custom / jsonc_provider）
    prompts/apply.py          — prompt apply（写入 prompt 文件 + prompt_ref）
    mcp/apply.py              — MCP server apply（写 agent 配置的 enabled_* 列）
    skills/apply.py           — skills apply（拷贝到 profile skills 目录）
    sessions.py               — session 追踪（UTC 时间、PID 存活检测、cleanup）
    hooks.py                  — hooks CRUD（JSON / YAML 双格式）
  cli/                    — cmd2 上下文栈 REPL
    shell.py                  — AgentBoxShell（repl / exec 双入口、上下文栈）
    commands/core.py          — 全局命令
    commands/profile.py       — profile 上下文命令
```

## CLI（cmd2 上下文栈 REPL）

入口（`cli/__init__.py`）：

- `agent-box` / `agent-box repl` — 交互 REPL（tab 补全、历史、自动建议）。
- `agent-box exec "<script>"` — 脚本执行：`;` 分隔命令（引号内不分割），
  `#` 注释；stdin 非 TTY 时读整段 stdin。任一命令失败返回 exit 1，
  无脚本返回 exit 2。

上下文模型：全局提示符 `agent-box>` ；`use <profile>` 后进入 profile
上下文，提示符 `[<profile>:<agent_type>]>`。`back` 返回全局。上下文栈
只有一层。

| 上下文  | 命令                                                                                                                                                                             |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 全局    | `list`（profiles/sessions/presets）、`create`、`delete`、`show`、`configure`（编辑 meta 或开 `$EDITOR`）、`use`、`launch`（`--cwd`、透传 extra）、`sessions`（--exit/--cleanup） |
| profile | `options`（配置总览）、`apply <provider\|mcp\|skill\|prompt> <id>`、`remove <provider\|mcp\|skill> <id>`、`hooks`（show/set/add/remove）、`launch`（默认当前 profile）、`back`   |

输出：人类可读对齐列；`list --json` / `show --json` / `hooks show` 输出
JSON（`ensure_ascii=False`）。数据来源：profile CRUD → SQLite +
meta.yaml；apply → ACS 库查询 + strategy 写入；launch → bwrap。

## launch.py 行为

`launch.launch(name, extra_args=None, cwd=None)`:

1. `profile.load_meta(name)` 读 `meta.yaml` 决定 `agent_type`。
2. 解析路径组：
   - `pdir = config.profile_agent_dir(name, agent_type)` — profile 的 config 目录
   - `rdir = config.real_agent_dir(agent_type)` — 真实主机配置目录
   - 二次 data dir（opencode 等需要时）：`pdata`/`rdata`
3. 若给 `cwd`：`os.chdir(os.path.expanduser(cwd))`（后端解析 `~`，
   不做 shell `cd`）。
4. bwrap argv 模板（按顺序）：

   ```
   bwrap
     --bind / /
     --bind <pdir> <rdir>                    # 隔离 agent 配置
     [--bind <pdata> <rdata>]                # 二次 data dir（opencode）
     [--bind <pjson> <rjson>]                # claude 专用：dot-claude.json
     --dev /dev
     --proc /proc
     --tmpfs /tmp
     --unshare-ipc --unshare-pid --unshare-uts
     --share-net                              # WSL2 兼容，不破坏网络
     <binary> [extra_args...]
   ```

5. `env = dict(os.environ)` 透传（不注入 provider env，不剥离变量）。
6. `os.execvpe(bwrap, argv, env)` — 成功后永不返回。

### 隔离完整性

`--bind <pdir> <rdir>` 整目录覆盖真实配置目录。对 claude 意味着
`history.jsonl`、`projects/`、`credentials/`、`session-env/` 等所有
`~/.claude/` 子路径都被 profile 拷贝覆盖。claude 额外绑
`dot-claude.json` → `~/.claude.json`。

> runtime 测试（2026-06-21）确认 `--bind` 整目录覆盖，无子路径泄漏。

## 数据流

```
core/agent_types.json + templates/<type>/ + presets/    ← package data（只读）
        ↓ create
~/.agent-box/profiles/<name>/<type>/                   ← per-profile 拷贝
        ↓ apply <resource>（strategy 写入真实配置）
profile 的 settings.json / auth.json / config.toml / opencode.jsonc ...
        ↓ launch
bwrap 子进程（覆盖真实 ~/.claude / ~/.codex / ~/.hermes / ~/.config/opencode）
        ↓ execvpe
agent binary（claude / codex / hermes / opencode）
```

- **ACS 库**（`~/.agent-box/config/cc-switch.db`）— providers / mcp /
  skills / prompts 的只读来源，apply 时查询。
- **profiles / sessions** — SQLite `~/.agent-box/agent-box.db`；session
  时间存 UTC（`datetime('now')`），消费端按 UTC 解析。

## config.py 行为

路径 helper（基于 `AGENT_BOX_HOME_ENV` 或 `~/.agent-box`）：

- `agent_box_home()` / `profiles_dir()` / `profile_dir(name)`
- `agent_config_dir(t)` / `real_agent_dir(t)` / `profile_agent_dir(name, t)`
- `agent_binary(t)` / `agent_data_dir(t)` / `real_agent_data_dir(t)` /
  `profile_agent_data_dir(name, t)`
- `default_projects_dir()` / `projects_dir()` / `set_projects_dir()` —
  GUI 项目目录（默认 `~/`，持久化 `gui-settings.json`）
- `acs_binary()` — ACS 可执行文件路径（env 覆盖 → PyInstaller `_MEIPASS`
  → 仓库 submodule `acs/src-tauri/target/release/cc-switch`）
- `home_dir()` — OS home（GUI 显示 `~/...` 用）
- `provider_endpoints_file()` / `profile_skills_dir()` — 声明式数据表路径
- `validate_profile_name(name)` — 仅允许 `[a-zA-Z0-9._-]`

## GUI（独立于 CLI 包）

- 路径：`gui-web/`（PyWebView + React + Vite + Tailwind），不是
  `agent-box` 包的子模块。
- **双模式 bridge**（`bridge.py`，策略模式）：
  - Windows 宿主 → `WslDataAccess`：经 `wsl.exe python3 rpc_server.py`
    （stdin/stdout JSON **RPC**）调 agent_box **库**，不是 `agent-box`
    CLI 二进制 —— **Windows 宿主零 agent-box 依赖**（bridge.py +
    data_wsl.py 只有 stdlib）。路径转换用确定性字符串转换
    （`_to_wsl_path`），不经 `wslpath`。
  - Linux/WSL → `LinuxDataAccess`：直接 `import agent_box`（懒加载，
    Windows 不导入）。
  - `main()` 按 `sys.platform == "win32"` 选择；`data_linux` 仅在
    Linux 分支懒导入。
- **RPC 运行时**：exe 内置 `build/runtime/`（rpc_server.py +
  data_linux.py + agent_box 库 + 纯 Python 依赖），WSL 的 python3 经
  `/mnt/<drive>/...` 读取 —— 无 pip / venv / CLI 安装。
- 页面：home（仪表盘）/ profiles（列表+launch）/ detail（profile 详情，
  tab 由 registry `resources` 动态生成）/ sessions / settings / help。
- **前端零 agent 知识**：页面结构、tab、图标、默认值全部来自后端
  注册表 + ACS，前端无硬编码 agent 名。
- 关键目录：`gui-web/src/pages/`、`src/domains/`、`src/hooks/`、
  `src/api/`（`call()` 统一桥接 PyWebView）、`src/i18n/`（中/英）。

## Future（未实现）

- **Profile import/export**（tarball）。
- **CLI 库浏览** — `list providers/skills/prompts`（ACS 只读查询）目前仅
  GUI 走，CLI 只有 `apply <id>`（需先知 id）。
- **CLI `status` / `list models` / `test <endpoint>`** — `fetch_models` /
  `test_endpoint` 目前只被 GUI 消费。
- **`team`** — tmux 布局多 agent 启动。
- **plugins / permissions / rules / memories / instructions 的 CLI 命令** —
  注册表已声明，CLI 无对应命令。
- **Profile rename / duplicate / 批量操作**。

详见 `docs/ROADMAP.md` 与 `docs/specs/`。
