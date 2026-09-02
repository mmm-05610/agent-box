# Central-store pattern matrix

| Project | Store | Identity | Revision/digest | Install/sync | Project handling | Activation/conflict | Architecture |
|---|---|---|---|---|---|---|---|
| `skills` / skills.sh | remote GitHub/index; target native dir | repo + skill slug | source metadata; exact pin not established | copy into selected agents | workspace target option; no automatic central adoption | explicit install; harness precedence | E/A |
| `gh skill` | GitHub source, local native target | repo/skill[@version] | version supported; commit/digest/rollback not promised | copy/install/update | project or user | target agent; native precedence | A/E |
| CC Switch | `~/.cc-switch/skills` SSOT + DB/backups | skill name/source record | DB/source metadata; backup rollback | symlink/copy to Claude/Codex/Gemini/OpenCode | import from app; removes/replaces targets | app matrix; blocked conflicts | B/D |
| Codeg | `~/.codeg/skills` | folder name/pack identity | pack update; digest semantics not public | symlink/junction, copy fallback | import from agent; custom native authoring | blocked or linked-elsewhere | B/D |
| skill-manager | `~/.skill-manager/skills`, cloned `sources/` | slug + source URL | SHA-256 change detection; no immutable version model | atomic symlink deployment, auto-adopt | auto-adopts project skills, which can violate ownership expectations | numeric suffix conflict | B/E |
| Agent Harness | `.harness/src`, Git registries | typed entity id + sourcePath | lock contains source SHA and registry commit | copy full source; render outputs | project is canonical | apply blocks unmanaged/colliding output | A/D/E |
| Hermes | `~/.hermes/skills`, Hub/plugin trees | slug or `plugin:skill` | package/source version not an execution digest | copy; update sync respects edits/deletions | external dirs supported; global is primary | namespaced plugin wins without hiding base | A/D/E |
| OpenAI API Skills | service project store | API skill id | immutable versions and default pointer | zip content download | API project, not local harness scope | API id/version | E/package |

Most systems do not implement bidirectional synchronization. They use one authority, one-way materialization, or an explicit import/adopt operation. No reviewed mainstream project demonstrates a production-grade immutable CAS plus execution-time projection end to end.
