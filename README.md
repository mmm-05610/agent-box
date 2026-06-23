<p align="center">
  <img src="logo.png" alt="agent-box" width="128" height="128">
</p>

# agent-box

> **Isolated launcher for AI coding agents.** Create multiple fully-configured
> agents — each with its own system prompt, permissions, hooks, and tools — on
> the same machine. Kernel-level isolation via bwrap. No Docker.

[English](README.md) | [简体中文](README_CN.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.9+](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/)
[![v0.4.0](https://img.shields.io/badge/version-0.4.0-orange.svg)](https://github.com/mmm-05610/agent-box/releases)

---

## What is agent-box?

A coding agent is defined by its config stack: **CLAUDE.md** (system-level
instructions), **settings.json** (permissions, tools), **hooks**, and **MCP
servers**. Out of the box, you get one agent = one config directory.

But what if you want more than one?

- A **decision-maker** — focused on architecture, limited edit permissions
- A **researcher** — broad access, different tools, exhaustive output
- A **code-reviewer** — read-only, diff-focused

Each is a **complete agent**, not just a skill preset. Each needs its own
conversation history, its own memory, its own config stack. Without agent-box,
you're stuck manually swapping config files every time you switch roles.

**agent-box gives each agent its own isolated profile.** Launch one — or all
three in parallel — and each sees only its own config directory. bwrap
bind-mounts the profile at the kernel VFS layer: the agent cannot read the
host's real config, no matter how it resolves paths.

```
agent-box create decision --type cc --preset decision-maker
agent-box create research --type cc --preset spec-writer
agent-box create reviewer  --type cc --preset blank

agent-box cc decision    # architecture + decisions
agent-box cc research    # deep investigation
agent-box cc reviewer    # code review
```

Three agents, three config stacks, three isolated histories. Same machine. Zero
manual switching.

---

## Installation

### Windows (GUI + one-click installer)

Download the installer from [GitHub Releases](https://github.com/mmm-05610/agent-box/releases),
run it, and you'll have a desktop shortcut, start menu entry, and uninstaller.
**Requires WSL2** (Ubuntu recommended).

The GUI does everything: manage profiles, edit configs, launch agents, check
health — no terminal needed.

### Linux / WSL (CLI)

```bash
# 1. System dependency
sudo apt install bubblewrap

# 2. Install agent-box
pip install agent-box-cli

# 3. Install your agents (at least one)
npm install -g @anthropic-ai/claude-code   # Claude Code
# and/or: npm install -g @openai/codex       # Codex
# and/or: pip install hermes-agent            # Hermes
# and/or: npm i -g @opencode-ai/opencode      # OpenCode
```

> **macOS users:** bwrap is Linux-only. Use agent-box inside a Linux VM or WSL2.
> See [docs/troubleshooting/desktop-launch.md](docs/troubleshooting/desktop-launch.md).

---

## Quick Start

<p align="center">
  <img src="GUI截图.png" alt="agent-box GUI screenshot" width="720">
</p>

### GUI (Windows)

1. Install from the [latest release](https://github.com/mmm-05610/agent-box/releases)
2. Click a profile → **Launch** — a terminal opens with your agent inside its
   isolated environment
3. Use the tabs to edit settings, hooks, auth, and CLAUDE.md directly

### CLI (Linux / WSL)

```bash
# Create a profile
agent-box create dev --type cc --preset python-dev

# Set your API key (opens profile config in $EDITOR)
agent-box edit dev
#  → edit settings.json and replace the placeholder API key

# Launch
agent-box cc dev
```

That's it. The agent runs in a bwrap namespace where `~/.claude/` IS your
profile's config. Ctrl-C, terminal colors, and signals all work normally.

---

## Features

|                               |                                                                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 🔒 **Kernel-level isolation** | bwrap bind-mount replaces the agent's config directory at the VFS layer. No `$HOME` tricks — the agent CANNOT see the host's real config.    |
| 🎛 **Multi-agent**            | Claude Code, Codex, Hermes, OpenCode — same CLI, same profile tree, same launcher.                                                           |
| 📦 **Presets**                | `python-dev`, `decision-maker`, `spec-writer` — one command to create a fully-configured profile with custom CLAUDE.md, hooks, and settings. |
| 📜 **Session tracking**       | `agent-box sessions` logs every launch. Know what ran, when, how long, and whether it exited clean.                                          |
| 🪟 **Windows GUI**            | Manage profiles, edit raw config, track sessions — all from a desktop app. Dark/light themes.                                                |
| ⚡ **Zero Python deps**       | CLI: stdlib only. `bwrap` and agent CLIs are system deps, not Python deps.                                                                   |
| 📂 **Filesystem-native**      | Every profile is plain JSON/YAML/Markdown on disk. Edit with anything. No database for profile storage.                                      |

---

## Supported Agents

| Agent       | CLI command                 | Config directory |
| ----------- | --------------------------- | ---------------- |
| Claude Code | `agent-box cc <name>`       | `dot-claude/`    |
| Codex       | `agent-box codex <name>`    | `dot-codex/`     |
| Hermes      | `agent-box hermes <name>`   | `dot-hermes/`    |
| OpenCode    | `agent-box opencode <name>` | `dot-opencode/`  |

---

## How It Works

```
Host (real filesystem)          bwrap namespace (what the agent sees)
┌─────────────────────┐         ┌─────────────────────────────┐
│ ~/.claude/          │         │ ~/.claude/  ─────────────── │
│  (untouched)        │◄ ─ ─ ─ ┤   bind-mount from profile    │
│                     │         │                              │
│ ~/.agent-box/       │         │ • settings.json (yours)      │
│  profiles/dev/      │         │ • CLAUDE.md   (yours)        │
│   dot-claude/ ──────┘         │ • hooks/      (yours)        │
│   dot-claude.json ─────────── │ • credentials (yours)        │
│                               └─────────────────────────────┘
```

- `os.execvpe` — the agent replaces our process in the same terminal
- `--share-net` — API access works normally
- `--tmpfs /tmp` — fresh temp space per session
- PID/IPC/UTS namespaces — clean process isolation

→ Full details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## CLI Commands

| Command                                                            | What it does                     |
| ------------------------------------------------------------------ | -------------------------------- |
| `agent-box create <name> --type cc \| codex \| hermes \| opencode` | Create a new profile             |
| `agent-box list`                                                   | List all profiles                |
| `agent-box edit <name>`                                            | Open profile config in `$EDITOR` |
| `agent-box cc \| codex \| hermes \| opencode <name>`               | Launch a profile                 |
| `agent-box presets`                                                | List available presets           |
| `agent-box sessions`                                               | View launch history              |
| `agent-box --version`                                              | Print version                    |

`agent-box --help` for the full reference.

---

## Presets

Shipped presets jump-start a profile with a purpose-built CLAUDE.md:

| Preset           | Use case                                         |
| ---------------- | ------------------------------------------------ |
| `blank`          | Clean slate — empty CLAUDE.md, template defaults |
| `decision-maker` | Architecture + design decisions (V4 Pro style)   |
| `python-dev`     | Python development with testing + linting habits |
| `spec-writer`    | Spec-first workflow; writes before coding        |

```bash
agent-box create planner --type cc --preset decision-maker
agent-box presets --type cc          # list all CC presets
```

---

## Development

```bash
git clone https://github.com/mmm-05610/agent-box.git
cd agent-box
pip install -e .[dev,gui]
pytest -q                           # 53 tests, hermetic
python gui-redesign.py              # launch GUI from source
```

→ [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
→ [docs/ROADMAP.md](docs/ROADMAP.md)

---

## License

MIT — see [LICENSE](LICENSE).
