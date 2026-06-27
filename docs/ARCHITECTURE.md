# agent-box 架构

> This document describes **IMPLEMENTED** behavior. For design intent /
> future plans see `docs/planning/v0.4.0-plan.md` and `docs/specs/`.

## 设计原则（来自对话 + 代码现状）

1. **零外部依赖** — CLI is stdlib only (`sqlite3` 是标准库，`bwrap` 是
   系统工具)。GUI (PyWebView + React) is a separate Windows-launched
   process (`gui-web/bridge.py`), not part of the CLI package.
2. **模板是 package data** — `src/agent_box/templates/<agent_type>/`，
   `pip install` 后随 wheel 一起分发。`library.get_template_dir()` 解析。
3. **Profile = 模板的拷贝** — `profile.create()` 拷贝模板目录到
   `~/.local/share/agent-box/profiles/<name>/`，运行时 bwrap 把它
   bind-mount 到真实配置目录上做隔离。
4. **不碰项目目录** — `cd` 是 shell 的事，agent-box 只管启动；
   working directory 透传给 bwrap 的子进程。
5. **和 cc-switch 的关系** — 设计上数据来源相似（preset 概念），
   但运行时不依赖 cc-switch。

## 数据流（已实现）

```
src/agent_box/templates/<agent_type>/    ← package data (read-only)
        ↓ copy at create time
~/.local/share/agent-box/profiles/<name>/<agent_type>/   ← per-profile copy
        ↓ bind-mount at launch time
bwrap 子进程 (覆盖真实 ~/.claude / ~/.codex / ~/.hermes / ~/.config/opencode)
        ↓ execvpe
agent binary (claude / codex / hermes / opencode)
```

## 源码布局

```
src/agent_box/
  cli.py        — argparse 入口；子命令：create / list / launch /
                  cc / codex / hermes / opencode / show / edit / delete
  launch.py     — bwrap argv 构建 + os.execvpe
  profile.py    — profile CRUD（create/list/show/delete/load_meta/write_meta）
                  + 极简 YAML meta 解析
  library.py    — _AGENT_TYPES 注册表（config_dir / binary / data_dir）
                  + template 路径解析
  config.py     — 路径工具（agent_box_home、profile_dir、real_agent_dir 等）
                  + profile 名校验
  edit.py       — $EDITOR 启动器
  templates/    — 每种 agent 类型的初始配置（package data）
```

## CLI 子命令（已实现）

`agent-box <subcommand>`：

- `create <name> [--type cc|codex|hermes|opencode]` — 拷贝模板到
  `profiles/<name>/` 并写 `meta.yaml`。
- `list [--json]` — 列出所有 profile（人读 / `--json`）。
- `launch <name> [extra ...]` — bwrap 启动（剩余参数透传给 agent binary）。
- `cc <name> [extra ...]` / `codex <name> [extra ...]` /
  `hermes <name> [extra ...]` / `opencode <name> [extra ...]` — `launch` 的快捷方式。
- `show <name>` — 打印 meta + config_dir(+ data_dir)。
- `edit <name>` — 用 `$EDITOR` 打开 profile 的 agent config 目录。
- `delete <name> [--force]` — 删除 profile。

**不在 CLI 里的**：没有 `gui` / `config` / `test` / `component` /
`provider` / `apply` 子命令。

## launch.py 行为

`launch.launch(name, extra_args=None)`:

1. `profile.load_meta(name)` 读 `meta.yaml` 决定 `agent_type`。
2. 解析三组路径：
   - `pdir = config.profile_agent_dir(name, agent_type)` — profile 的 config 目录
   - `rdir = config.real_agent_dir(agent_type)` — 真实主机配置目录
   - 二次 data dir（仅 opencode 等需要时）：`pdata`/`rdata`
3. bwrap argv 模板（按顺序）：

   ```
   bwrap
     --bind / /
     --bind <pdir> <rdir>                    # 隔离 agent 配置
     [--bind <pdata> <rdata>]                # 二次 data dir（opencode）
     [--bind <pjson> <rjson>]                # cc 专用：dot-claude.json
     --dev /dev
     --proc /proc
     --tmpfs /tmp
     --unshare-ipc --unshare-pid --unshare-uts
     --share-net                              # WSL2 兼容，不破坏网络
     <binary> [extra_args...]
   ```

4. `env = dict(os.environ)` 透传给子进程（**不**注入 provider env，**不**剥离任何变量）。
5. `os.execvpe(bwrap, argv, env)` — 成功后永不返回。

### 隔离完整性

