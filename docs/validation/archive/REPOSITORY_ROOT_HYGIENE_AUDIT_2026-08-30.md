# Agent-Box Root and Repository Hygiene Audit
>
> Historical record — describes an earlier architecture or validation state and is not current implementation guidance.
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

Date: 2026-08-30

Scope: read-only audit. No deletion, move, staging, commit, checkout, reset,
push, or secret-value inspection was performed. The only write in this audit
is this report, as explicitly authorized.

# Verdict

## NOT READY FOR CLEANUP IMPLEMENTATION WITHOUT PRESERVATION REVIEW

The production Python source layout is close to the intended Core + Plugins
shape, but the repository is not yet a clean release checkpoint. The working
tree contains a dirty 3.3G ACS submodule, a 637M mostly-untracked `spikes/`
tree, 266M ignored-but-tracked-in-part `workspace/` material, personal
`.superpowers/` material, stale root documentation, old assets/screenshots,
and CI/release configuration that still describes the deleted `gui-web` and
Windows installer.

The most important distinction is that the pending Phase 6 deletion is still
unstaged. Git therefore reports many deleted legacy paths as tracked with
working-tree status `D`; they are not present in the current filesystem, but
remain in the index until a separately authorized checkpoint operation.

# Current root inventory

| Path | Tracked | Ignored | Size | Active reference | Contains user work | Classification | Recommended action |
|---|---:|---:|---:|---|---|---|---|
| `acs/` | gitlink | no | 3.3G | no formal runtime import; submodule metadata only | yes, dirty submodule changes | external dependency / local work | NEEDS HUMAN DATA REVIEW |
| `gui-web/` | 152 paths, all pending `D`; absent on disk | no | absent | stale docs/tools/CI references | deleted working copy | retired product path | DELETE FROM REPOSITORY |
| `spikes/` | 9 frozen contract files | no | 637M | many historical docs link into it | yes; evidence, venvs, runtime/cache | experiment + historical contracts | MOVE INTO DOCS/ARCHIVE |
| `e2e/` | 0 parent paths; nested fixture has its own Git repo | no | 304K | no active product/CI reference found | nested fixture history | experimental fixture | MOVE INTO DOCS/ARCHIVE |
| `workspace/` | 1 tracked file | partially: directory rule does not untrack existing file | 266M | referenced by old docs/migrations and local notes | yes; archives, tgz, JSONL, reports | personal/agent work products | REMOVE FROM GIT, KEEP LOCAL IGNORED after review |
| `home/` | 0 | no | 24K | no active reference | unclear, currently directory shell | local scratch / possible user data | NEEDS HUMAN DATA REVIEW |
| `assets/` | 2 | no | 1.2M | `setup.iss` references `logo.ico`; README previously referenced logo | no obvious user data | legacy GUI branding | DELETE FROM REPOSITORY after installer decision |
| `截图/` | 5 | no | 800K | old README/history only | no | legacy GUI screenshots | MOVE INTO DOCS/ARCHIVE |
| `scripts/` | 2 tracked; additional untracked preview config | no | 108K | old GUI/history scripts; `tmux-preview.conf` local preview aid | possible generated pycache | mixed historical/dev scripts | NEEDS HUMAN DATA REVIEW |
| `tools/` | 1 | no | 12K | checkpoint helper still references `gui-web` | no | development/checkpoint tool | KEEP IN ROOT after updating stale paths |
| `.superpowers/` | 0 | no | 492K | no product reference | yes, personal design/review records | personal tooling output | REMOVE FROM GIT, KEEP LOCAL IGNORED |
| `.agent-box*` | 0 | yes | 156K + 12K | runtime only | possible local configuration | local runtime/personal data | SAFE TO DELETE LOCALLY after data review |
| `.workboard-*` | 0 | yes | 164K, 166M, 172K | no current formal source reference | yes; DBs, Pi worktrees, runtime outputs | runtime residue | SAFE TO DELETE LOCALLY after data review |
| `.worktrees/` | 0 | yes | 24M | no current formal source reference | yes, alternate worktrees | Git worktree state | SAFE TO DELETE LOCALLY only after checking active worktrees |
| `logs/` | 0 | yes | 8K | no current formal reference | yes, local logs | runtime residue | SAFE TO DELETE LOCALLY |
| `report-source.md` | 0 | no | 16K | no active code/CI reference | likely personal temporary report | temporary report | REMOVE FROM GIT, KEEP LOCAL IGNORED or SAFE TO DELETE LOCALLY |
| `AGENTS.md` | 0 | no | 0 | no reference | no content currently | empty local instruction file | SAFE TO DELETE LOCALLY |
| `CLAUDE.md` | 1 | no | 4K | active agent instruction | project notes are stale and refer to GUI/old config | repository instructions | KEEP IN ROOT after rewrite |
| `CONVENTIONS.md` | 1 | no | 16K | no runtime reference | no | historical engineering rules | MOVE INTO DOCS/ARCHIVE or rewrite |
| `CONVENTIONS_FRONTEND.md` | 1 | no | 4K | no active source reference found | no | old frontend conventions | MOVE INTO DOCS/ARCHIVE |
| `agent-box` | 1 | no | 4K | direct source-checkout launcher | useful developer entry point | thin dev launcher | KEEP IN ROOT |
| `setup.iss` | 1 | no | 4K | release-please extra-file; obsolete GUI installer | no | retired Windows installer | DELETE FROM REPOSITORY |
| `release-please-config.json` | 1 | no | 4K | active release workflow | no | stale release configuration | KEEP IN ROOT after removing `setup.iss` extra-file |
| `.release-please-manifest.json` | 1 | no | 4K | active release workflow | no | release metadata | KEEP IN ROOT |
| `.github/` | 3 | no | 20K | CI and release workflows | no | CI/release configuration | KEEP IN ROOT after repair |
| `src/agent_box/presets/` | 8 | no | 60K | no active runtime reference after Phase 6 deletion | no | legacy Profile templates/presets | DELETE FROM REPOSITORY |
| `src/agent_box/templates/` | 9, pending `D` | no | 24K | no active runtime reference | includes secret-shaped filenames/placeholders | legacy concrete-agent config | DELETE FROM REPOSITORY |

