# Source ledger

Accessed 2026-09-02 (dynamic pages may change).

| ID | Source | Exact location | Fact used | Tier |
|---|---|---|---|---|
| S1 | https://github.com/agentskills/agentskills | `docs/specification.mdx`; `docs/client-implementation/adding-skills-support.mdx` | SKILL.md format, progressive disclosure, supporting files; location is not mandated and `.agents/skills` is convention | A/B |
| S2 | https://docs.github.com/en/copilot/concepts/agents/about-agent-skills | About agent skills | Copilot project/user paths and open standard | B |
| S3 | https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/using-agent-skills.md | discovery tiers, management, consent | built-in/extension/user/workspace precedence; install/link/disable; consent | B |
| S4 | https://opencode.ai/docs/skills | Place files / discovery | project/global `.opencode`, `.claude`, `.agents`; ancestor walk | B |
| S5 | https://github.com/NousResearch/hermes-agent/blob/main/website/docs/guides/work-with-skills.md | install/plugin sections | copy to `~/.hermes/skills`, Hub URLs, plugin namespace, opt-in | B |
| S6 | https://cli.github.com/manual/gh_skill | command reference | GitHub repo/local install, project/user targets, search/preview/update | B |
| S7 | https://skills.sh/docs/cli | CLI reference | npx installer and pack/index concept | B |
| S8 | https://cc-switch.dev/docs/extensions/skills/ | uninstall/backup | SSOT, app directories, backup restore | B |
| S9 | https://docs.codeg.app/guide/skills | enabling | `~/.codeg/skills`, symlink/junction/copy fallback, blocked conflicts | B |
| S10 | https://github.com/madebywild/agent-harness | README and docs | `.harness/src` canonical source, provider render, Git registry pull | B/C |
| S11 | https://github.com/obra/superpowers | installation matrix | per-harness plugin/package installation; separate targets | B |
| S12 | https://github.com/omrikais/skill-manager | README / source sync / auto-adopt | central store, source clones, atomic symlinks, adoption/conflict suffixes | C |
| S13 | https://developers.openai.com/api/reference/go/resources/skills | Skills and Versions | API project skill IDs, immutable versions, default pointer, zip content | B |
| S14 | https://github.com/openai/codex | adjacent local dossier `harness-native-knowledge-2026-09-01/harnesses/codex/FACTS.md` | Codex versioned scope/config facts; native skill behavior remains version-sensitive | A/B |
| S15 | https://github.com/badlogic/pi-mono | official repository identity | Pi package/native skill ecosystem; exact path evidence in adjacent dossier | B |
| S16 | https://arxiv.org/abs/2604.16911 | Skilldex abstract | supplementary package-manager/registry architecture, not mainstream proof | D |

Conflicting evidence: OpenCode docs currently list `.opencode/skills`, while older/community plugin material mentions migration to `skill/` and older paths. This is version-sensitive and left as an explicit compatibility risk. Hermes has strong global-skill documentation; project-local semantics are less canonical than global/external directories.
