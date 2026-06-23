<p align="center">
  <img src="logo.png" alt="agent-box" width="128" height="128">
</p>

# agent-box

> **AI 编码 Agent 隔离启动器。** 创建多个完整配置的 Agent——每个拥有独立的系统提示词、权限、钩子和工具——在同一台机器上同时运行。基于 bwrap 内核级隔离，无需 Docker。

[English](README.md) | 简体中文

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.9+](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/)
[![v0.4.0](https://img.shields.io/badge/version-0.4.0-orange.svg)](https://github.com/mmm-05610/agent-box/releases)

---

## 解决什么问题

一个 AI 编码 Agent 的完整定义，不只是 prompt，而是整个配置栈：
**CLAUDE.md**（系统级指令）、**settings.json**（权限、工具）、**hooks**（钩子）、
**MCP 服务器**。默认情况下，你只有一个 Agent = 一套配置目录。

但你想创建的远不止一个：

- 🧠 **决策者** — 只做架构设计，编辑权限受限，有结构化输出偏好
- 🔍 **调研者** — 广泛访问权限，不同的工具配置，输出详尽
- 👀 **代码审查员** — 只读模式，专注 diff 分析

每个都是**完整的 Agent**，不只是换个 skill。每个都需要独立的对话历史、独立的记忆、
独立的配置。没有 agent-box，你只能手动备份切换配置文件——或者放弃同时拥有它们。

**agent-box 给每个 Agent 一个独立的 profile。** 启动时 bwrap 在内核 VFS 层做
bind-mount，把 profile 的配置目录覆盖到 Agent 看到的路径。Agent 完全不知道其他
profile 的存在，无论它怎么解析路径都读不到宿主机的真实配置。

```bash
agent-box create decision --type cc --preset decision-maker
agent-box create research --type cc --preset spec-writer
agent-box create reviewer  --type cc --preset blank

agent-box cc decision    # 架构与决策
agent-box cc research    # 深度调研
agent-box cc reviewer    # 代码审查
```

三个 Agent，三套配置栈，三段独立的历史。同一台机器，零手动切换。

---

## 安装

### Windows（GUI 一键安装）

从 [GitHub Releases](https://github.com/mmm-05610/agent-box/releases) 下载安装包，
双击运行即可。自动创建桌面快捷方式、开始菜单和卸载入口。
**需要 WSL2**（推荐 Ubuntu）。

GUI 覆盖全部操作：管理 profile、编辑配置、启动 Agent、环境检查——不需要打开终端。

### Linux / WSL（命令行）

```bash
# 1. 系统依赖
sudo apt install bubblewrap

# 2. 安装 agent-box
pip install agent-box

# 3. 安装至少一个 Agent
npm install -g @anthropic-ai/claude-code   # Claude Code
# 和/或: npm install -g @openai/codex       # Codex
# 和/或: pip install hermes-agent            # Hermes
# 和/或: npm i -g @opencode-ai/opencode      # OpenCode
```

> **macOS 用户：** bwrap 仅支持 Linux。请在 Linux 虚拟机或 WSL2 中使用 agent-box。
> 详见 [docs/troubleshooting/desktop-launch.md](docs/troubleshooting/desktop-launch.md)。

---

## 快速上手

<p align="center">
  <img src="GUI截图.png" alt="agent-box GUI" width="720">
</p>

### GUI（Windows）

1. 从 [最新 Release](https://github.com/mmm-05610/agent-box/releases) 下载安装
2. 点击 profile → **启动** — 终端自动打开，Agent 在隔离环境中运行
3. 使用标签页直接编辑 settings、hooks、auth、CLAUDE.md

### 命令行（Linux / WSL）

```bash
# 创建一个 profile
agent-box create dev --type cc --preset python-dev

# 填入 API Key（在编辑器中打开 profile 配置目录）
agent-box edit dev
#  → 编辑 settings.json，替换占位 API Key

# 启动
agent-box cc dev
```

搞定。Agent 在 bwrap 命名空间中运行，`~/.claude/` 就是你的 profile 配置。
Ctrl-C、终端颜色、信号处理全部正常工作。

---

## 特性

|                         |                                                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| 🔒 **内核级隔离**       | bwrap bind-mount 在 VFS 层替换 Agent 的配置目录。不是 `$HOME` 环境变量——Agent 无法读取宿主机真实配置。    |
| 🎛 **多 Agent 支持**    | Claude Code、Codex、Hermes、OpenCode——统一入口，统一 profile 管理。                                       |
| 📦 **预设模板**         | `python-dev`、`decision-maker`、`spec-writer`——一条命令创建带 CLAUDE.md、hooks、settings 的完整 profile。 |
| 📜 **会话追踪**         | `agent-box sessions` 记录每次启动。知道什么时间跑了什么、退出状态如何。                                   |
| 🪟 **Windows 桌面 GUI** | 管理 profile、编辑配置、查看会话——全在桌面应用中完成。深色/浅色主题。                                     |
| ⚡ **零 Python 依赖**   | CLI：纯标准库。`bwrap` 和 Agent CLI 是系统依赖，不是 Python 依赖。                                        |
| 📂 **文件系统即数据库** | 每个 profile 就是磁盘上的 JSON/YAML/Markdown 文件。用任何编辑器都能改。                                   |

---

## 支持的 Agent

| Agent       | CLI 命令                    | 配置目录        |
| ----------- | --------------------------- | --------------- |
| Claude Code | `agent-box cc <name>`       | `dot-claude/`   |
| Codex       | `agent-box codex <name>`    | `dot-codex/`    |
| Hermes      | `agent-box hermes <name>`   | `dot-hermes/`   |
| OpenCode    | `agent-box opencode <name>` | `dot-opencode/` |

---

## 工作原理

```
宿主机（真实文件系统）          bwrap 命名空间（Agent 看到的）
┌─────────────────────┐         ┌─────────────────────────────┐
│ ~/.claude/          │         │ ~/.claude/  ─────────────── │
│  （不受影响）        │◄ ─ ─ ─ ┤   bind-mount 自 profile     │
│                     │         │                              │
│ ~/.agent-box/       │         │ • settings.json（你的配置）  │
│  profiles/dev/      │         │ • CLAUDE.md  （你的提示词）  │
│   dot-claude/ ──────┘         │ • hooks/     （你的钩子）    │
│   dot-claude.json ─────────── │ • （你的凭证）               │
│                               └─────────────────────────────┘
```

- `os.execvpe` — Agent 在同一终端中替换当前进程
- `--share-net` — API 访问正常工作
- `--tmpfs /tmp` — 每次会话独立的临时目录
- PID/IPC/UTS namespace — 干净的进程隔离

→ 详见：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## CLI 常用命令

| 命令                                                               | 说明                             |
| ------------------------------------------------------------------ | -------------------------------- |
| `agent-box create <name> --type cc \| codex \| hermes \| opencode` | 创建新 profile                   |
| `agent-box list`                                                   | 列出所有 profile                 |
| `agent-box edit <name>`                                            | 在 `$EDITOR` 中打开 profile 配置 |
| `agent-box cc \| codex \| hermes \| opencode <name>`               | 启动 profile                     |
| `agent-box presets`                                                | 列出可用预设                     |
| `agent-box sessions`                                               | 查看启动历史                     |
| `agent-box --version`                                              | 输出版本号                       |

`agent-box --help` 查看完整命令参考。

---

## 预设模板

内置预设一键创建带定制 CLAUDE.md 的 profile：

| 预设             | 适用场景                        |
| ---------------- | ------------------------------- |
| `blank`          | 空白模板——默认配置              |
| `decision-maker` | 架构与设计决策                  |
| `python-dev`     | Python 开发，带测试和 lint 习惯 |
| `spec-writer`    | 规范驱动开发                    |

```bash
agent-box create planner --type cc --preset decision-maker
agent-box presets --type cc          # 列出所有 CC 预设
```

---

## 开发

```bash
git clone https://github.com/mmm-05610/agent-box.git
cd agent-box
pip install -e .[dev,gui]
pytest -q                           # 53 个测试，完全隔离
python gui-redesign.py              # 从源码启动 GUI
```

→ [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
→ [docs/ROADMAP.md](docs/ROADMAP.md)

---

## License

MIT — 详见 [LICENSE](LICENSE)。
