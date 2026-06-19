# DW Prompt: agent-box Implementation Plan

## Context

agent-box is a CLI tool that gives each AI agent (Claude Code, Codex, OpenCode, Hermes) an isolated identity by overriding the HOME environment variable at launch. Think of it as cc-switch's missing half: cc-switch switches between configs (one at a time), agent-box lets multiple identities run simultaneously with complete isolation.

## What to Produce

**A single implementation plan document** (`IMPLEMENTATION.md`) covering:

### 1. Technical Research

- Verify CC config loading: does `$HOME/.claude/` path have any alternative env var override (like `CLAUDE_CONFIG_HOME`)? Check CC official docs, community knowledge, and any discoverable env vars.
- Verify Codex config loading: same check. Is it pure `$HOME/.codex/` or is there `CODEX_CONFIG_HOME`?
- Verify OpenCode config paths: `~/.config/opencode/` and `~/.local/share/opencode/` — confirm and document.
- Verify Hermes config paths: check `~/.hermes/` or whatever hermes uses.

### 2. Profile Directory Specification

- Exact directory tree for each supported agent type
- Which files are managed by agent-box vs auto-created by the agent
- Symlink strategy for shared files (.gitconfig, .ssh, .npmrc)
- `meta.yaml` schema for profile metadata
- Where profiles are stored: `~/.agent-box/profiles/` or `$AGENT_BOX_HOME/profiles/` or XDG?

### 3. Launch Mechanism Design

- Exact command construction for each agent type
- Environment variable injection (API keys, base URLs, proxy settings)
- How `--cwd` (project directory) is passed
- How `--resume` works for each agent type (CC, Codex have different resume mechanisms)
- Edge cases: what if the agent CLI is not installed? What if profile home is corrupted?

### 4. CLI Design

- Command structure: `agent-box <agent> <profile> [options]`
- Subcommands: `create`, `list`, `show`, `edit`, `delete`, `launch`
- Error handling and user feedback
- Tab completion support (optional, note complexity)

### 5. Implementation Plan (Phase 1)

- Tech stack: Python (pure stdlib + click/typer? or just argparse?)
- File-by-file module breakdown
- Step-by-step implementation order (e.g., "1. profile init command, 2. launch command, 3. list/show...")
- Testing strategy

### 6. Open Questions / Decision Points

- Any trade-offs or unresolved design decisions to bring back for user approval
- Risks and mitigations

## Rules

- **Do NOT write any code.** This is a design/planning task only.
- Focus on practical implementation, not theoretical architecture.
- Phase 1 is MVP — the simplest thing that works. No over-engineering.
- The plan should be actionable: someone reading it can implement agent-box without asking further questions.

## Reference

Full requirements: see `REQUIREMENTS.md` in the same directory.
