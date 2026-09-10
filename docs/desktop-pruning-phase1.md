# Desktop pruning, phase 1 — removing the standalone TUI and Web Dashboard

Scope of this round, stated up front: delete the two standalone product frontends this fork does
not ship — `ui-tui/` (the Ink terminal UI) and `web/` (the browser Dashboard SPA) — together with
the workspace, build, CI, Docker and nix wiring that existed only to build or launch them, plus the
one Desktop affordance that depended on the removed TUI. Nothing else was touched, and no
`gateway/`, `acp_adapter/`, `cron/`, messaging component, or agent-runtime business logic was
changed.

Two things this document is not allowed to claim: that `tui_gateway/` was removed (it was not), and
that a check passed when it was not run. Every verification result below is either a command that
ran with its outcome, or an explicit statement that it did not run and why.

## 1. What was removed

| Removed | Files | Lines |
|---|---:|---:|
| `ui-tui/` (Ink terminal UI, package `hermes-tui`) | 489 | 99,891 |
| `web/` (browser Dashboard SPA, package `web`) | 192 | 58,216 |
| `apps/desktop/electron/external-terminal.ts` + its test | 2 | 306 |
| `nix/tui.nix`, `nix/web.nix` | 2 | 62 |
| `scripts/profile-tui.py` (TUI-only perf harness) | 1 | 625 |
| **Total** | **686** | **~159,100** |

Change size as `git diff --stat HEAD`: **730 files changed, 359 insertions(+), 158,588 deletions(-)**
— 686 deletions plus 44 modified files. (Line counts differ slightly between `wc -l` and the diff
because trailing-newline handling differs; both are stated so neither has to be taken on faith.)

### Top-level tree, before → after

```
before                                   after
  acp_adapter/                             acp_adapter/
  agent/                                   agent/
  apps/          (desktop, shared)         apps/          (bootstrap-installer, desktop, shared)
  assets/                                  assets/
  cli.py, run_agent.py, ...                cli.py, run_agent.py, ...        (unchanged)
  cron/                                    cron/
  docs/                                    docs/            (+ desktop-pruning-phase1.md)
  gateway/                                 gateway/
  hermes_cli/                              hermes_cli/
  nix/           (tui.nix, web.nix)        nix/             (tui.nix, web.nix deleted)
  plugins/                                 plugins/
  skills/                                  skills/
  tests/                                   tests/
  tools/                                   tools/
  tui_gateway/   ── KEPT ──                tui_gateway/     ── KEPT ──
  ui-tui/        ── REMOVED ──             (gone)
  web/           ── REMOVED ──             (gone)
  website/                                 website/
```

`ui-tui/` and `web/` are gone from the working tree entirely, including the workspace-local
`node_modules` trees their installs had left behind (verified to contain zero git-tracked files
before removal). Three now-dangling symlinks in the root `node_modules` (`hermes-tui`, `web`,
`@hermes/hermes-ink`) were removed as well; they are gitignored install artifacts, not sources.

## 2. Root configuration and wiring changes

| File | Change |
|---|---|
| `package.json` | `workspaces` is now `["apps/*", "tests-js"]`; dropped `install:web`, `install:tui`, `audit:web`, `audit:tui`, `audit:fix:web`, `audit:fix:tui` |
| `package-lock.json` | Regenerated with `npm install --package-lock-only`. **91 keys removed, 0 added, 0 version/resolved/integrity drift** — no dependency was upgraded, added or re-resolved. npm accepts the file without rewriting it |
| `.github/workflows/js-tests.yml` | Dropped the `ui-tui` and `web` `node_modules` cache paths. The check runner discovers workspaces via `npm query .workspace`, so their checks disappear on their own |
| `Dockerfile` | Dropped the `ui-tui`/`web` manifest and source `COPY` layers, the whole frontend build stage, and `ENV HERMES_TUI_DIR`; trimmed the now-stale TUI rationale from the `npm_config_install_links` comment |
| `nix/hermes-agent.nix` | Dropped the `hermesTui`/`hermesWeb` derivations, their store symlinks, the `HERMES_WEB_DIST`/`HERMES_TUI_DIR` wrapper env, and the passthru entries |
| `nix/packages.nix` | Dropped the `tui` and `web` package attributes |
| `nix/checks.nix` | Dropped the `bundled-tui` check |
| `nix/lib.nix` | `update-npm-lockfile` now builds `.#desktop` only; workspace discovery was already derived from root `package.json`, so it adapts by itself |
| `nix/devShell.nix`, `.envrc` | Watch lists / example paths updated |
| `.dockerignore`, `.gitignore`, `.gitattributes`, `.hadolint.yaml` | Removed the entries that named the deleted paths |
| `scripts/install.sh`, `scripts/install.ps1` | Removed the TUI dependency-install stages; `node_deps_workspace_args` is now unconditionally `--workspaces=false` |
| `scripts/ci/classify_changes.py` | `_FRONTEND = ("apps/",)` |
| `apps/desktop/eslint.config.mjs`, `scripts/perf/gateway_attach_bench.py` | Dropped the TUI references |

