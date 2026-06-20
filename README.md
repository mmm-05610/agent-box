# agent-box

> **Isolated HOME launcher for coding agents** — run Claude Code as multiple

[English](README.md) | [简体中文](README_CN.md)

> identities (different providers, different prompts) on the same machine, with
> **kernel-level isolation** via [bubblewrap](https://github.com/containers/bubblewrap)
> bind mounts.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.9+](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/)
[![v0.1.0](https://img.shields.io/badge/version-0.1.0-orange.svg)](#)

---

## Why

AI agent CLIs (Claude Code, Codex, Hermes, ...) read their identity, model
provider, and per-project memory from a single `~/.claude/` (or `~/.codex/`,
etc.) directory. Running two agent identities on the same machine means
constantly editing config files and fighting the on-disk state.

`agent-box` solves this by giving each identity its own profile directory and
launching the agent inside a `bwrap` mount namespace where the profile is
bind-mounted over the real `~/.claude/`. The agent sees its own world; the
host filesystem is untouched.

```
agent-box cc decision     # CC + DeepSeek, 决策者
agent-box cc dw           # CC + MiniMax,   DW 执行
agent-box cc spec         # CC + Anthropic,  spec 写作
```

Each identity runs in parallel, in separate terminals, with fully isolated
config, credentials, and per-project memory.

---

## Install

### Requirements

- **Python 3.9+** (stdlib only — no Python dependencies)
- **`bubblewrap`** (`bwrap`) — system package, see below
- **Claude Code** (`claude` CLI) — installed once globally via npm

### System packages

```bash
# Debian / Ubuntu
sudo apt install bubblewrap

# Fedora / RHEL
sudo dnf install bubblewrap

# Arch
sudo pacman -S bubblewrap

# macOS — bwrap is unavailable; v2 bwrap isolation requires Linux
```

### Claude Code

```bash
npm install -g @anthropic-ai/claude-code
```

### agent-box itself

From a source checkout:

```bash
git clone https://github.com/mmm-05610/agent-box.git
cd agent-box
pip install -e .
# or, no install needed:
./agent-box --help
```

From PyPI (once published):

```bash
pip install agent-box
```

---

## Quick Start

```bash
# 1. Bootstrap the template from your real ~/.claude/ (one time)
agent-box init-template

# 2. Create one profile per agent identity
agent-box create decision --provider deepseek
agent-box create dw       --provider minimax
agent-box create spec     --provider anthropic

# 3. Set the API key in the profile you want to use
agent-box edit decision
#  → opens ~/.agent-box/profiles/decision/dot-claude/settings.json
#  → replace sk-REPLACE_ME with your real ANTHROPIC_AUTH_TOKEN

# 4. Launch — each command is a fully isolated CC session
agent-box cc decision
agent-box cc dw
agent-box cc spec --cwd ~/projects/my-app
```

That's it. Run `agent-box cc dw` in terminal A and `agent-box cc decision` in
terminal B — both are live, both see their own config, neither leaks into the
other.

---

## Command Reference

| Command                                                                    | What it does                                                           |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `agent-box init-template [--force]`                                        | Extract a clean template from `~/.claude/` (strips secrets)            |
| `agent-box create <name> --provider <p>`                                   | Create a new profile (auto-inits template if missing)                  |
| `agent-box list [--json]`                                                  | List all profiles                                                      |
| `agent-box show <name>`                                                    | Show metadata, provider, model, base_url for a profile                 |
| `agent-box edit <name> [--claude-md \| --local]`                           | Open a profile config file in `$EDITOR`                                |
| `agent-box config <name> [<key> [<value>]]`                                | Get/set individual config values (e.g. `api-key`, `model`, `base-url`) |
| `agent-box test <name>`                                                    | Test API connectivity for a profile                                    |
| `agent-box cc <name> [--cwd DIR]`                                          | Launch Claude Code under a profile (the headline command)              |
| `agent-box component list [--type] [--region] [--tag] [--user-only]`       | List built-in and user components (providers, MCP servers)             |
| `agent-box component show <id> [--type]`                                   | Show one component's full config                                       |
| `agent-box component add --type <t> --id <id> --name <n> --config '{...}'` | Add a user-defined component                                           |
| `agent-box component delete <id> [--type]`                                 | Delete a user-defined component (built-ins are protected)              |
| `agent-box delete <name> [--force]`                                        | Delete a profile                                                       |
| `agent-box --help`                                                         | Full CLI help                                                          |

### Providers

| Provider    | Base URL                             | Model               |
| ----------- | ------------------------------------ | ------------------- |
| `deepseek`  | `https://api.deepseek.com/anthropic` | `deepseek-v4-pro`   |
| `minimax`   | `https://api.minimaxi.com/anthropic` | `MiniMax-M2.7`      |
| `anthropic` | `https://api.anthropic.com`          | `claude-sonnet-4-6` |

All three CC tier model env vars (`HAIKU`/`SONNET`/`OPUS`) default to the
provider's primary model, so `/model` inside CC consistently shows one model
regardless of the tier CC selects internally.

---

## How It Works

### The isolation problem

`HOME` override (v1) is defeated by `os.userInfo().homedir` inside CC. The
agent re-derives the real home and reads the host's real `~/.claude/`. **Partial
isolation. Broken.**

### The v2 solution: bwrap bind mount

`agent-box v2` uses `bubblewrap` to enter a mount namespace and bind the
profile's `dot-claude/` directory over the real `~/.claude/` **at the kernel
VFS layer**. Inside the namespace, the path is rewritten regardless of how
the agent resolves it.

```
┌─────────────────────────────────────────────────────┐
│  host filesystem                                    │
│                                                     │
│  /home/user/.claude/          ← real, untouched     │
│         ▲                                           │
│         │ bind mount (bwrap)                        │
│         │                                           │
│  /home/user/.agent-box/profiles/dw/dot-claude/      │
│         (profile's settings.json, CLAUDE.md, ...)   │
└─────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│  bwrap namespace                                    │
│                                                     │
│  --bind / /                                         │
│  --bind <profile>/dot-claude   /home/user/.claude   │
│  --bind <profile>/dot-claude.json  /home/user/.claude.json │
│  --dev /dev --proc /proc --tmpfs /tmp               │
│  --unshare-all --share-net                          │
│  claude                                             │
│                                                     │
│  ⇒ execvpe replaces our PID; CC inherits tty,       │
│    signal handlers, Ctrl-C still works.             │
└─────────────────────────────────────────────────────┘
```

Key properties:

- **Kernel-level isolation** — there is no way for the agent to read the host's real `~/.claude/` from inside the namespace.
- **PID/tty preserved** — `os.execvpe` replaces our process with `bwrap`, which execs `claude`. The terminal session is unchanged; Ctrl-C still goes to CC.
- **Network shared** (`--share-net`) — the agent needs API access to Anthropic/DeepSeek/MiniMax.
- **Template / profile split** — `init-template` reads the host's real `~/.claude/` **once** and strips secrets (`env`, `permissions`, `_marker`); `create` only copies from the template. The host's real config is never written to after that.
- **No `os.chdir` hack** — `--cwd` on `agent-box cc` is honored by `os.chdir` in the parent process before `execvpe`, so the agent sees the right project root.
- **API key injection** — `settings.json`'s `env` block is overlaid onto the bwrap child environment, with placeholders (`sk-REPLACE_ME`, empty strings) skipped to force the user to fix them.

### v1 vs v2

| Version | Mechanism               | Defeatable by `os.userInfo().homedir`? | Result             |
| ------- | ----------------------- | :------------------------------------: | ------------------ |
| v1      | `HOME=<profile> claude` |                 ✅ Yes                 | Partial isolation  |
| v2      | `bwrap` bind mount      |                 ❌ No                  | **Full isolation** |

---

## Project Structure

```
agent-box/
├── agent-box                       # launcher shim (direct exec from source)
├── pyproject.toml                  # setuptools + console_script entry point
├── LICENSE                         # MIT
├── README.md
├── .gitignore
│
├── src/agent_box/                  # the package (zero runtime deps)
│   ├── __init__.py
│   ├── cli.py                      # argparse, subcommand dispatch
│   ├── config.py                   # path resolution, name validation
│   ├── providers.py                # provider → env block table
│   ├── profile.py                  # init-template / create / list / show / delete
│   ├── edit.py                     # $EDITOR launcher
│   └── launch.py                   # bwrap argv construction + execvpe
│
├── docs/
│   ├── REQUIREMENTS.md             # v1 design rationale
│   ├── IMPLEMENTATION.md           # full design + research notes
│   └── specs/
│       ├── mvp-implementation.md
│       ├── v2-bwrap-implementation.md
│       └── v2-bwrap-rewrite.md     # canonical v2 spec
│
└── (runtime, on the host, not in repo)
    ~/.agent-box/
    ├── template/                   # produced by `init-template`
    │   ├── dot-claude/             #    settings.json + skills/ symlink
    │   └── dot-claude.json         #    onboarding placeholder
    └── profiles/<name>/
        ├── meta.yaml               #    name, agent_type, provider
        ├── dot-claude/             #    settings.json + CLAUDE.md + projects/
        └── dot-claude.json         #    onboarding placeholder
```

### Source map

| File           | Responsibility                                              |
| -------------- | ----------------------------------------------------------- |
| `cli.py`       | argparse tree; one `cmd_*` per subcommand                   |
| `config.py`    | `$AGENT_BOX_HOME` resolution, path helpers, name validation |
| `providers.py` | Per-provider base URL / model / tier env block table        |
| `profile.py`   | `init-template`, `create`, `list`, `show`, `delete`         |
| `edit.py`      | `subprocess.Popen([$EDITOR, path])`                         |
| `launch.py`    | `build_bwrap_argv`, `build_child_env`, `os.execvpe`         |

---

## Design Principles

- **Zero Python runtime dependencies** — stdlib only. `bwrap` and `claude` are
  system dependencies, not Python dependencies.
- **No database** — profiles are a directory tree; the filesystem is the
  source of truth.
- **Don't modify the agent** — `agent-box` is a launcher, not a wrapper. CC is
  unchanged; we only change what it sees.
- **Don't write to the host's real `~/.claude/`** — `init-template` is the
  only code that ever reads it, and only to produce the template.
- **Human-editable profiles** — every file in a profile is a plain JSON /
  YAML / Markdown document. The CLI is a convenience, not a cage.
- **One install, N identities** — the cost of adding a new identity is one
  `agent-box create` command.

---

## Phase 2 (not yet implemented)

- tmux layout integration (multi-agent panels in one terminal)
- NiceGUI web profile editor
- Session history tracking
- Import/export profiles
- Knowledge-base MCP sharing layer

---

## Development

```bash
# Run from a source checkout without installing
./agent-box --help

# Editable install
pip install -e .

# Run a single subcommand directly
python -m agent_box.cli list
```

### Testing

There is no test suite in v0.1.0. The MVP is verified manually via the spec
acceptance checklist (`docs/specs/v2-bwrap-rewrite.md` §验收).

---

## License

MIT — see [LICENSE](LICENSE).
