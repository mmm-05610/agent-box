<p align="center">
  <img src="logo.png" alt="agent-box" width="128" height="128">
</p>

# agent-box

> **AI Agent 配置隔离启动器** — 在同一台机器上以多个隔离身份（不同 Provider、不同提示词、不同凭证）运行 Claude Code、Codex、Hermes、OpenCode，通过 [bubblewrap](https://github.com/containers/bubblewrap) bind mount 实现**内核级隔离**。

[English](README.md) | 简体中文

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.9+](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/)
[![v0.4.0](https://img.shields.io/badge/version-0.4.0-orange.svg)](#)

---

## 为什么需要

编码 Agent CLI（Claude Code、Codex、Hermes、OpenCode）从单一配置目录（`~/.claude/`、`~/.codex/`、`~/.hermes/`、`~/.config/opencode/`）读取身份、模型供应商、凭证和项目记忆。在同一台机器上跑多个 Agent 身份意味着不断手动编辑配置文件、互相覆盖状态——而且一个 Agent 的凭证还会泄漏到下一个会话里。

`agent-box` 为每个身份创建独立的 profile 目录，并在 `bwrap` mount namespace 内启动 Agent，把 profile 绑定挂载到真实配置目录之上。Agent 看到的是自己的世界；宿主文件系统毫发无损。

```
agent-box cc decision       # 一个 Claude Code 身份
agent-box codex builder     # 一个 Codex 身份，并行运行
agent-box opencode alt      # 一个 OpenCode 身份，并行运行
```

每个身份在独立终端运行，配置、凭证、历史、项目记忆完全隔离，互不污染。

---

## 安装

### 依赖

- **Python 3.9+**（仅用标准库——CLI 零 Python 运行时依赖）
- **`bubblewrap`**（`bwrap`）—— 系统包，见下
- 一个或多个你要启动的 Agent CLI（`claude`、`codex`、`hermes`、`opencode`）

### 系统包

```bash
# Debian / Ubuntu
sudo apt install bubblewrap

# Fedora / RHEL
sudo dnf install bubblewrap

# Arch
sudo pacman -S bubblewrap

# macOS —— 无 bwrap；agent-box 需要 Linux（WSL2 完美适用）
```

### agent-box 本体

从源码检出：

```bash
git clone https://github.com/mmm-05610/agent-box.git
cd agent-box
pip install -e .
# 或不安装直接运行：
python -m agent_box.cli --help
```

从 PyPI（发布后）：

```bash
pip install agent-box
```

Windows 桌面 GUI 是可选 extra（依赖 CustomTkinter）：

```bash
pip install -e .[gui]
```

---

## 快速开始

```bash
# 1. 为每个 Agent 身份创建一个 profile。模板内置在包里——无需初始化步骤。
agent-box create decision --type cc
agent-box create builder   --type codex
agent-box create dev        --type cc --preset python-dev   # 自带 CLAUDE.md + hooks + settings 覆盖

# 2. 把真实 API key / 凭证填进 profile。模板是空 key 占位符——
#    打开配置目录填进去：
agent-box edit decision        # 在 $EDITOR 中打开 profile 的配置目录
#  → ~/.agent-box/profiles/decision/dot-claude/settings.json
#  → 把空的 env / apiKey 占位符替换成你的真实值

# 3. 启动——每条命令都是完全隔离的 Agent 会话
agent-box cc decision
agent-box codex builder
agent-box opencode alt
```

在终端 A 跑 `agent-box cc decision`，终端 B 跑 `agent-box codex builder`——两者同时在线，各自看到自己的配置，互不泄漏。

---

## 命令参考

| 命令                                                                                                                                 | 作用                                   |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| `agent-box create <name> [--type <t>] [--preset <p>] [--provider <p>] [--display-name <s>] [--description <s>] [--claude-md <file>]` | 复制 Agent 类型的模板创建新 profile    |
| `agent-box list [--json]`                                                                                                            | 列出所有 profile                       |
| `agent-box show <name>`                                                                                                              | 显示 profile 的元数据、路径及可选字段  |
| `agent-box edit <name>`                                                                                                              | 在 `$EDITOR` 中打开 profile 的配置目录 |
| `agent-box presets [--type <t>] [--json]`                                                                                            | 列出自带预设                           |
| `agent-box launch <name> [extra...]`                                                                                                 | 在 bwrap namespace 内启动 profile      |
| `agent-box cc \| codex \| hermes \| opencode <name> [extra...]`                                                                      | 快捷方式：启动该类型的 profile         |
| `agent-box delete <name> [--force]`                                                                                                  | 删除 profile                           |
| `agent-box sessions [--json] [--active] [--cleanup] [--exit <id> <code>]`                                                            | 查看/管理启动会话历史                  |
| `agent-box --help`                                                                                                                   | 完整 CLI 帮助                          |
| `agent-box --version`                                                                                                                | 打印版本号                             |

profile 名之后的 `extra` 参数会透传给 Agent 二进制（如 `agent-box cc decision --resume`）。

### `create` 选项

- `--type / -t` —— Agent 类型：`cc`（默认）、`codex`、`hermes`、`opencode`。
- `--preset` —— 应用一个自带预设（v0.4 仅 CC）。复制预设的 `CLAUDE.md`、`hooks/hooks.json`，并把 `settings.overlay.json` 深合并到模板的 `settings.json` 上。若同时给 `--claude-md`，`--preset` 优先。
- `--provider` —— Provider 键（如 `anthropic`、`deepseek`）。**v0.4 仅作记录**——存入 `meta.yaml`，无应用逻辑（v0.5 接入）。
- `--display-name` / `--description` —— 人类可读元数据，存入 `meta.yaml`。
- `--claude-md <file>` —— 该文件内容成为 profile 的 `CLAUDE.md`（v0.4 仅 CC）。避免在 shell 里拼多行正文。

### 自带预设（CC）

`blank`、`decision-maker`、`python-dev`、`spec-writer`——见 `src/agent_box/presets/cc/`。用 `agent-box presets --type cc` 查看。

---

## 工作原理

### 隔离问题

仅靠 `HOME` 环境变量覆盖会被 Agent 内部的 `os.userInfo().homedir` 击穿——它会重新解析出真实 home 并读取宿主真实配置目录。**部分隔离，已失效。**

### 解决方案：bwrap bind mount

`agent-box` 进入 `bubblewrap` mount namespace，在**内核 VFS 层**把 profile 的配置目录绑定挂载到 Agent 的真实配置目录之上。namespace 内路径已被改写，无论 Agent 如何解析都看不到宿主配置。

```
┌─────────────────────────────────────────────────────┐
│  宿主文件系统                                        │
│                                                     │
│  /home/user/.claude/          ← 真实，未被触碰        │
│         ▲                                           │
│         │ bind mount (bwrap)                        │
│         │                                           │
│  /home/user/.agent-box/profiles/decision/dot-claude/│
│         (profile 的 settings.json, CLAUDE.md, ...)  │
└─────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│  bwrap namespace                                    │
│                                                     │
│  --bind / /                                         │
│  --bind <profile>/dot-claude   /home/user/.claude   │
│  --bind <profile>/dot-claude.json  /home/user/.claude.json   (仅 CC)
│  --bind <profile>/dot-opencode-data  ~/.local/share/opencode (仅 OpenCode)
│  --dev /dev --proc /proc --tmpfs /tmp               │
│  --unshare-ipc --unshare-pid --unshare-uts --share-net│
│  <agent 二进制>                                      │
│                                                     │
│  ⇒ os.execvpe 替换我们的 PID；Agent 继承 tty、      │
│    信号处理，Ctrl-C 仍有效。                         │
└─────────────────────────────────────────────────────┘
```

关键特性：

- **内核级隔离** —— Agent 在 namespace 内无法读取宿主真实配置目录。
- **PID/tty 保留** —— `os.execvpe` 把我们的进程替换为 `bwrap`，后者再 exec Agent。终端会话不变，Ctrl-C 仍发给 Agent。
- **网络共享**（`--share-net`）—— Agent 需要 API 访问。
- **凭证存在 profile 里** —— API key 放在 profile 自己的 `settings.json` / `auth.json` / `.env` 中，Agent 在 namespace *内部*读取。`agent-box` 不注入也不改写它们，只确保 Agent 看到的是 profile 的副本而非宿主的。
- **模板 / profile 分离** —— 模板内置在包里（`src/agent_box/templates/<type>/`），是空 key 占位符；`create` 把模板复制成 profile。宿主真实配置目录永不被写入。
- **按 Agent 类型的附加绑定** —— CC 额外绑定 `dot-claude.json` → `~/.claude.json`；OpenCode 额外绑定其二级数据目录（`dot-opencode-data` → `~/.local/share/opencode`），使 `auth.json` 也被隔离。

### 预设

预设是一个目录（`src/agent_box/presets/<type>/<name>/`），可包含 `CLAUDE.md`、`hooks/hooks.json`、`settings.overlay.json`。`create --preset` 时复制 `CLAUDE.md` 和 hooks，并把 settings 覆盖**深合并**到模板的 `settings.json` 上——冲突时覆盖方胜出，但兄弟键保留（所以预设的 `permissions.allow` 不会抹掉模板的 `permissions.deny`）。所选预设记入 `meta.yaml`。

---

## Windows 桌面 GUI

CLI 在 WSL 中运行；可选的 Windows 桌面 GUI（`gui-redesign.py` → `gui/app.py`，基于 [CustomTkinter](https://github.com/TomSchimansky/CustomTkinter)）让你在 Windows 上管理 profile：创建、列出、查看，并直接编辑每个 profile 的原始配置文件（settings、hooks、auth、CLAUDE.md），覆盖全部四种 Agent 类型，采用 cc-switch / shadcn-Zinc 设计系统与深浅主题。

它通过 `wsl.exe` 与 WSL 通信，所以真正的隔离工作仍由 CLI 和 bwrap 完成——GUI 只是同一棵 profile 树之上的便利层。

直接用 `python gui-redesign.py` 启动，或使用桌面快捷方式。

---

## 项目结构

```
agent-box/
├── pyproject.toml                  # setuptools + console_script + [gui]/[dev] extras
├── LICENSE                         # MIT
├── README.md  /  README_CN.md
├── .gitignore
│
├── src/agent_box/                  # 包本体（零运行时依赖）
│   ├── cli.py                      # argparse、子命令分发
│   ├── config.py                   # AGENT_BOX_HOME 解析、路径 + 名称校验
│   ├── library.py                  # Agent 类型注册表（模板、预设、二进制、目录）
│   ├── profile.py                  # create / list / show / delete、meta IO、预设应用、_deep_merge
│   ├── edit.py                     # $EDITOR 启动
│   ├── launch.py                   # bwrap argv 构造 + execvpe
│   ├── sessions.py                 # 会话追踪（启动历史 SQLite）
│   ├── templates/<type>/           # 自带 Agent 配置模板（空 key 占位符）
│   └── presets/<type>/<name>/      # 自带预设（CLAUDE.md, hooks.json, settings.overlay.json）
│
├── gui/                            # Windows 桌面 GUI（CustomTkinter）—— [gui] extra
│   ├── app.py  tokens.py  theme.py  data.py  config.py  wsl.py
│   ├── pages/  components/
│
├── tests/                          # 回归测试脊梁（WS7）—— [dev] extra
└── docs/
    ├── ARCHITECTURE.md  ROADMAP.md  REQUIREMENTS.md
    ├── specs/  troubleshooting/
```

### 运行时布局（在宿主上，不在仓库里）

```
~/.agent-box/                       # 或 $AGENT_BOX_HOME
└── profiles/<name>/
    ├── meta.yaml                   # name, agent_type,（+ display_name/description/provider/preset）
    ├── dot-claude/                 # bwrap 绑定挂载的配置目录（CC）
    ├── dot-claude.json             # → ~/.claude.json  (仅 CC)
    └── dot-<type>/                 # dot-codex / dot-hermes / dot-opencode
    └── dot-<type>-data/            # 二级数据目录（OpenCode: dot-opencode-data → ~/.local/share/opencode）
```

### 源码地图

| 文件          | 职责                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| `cli.py`      | argparse 树；每个子命令一个 `cmd_*`                                         |
| `config.py`   | `$AGENT_BOX_HOME` 解析、路径辅助、名称校验                                  |
| `library.py`  | Agent 类型注册表：配置目录、二进制、数据目录、模板、预设                    |
| `profile.py`  | `create`、`list`、`show`、`delete`、meta IO、`_apply_preset`、`_deep_merge` |
| `sessions.py` | 会话追踪：记录启动/退出、查询历史、清理僵尸会话                             |
| `edit.py`     | 在 `$EDITOR` 中打开 profile 的配置目录                                      |
| `launch.py`   | `launch`：构造 bwrap argv + `os.execvpe`                                    |

---

## 设计原则

- **CLI 零 Python 运行时依赖** —— 仅标准库。`bwrap` 和 Agent CLI 是系统依赖，不是 Python 依赖。
- **无数据库** —— profile 是目录树；文件系统即真相之源。
- **不改 Agent** —— `agent-box` 是启动器，不是包装器。Agent 不变，我们只改变它看到的东西。
- **不写入宿主真实配置目录** —— `create` 只从内置模板复制。宿主真实 `~/.claude/` 等永不被写入。
- **人类可编辑的 profile** —— profile 里每个文件都是普通的 JSON / TOML / YAML / Markdown 文档。CLI 是便利，不是牢笼。
- **一次安装，N 个身份** —— 新增身份的成本是一条 `agent-box create` 命令。

---

## 路线图

**v0.4.0（当前）：** 四 Agent 启动 + bwrap 隔离、预设管道、带原始配置编辑的 Windows GUI、模板修正、回归测试脊梁。

**下一步：**

- GUI 内结构化配置表单（在原始编辑之上）
- Team 模式——多 Agent tmux 编排
- 会话历史管理
- profile 导入 / 导出

**明确不做：** web 前端。agent-box 是轻量 WSL 工具，web 栈带来的复杂度与隔离收益不成比例。

---

## 开发

```bash
# 带 dev + gui extras 的可编辑安装
pip install -e .[dev,gui]

# 不安装直接从源码运行
python -m agent_box.cli list

# 运行 GUI
python gui-redesign.py
```

### 测试

```bash
pip install -e .[dev]
pytest -q
```

测试套件是封闭的：测试把 `AGENT_BOX_HOME` 指向临时目录，并 monkeypatch `os.execvpe` / `shutil.which` / `subprocess.run`，因此不会跑真实的 bwrap、不会调真实的 `wsl.exe`、也不会触碰真实的 `~/.agent-box`。覆盖 meta 往返 + 向后兼容、profile 生命周期、`_deep_merge`（预设覆盖回归）、library 注册表、launch argv 构造、wsl base64 往返 + shell 引号、以及预设解析。

---

## 许可证

MIT —— 见 [LICENSE](LICENSE)。
