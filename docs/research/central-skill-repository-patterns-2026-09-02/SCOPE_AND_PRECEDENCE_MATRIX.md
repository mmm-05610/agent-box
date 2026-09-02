# Scope and precedence

| Harness | Lowest → highest observed | Name collision | Disable/activation |
|---|---|---|---|
| Codex | built-in/system/managed → user → project `.agents/skills` (source evidence in adjacent harness audit) | exact current CLI precedence is version-sensitive; UNKNOWN where not exposed | discovery plus model/tool selection; plugin activation separate |
| Claude Code | managed/plugin/user/project `.claude/skills` semantics vary by feature; project is local authority | plugin namespaced/priority rules; exact collision rule requires version fixture | slash/description matching, plugin enablement |
| Copilot | built-in/org/user → project `.github/skills`, `.claude/skills`, `.agents/skills` | higher scope wins | relevance-driven; policy can disable |
| Gemini CLI | built-in → extension → user → workspace | higher precedence wins | `/skills enable|disable`, install/link, activation consent |
| OpenCode | global config/Claude/agent-compatible roots → project roots; walks to git worktree | project/local higher; warning/merge behavior version-sensitive | native skill tool and permissions |
| Hermes | bundled/global → external dirs; plugin `plugin:skill` explicit | namespace avoids collision; base and plugin can coexist | slash command, `skill_view`, opt-in optional skills |
| Pi | user `.pi/agent/skills` and project `.pi/skills` / package load paths | package/native conflict behavior version-sensitive | native skill discovery; package/extension startup injection |

Industry pattern: project-local generally outranks global, but explicit collision diagnostics are safer than silent replacement. “Installed” only means discoverable; activation is still relevance, explicit command, profile, plugin, or permission-gated.
