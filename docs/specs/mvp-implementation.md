# agent-box MVP Implementation Spec

## Goal

A Python CLI that launches Claude Code with an isolated HOME directory per agent identity. Phase 1: CC only, 4 commands.

## What to Build

```
agent-box create <name> [--provider PROVIDER]   # Create a new CC profile
agent-box list                                   # List all profiles
agent-box cc <name> [--project DIR]             # Launch CC with profile's HOME
agent-box delete <name>                          # Delete a profile
```

## Profile Structure

```
~/.agent-box/profiles/<name>/
├── meta.yaml                    # name, agent_type: cc, provider
└── home/                        # ← set as $HOME for the CC process
    ├── .claude.json             # {"hasCompletedOnboarding": true}
    ├── .claude/
    │   ├── settings.json        # model, permissions, MCP (template)
    │   └── CLAUDE.md            # role prompt (template)
    ├── .gitconfig → symlink ~/.gitconfig
    └── .ssh/      → symlink ~/.ssh/
```

## Commands

### `agent-box create <name> [--provider deepseek|minimax|anthropic]`

1. Create `~/.agent-box/profiles/<name>/home/` directory
2. Write `meta.yaml` with `name`, `agent_type: cc`, `provider`
3. Write `home/.claude.json` = `{"hasCompletedOnboarding": true}`
4. Write `home/.claude/settings.json` from template (provider determines default base_url/model)
5. Write `home/.claude/CLAUDE.md` = `# <name>`
6. Create symlinks: `home/.gitconfig -> ~/.gitconfig`, `home/.ssh/ -> ~/.ssh/`
7. Print success message

### `agent-box list`

1. List all subdirectories in `~/.agent-box/profiles/`
2. For each, read `meta.yaml` and print: name, agent_type, provider
3. JSON output if `--json` flag

### `agent-box cc <name> [--project DIR]`

1. Load profile: find `~/.agent-box/profiles/<name>/`
2. Validate: `meta.yaml` exists, `agent_type` is `cc`, `home/` exists
3. Construct env:
   - `HOME = <profile_home>` (absolute path)
   - Inject API key/base_url/model from `settings.json` env section
4. If `--project DIR`: `os.chdir(DIR)` before exec
5. `os.execvpe("claude", ["claude"], env)` — replace current process with CC

### `agent-box delete <name>`

1. Confirm with user (unless `--force`)
2. Remove `~/.agent-box/profiles/<name>/` directory tree
3. Print confirmation

## Provider Templates

| Provider | ANTHROPIC_BASE_URL | ANTHROPIC_MODEL |
|----------|-------------------|-----------------|
| deepseek | `https://api.deepseek.com/anthropic` | `deepseek-v4-pro` |
| minimax | (user provides) | `minimax-m3` |
| anthropic | (default, empty base_url) | `claude-sonnet-4-6` |

API key: leave placeholder `"sk-REPLACE_ME"` in settings.json. User edits later.

## Error Handling

- Profile not found → `agent-box: <name>: profile not found. Try: agent-box list`
- CC not installed → `agent-box: claude not found in PATH. Install with: npm install -g @anthropic-ai/claude-code`
- Profile name invalid → reject names with `/`, `\`, spaces, leading dots
- meta.yaml missing → `agent-box: <name>: meta.yaml corrupted. Try: agent-box delete <name> && agent-box create <name>`

## Files

All code goes in a single directory `~/projects/agent-box/src/agent_box/`:

```
src/agent_box/
├── __init__.py
├── cli.py              # argparse entry point + main()
├── config.py           # AGENT_BOX_HOME resolution + constants
├── profile.py          # create, list, delete, load meta.yaml
├── launch.py           # cc launch logic (env construction + execvpe)
└── templates.py        # settings.json + CLAUDE.md templates per provider
```

`pyproject.toml` at repo root with entry point `agent-box = agent_box.cli:main`.

## Constraints

- Python 3.9+ (no tomllib, no match/case)
- Zero pip dependencies (stdlib only: argparse, os, sys, json, yaml, pathlib, shutil, subprocess)
- No database, no network calls, no telemetry
- `os.execvpe` for launch (preserves PID, tty, signals, exit code)

## Acceptance Criteria

```bash
# 1. Create
agent-box create decision --provider deepseek
# → creates ~/.agent-box/profiles/decision/

# 2. List
agent-box list
# decision     cc     deepseek

# 3. Launch (in a real terminal)
agent-box cc decision --project /tmp/sandbox
# → CC starts, /model shows deepseek-v4-pro
# → writes sessions to ~/.agent-box/profiles/decision/home/.claude/projects/

# 4. Delete
agent-box delete decision
# → ~/.agent-box/profiles/decision/ is gone
```

## Out of Scope (Phase 2)

- Codex, OpenCode, Hermes support
- `--resume` / session management
- `edit`, `show`, `validate`, `doctor` commands
- env var injection from meta.yaml
- tab completion
- tests (add after MVP confirmed working)
