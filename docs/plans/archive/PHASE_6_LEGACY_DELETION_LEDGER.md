# Phase 6 Legacy Deletion Ledger
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

Date: 2026-08-30

## Decision rule

Deletion required a replacement capability, no supported runtime caller, and
an import/packaging check. Tests that exercised retired ownership were removed;
Core semantic tests and official plugin tests remain.

| Path / surface | Decision | Evidence / rationale |
|---|---|---|
| `src/agent_box/work/` | DELETE | Fixed 1.x workflow, session/provider/artifact/workspace implementations; Web and official plugins replace the supported path. |
| `src/agent_box/resources/` | DELETE | Old Profile, sessions, MCP/skills/hooks/prompt/provider application and duplicate artifact authority; Harness/Artifacts own replacements. |
| `src/agent_box/core/` | DELETE | Old DB location, agent catalog, config I/O and concrete library; durable DB moved to `work_core.db`, historical SQL unchanged. |
| `src/agent_box/adapters/` | DELETE | ACS/model concrete adapters are retired; Harness importers are read-only and plugin-owned. |
| `src/agent_box/launch.py` | DELETE | bwrap/profile launch orchestration replaced by Harness native launch. |
| `src/agent_box/config.py` | DELETE | Duplicate profile/agent/project/session configuration authority; provider-neutral home/database paths are `work_core.runtime`. |
| `src/agent_box/edit.py` | DELETE | Retired interactive profile editor. |
| `src/agent_box/project_space.py` | DELETE | Legacy project/profile selection and mount planner; Git selector owns exact workspaces. |
| `src/agent_box/cli/shell.py` and legacy command sets | DELETE | Retired REPL/use/apply/exec/profile/work commands; no supported caller. |
| `src/agent_box/work_core/cli.py` | DELETE | Opt-in development CLI is not the supported Root CLI. |
| root templates/presets and agent registry JSON | DELETE | Concrete Agent/Profile implementation and secret-shaped template residue. |
| `plugins/agent-box-codex/` | HISTORICAL/DELETE | Consolidated into Harnesses; no entry point or source package remains. |
| `plugins/agent-box-preview-resources/` | HISTORICAL/DELETE | Replaced by Git, tmux, and Artifacts; no entry point or source package remains. |
| `gui-web/` and retired desktop paths | HISTORICAL/DELETE | Production Web moved to `plugins/agent-box-web`; no supported GUI runtime. |
| `scripts/preview_demo/`, `work-acp-probe.py` | DELETE | Preview-only paths referenced retired modules and are not user paths. |
| `src/agent_box/migrations/*.sql` | KEEP / HISTORICAL COMPATIBILITY | Historical upgrade chain is packaged unchanged and executed only by Core persistence. |
| `work_core/`, `extensions/`, `resource_contracts/`, thin `cli/` | KEEP | Frozen Core, SDK, Contracts, discovery/diagnostics, and Host delegation. |

## Compatibility shims

None. No deprecated import-forwarding package or legacy CLI alias remains.

## Audit result

`rg` over active Python source finds no imports of deleted Root modules, no
`shell=True`, no Core concrete provider implementation, and no duplicate Codex
entry point. Build staging and egg-info caches were removed before wheel
validation; no runtime database/auth file is tracked.

## Repository hygiene closure — 2026-08-30

- ACS checkout was removed from the repository tree after recovery materials
  were written to `/tmp/agent-box-acs-recovery-20260830/`; the gitlink remains
  an unstaged deletion for the human checkpoint.
- Frozen contracts now live under `docs/contracts/work-core/v0_1/`.
- Presets, templates, retired GUI assets/scripts, spikes, and the nested E2E
  fixture were removed from the repository tree; useful local material is
  preserved under `/tmp/agent-box-*-20260830/`.
- CI and release workflows now target the Web plugin and build all five
  official plugin wheels. No Core semantic files or migrations were changed.
