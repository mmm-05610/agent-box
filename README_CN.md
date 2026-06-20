# agent-box

> **AI Agent 配置隔离启动器** — 在同一台机器上以多个身份（不同 Provider、不同提示词）运行 Claude Code，通过 [bubblewrap](https://github.com/containers/bubblewrap) bind mount 实现**内核级隔离**。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.9+](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/)
[![v0.1.0](https://img.shields.io/badge/version-0.1.0-orange.svg)](#)

[English](README.md) | 简体中文

---

## 痛点

AI Agent CLI（Claude Code、Codex、Hermes 等）从单一的 `~/.claude/`（或 `~/.codex/` 等）目录读取身份、模型供应商和项目记忆。在同一台机器上跑多个 Agent 身份意味着不断手动编辑配置文件、互相覆盖状态。

`agent-box` 给每个身份独立的 profile 目录，通过 `bwrap` 挂载命名空间将 profile bind mount 到真实 `~/.claude/` 上。Agent 看到的是自己的世界，宿主机文件系统毫发无损。

```bash
agent-box cc decision     # CC + DeepSeek，决策者
agent-box cc dw           # CC + MiniMax，DW 执行
agent-box cc spec         # CC + Anthropic，spec 写作
```

每个身份在不同终端并行运行，配置、凭证、项目记忆完全隔离。

---

## 安装

### 环境要求

- **Python 3.9+**（仅标准库，零 Python 依赖）
- **`bubblewrap`**（`bwrap`）— 系统包，见下方
- **Claude Code**（`claude` CLI）— 通过 npm 全局安装一次

### 系统包

```bash
# Debian / Ubuntu
sudo apt install bubblewrap

# Fedora / RHEL
sudo dnf install bubblewrap

# Arch
sudo pacman -S bubblewrap

# macOS — bwrap 不可用；v2 bwrap 隔离需要 Linux
```

### Claude Code

```bash
npm install -g @anthropic-ai/claude-code
```

### agent-box

从源码安装：

```bash
git clone https://github.com/mmm-05610/agent-box.git
cd agent-box
pip install -e .
# 或者不安装直接运行：
./agent-box --help
```

---

## 快速开始

```bash
# 1. 从真实 ~/.claude/ 生成模板（一次性）
agent-box init-template

# 2. 每个 Agent 身份创建一个 profile
agent-box create decision --provider deepseek
agent-box create dw       --provider minimax
agent-box create spec     --provider anthropic

# 3. 设置 API key
agent-box edit decision
#  → 打开 ~/.agent-box/profiles/decision/dot-claude/settings.json
#  → 把 sk-REPLACE_ME 替换为真实的 ANTHROPIC_AUTH_TOKEN

# 4. 启动 — 每个命令都是一个完全隔离的 CC 会话
agent-box cc decision
agent-box cc dw
agent-box cc spec --cwd ~/projects/my-app
```

在终端 A 跑 `agent-box cc dw`，终端 B 跑 `agent-box cc decision` — 两者同时在线，各自看到自己的配置，互不泄漏。

---

## 命令速查

| 命令                                             | 说明                                                |
| ------------------------------------------------ | --------------------------------------------------- |
| `agent-box init-template [--force]`              | 从 `~/.claude/` 抽取干净模板（清除敏感信息）        |
| `agent-box create <name> --provider <p>`         | 创建新 profile（模板不存在时自动初始化）            |
| `agent-box list [--json]`                        | 列出所有 profile                                    |
| `agent-box show <name>`                          | 查看 profile 的元信息、provider、模型、base_url     |
| `agent-box edit <name> [--claude-md \| --local]` | 用 `$EDITOR` 打开 profile 配置文件                  |
| `agent-box config <name> [<key> [<value>]]`      | 读写单个配置项（如 `api-key`、`model`、`base-url`） |
| `agent-box test <name>`                          | 测试 profile 的 API 连通性                          |
| `agent-box cc <name> [--cwd DIR]`                | 以 profile 身份启动 Claude Code（核心命令）         |
| `agent-box delete <name> [--force]`              | 删除 profile                                        |
| `agent-box --help`                               | 完整 CLI 帮助                                       |

### Provider 预设

| Provider    | Base URL                             | 模型                |
| ----------- | ------------------------------------ | ------------------- |
| `deepseek`  | `https://api.deepseek.com/anthropic` | `deepseek-v4-pro`   |
| `minimax`   | `https://api.minimaxi.com/anthropic` | `MiniMax-M2.7`      |
| `anthropic` | `https://api.anthropic.com`          | `claude-sonnet-4-6` |

三个 CC 模型等级的环境变量（`HAIKU`/`SONNET`/`OPUS`）默认均指向 provider 的主模型，因此 CC 内 `/model` 始终显示统一模型名。

---

## 原理

### 隔离问题

v1 的 `HOME` 环境变量覆盖方案被 CC 内部的 `os.userInfo().homedir` 绕过 — Agent 重新推导真实 home 目录，读到了宿主机的 `~/.claude/`。**部分隔离，已废弃。**

### v2 方案：bwrap bind mount

`agent-box v2` 使用 `bubblewrap` 进入挂载命名空间，在内核 VFS 层将 profile 的 `dot-claude/` 目录 bind mount 到真实 `~/.claude/` 之上。在命名空间内，无论 Agent 通过何种方式解析路径，读到的都是隔离后的配置。

```
┌─────────────────────────────────────────────────────┐
│  宿主机文件系统                                       │
│                                                     │
│  /home/user/.claude/          ← 真实、未改动          │
│         ▲                                           │
│         │ bind mount (bwrap)                        │
│         │                                           │
│  /home/user/.agent-box/profiles/dw/dot-claude/      │
│         (profile 的 settings.json, CLAUDE.md, ...)  │
└─────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│  bwrap 命名空间                                      │
│                                                     │
│  --bind / /                                         │
│  --bind <profile>/dot-claude   /home/user/.claude   │
│  --bind <profile>/dot-claude.json  /home/user/.claude.json │
│  --dev /dev --proc /proc --tmpfs /tmp               │
│  --unshare-all --share-net                          │
│  claude                                             │
│                                                     │
│  ⇒ execvpe 替换当前进程；CC 继承 tty、信号、Ctrl-C    │
└─────────────────────────────────────────────────────┘
```

关键属性：

- **内核级隔离** — Agent 在命名空间内无法读取宿主机真实 `~/.claude/`
- **保留 PID/tty** — `os.execvpe` 用 bwrap 替换当前进程，bwrap exec `claude`，终端会话不变，Ctrl-C 直达 CC
- **共享网络**（`--share-net`）— Agent 需要 API 访问
- **模板/Profile 分离** — `init-template` **仅一次**读取宿主机 `~/.claude/`，清除 `env`、`permissions`、`_marker`；`create` 仅从模板复制，此后不再触碰宿主机真实配置
- **`--cwd` 支持** — `agent-box cc --cwd DIR` 在 execvpe 前 `os.chdir`，Agent 看到正确项目根目录

### v1 vs v2

| 版本 | 机制                    | 能否被 `os.userInfo().homedir` 绕过？ | 结果         |
| ---- | ----------------------- | :-----------------------------------: | ------------ |
| v1   | `HOME=<profile> claude` |                 ✅ 能                 | 部分隔离     |
| v2   | `bwrap` bind mount      |                ❌ 不能                | **完全隔离** |

---

## 目录结构

```
agent-box/
├── agent-box                       # 启动 shim（源码直接执行）
├── pyproject.toml                  # setuptools + console_script 入口
├── LICENSE                         # MIT
├── README.md
├── README_CN.md                    # 本文档
├── .gitignore
│
├── src/agent_box/                  # 核心包（零运行时依赖）
│   ├── __init__.py
│   ├── cli.py                      # argparse，子命令分发
│   ├── config.py                   # 路径解析、名称校验
│   ├── providers.py                # provider → env 配置表
│   ├── profile.py                  # init-template / create / list / show / delete
│   ├── edit.py                     # $EDITOR 启动器
│   └── launch.py                   # bwrap 参数构建 + execvpe
│
├── docs/
│   ├── REQUIREMENTS.md             # v1 设计思路
│   ├── IMPLEMENTATION.md           # 完整设计 + 调研笔记
│   └── specs/
│       ├── mvp-implementation.md
│       ├── v2-bwrap-implementation.md
│       └── v2-bwrap-rewrite.md     # v2 规范文档
│
└── (运行时，在宿主机上，不在仓库中)
    ~/.agent-box/
    ├── template/                   # `init-template` 生成
    │   ├── dot-claude/             #    settings.json + skills/ 软链
    │   └── dot-claude.json         #    初始化占位
    └── profiles/<name>/
        ├── meta.yaml               #    name, agent_type, provider
        ├── dot-claude/             #    settings.json + CLAUDE.md + projects/
        └── dot-claude.json         #    初始化占位
```

---

## 设计原则

- **零 Python 运行时依赖** — 仅标准库。`bwrap` 和 `claude` 是系统依赖，非 Python 依赖
- **无数据库** — profile 即目录树，文件系统即真实数据源
- **不修改 Agent** — `agent-box` 是启动器，非包装器。CC 本身不变，只改变它看到的世界
- **不写入宿主机真实 `~/.claude/`** — `init-template` 是唯一读取它的代码，且仅用于生成模板
- **人可读的 profile** — profile 中每个文件都是纯 JSON/YAML/Markdown。CLI 是便利工具，不是牢笼
- **一次安装，N 个身份** — 新增一个身份的成本就是一行 `agent-box create` 命令

---

## Phase 2（尚未实现）

- tmux 布局集成（单终端多 Agent 面板）
- NiceGUI Web profile 编辑器
- 会话历史追踪
- Profile 导入/导出
- 知识库 MCP 共享层

---

## 开发

```bash
# 源码直接运行（无需安装）
./agent-box --help

# 可编辑安装
pip install -e .

# 直接运行子命令
python -m agent_box.cli list
```

### 测试

v0.1.0 无测试套件。MVP 通过 spec 验收清单手动验证（`docs/specs/v2-bwrap-rewrite.md` §验收）。

---

## License

MIT — 详见 [LICENSE](LICENSE)。
