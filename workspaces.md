# Workspaces — every preserved repository and worktree

**2026-09-21 更新：**当前角色与新集成树见 [development-layout.md](development-layout.md)，
版本见 [development-baseline.json](development-baseline.json)。下文为清理时历史清单，
其 HEAD、进程状态和“当前工作”分类不再代表新开发组织。

Written 2026-09-20. `HEAD`, cleanliness and unique-commit counts are **measured by
the cleanup executor on 2026-09-20**; "owner status" and the class letters come
from the user's four-class instruction — **A** current work retained, **B**
historical unique work preserved pending an ownership audit, **C** clean tree
fully absorbed by a retained branch, **D** dependency/build cache.

Nothing was moved. `repos/` and `worktrees/` are symlinks to the original paths,
so every absolute path printed in the old records, every running service, and
every Windows-side frozen copy still resolves.

## Repositories

| Entry | Real path | Worktrees | Branches | Tags | `.git` size | Bundle |
| --- | --- | --- | --- | --- | --- | --- |
| `repos/backend` | `/home/maoqh/projects/agent-box` | 10 | 48 | 66 | 261 MB | `archive/bundles/agent-box.bundle` (46 MB) |
| `repos/desktop` | `/home/maoqh/projects/agent-box-desktop-next` | 6 | 47 | 26 | 136 MB | `archive/bundles/agent-box-desktop-next.bundle` (111 MB) |
| `repos/studio-legacy` | `/home/maoqh/projects/agent-box-studio` | 3 | 5 | 183 | 142 MB | `archive/bundles/agent-box-studio.bundle` (118 MB) |

Each bundle holds **complete history for every ref** (`git bundle verify` says
"records a complete history"), including the detached worktree `HEAD`s that the
repositories had registered. Restoring any branch, in a scratch directory, without
touching the originals:

```bash
git clone --branch <branch> /home/maoqh/projects/ordessa/archive/bundles/agent-box.bundle /tmp/recover
```

## Worktrees

Class legend: **A** current — keep and use. **B** historical with its own
commits/work — keep, do not judge as dead code yet. **C** clean and fully
absorbed by a retained branch — retirement candidate. **D** generated content —
only removable once rebuildability and absence of live references are confirmed.

### Current work — class A

| Entry | Branch @ HEAD | Clean? | Owner | Notes |
| --- | --- | --- | --- | --- |
| `worktrees/backend-service-env-provider` | `feature/env-provider-v1` @ `003b52b2b18a` | tracked 0 / untracked 0 | executor tree, in flight | **live**: the running trial server imports from here. Has 37 open orders. |
| `worktrees/backend-runtime-round1` | `feature/env-provider-runtime` @ `a7b7b6ff15ab` | tracked 0 / untracked 1 (`.qoder/settings.local.json`) | executor tree, in flight | **live**: the QA trial server (18810) uses its plugins as its plugin root. 27 open orders. |
| `worktrees/desktop-chat-wsl-round1` | `feature/agentbox-desktop-product` @ `08b4eac7fe10` | tracked 0 / untracked 1 (`.qoder/`) | executor tree, in flight | 87 commits unique to this branch. 24 open orders. The user's frozen app was built from a descendant of this branch. |
| `worktrees/desktop-settings-round1` | `feature/agentbox-desktop-settings` @ `01083212aaad` | tracked 0 / untracked 1 (`.qoder/`) | executor tree, in flight | 117 commits unique to this branch. 16 open orders. |
| `repos/desktop` (`main`) | `main` @ `e08fa034f247` | tracked 2 / untracked 29 | **publishing branch** | `main` carries 11 commits that no other branch has. **Do not overwrite.** |

### Historical work with its own content — class B