Because `nix/lib.nix` derives its workspace set from root `package.json`, and the JS CI runner
derives its checks from `npm query .workspace`, the workspace removal propagates to both without
further edits.

## 3. Why `tui_gateway/` was NOT removed

`tui_gateway/` is the HTTP + JSON-RPC WebSocket App Server that `hermes serve` exposes to the
Desktop renderer. Only its *name* is about a TUI; the TUI client is what was deleted, not the
server. Evidence gathered before deleting anything:

- `tui_gateway/server.py` and `tui_gateway/entry.py` contain **zero** references to `ui-tui` or
  `web` (`git grep -n -E "ui-tui|ui_tui|web_dist|PROJECT_ROOT" tui_gateway/server.py tui_gateway/entry.py`).
- `hermes serve` runs with `headless_backend=True`, and `hermes_cli/main_dashboard.py:724-725`
  then only sets `HERMES_SERVE_HEADLESS=1` before returning — it never builds or validates a web
  dist, so no `web/` directory is required.
- `apps/desktop/src/AGENTS.md` already recorded the design intent: the Desktop "has **no
  build/runtime dependency on the dashboard frontend**" and "does NOT embed `hermes --tui`".
- `tui_gateway/AGENTS.md` was rewritten to describe the server and its Desktop client honestly,
  instead of the removed Ink client.

## 4. The one real coupling that had to be decided

The audit found a dependency the initial proof checklist did not cover, and it was surfaced rather
than guessed at: the Desktop's session menu offered **"Open in terminal"**, which handed the session
to the user's own terminal emulator running `hermes --tui --resume <id>`
(`apps/desktop/electron/external-terminal.ts:32`, IPC handler `hermes:window:openInTerminal` in
`electron/main.ts:15089`, localized into 7 locales). Deleting `ui-tui/` necessarily breaks that verb.

Decision taken: remove the verb along with the directories, so the tree has no silently broken path.
That touched 15 files, all of them the verb's own surface — `external-terminal.ts` and its test,
the `main.ts` IPC handler and import, `preload.ts`, `global.d.ts`, `store/windows.ts`
(`canOpenSessionInTerminal` + `openSessionInTerminal`), the `session-actions-menu.tsx` menu item and
its test, and the `openInTerminal` key in `en`, `zh`, `zh-hant`, `ja`, `ru`, `ar` and the `types.ts`
contract. No other Desktop behaviour was refactored.

`web/src/pages/ChatPage.tsx` spawned `ui-tui/dist/entry.js` in a PTY, i.e. a `web → ui-tui`
dependency. That is one-way and both ends were removed together, so nothing dangles.

## 5. Runtime-side fallout, fixed minimally

Two routine commands would have started failing because they name workspaces that no longer exist.
Both were fixed at the call site, not by reworking the modules:

- `hermes doctor` (`hermes_cli/doctor_tools.py`) named `--workspace web` / `--workspace ui-tui` for
  `npm audit`, guarded only by the root `node_modules` existing. `npm` treats `--workspace` against
  a missing workspace as a hard error, so those rows are now emitted only while the workspace is
  actually present.
- `hermes update` (`hermes_cli/update_cmd_deps.py`) named the same two workspaces in its `npm
  install`. It now names only the frontend workspaces that exist, and — when none do — scopes to
  `--workspaces=false`.

That last point is worth recording because the first implementation was wrong and an experiment
caught it. `npm install --include-workspace-root` **without** a `--workspace` selector resolves
*every* workspace: against a throwaway three-package repo on npm 10.9.8 it linked each member into
`node_modules` and hoisted their dependencies. Applying that here would have resolved
`apps/desktop` and dragged in its ~200 MB Electron postinstall — precisely the hazard the surrounding
comment warns about. `--workspaces=false` is the correct root-only scope (verified in the same
experiment: no workspace links, no workspace deps, root devDependencies installed).

`hermes_cli/main_dashboard.py`'s `_PRE_BUILD_HINT` also told users to run
`npm install --workspace web && npm run build -w web`, a command that can no longer work; it now
states the outcome instead.

