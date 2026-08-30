# Repository Hygiene Closure — 2026-08-30

# Verdict

READY EXCEPT EXTERNAL NATIVE REHEARSAL

The working tree now presents Core + Plugin SDK + official plugins. Core
semantics and historical migrations were not changed. Git staging/commit was
intentionally not performed.

# ACS removal result

The ACS checkout is absent from the repository tree and `.gitmodules` was
removed. The parent gitlink remains an unstaged deletion because Git writes
were prohibited. Formal source, tests, Web, and wheels do not require ACS;
the Harness importer remains external-format based.

# ACS recovery location

`/tmp/agent-box-acs-recovery-20260830/` contains `commit.txt`, `status.txt`,
`dirty.patch`, `untracked-files.txt`, and the preserved checkout. No secret
value was read or printed.

# Final root tree

```text
.github/  docs/  plugins/  src/  tests/  tools/
README.md  README_CN.md  CHANGELOG.md  LICENSE
CLAUDE.md  CONVENTIONS.md  CONVENTIONS_FRONTEND.md  agent-box
pyproject.toml  release-please-config.json  .release-please-manifest.json
```

Ignored local environments may be recreated during development but are not
release inputs.

# Deleted root paths

ACS checkout, `spikes/`, nested `e2e/`, old GUI `gui-web/`, `setup.iss`, root
GUI assets and screenshots, legacy `src/agent_box/presets/` and `templates/`,
retired GUI/history/preview scripts, empty legacy directories, and generated
root residue were removed from the repository tree.

# Moved or archived material

Potentially useful spikes, E2E fixture, workspace, home, `.superpowers`,
report-source, old local homes/worktrees/logs, generated caches, and old GUI
binary assets are preserved under `/tmp/agent-box-*-20260830/`.

# Presets/templates result

Deleted. Claude presets and concrete agent templates have no current Profile
authority and were not moved into Root or Harnesses.

# Spikes/contracts result

Nine frozen contracts were migrated to `docs/contracts/work-core/v0_1/` and
active architecture/validation links were updated. Spike experiments are
outside the repository in `/tmp/agent-box-spikes-archive-20260830/`.

# Local user material preserved

Workspace, `.superpowers`, home, report-source, workboard homes, worktrees,
and ACS dirty work were preserved outside the repository. Credential/config
locations were not opened or printed.

# CI result

CI now targets `plugins/agent-box-web/frontend/`, tests Root and official
plugins, builds wheels, and verifies discovery/doctor. No active CI command
uses `cd gui-web`.

# Release workflow result

Windows installer/PyInstaller/Inno Setup assumptions and `setup.iss` sync were
removed. Release builds the frontend, Root wheel/sdist, and five official
plugin wheels. Release-please remains root-version-led; coordinated future
multi-package versioning is still a product decision.

# Documentation result

README, docs index/release process, contributor conventions, frozen contract
links, archive policy, Pi positioning, and Phase 6 records were updated.
Historical research remains preserved and separated from supported runtime
architecture.

# Official plugin set

`agent-box-web`, `agent-box-harnesses`, `agent-box-git`, `agent-box-tmux`, and
`agent-box-artifacts`. Install with `pip install "agent-box-cli[preview]"`.

# Third-party/example plugin set

`agent-box-pi` remains opt-in third-party/example, uses the general SDK, and is
not part of the Preview extra.

# Root wheel result

`agent_box_cli-1.9.0-py3-none-any.whl` built successfully. It contains Core,
SDK, resource contracts, and nine migrations, with no Web or concrete provider
package.

# Preview clean-install result

Offline installation of Root plus all five official wheels succeeded in a
fresh virtualenv. Discovery found four READY official plugin entries and
`doctor --json` reported registry, Web/static, Git, and execution-provider
health. Root-only install correctly listed no plugins and no Web capability.

# Tests

- Root: 83 passed.
- Web: 14 passed, 3 skipped; Harnesses: 26; Git: 4; tmux: 7; Artifacts: 2;
  Pi: 33 passed.
- Frontend: 6 passed; lint and production build passed with existing duplicate
  i18n-key and unused-import warnings.
- `git diff --check` and checkpoint preflight passed.

# Remaining repository residue

The worktree is intentionally dirty from Phase 6 and this closure. ACS
gitlink and legacy deletions are unstaged. Ignored local `.venv`, `.claude`,
`.codex`, `.agents`, `.mcp.json`, and runtime homes are not release content.

# Remaining release blockers

The controlled Native Codex rehearsal was not run because this task forbids
real model execution. Frontend warnings should be cleaned before stable
release. Human review is required for the preserved ACS dirty work and large
deletion diff.

# Ready for clean checkpoint?

NO — implementation is ready for human review, but staging/commit remains
outstanding.

# Ready for Native Codex rehearsal?

YES — offline chain and clean installs pass; use a temporary home/repository
and do not expose credentials.

# Ready for Preview release after rehearsal?

YES, contingent on successful controlled Native rehearsal, ACS backup review,
checkpoint staging review, and warning cleanup.
