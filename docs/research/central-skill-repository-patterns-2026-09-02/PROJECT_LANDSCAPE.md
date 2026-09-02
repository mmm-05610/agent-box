# Project landscape and identity verification

| Project | Official URL / maintainer | License / maintenance | Actual function | CLI / service | Native-directory write | Tier |
|---|---|---|---|---|---|---|
| OpenAI Codex | https://github.com/openai/codex / OpenAI | Apache-2.0 / active | harness skills + plugins | CLI, no public skill registry in CLI evidence | yes via plugin/install paths | B |
| Anthropic Agent Skills | https://github.com/agentskills/agentskills / Anthropic-led | Apache-2.0 code, CC-BY docs / active | open format and validator | `skills-ref`; no registry | no | A/B |
| Anthropic skills | https://github.com/anthropics/skills / Anthropic | official repository; license per repo | examples/official skills | no central manager | consumers copy/install | B |
| GitHub CLI skill | https://cli.github.com/manual/gh_skill / GitHub | MIT CLI ecosystem / active | search, preview, install, update | `gh skill`; remote GitHub | yes | A |
| Vercel skills | https://skills.sh/docs/cli / Vercel Labs | repo license varies / active | registry/index plus installer | `npx skills`; web service/index | yes | B |
| CC Switch | https://github.com/farion1231/cc-switch / community maintainers | verify repository LICENSE before adoption; active docs | GUI SSOT and multi-app deployment | desktop app; no model service required | yes, links/copies | C/B |
| Codeg | https://docs.codeg.app/guide/skills / Codeg | product license not established here | central packs and agent matrix | desktop app | yes, symlink/junction/copy | B |
| Agent Harness | https://github.com/madebywild/agent-harness / madebywild | MIT / active | canonical project source and provider render | `npx harness`; optional Git registries | project outputs | B/C |
| obra/superpowers | https://github.com/obra/superpowers / obra | repo LICENSE is authoritative; active | skill/plugin package with per-harness adapters | harness-specific installers | yes, per harness | B |
| omrikais/skill-manager | https://github.com/omrikais/skill-manager / omrikais | inspect repository LICENSE; active | local SSOT, adoption, symlink deployment | `sm` CLI/TUI | yes | C |
| skills CLI | https://github.com/vercel-labs/skills / Vercel Labs | inspect repository LICENSE; active | install packs into supported agents | `npx skills` | yes | B |
| Codeg skills | https://docs.codeg.app/guide/skills | product docs; license UNKNOWN | shared store and toggled links | app | yes | B |
| Hermes | https://github.com/NousResearch/hermes-agent / Nous Research | MIT / active | global skills, Hub, plugin namespaces | `hermes skills`, Hub | yes | B |
| Pi | https://github.com/badlogic/pi-mono / badlogic | repo LICENSE authoritative; active | package/extensions and native skill dirs | `pi install`, `-e` | yes | B |
| Skilldex | https://arxiv.org/abs/2604.16911 / research project | source/license must be checked before use | package manager + metadata registry proposal/implementation | `skillpm`/`spm` reported | likely | D |
| Impeccable | https://github.com/pbakaus/impeccable / pbakaus | repo LICENSE authoritative | multi-provider copy/render utility | CLI | yes | C |

Candidates are not all equally mature. The first eleven are directly relevant management implementations; Skilldex and Impeccable are supplementary. `multi-cli` and Codeg-like tools found in the adjacent workspace research are treated as design evidence, not official harness behavior.

Required identity checks were completed at URL/maintainer/function level. License is marked UNKNOWN where the public result did not expose an authoritative LICENSE file; that is a release-gate item, not an assumption.