## 6. What remains, and what still references the removed components

Kept deliberately and NOT deleted this round — these are the follow-up candidates:

| Area | State |
|---|---|
| `hermes_cli/main_tui_launch.py` (873 lines), `hermes_cli/main_web_build.py` (539 lines) | Kept by decision. Still describe and reference `ui-tui/` and `web/`; now inert. `_build_web_ui` already no-ops when `web/package.json` is absent, so `hermes update`'s web-build call is a safe no-op |
| `hermes --tui`, `hermes dashboard` subcommands | Still registered. `hermes --tui` cannot work without `ui-tui/`; `hermes dashboard` starts but has no built frontend |
| `gateway/` | Not audited this round — its sharing relationship with the core runtime is still to be reviewed |
| `acp_adapter/` | Not audited; kept as a possible generic Harness boundary reference |
| `cron/`, messaging components | Not audited |
| Hermes install/update-specific logic (`hermes_cli/update_cmd*.py`, `main_web_build.py`, `doctor_tools.py` audit rows) | Kept; only the two unconditional workspace references were guarded |
| `web_routers/`, `web_server*.py` | Kept — Python FastAPI surfaces behind `serve`; they are runtime, not the deleted SPA |

Prose and comments that still name the removed directories, kept as upstream history or provenance
rather than rewritten:

- `docs/billing-lifecycle.md` — documents the removed Ink renderer; now carries an "upstream
  history" banner.
- Mirror/provenance comments in `hermes_cli/pty_bridge.py`, `hermes_cli/voice.py`,
  `hermes_cli/clipboard.py`, `hermes_cli/cli_terminal_mixin.py`, `hermes_cli/curses_ui.py`,
  `cli.py`, `hermes_constants.py` — each says it mirrors a specific `ui-tui/**` file. Those files no
  longer exist here; the comments are dead provenance.
- `hermes_cli/update_cmd_zip.py:49` — a historical note about an incident where `ui-tui/` vanished.
- `website/` docs and translations describing the TUI and Dashboard as shipped features. These
  describe upstream Hermes, not this fork's tree.
- `tests/hermes_cli/test_web_ui_build.py`, `test_tui_*.py`, `tests/docker/test_tui_prebuilt_bundle.py`
  — they exercise the kept-but-inert launcher modules against `tmp_path` fixtures, so they still pass
  (see below). They are coverage of code this fork no longer ships.

## 7. Verification — what ran

All figures below come from commands run against this tree after the changes.

| Check | Result |
|---|---|
| `git diff --check` (worktree and staged) | Clean, exit 0 — no whitespace errors |
| Desktop typecheck — `tsc -p . --noEmit`, plus `tsconfig.electron.json`, `tsconfig.e2e.json` | **Passed**, exit 0 (all three projects) |
| `apps/shared` typecheck (`tsc -p . --noEmit`) | **Passed**, exit 0 |
| Desktop unit tests touching the edited surfaces (`session-actions-menu`, `session-row`, `connection-switcher`, `open-session`, `use-desktop-integrations`, `use-composer-popout`) | **88 tests passed**, 0 failed |
| `npm ls` (root, `apps/desktop`, `apps/shared`) | No unmet/missing/invalid dependencies. The `extraneous` entries reported at root are leftover transitive packages in the gitignored `node_modules`; the lockfile itself is clean |
| Python import smoke (12 modules) | **0 failures**: `hermes_cli.main`, `tui_gateway.server`, `tui_gateway.entry`, `run_agent`, `agent`, `model_tools`, `toolsets`, `hermes_state`, `hermes_cli.doctor_tools`, `hermes_cli.update_cmd_deps`, `hermes_cli.main_dashboard`, `hermes_cli.web_server` |
| `py_compile` on every touched Python module | Passed |

### Python test suite

`scripts/run_tests.sh` is the mandated runner, and it refuses a venv without pytest. The repo's
`.venv` has **no pytest installed**, so the runner's documented `HERMES_PYTHON` entry point was used
with `/usr/bin/python3` (which has pytest) rather than falling back to bare `pytest`, which the repo
forbids. That is a real deviation from CI parity and is recorded as such: tests were executed, but
not in a CI-identical interpreter.