Sizes are `du -sh` working-tree measurements. They include ignored and
untracked material where present; they are not wheel sizes.

# Required production directories

The current filesystem under `src/agent_box/` contains the intended live
packages: `cli/`, `extensions/`, `migrations/`, `resource_contracts/`, and
`work_core/`, plus `__init__.py`. The old `work/`, `resources/`, `core/`,
`adapters/`, `launch.py`, `config.py`, `edit.py`, and `project_space.py` are
absent from the working tree, but their deletions are still unstaged Git
changes.

The official plugin directories are present under `plugins/`: Web,
Harnesses, Git, tmux, and Artifacts. `agent-box-pi` is explicitly third-party
and should not be included in the official Preview extra without a separate
ownership/license/release decision. It may remain in the monorepo only as an
opt-in third-party plugin with an explicit README and CI lane; otherwise it
should become a separate repository.

# ACS verdict

## Answers

1. `acs/` is no longer required by the formal Agent-Box runtime path.
2. It can likely be removed from the parent repository, but not in this audit
   and not before preserving its dirty changes.
3. Before removal, record the submodule commit and dirty diff summary, copy
   the complete dirty working tree or export the changes to a location outside
   Agent-Box, obtain human confirmation, and only then remove the parent
   gitlink and `.gitmodules` entry in a dedicated change. Do not use a broad
   cleanup command.

## Evidence

- Parent Git records `acs` as a gitlink at commit
  `a551a38c8346a8c8a69f3287881733bec18ca1df`.
- `git -C acs status` reports 18 modified files and a dirty submodule.
- Formal Harness importer code imports only `agent_box` contracts and reads a
  selected JSON export object/file. It does not import ACS Python/TypeScript
  modules, run an ACS binary, or open an ACS database.
- Formal Web code has no direct ACS dependency.
- Plugin/root packaging metadata has no ACS dependency.
- `src/agent_box/migrations/001_init.sql` contains ACS references only in
  historical comments describing the retired schema; it is not a runtime ACS
  import.
- `.gitmodules` contains only the ACS entry, so its removal is mechanically
  simple after preservation review.

## Recommendation

Keep the external importer and format fixtures/documentation; do not copy ACS
source into a plugin. Preserve the dirty ACS checkout outside this repository
until the owner confirms it is disposable. Then remove the gitlink and
`.gitmodules` entry in a separately reviewed Git change.

# Legacy source leftovers

`src/agent_box/presets/` is a Phase 6 deletion omission in repository hygiene
terms. Its Claude presets are concrete legacy Profile UX and are not consumed
by Harness Profile revisions. They should not be moved wholesale into
Harnesses; the replacement is the Harness-owned immutable Profile repository
and explicit importer.

`src/agent_box/templates/` is also a deletion omission in the current index
state. It contains concrete agent configuration templates, including
`auth.json`-named files and an `.env` placeholder. No values were read. The
files do not enter the current wheel after the pending deletion, but their
tracked presence is still a repository hygiene and secret-scanner risk.

