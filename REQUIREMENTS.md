# agent-box — Requirements

## Problem

Managing multiple AI agent identities (CC+DeepSeek决策, CC+MiniMax执行, Codex编码, Hermes秘书...) requires constant manual config switching. cc-switch handles provider switching but can't run multiple identities simultaneously because they share the same `~/.claude/` global config.

## Core Concept

**Agent CLI tools become pure runtime frameworks. Agent identity data lives externally in isolated HOME directories.**

```
agent-box cc DW              # Launch CC with DW identity
agent-box cc decision        # Launch CC with decision-maker identity
agent-box cc DW --resume     # Resume last DW session
```

The tool acts as a HOME dispatcher: select profile → point HOME → launch agent process.

## Agent = CLI Tool + Profile (isolated HOME)

Each profile = one agent type + one identity. The `home/` replaces `$HOME` when the agent runs.
The home directory contains ONLY the config for that specific agent type.

```
~/.agent-box/profiles/
│
├── DW/                           # CC + MiniMax M3，DW 执行
│   ├── meta.yaml                 #   agent_type: cc, provider: minimax
│   └── home/                     # ← becomes $HOME at launch
│       ├── .claude/
│       │   ├── settings.json
│       │   ├── settings.local.json
│       │   ├── CLAUDE.md         #   "你是 Polaris DW 执行者..."
│       │   └── projects/         #   per-project memory (CC auto)
│       ├── .claude.json          #   onboarding 占位
│       ├── .gitconfig → ~/.gitconfig    # shared
│       └── .ssh/      → ~/.ssh/         # shared
│
├── decision/                     # CC + DeepSeek，决策者
│   ├── meta.yaml                 #   agent_type: cc, provider: deepseek
│   └── home/
│       └── .claude/              #   只有 .claude/
│           (同上结构...)
│
├── codex-spec/                   # Codex CLI + MiniMax，编码执行
│   ├── meta.yaml                 #   agent_type: codex, provider: minimax
│   └── home/
│       ├── .codex/
│       │   ├── config.toml
│       │   └── auth.json
│       ├── .gitconfig → ~/.gitconfig
│       └── .ssh/      → ~/.ssh/
│
└── hermes/                       # Hermes + MiMo，秘书
    ├── meta.yaml                 #   agent_type: hermes, provider: mimo
    └── home/
        └── .hermes/
            └── config.yaml
```

### meta.yaml — Profile 身份证

每个 profile 的 `meta.yaml` 告诉 agent-box 这个身份的基本信息：

```yaml
name: DW
agent_type: cc # 决定启动哪个 CLI（cc|codex|opencode|hermes）
provider: minimax # 模型供应商
description: DW 多步骤编排执行者
shared:
  symlinks: # 哪些系统文件从真实 HOME symlink
    - .gitconfig
    - .ssh
```

`agent_type` 决定了 agent-box 去找 `home/.claude/` 还是 `home/.codex/` 还是 `home/.hermes/`，然后启动对应的 CLI。

### 会话隔离（CC 自动实现）

CC 的会话记忆存储在 `$HOME/.claude/projects/<project-hash>/memory/`，项目 hash 由项目绝对路径算出。

agent-box 替换 HOME 后，CC 自动将记忆写入 `<profile_home>/.claude/projects/<hash>/memory/`。不同 profile 的会话记忆**天然隔离**，无需额外处理：

```
DW/home/.claude/projects/abc123/memory/    ← DW 的 mentor-squad 项目记忆
decision/home/.claude/projects/abc123/memory/  ← decision 的 mentor-squad 项目记忆
                  ↑ 同一个项目，不同 profile，Hash 相同但 HOME 不同 → 隔离
```

## Isolation Boundary

| Layer                              |  Isolation  | What                       |
| ---------------------------------- | :---------: | -------------------------- |
| settings.json (model, permissions) | ✅ 完全隔离 | per profile home           |
| CLAUDE.md (角色 prompt)            | ✅ 完全隔离 | per profile home           |
| MCP servers config                 | ✅ 完全隔离 | per profile home           |
| Skills                             | ✅ 完全隔离 | per profile home           |
| 会话记忆 (projects/memory)         | ✅ 完全隔离 | per profile home (CC auto) |
| credentials / auth                 | ✅ 完全隔离 | per profile home           |
| hooks / settings.local.json        | ✅ 完全隔离 | per profile home           |
| 项目代码目录                       |   ❌ 共享   | project directory          |
| 项目 .claude/CLAUDE.md             |   ❌ 共享   | per project                |
| 项目 .claude/settings.local.json   |   ❌ 共享   | per project                |
| git config, ssh keys               |   ❌ 共享   | symlink from real HOME     |

## Supported Agents (Phase 1)

| Agent       | Config Path              | Provider        | Use Case      |
| ----------- | ------------------------ | --------------- | ------------- |
| Claude Code | `home/.claude/`          | DeepSeek V4 Pro | 决策讨论      |
| Claude Code | `home/.claude/`          | MiniMax M3      | DW 执行       |
| Codex CLI   | `home/.codex/`           | MiniMax M3      | spec 编码执行 |
| Hermes      | `home/.hermes/`          | MiMo v2.5 Pro   | 秘书          |
| OpenCode    | `home/.config/opencode/` | MiMo            | 临时工具      |

## CLI Interface (MVP)

```
agent-box <agent-type> <profile-name> [options]

agent-box cc DW                 # Launch CC with DW profile
agent-box cc decision           # Launch CC with decision profile
agent-box cc DW --resume        # Resume last session
agent-box cc DW --resume <id>   # Resume specific session
agent-box cc DW --cwd <dir>     # Launch in specific project directory

agent-box codex spec            # Launch Codex with spec profile

agent-box list                  # List all profiles
agent-box create <name>         # Create new profile interactively
agent-box edit <name>           # Edit profile (open in $EDITOR)
agent-box show <name>           # Show profile details
```

## Architecture

```
┌─────────────────────────────────────────────┐
│                agent-box CLI                 │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │ profile   │  │ launch   │  │ session   │  │
│  │ manager   │  │ engine   │  │ manager   │  │
│  └─────┬─────┘  └─────┬────┘  └─────┬─────┘  │
│        │              │             │        │
│  reads/writes    HOME override   resume ID   │
│  profile files   + env vars      lookup      │
└────────┬──────────────┬─────────────────────┘
         │              │
         ▼              ▼
┌─────────────┐  ┌──────────┐
│ profile home │  │ agent CLI │
│ (file tree)  │  │ (CC/Codex) │
└─────────────┘  └──────────┘
```

## Phase 1 Scope (MVP)

1. Python CLI (`pip install`-able or single script)
2. Profile initialization command — creates home directory with skeleton config
3. Launch command — `HOME=<profile_home> <agent_cli>` with proper env vars
4. Support CC first, Codex second (extensible)
5. List, show, edit commands
6. No database — profiles are file trees, managed directly

## Phase 2 (Future)

- tmux layout integration (launch multi-agent panels)
- NiceGUI simple web GUI (profile editor)
- Session history tracking
- Import/export profiles
- Knowledge-base MCP sharing layer

## Design Principles

- No database unless absolutely necessary — files are the source of truth
- Agent CLI tools are NOT modified — agent-box is a launcher, not a wrapper
- Profiles are human-readable and editor-friendly
- One tool installation, N agent identities