| Test file(s) | Result |
|---|---|
| `tests/ci/test_classify_changes.py` | 66 passed |
| `tests/hermes_cli/test_doctor.py`, `test_update_current_node_repair.py`, `test_dashboard_web_dist_validation.py` | 75 passed |
| `tests/hermes_cli/test_cmd_update.py` | 47 passed |
| `tests/hermes_cli/test_web_ui_build.py`, `tests/docker/test_tui_prebuilt_bundle.py`, `tests/hermes_cli/test_tui_npm_install.py`, `test_tui_bundled.py` | 57 passed, 2 skipped |
| `tests/test_packaging_metadata.py`, `test_update_zip_atomic_replace.py`, `test_tui_resume_flow.py`, `test_update_zip_two_phase.py` | 80 passed |
| `tests/test_tui_gateway_server.py` | 711 passed across the batch, 10 skipped |
| `tests/test_install_sh_node_deps_workspaces.py`, `test_install_sh_node_deps_failure.py`, `tests/tools/test_dockerfile_node_modules_perms.py`, `test_dockerfile_immutable_install.py` | 10 passed after the updates below |

Five tests asserted the old behaviour and were updated to the new contract rather than deleted
wholesale: the install-scope tests now assert that no workspace is ever named (so the `apps/*` glob
never resolves), the removed TUI install stage's failure case was dropped with its subject, and the
Dockerfile test now guards only the surviving half of its contract (the image must not hand
`node_modules` to the runtime user). `tests/tui_gateway/` was not run; it is the subject of the next
round.

**One flaky test, reported as such rather than as green:** `tests/test_tui_gateway_server.py::test_ws_orphan_reap_releases_resume_lock_before_slow_teardown`
failed on its first attempt on a 1.0 s `threading.Event.wait` timing assertion and passed on retry.
It is unrelated to this change (WebSocket orphan reaping and SQLite resume locks), and the repo's own
guidance says wall-clock bounds in timing tests should be at least 2 s.

## 8. Desktop launch verification

Run through the repo's own `scripts/dev-sandbox.sh --persistent`, with `HERMES_DEV_SANDBOX_DIR`
pointing at a throwaway directory so the user's own `.hermes-sandbox/` was never written to. Provider
credential variables were unset for the launch, no prompt was submitted (so no model request was
made), and the run was bounded with process-group teardown afterwards.

Pinning the backend mattered: on the first attempt the app's resolver picked the user's separate
global install (`/home/maoqh/.local/bin/hermes`, v0.19.0) rather than this checkout, which proves
nothing about this tree. `HERMES_DESKTOP_HERMES` — the repo's documented "explicit desktop backend
command is a deployment contract" override — was then pointed at a wrapper around this checkout's
`.venv/bin/python -m hermes_cli.main`, and the launch was repeated.

Result against this checkout's runtime, from `hermes-home/logs/desktop.log`:

```
[boot] Using existing Hermes CLI at /tmp/hermes-verify
[backend] `serve` supported for existing Hermes CLI at /tmp/hermes-verify
HERMES_BACKEND_READY port=36809
Hermes backend listening on 127.0.0.1:36809
[boot] Hermes backend is ready. Finalizing desktop startup
```

with, from the process table during the run: an Electron main process, a `--type=renderer` process,
and the checkout's `hermes_cli.main` backend child — all present. So the Electron renderer starts and
the `serve`/`tui_gateway` backend becomes ready **with `ui-tui/` and `web/` deleted**.

`hermes serve` was also verified standalone, without Electron: launched from this checkout with an
isolated `HERMES_HOME`, it announced `HERMES_BACKEND_READY port=45999` and
`Hermes backend listening on 127.0.0.1:45999` within ~3 s, and then answered `GET /` → 200 and
`GET /api/health` → 200. (`GET /api/gateway/status` → 401 is correct: it is a token-gated endpoint
the app supplies credentials for. That 401 is also what the earlier run against the user's global
install tripped over, and it is unrelated to this change.)

After teardown: no residual Electron, `hermes_cli.main` or wrapper processes remained, and the
throwaway sandbox and wrapper were deleted. The user's `.hermes-sandbox/` was left untouched.

## 9. AgentBox POC

`apps/desktop/src/agentbox/` (6 files) and `apps/desktop/src/plugins/agentbox-lab/` (2 files) are
present and byte-unchanged: no file under either directory has a modification time inside this
session's work, and both remain untracked in `git status`, exactly as they were beforehand. They were
not staged, edited, or normalized at any point — an intermediate `git add -A` that would have staged
them was reverted.

## 10. Next round — auditable, not deleted

`gateway/`, `acp_adapter/`, `cron/`, the messaging components, and the Hermes install/update-specific
logic remain untouched and unaudited. Within the launcher modules kept this round, the obvious
follow-up is to retire `hermes --tui` and `hermes dashboard` along with `main_tui_launch.py` and
`main_web_build.py`, and to clear the dead provenance comments listed in §6.