`scripts/history_test.sh` and `scripts/smoke_test_gui.py` are old CLI/GUI
validation paths. They reference retired behavior or obsolete GUI assumptions
and should be deleted after a human confirms no external contributor workflow
depends on them. `scripts/tmux-preview.conf` is a local preview aid and should
not be part of the official user path.

The root `agent-box` launcher is still a useful thin source-checkout wrapper
and is consistent with the target CLI. Keep it.

# Local runtime residue

The following are ignored correctly by `.gitignore`: `.agent-box*`,
`.workboard-*`, `.worktrees/`, `logs/`, `.venv/`, `.claude/`, `.codex/`,
`.agents/`, `.mcp.json`, `__pycache__/`, `.pytest_cache/`, and `nul`.

They are not all disposable without review:

- `.workboard-preview-pi-home/` is 166M and contains worktrees/runtime data;
- `.workboard-*-home/` contains SQLite databases;
- `.worktrees/` may contain active alternate branches/work;
- `.claude/`, `.codex/`, `.agents/`, and `.mcp.json` are credential/config
  sensitive even though ignored;
- `workspace/` contains archives, session JSONL, reports and local research;
  the directory rule does not remove its already tracked file.

No credential content was printed or inspected. The ignored rules are broadly
adequate, but `workspace/`, `.superpowers/`, `home/`, and `report-source.md`
are not protected by the current ignore policy and need explicit human data
review.

# Spikes and E2E verdict

`spikes/` is not a production directory. Only nine frozen Core contract files
are tracked; the remaining roughly 23,000 files are untracked working-tree
material. It contains virtual environments, runtime directories, generated
evidence, and at least environment/config-shaped files. It should not remain
at the root in a release checkpoint.

The nine frozen contracts are still referenced by multiple architecture and
validation documents. First migrate or copy the authoritative contract texts
to `docs/contracts/` (or `docs/architecture/contracts/`) and update links.
Then archive or remove the experiments. Do not bulk-delete before link
conversion and before separating reproducible evidence from local runtime.

`e2e/` contains a small nested Git fixture repository and a reviewer note but
no active product or CI reference was found. It is not required by the formal
Preview package. Move its useful fixture/readme into a clearly named test or
docs archive location, or remove it after human review.

# Web and frontend residue

The production frontend is now physically under
`plugins/agent-box-web/frontend/` and the Web wheel owns its static bundle.
`gui-web/` is absent from the filesystem but has 152 pending deletions in the
working tree, so Git still sees the old path until a checkpoint is authorized.

The current CI workflow is incorrect:

```text
cd gui-web && npm ci
cd gui-web && npx vitest run
cd gui-web && npm run build
```

Those commands must target `plugins/agent-box-web/frontend/`. The release
workflow also still describes Windows GUI/Linux GUI artifacts and references
`setup.iss`. Both are stale for the current Web Host architecture.

# CI and release configuration problems

1. `.github/workflows/ci.yml` fails because `gui-web/` no longer exists.
2. CI installs only `.[dev]`; it does not run official plugin suites or verify
   the Preview wheel composition.
3. CI does not build the Web wheel or verify current static asset ownership.
4. `release-please-config.json` still updates obsolete `setup.iss`.
5. `release-please.yml` builds and uploads only the Root wheel/sdist, not the
   Web, Harnesses, Git, tmux, and Artifacts wheels required by Preview.
6. Release comments still promise Windows installer/Linux GUI artifacts that
   are no longer part of the supported structure.
7. `tools/create-restructure-checkpoint.sh` still contains many `gui-web`
   paths and old source lists despite its partial update; it is unsafe as a
   current checkpoint helper until rewritten and reviewed.

These are concrete release/checkpoint blockers independent of Python feature
tests.

# Documentation hygiene

Current formal docs include the updated README files, `docs/README.md`,
`docs/ARCHITECTURE.md`, Plugin SDK guidance, architecture/ADR documents,
phase validation records, and the Phase 6 ledger/RC reports.

Historical or superseded material remains mixed into the active tree:

- `docs/REQUIREMENTS.md` still presents old `agent-box create` behavior;
- `CLAUDE.md` still describes bwrap, `library.db`, PyWebView, and `gui-web`;
- `CONVENTIONS.md` mandates deleted `config.py`, `core/library.py`, and
  `core/io.py` paths;
- `CONVENTIONS_FRONTEND.md` is not aligned with the plugin-owned frontend;
- many validation/research documents link directly to `spikes/` and old
  `gui-web` paths;
- older docs describe `agent-box-codex` and `preview-resources` as active.