| Entry | Branch @ HEAD | Dirty | Unique commits | Why kept |
| --- | --- | --- | --- | --- |
| `repos/backend` (`agent-box`) | `studio-backend` @ `a9f749f6ff8c` | 0 / 68 untracked docs | 9 | Git main dir; holds design/research notes no branch has. Snapshotted as `agent-box_maindir`. |
| `worktrees/scheduling-legacy-server-round1` | `feature/server-harness-extension-v1` @ `40717603da3d` | 14 tracked modified / 12 untracked | 500 | **the retired scheduling authority.** Its dirty files are the live scheduling text of the stopped sessions (status, manifest, handoffs, bulletins). Preserved twice: snapshot `scheduling-tree` + `archive/legacy-scheduling/`. |
| `worktrees/studio-ui-reconstruction` | `feat/agentbox-frontend-clean` @ `c65c133c4eea` | **898 tracked modified (864 of them deletions) / 277 untracked** | 2 | Largest uncommitted body of work in the whole workspace. Not part of the current product line. Snapshotted as `studio-ui-reconstruction`. |
| `worktrees/studio-codex-vertical` | `feat/studio-codex-product-vertical` @ `9ad2044221bf` | **57 tracked modified / 51 untracked** | 1 | The Studio product vertical. Snapshotted as `studio-codex-vertical` and used as the end-to-end restore test. |
| `worktrees/legacy-capability-entry-v1` | `feature/capability-entry-v1` @ `1c74d1559ca7` | 0 / 1 untracked | 51 | 51 commits no other branch has. |
| `worktrees/legacy-harness-registry` | `refactor/harness-registry` @ `9fcecd2…` | 0 / 0 | 6 | diverged from `main` (6 ahead / 3 behind). |
| `worktrees/legacy-resource-routing-phase2` | `feat/resource-routing-phase2` @ `ea4880825b06` | 0 / 0 | 4 | diverged from `main` (4 ahead / 2 behind). |
| `worktrees/legacy-studio-backend-core` | `main` @ `6c14ea86…` | 0 / 0 | — | the only checkout of backend `main`; the publishing source's working copy. |
| `worktrees/legacy-desktop-agentbox-ui` | `experiment/agentbox-desktop-frontend` @ `31588667e19a` | 0 / 8 untracked | 9 | 9 commits no other branch has. |
| `/home/maoqh/projects/agent-box-studio` (`repos/studio-legacy`) | `studio-shell` @ `8dce2c022925` | 1 tracked modified / 18 untracked (incl. a 16 MB `dsh-session-*.zip`) | 1 | Studio main dir. The session zip is session material and is deliberately **not** in any Git repo. |
| `worktrees/legacy-harness-expansion` | `feature/harness-expansion-v1` @ `c1a7ea9b8207` | tracked 0 / untracked 0 | **0** | Commits fully absorbed — but its ignored directories contain **`.acceptance-bundle-c4` / `-c8`**, which the user ruled must not be treated as cache. Bundles snapshotted as `harness-expansion-bundles`. |

### Absorbed / clean — class C

| Path | Branch @ HEAD | Blocked by |
| --- | --- | --- |
| `/home/maoqh/projects/agent-box-studio-flat-transcript` | `feat/profile-provider-flat-transcript-ui` @ `3763d0c831ae` — **fully contained in `feat/agentbox-frontend-clean`** (0 ahead / 2 behind) | git refuses removal: it holds only ignored build output (`out/`, `public/vs/`, `next-env.d.ts`, `tsconfig.tsbuildinfo`). Clearing those is class D. |
| `/tmp/audit-fe-2/settings` | detached `d67f9c23ac09` — contained in `feature/agentbox-desktop-settings` | git refuses removal: 87 179 ignored files, dominated by `node_modules/`. Class D. |
| `/tmp/audit-fe-2/app` | detached `a25a5adb01c5` — contained in `feature/agentbox-desktop-product` | git refuses removal: 1 untracked reviewer script (`audit-drive.mjs`, preserved in `archive/reviewer-evidence/audit-fe-2/`) plus `node_modules/`. |

**Retired in this cleanup:** `/tmp/audit-fe-2/server` (detached `90a11cb8e555`,
contained in `feature/env-provider-v1`, 0 dirty, 0 ignored) — removed with
`git worktree remove`, no `--force`; the branch and its commits are untouched.
See [migration-log.md](migration-log.md) M-7.

**Why the three above were *not* retired.** `git worktree remove` refuses when a
tree contains *any* modified, untracked **or ignored** file (verified on a scratch
repository). Clearing those files, or using `--force`, was outside the authority
this round carried. Their commits are safe regardless, because every one of their
HEADs is **also** reachable from a retained branch and is inside the bundles.
Turning them off is a one-line decision for `I` — see
[../cleanup-report.md](../cleanup-report.md) §7 Q-2.

## Owner status

The user closed every session of the former formation on 2026-09-20. **No
worktree currently has a known live writer**, and the cleanup confirmed this
independently: no process has a working directory under any of these paths, and no
open file descriptor points into them. That is evidence, not proof — the cleanup
does not treat "no cwd" as "nobody is using it", which is why nothing was deleted
on that basis alone and why the two trial servers were left running
([environments.md](environments.md)).

## How to restore any of them

- **A branch that still exists locally**: nothing to do — the branch ref lives in
  the repository's common dir and was never touched. `git -C repos/backend worktree add <path> <branch>`.
- **After losing the repository**: clone from the bundle (command above), then
  `git worktree add`.
- **Untracked/ignored documents and reviewer work**: `archive/workspace-backups/<label>/`
  — see [../archive/README.md](../archive/README.md).
