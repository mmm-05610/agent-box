# Cross-harness compatibility

| Harness | Global | Project | Format/supporting files | Recursive/symlink | Activation/projection |
|---|---|---|---|---|---|
| Codex | `~/.agents/skills` (plus CODEX_HOME/plugin surfaces) | `.agents/skills` | Agent Skills folder; scripts/resources supported by implementation | convention; exact symlink policy UNKNOWN | direct native path or isolated Profile Home |
| Claude Code | `~/.claude/skills` | `.claude/skills` | SKILL.md plus Claude frontmatter/features | native scan; symlink policy UNKNOWN | slash/description/plugin; native target |
| OpenCode | `~/.config/opencode/skills`, `~/.claude/skills`, `~/.agents/skills` | corresponding project roots | Agent Skills folder | walks ancestors; symlink policy UNKNOWN | native skill tool/permissions |
| Hermes | `~/.hermes/skills` and external dirs | workspace support is less canonical; `.hermes` plans, external dirs | compatible Agent Skills plus Hermes metadata | scan; symlink policy UNKNOWN | slash/skill_view; plugins namespaced |
| Pi | `~/.pi/agent/skills` | `.pi/skills` | native Agent Skills plus package extensions | package load; symlink policy UNKNOWN | native skill loading/package startup |
| Gemini | `~/.gemini/skills` or `~/.agents/skills` | `.gemini/skills` or `.agents/skills` | Agent Skills; scripts/resources | link command; safe consent | `/skills`, activation consent |
| Copilot | `~/.copilot/skills` or `~/.agents/skills` | `.github/.claude/.agents/skills` | Agent Skills | managed policy may constrain | relevance/policy |

Answer to “one unchanged central skill for five?”: content compatibility is often yes if it uses standard `name`, `description`, Markdown, relative references, and portable scripts. Path compatibility is no unless all targets scan `.agents/skills` or the manager projects it. Metadata is partial (`license`, `compatibility`, `allowed-tools` support varies). Activation is not standardized. Runtime capability is not portable: permission models, tool names, hooks, plugins and shell assumptions differ. Therefore projection/adapters remain necessary.