Do not batch-delete research records. Add clear `Superseded`/`Historical`
markers and move stable historical material into `docs/archive/` or preserve
it with link stubs. Migrate the frozen contracts before removing their spike
location. `report-source.md` is a temporary personal report, not a formal
documentation artifact.

# Root files verdict

Keep: `README.md`, `README_CN.md`, `LICENSE`, `pyproject.toml`, the thin
`agent-box` launcher, `.release-please-manifest.json`, and a repaired
`.github/` configuration.

Rewrite or archive: `CLAUDE.md`, `CONVENTIONS.md`,
`CONVENTIONS_FRONTEND.md`, and `CHANGELOG.md` references to old products.

Remove after human/release review: `setup.iss`, root `assets/`, old `截图/`,
and temporary `report-source.md`. Root branding should be reintroduced only if
the Web Host/CLI release actually needs it and its ownership is documented.

`AGENTS.md` is empty and untracked; it has no current value. `.superpowers/`
is personal work and should remain outside Git.

# Safe cleanup candidates

Safe only after checking for active processes or user work:

- generated `__pycache__/` and `.pytest_cache/`;
- `logs/`;
- obsolete `.workboard-*` preview homes after preserving needed evidence;
- `.worktrees/` after checking active worktrees;
- local build/venv/runtime/cache directories under `spikes/`;
- empty `AGENTS.md` and temporary `report-source.md`.

These are not safe for automatic deletion merely because they are ignored:
`.claude/`, `.codex/`, `.agents/`, `.mcp.json`, workspace archives, ACS dirty
changes, and any nested Git worktree.

# Items requiring preservation or backup

Before any cleanup implementation, preserve:

1. ACS dirty changes, outside the repository, with commit and diff metadata;
2. any useful frozen Core contract text and links from `spikes/`;
3. reproducible validation evidence that is not generated runtime/cache;
4. any user-authored material under `workspace/`, `.superpowers/`, `home/`,
   or `.agent-box-local/`;
5. nested `e2e` fixture history if it is needed for a future test lane.

# Proposed final root tree

```text
agent-box/
├── .github/
├── docs/
│   ├── architecture/
│   ├── contracts/
│   ├── plugins/
│   ├── validation/
│   └── archive/
├── plugins/
│   ├── agent-box-web/
│   ├── agent-box-harnesses/
│   ├── agent-box-git/
│   ├── agent-box-tmux/
│   └── agent-box-artifacts/
├── scripts/                 # only maintained contributor checks
├── tools/                   # maintained exact-path tooling
├── src/agent_box/
│   ├── cli/
│   ├── extensions/
│   ├── migrations/
│   ├── resource_contracts/
│   ├── work_core/
│   └── __init__.py
├── tests/
├── agent-box
├── pyproject.toml
├── README.md
├── README_CN.md
└── LICENSE
```

No ACS submodule, root `spikes/`, root `workspace/`, root screenshots,
Windows installer, legacy templates/presets, or personal tool output should be
in this final tree.

# Ordered cleanup plan

1. Human-review and back up ACS dirty changes; do not touch its contents.
2. Migrate frozen contracts and stable evidence links from `spikes/` into
   `docs/`; classify or discard local runtime/cache separately.
3. Decide whether third-party Pi remains in the monorepo; keep it out of the
   official Preview extra either way.
4. Repair CI to build/test `plugins/agent-box-web/frontend/`, all official
   plugin suites, and clean wheels.
5. Remove obsolete release-please `setup.iss` handling and obsolete GUI
   artifact promises.
6. Rewrite `tools/create-restructure-checkpoint.sh` with only current exact
   paths; do not use broad `git add`.
7. Mark old docs superseded and migrate/archive stable history without broken
   links.
8. Remove root assets/screenshots, old scripts, `setup.iss`, and legacy docs
   only after ownership review.
9. Remove ACS gitlink and `.gitmodules` entry in a separate explicitly
   authorized Git change after preservation.
10. Perform a clean checkout validation and only then create a release
    checkpoint.

# Deletion safety notes

- Never run recursive deletion against the repository root, `acs/`,
  `.worktrees/`, `workspace/`, or a user home.
- An ignored path may still contain credentials, active work, or evidence.
- A pending `D` status is not the same as a completed checkpoint; do not
  assume deleted files are safely recorded until a human reviews the diff.
- Do not inspect or print credential files, auth JSON, environment values, or
  secret-shaped evidence while cleaning.
- Preserve submodule dirty work before changing the parent gitlink.

# Ready / Not Ready for cleanup implementation

Cleanup implementation is complete in the working tree. The ACS gitlink and
legacy deletions remain unstaged because this work forbids Git staging and
commit; human review is required before checkpoint creation.