`--bind <pdir> <rdir>` 把整个真实配置目录覆盖到 profile 的拷贝上。
对于 CC，这意味着 `history.jsonl`、`projects/`、`credentials/`、
`session-env/` 等所有 `~/.claude/` 子路径都被覆盖（每个 profile 自己
一份），实现完整隔离。CC 还多绑一个 `dot-claude.json` → `~/.claude.json`。

> 之前曾担心“`--bind` 太窄会漏掉 ~25 个子路径”——runtime 测试
> (2026-06-21) 已确认 `--bind` 是整目录覆盖，无泄漏。

## profile.py 行为

- `create(name, agent_type="cc")` — 拷贝 `templates/<type>/` 到
  `profiles/<name>/<type>/`，写 `meta.yaml`（字段：`name`、`agent_type`）。
  CC 还种一份 `dot-claude.json`。Opencode 拷二次 data dir。
- `list_profiles()` — 扫 `profiles/*/meta.yaml` 解析出 `[{"name", "agent_type"}]`。
- `show(name)` — `{meta, config_dir, data_dir?}`。
- `delete(name, force=False)` — `rmtree(profiles/<name>)`。
- `load_meta(name)` / `write_meta(root, meta)` — 极简 YAML（手动 parser，
  只支持 `key: value` 字符串行；不引 PyYAML）。
- `ProfileError(Exception)` — 业务异常。

## library.py 行为

内置注册表：

```python
_AGENT_TYPES = {
    "cc":       {"config_dir": "~/.claude",          "binary": "claude"},
    "codex":    {"config_dir": "~/.codex",           "binary": "codex"},
    "hermes":   {"config_dir": "~/.hermes",          "binary": "hermes"},
    "opencode": {"config_dir": "~/.config/opencode", "binary": "opencode",
                 "data_dir": "~/.local/share/opencode"},
}
```

公共 API：`get_agent_types()`、`get_agent_config(t)`、
`get_template_dir(t)`、`get_template_data_dir(t)`。

## config.py 行为

路径 helper（全部基于 `AGENT_BOX_HOME_ENV` 或 `~/.local/share/agent-box`）：

- `agent_box_home()` — 配置根
- `profiles_dir()` — `<home>/profiles`
- `profile_dir(name)` — `<home>/profiles/<name>`
- `profile_meta(name)` — `<home>/profiles/<name>/meta.yaml`
- `agent_config_dir(t)` / `real_agent_dir(t)` — 真实主机目录（`~` 展开）
- `profile_agent_dir(name, t)` — profile 内对应目录
- `agent_binary(t)` / `agent_data_dir(t)` / `real_agent_data_dir(t)` /
  `profile_agent_data_dir(name, t)` — 二进制 + 二次 data dir
- `validate_profile_name(name)` — 仅允许 `[a-zA-Z0-9._-]`

## edit.py 行为

- `open_editor(path)` — `EDITOR` 环境变量解析，回退 `vim/nvim/nano/vi/emacs`；
  找不到则退出 2。`os.execvpe` 替换当前进程。

## GUI（独立于 CLI 包）

- 路径：`gui-web/`（PyWebView + React + Vite + Tailwind）。不是 `agent-box` 包的子模块，不通过
  `agent-box` CLI 启动。
- 启动方式：Windows 上跑 `gui-web/bridge.py --prod`（开发模式连 `localhost:5173`）；
  内部通过 `wsl.exe bash -lc agent-box ...` 调 CLI 子命令（list / create / delete / launch）。
- 关键文件：
  - `gui-web/bridge.py` — PyWebView 窗口 + Python API bridge
  - `gui-web/src/pages/` — React 页面（home / profiles / library / sessions / settings）
  - `gui-web/src/components/layout/sidebar.tsx` — 侧边栏导航

## Future (not implemented)

下面这些是设计意图，**当前代码里不存在**：

- **Provider system**：`_BUILTIN_PROVIDERS` 常量、`apply_provider()`、
  `user_overrides` 表（library.db）、`build_child_env()`、`providers.py`
  模块 —— 均未实现。CLI 也不接受 provider 相关 flag。
- **CLI 子命令 `config` / `test` / `component` / `gui`** —— 均已移除
  或从未存在。`gui` 子命令曾在 0.4.0 (commit 8c84cf0) 中删除（指向
  一个有 bug 的 nicegui 桩）。
- **Profile import/export**（tarball）。
- **Session history UI**（数据层已有占位）。

详见 `docs/planning/v0.4.0-plan.md` 里对应 workstream 的设计与排期。
