# Desktop pruning, phase 2 — separating the repository from the Hermes runtime

This round answered one question for every directory in the tree: **does the
current Hermes Desktop consume this at startup or at runtime?** Where the answer
was no, the code was deleted. The result is a repository that contains the
desktop client and nothing else.

Two things must be stated before anything else, because they define the round's
shape:

1. **The plan changed mid-round.** An earlier instruction in this session asked
   for the opposite of what was delivered: keep an in-repo Hermes runtime,
   extract a `desktop_backend/serve.py`, and delete the Desktop's
   gateway/cron/skills pages. Those requirements were withdrawn before any of
   that work was done. No `desktop_backend/` exists; nothing was extracted or
   copied; no Desktop page was removed. Only the first bullet of the withdrawn
   plan survived — accepting round 1.
2. **The repository no longer ships a Hermes runtime at all.** The app is a
   client of an external `hermes`. That is a deliberate product boundary, not a
   packaging accident, and it is what the new `AGENTS.md` opens with.

Final status: **DESKTOP_EXTERNAL_HERMES_RUNTIME_ONLY_PARTIAL**, downgraded from
GREEN after review. The two blockers it named are fixed and verified (§12), and
three of the four remaining gates are met — but gate 3 ("the full Desktop Vitest
passes") is qualified by five pre-existing environmental failures that this round
did not cause and did not fix. Claiming GREEN would require overstating that, so
it is not claimed. Nothing here is claimed as green that was not run.

## 1. Round-1 acceptance

`PHASE_1_LEGACY_UI_PRUNE_GREEN`, recorded at the start of this round. Verified
before any new work began: `ui-tui/` and `web/` gone from disk and from the
index; no build/CI/Docker/install path still referencing them (the only
remaining hits were prose); `apps/shared` intact at 18 files; `tui_gateway`
importable and `hermes serve` reaching `ready` in 2s with `GET /api/health` →
200; the AgentBox POC byte-unchanged; `git diff --check` clean.

## 2. Root directory tree, before → after

```
                before (round 2 start)                  after
  acp_adapter/      14 files            ── deleted
  agent/           271 files            ── deleted
  apps/                                  apps/
    bootstrap-installer/  44 files      ── deleted   (separate Tauri installer product)
    desktop/      ~2400 files                          desktop/   2397 files
    shared/           18 files                         shared/      18 files
  assets/           1 file (README banner)             assets/       1 file
  contributors/  1077 files              ── RETAINED (attribution)
  cron/             24 files            ── deleted
  docs/             24 files             ── pruned to the pruning record:  1 → 2 files
  evals/           181 files            ── deleted
  gateway/         153 files            ── deleted
  hermes_cli/      473 files            ── deleted
  locales/          17 files            ── deleted
  mcp-research-data/ 5 files            ── deleted
  native/            5 files            ── deleted
  nix/              16 files            ── deleted
  optional-mcps/    65 files            ── deleted
  optional-skills/ 723 files            ── deleted
  plugin-catalog/   11 files            ── deleted
  plugins/         384 files            ── deleted
  providers/         3 files            ── deleted
  scripts/          89 files             ── pruned to 15 files
  skills/          331 files            ── deleted
  tests/          4054 files            ── deleted
  tests-js/         16 files             ── pruned to 13 files
  tools/           302 files            ── deleted
  tui_gateway/      63 files            ── deleted
  website/         822 files            ── deleted
  docker/, Dockerfile, compose, .dockerignore, .hadolint.yaml   ── deleted
  flake.nix, flake.lock, .envrc         ── deleted
  run_agent.py, cli.py, hermes_state*.py (21), model_tools*.py, toolsets.py,
  toolset_distributions.py, mcp_serve.py, batch_runner.py, mini_swe_runner.py,
  trajectory_compressor.py, utils.py, hermes_constants.py, hermes_logging.py,
  hermes_bootstrap.py, hermes_startup_watchdog.py, hermes_time.py,
  registration_lifecycle.py, setup.py, pyproject.toml, uv.lock,
  constraints-termux.txt, cli-config.yaml.example, .env.example, .python-version,
  hermes, setup-hermes.sh, test_durations.json, .bytecode-fingerprint  ── deleted
  about 30 more workflows/actions in .github/  ── pruned
```

## 3. Top-level directories actually deleted

`acp_adapter/`, `agent/`, `apps/bootstrap-installer/`, `cron/`, `evals/`,
`gateway/`, `hermes_cli/`, `locales/`, `mcp-research-data/`, `native/`, `nix/`,
`optional-mcps/`, `optional-skills/`, `plugin-catalog/`, `plugins/`,
`providers/`, `skills/`, `tests/`, `tools/`, `tui_gateway/`, `website/`,
`docker/` — plus the root Python modules, Python packaging, the container
definitions, the nix flake, and the GitHub Actions lanes that built or tested
them.

## 4. `hermes_cli/`: deleted wholesale, nothing migrated

The withdrawn plan called for reducing `hermes_cli/` to a `desktop_backend/serve.py`
closure and migrating the Electron launch to it. That is not what happened: with
the app pinned to an **external** `hermes`, there is no in-repo serve entry point
to slim down or migrate, so the entire 473-file / 202,082-line package was
deleted.

Nothing was moved, copied, or re-exported. The launch contract the Electron app
depends on is **argv + stdout**, not a Python module:

```
hermes serve --host 127.0.0.1 --port 0        # port announced on stdout
```

That is why no shim is needed and why a migration to `desktop_backend/` would
have been duplication. The compatibility path for a runtime that predates
`serve` (`dashboard --no-open`) is untouched and still lives in
`apps/desktop/electron/backend-command.ts`.

## 5. The current "hermes serve" dependency closure

The in-repo closure is **empty**. The app's contract with its runtime is:

| Direction | Contract |
|---|---|
| spawn | `hermes serve --host 127.0.0.1 --port 0`, `HERMES_HOME` pinned in the child env, `HERMES_DASHBOARD_SESSION_TOKEN` injected |
| discover | the child annonces `HERMES_BACKEND_READY port=<n>` on stdout |
| health | `GET /api/health` probed **with** that session token, then `GET /api/ws?token=…` must accept the WS upgrade |
| drive | JSON-RPC over the WebSocket (`apps/shared` `JsonRpcGatewayClient`), plus REST under `/api/*` |

Anything the runtime needs to satisfy that lives in the external install. This
repository contributes no code to it.

## 6. Files and lines deleted

| | Files | Lines |
|---|---:|---:|
| Round 1 (`ui-tui/`, `web/`) | 681 | 155,804 |
| **Round 2** | **8,198** | **2,436,687** |
| Cumulative (`git diff --stat HEAD`) | 8,879 deleted | 2,592,491 — 795 insertions |

Largest round-2 areas: `tests/` 1,056,346 · `website/` 287,047 ·
`optional-skills/` 215,766 · `hermes_cli/` 202,082 · `agent/` 108,922 ·
`tools/` 101,143 · `plugins/` 100,814 · `gateway/` 83,060 · `skills/` 66,332 ·
`tui_gateway/` 26,555 · `scripts/` 24,851.

## 7. What the Desktop still depends on

Nothing from the deleted tree is imported, bundled, or launched. Four classes of
reference to it remain, and none of them is a dependency:

- **Comments** citing upstream files for provenance (`gateway/run.py`-style
  pointers in the issue templates, `tools/browser_tool.py` in a tests-js
  rationale, `tui_gateway` in an e2e spec's bug narrative). They explain why a
  rule exists; they are not paths that resolve here.
- **Argv and path literals describing the external runtime**: the app spawns
  `python -m hermes_cli.main serve` for python-kind backends, reads
  `<backend.root>/hermes_cli/subcommands/dashboard.py` to detect `serve`
  support, and reads `<updateRoot>/hermes_cli/__init__.py` for the About
  version. Every one of those roots is an *external* install
  (`ACTIVE_HERMES_ROOT`, `HERMES_DESKTOP_HERMES_ROOT`, `updateRoot`) — reading
  them is how the app stays compatible with runtimes it did not build.
- **`isHermesSourceRoot()`** (`<root>/hermes_cli/main.py`) — the predicate that
  recognises an external Hermes *checkout*. It survives precisely because the
  managed install has that layout.
- **`apps/desktop/scripts/test-desktop.mjs`** asserts the packaged app must NOT
  ship `hermes-agent/hermes_cli/main.py`. Now doubly true.

Relocated rather than deleted, because the Desktop genuinely consumed them out
of the old `tests/` tree:

| Was | Now | Consumer |
|---|---|---|
| `tests/fixtures/session-resume-active-turn.json` | `apps/desktop/src/app/session/hooks/__fixtures__/` | `use-session-actions.test.tsx` |
| `tests/install/e2e-assets/window-input.cjs` | `apps/desktop/e2e/assets/` | `onboarding-settings.spec.ts`, `window-input.unit.test.ts` |

`tests-js/` was kept for the same reason — 20 of 32 Playwright specs import its
`mock-server.ts`, `apps/desktop`'s `dev:mock` script runs it, and
`tsconfig.e2e.json` includes it. Three of its tests were runtime-coupled and went
with the runtime (`install-known-failures`, `install-process-close`,
`bootstrap-installer-stage-timer`), and the bootstrap-installer half of
`desktop-mac-entitlements` was removed; the other seven are Desktop and
workspace contracts and stay.

Two things were kept that no longer have a consumer, deliberately:

- **`contributors/` + `.mailmap`** — contributor attribution. Their only consumer
  (`scripts/release.py`) was deleted, so they are inert, but deleting attribution
  data is not something to do as a side effect of a pruning round.
- **`scripts/install.sh`, `scripts/install.ps1`, `scripts/install.cmd`,
  `scripts/lib/node-bootstrap.sh`** — the installers the first-run bootstrap
  drives (`bootstrap-runner.ts` `resolveLocalInstallScript` reads them from the
  repo root; packaged builds download the same files from the pinned ref). They
  install the *external* runtime, so they are Desktop assets, not runtime code.

## 8. Round-2 code changes (not just deletions)

The deletion was the easy part. Four things had to change for the separation to
be real, and three of them were defects found by testing rather than by reading.

**8.1 The source-checkout launch rung was removed.** `resolveHermesBackend` used
to fall back to `SOURCE_REPO_ROOT` whenever the tree it was running from looked
like a Hermes source tree, so in-repo Python edits were exercised in
development. With no runtime in the repo that rung is meaningless, and leaving it
would have re-coupled the two products. It is gone; the ladder is external-only
(explicit checkout → managed install → PATH/explicit executable → installed
`hermes_cli` module → bootstrap installer). `SOURCE_REPO_ROOT` itself survives
for non-launch uses (update root, default session cwd, bootstrap script lookup).

**8.2 `HERMES_EXECUTABLE_NOT_FOUND` is now a real, typed outcome.** The
fall-through sentinel carries `errorCode`; `DesktopBootProgress` gained a sticky
`errorCode` field (a later generic error update must not erase the cause, and
only a successful boot clears it); and the renderer gained a matching
"Hermes isn't installed" failure surface with copy in all seven locales.
Resolution never throws and the window never fails to open.

**8.3 A runtime that gates `/api/health` was mistaken for a dead one.** This is
the defect that mattered most. Readiness was probed **without** credentials, and
newer Hermes builds gate `GET /api/health` behind the session token. An
anonymous probe gets 401, which the probe interprets as "this backend predates
`/api/health`", so it falls back to `GET /api/status` — which that same gate also
rejects. The result was a readiness timeout, and a boot failure, against a
perfectly healthy runtime:

```
Hermes backend did not become ready: 401: {"detail":"Unauthorized"}
```

The app already had everything needed: it injects
`HERMES_DASHBOARD_SESSION_TOKEN` into the child and uses it for the WS probe. The
local readiness probe now sends the same token. Verified against the user's
global Hermes v0.19.0, whose `/api/health` really does return 401 to a naked
`curl`: boot now reaches `Hermes backend is ready. Finalizing desktop startup`.
Without this fix, "support the `hermes` on your PATH" would have been true only
on paper.

**8.4 The typed code was never surfaced on the path that needed it.** The
first-run setup gate is consulted *before* `ensureRuntime()` runs, so a machine
with no Hermes parked at "Waiting for first-run setup choice" without ever
recording why. The code is now set when the choice is presented, and
`updateBootProgress` logs it on transition so `desktop.log` can answer "why is
this app not connected?" — which is the entire point of a typed code.

Two self-inflicted breakages were caught and fixed during the round, and are
noted because they are the kind of thing a reviewer should know was checked:
removing two `package.json` script lines left a trailing comma and broke
`apps/desktop/package.json` as JSON (npm found it; every `package.json` is now
validated), and a Python-written edit to `scripts/install.ps1` silently converted
it to LF against the repo's `*.ps1 text eol=crlf` attribute (restored; the
content diff remains 0 insertions / 8 deletions).

## 9. Verification — what ran, and what did not

| Check | Result |
|---|---|
| `git diff --check` (worktree + staged) | Clean, exit 0 |
| Workspace config parse | `workspaces: ["apps/*","tests-js"]`; lock has exactly `apps/desktop`, `apps/shared`, `tests-js`; npm accepts the lock without rewriting it; **19 keys removed, 0 added, 0 version/integrity drift** |
| Every tracked `package.json` parses | 5/5 valid |
| Desktop typecheck (renderer + electron + e2e projects) | **Passed**, exit 0 |
| Desktop lint | **17 errors remain, all in the AgentBox POC** (`src/agentbox/*`, `src/plugins/agentbox-lab/lab.tsx`) — untracked, pre-existing, not modified. My changes contributed **zero** lint errors (one import-order error I introduced was fixed). 149 warnings are spread across pre-existing test files |
| `apps/shared` typecheck + lint | Passed |
| `apps/shared` tests | **13 passed** (JSON-RPC transport + replay resume) |
| Desktop electron project (backend lifecycle, resolution, readiness, bootstrap, gate) | **2,135 passed**, 6 skipped, 4 failed |
| Desktop UI tests (boot overlay, install overlay, boot store, gateway boot, session actions) | **169 passed** |
| Python smoke on the 4 surviving helper scripts | `py_compile` clean (they are stdlib-only CI helpers) |
| Shell syntax on the 5 surviving shell scripts | clean |
| `scripts/run_tests.sh` / the pytest suite | **Not run** — deleted with the runtime. There is no Python test suite left to run |

### The 4 electron failures are pre-existing, and this was proven

`electron/api-transport.test.ts` (2) and `electron/mcp-oauth-callback-ipc.test.ts`
(2–3, depending on run) fail in this environment. They are not mine:

- Both test files **and** the modules they test are byte-identical to `HEAD`, and
  neither imports `main.ts` or anything else this round touched.
- Run from a **pristine `HEAD` worktree**, the identical tests fail with the
  identical names, before and independent of every change here.

They exercise real loopback HTTP servers and an OAuth callback listener; the
failure mode (0 server hits, listener never settling) is environmental.

### Deliberately not run

- **Playwright e2e.** Its CI lane was already hard-disabled (`if: false`) before
  this round, and eight of its specs drove the in-repo runtime
  (`real-session-builder.ts` spawned `tui_gateway.entry`; `fleet-profile-rail`
  ran `.venv/bin/hermes serve`). Those specs and that helper were deleted; the
  remaining suite was not executed. No claim is made about it.
- **The managed-install rung reaching `ready`.** Rung 3 resolves correctly — the
  log shows `Active Hermes runtime at …/hermes-agent is usable` — but this
  machine's managed install is a v0.16.0/0.21.1 hybrid that does not declare
  `serve`, so the app took the documented legacy `dashboard --no-open` fallback
  and never announced a port within the window. That logic is untouched by this
  round. I did not force it further: it is a stale third-party install, not a
  property of this repository.
- **`nix flake check`.** `nix/` was deleted, and with it the Desktop's nix
  packaging path (which also read `hermes_cli/linux_desktop_entry.py`). Anyone
  packaging the Desktop for nix now needs to re-add it against an external
  runtime. Recorded as a real capability loss, not a silent one.

### Launch verification (isolated dev-sandbox, zero credentials, no model calls)

Both runs used `scripts/dev-sandbox.sh` with `HERMES_DEV_SANDBOX_DIR` pointed at
a throwaway directory — the user's own `.hermes-sandbox/` was never written to.

**With an external Hermes on `PATH`** (no override; the app discovered the user's
global install on its own):

```
[boot] Using existing Hermes CLI at /home/maoqh/.local/bin/hermes
HERMES_BACKEND_READY port=…
[boot] Hermes backend is ready. Finalizing desktop startup
```

Renderer process present, backend ready, no `errorCode`. This is the target
behaviour: the repository contains no runtime, and the app still connects.

**With every external source hidden** (`HERMES_DESKTOP_IGNORE_EXISTING=1` +
isolated `HERMES_HOME` + `PYTHONNOUSERSITE=1`, the last hiding the pip-installed
`hermes_cli` that the repo no longer shadows):

```
[boot] Waiting for first-run setup choice
[boot] errorCode=HERMES_EXECUTABLE_NOT_FOUND
```

The renderer process is alive and executing. The app starts, says precisely what
is missing, and offers the install — no panic, no fake success.

After both runs: **zero residual processes** (checked for `electron` and
`hermes`), and the throwaway sandbox removed.

## 10. Working tree and processes

- 8,879 deletions and 45 modifications/insertions are staged; nothing is
  committed. `HEAD` is still `cfdbbb6`.
- `git status` untracked entries are exactly the two AgentBox POC directories. An
  intermediate `git add -A` staged them; that was reverted so they remain
  untracked and unmodified, as they were at the start.
- `apps/desktop/src/agentbox/` (6 files) and `apps/desktop/src/plugins/agentbox-lab/`
  (2 files) are present, byte-unchanged, and were not edited, staged, or
  reformatted at any point.
- No residual `electron`, `hermes`, or `hermes_cli` processes. Removed from disk
  as dead artifacts of the deleted runtime: the root `.venv` (an editable install
  of `hermes_agent` 0.21.1 whose `.pth` pointed at the deleted source), every
  `__pycache__` tree, `hermes_agent.egg-info/`, `.pytest_cache/`,
  `test_durations.json`, `.bytecode-fingerprint`.

## 11. Candidates for a further round — not done here

1. **`contributors/` + `.mailmap`** — inert attribution with no consumer left.
   Delete only if the project is certain it does not want the credit data.
2. **The upstream issue/PR templates** (`.github/ISSUE_TEMPLATE/`,
   `PULL_REQUEST_TEMPLATE.md`) still ask about skill bundling, `gateway/run.py`
   line numbers and upstream CONTRIBUTING sections. They should be rewritten for
   a client repository or removed.
3. **`scripts/install.sh` / `install.ps1` (≈3,000 lines)** — the bootstrap's
   local-script shortcut. Packaged builds download the same files from the pinned
   ref, so these could go once the dev shortcut is judged unnecessary.
4. **`apps/desktop/e2e/`** — the remaining specs assume a locally-provided
   backend. Re-pointing them at an external Hermes (or a recorded fixture) would
   let the lane be re-enabled; today it is still `if: false`.
5. **The `.github` PR-review automation** (`lockfile-diff`'s `review_status`
   output, `label-rerun`) — trimmed this round but still carrying habits from the
   upstream process.
6. **Comment-level provenance** citing deleted paths (issue templates,
   `tests-js/package-json-lazy-deps.test.ts`,
   `apps/desktop/e2e/interim-messages.spec.ts`) — accurate as history, but a
   reader cannot follow them in this repository.


## 12. Round 2b — remediation of the review findings

A review of the GREEN claim above found two blockers, two boundary errors and
several cleanups. All six were addressed; the status was corrected to PARTIAL
because of gate 3 (see §12.3).

### 12.1 Blocker — a test read runtime source that no longer exists

`src/plugins/hermes-bots/relay-deliver-budget.test.ts` read
`hermes_cli/config_defaults.py` and `tui_gateway/methods_bot_relay.py` at module
load to catch drift between the Desktop's relay deadline and the runtime's own
numbers. With those files deleted, the test threw `ENOENT` **at collection**, so
`npm run --workspace apps/desktop test` could not run at all. The earlier "169
tests passed" was a selected subset and did not represent the suite.

It is now a versioned protocol fixture, exactly as the review suggested. The
runtime's numbers live in `src/plugins/hermes-bots/relay-protocol-budget.ts`
pinned to the runtime version they came from (`0.21.1`, the last in-repo runtime),
with `RELAY_BUDGET_PROTOCOL_VERSION` and an explicit update procedure. The
Desktop's side is exported as `RELAY_DELIVER_BUDGET` from `relay.ts`, so the test
asserts VALUES by import instead of regexing the file's text — which also fixes
the same file's violation of `AGENTS.md`'s "never read source code in tests" rule.
No Python file was restored, and no test in this repository reads runtime source
any more.

Verified: the full suite now collects and runs (928 files / 9,595 tests).

### 12.2 Blocker — the Profile pool still probed anonymously

The main backend was fixed (`waitForHermes(baseUrl, token, undefined, 'token')`),
but three other spawn paths were not, so a second profile — or an SSH remote —
would still 401-timeout against the same gated runtime:

| Site | Path |
|---|---|
| `main.ts` profile pool | `waitForHermes(baseUrl, token)` |
| `remote-lifecycle.ts` | `waitForHermes(baseUrl, spawnToken)` |
| `windows-remote-lifecycle.ts` | `waitForHermes(baseUrl, token)` |

All three now pass the session token they spawned the backend with. The SSH sites
were included because they are the same bug: the token is the *spawn* credential
(minted at `remote-lifecycle.ts` and injected as `HERMES_DASHBOARD_SESSION_TOKEN`),
so the readiness probe reaching it anonymously is the identical defect.

The regression the review asked for is in `electron/backend-health.test.ts`, as a
pair: a gated backend is reached when the probe carries the token, and the same
backend times out for an anonymous probe. The second half is the point — it pins
WHY the call site must pass `'token'`, and it documents the exact failure mode
found in the field: a plain `401: {"detail":"Unauthorized"}` is not classified as
gate-shaped (`isGatedMissingHealthError` requires `no_cookie`), so it never falls
back to `/api/status` and simply exhausts the readiness timeout.

**Not verified live:** the profile-pool path was fixed by construction and by
unit test, but a second live profile against a gated runtime was not exercised —
that needs GUI interaction this environment cannot drive. The primary path was
re-verified live (§12.4).

### 12.3 Boundary — eight Desktop E2E specs were deleted to dodge a fixture

Deleting the specs was wrong: they verify Desktop user behaviour and only their
*fixture* depended on the in-repo runtime. All eight are restored
(bot-mode-row-click-mirrors-registry, bot-mode-tab-shows-bot-name,
bot-roster-user-sections, hidden-history-messages, image-attachment-resume,
large-session-resume, warm-resume-jitter, fleet-profile-rail), and the fixture is
migrated rather than deleted:

- New `e2e/hermes-runtime.ts` resolves an **external** Hermes runtime: an explicit
  `HERMES_E2E_PYTHON`, else the Desktop-managed install's venv, else `python3` on
  `PATH` — each trusted only after a probe that `import tui_gateway.entry`
  succeeds (the same probe-before-trust rule the app applies to its own backend).
- `real-session-builder.ts` spawns that runtime instead of `uv run --active
  --no-sync python -m tui_gateway.entry` out of this checkout, and the session's
  working directory is the sandbox rather than the repository.
- `fleet-profile-rail.spec.ts` uses the same resolver for its `hermes serve`
  backend instead of a repo-relative `.venv/bin/hermes`.
- Where no runtime exists the specs **skip with a typed reason**
  (`E2E_FIXTURE_MIGRATION_PENDING: needs an external Hermes runtime …`) rather than
  passing without having built a session. A green run can never again mean "the
  fixture was never exercised".

Verified: `tsc -p tsconfig.e2e.json` passes, Playwright collects 12 tests across
the restored files with no import errors, and the resolver finds a real external
runtime on this machine (the managed install's venv).

Deliberately not done: running the Playwright lane. It needs a full app build and
a display, and its CI lane is still hard-disabled (`if: false`). The specs are
restored, migrated and collectible — not demonstrated green.

### 12.4 Boundary — installer ownership was a producer-less consumer

`apps/bootstrap-installer/` was deleted while the Desktop kept its production
hand-off to `hermes-setup.exe`. That hand-off is now written down in
[`installer-ownership.md`](./installer-ownership.md): what the Desktop reads
(`<HERMES_HOME>/hermes-setup.exe`, staged by the installer itself, Windows only),
that the dependency is **soft** (absent binary ⇒ `handOffWindowsBootstrapRecovery`
returns `false` and the normal bootstrap runs), and the platform split after this
round — Windows *fresh install* and all of macOS/Linux install-and-update remain
owned here; only the Windows *recovery* orchestrator is external.

The document states plainly that end-to-end compatibility is **UNVERIFIED** and
lists the four decisions an owner must make (which repo builds it, how a fresh
install gets it, the versioning policy, who runs the cross-product E2E). It does
not invent a mechanism to fill the gap.

### 12.5 Cleanups

- `apps/desktop/src/AGENTS.md` — the architecture section described a `tui_gateway`
  backend and a dashboard that consumes the same transport; both are gone. It also
  cited `tests/tui_gateway/test_profiles_list_canonical_session.py`, a deleted
  Python test. Rewritten to describe the external backend and an honest coverage
  note for the server-side half of the Bot Mode contract.
- `.github/PULL_REQUEST_TEMPLATE.md` — required `pytest tests/ -q`, `cli-config.yaml.example`
  and a bundled-skill section. Rewritten for this repository: typecheck / test /
  lint, plus a "this repository is a desktop CLIENT" checklist covering the three
  invariants.
- `.github/ISSUE_TEMPLATE/bug_report.yml` — the component list was the runtime's
  (CLI, gateway adapters, skills, agent core) and the examples pointed at
  `gateway/run.py`. Now lists Desktop components and Desktop examples, and says to
  report runtime bugs upstream. `config.yml` gained a security-policy link.
- `SECURITY.md` and `CONTRIBUTING.md` — restored as Desktop versions rather than
  left absent: scope split (client here, runtime upstream) and this repository's
  setup, checks and the client invariant.

### 12.6 Verification after remediation

| Check | Result |
|---|---|
| Full Desktop Vitest | 928 files / 9,595 tests — **9,584 passed, 5 failed, 6 skipped** |
| Desktop typecheck (renderer + electron + e2e) | Passed |
| `tsc -p tsconfig.e2e.json` | Passed |
| Playwright collection of restored specs | 12 tests in 4 files, no import errors |
| Desktop lint | 17 errors, **all in the untracked AgentBox POC**; this round's tracked changes add none |
| Sandbox, external Hermes | backend ready (`Finalizing desktop startup`), renderer alive |
| Sandbox, no Hermes | `errorCode=HERMES_EXECUTABLE_NOT_FOUND`, renderer alive, no panic |
| Residual processes | none |
| `git diff --check` | clean |

**Gate 3 is qualified, not met.** The remaining failures are in
`api-transport.test.ts` (1–2), `mcp-oauth-callback-ipc.test.ts` (2–3) and
`src/store/voice-prefs.test.ts` (2). All reproduce on an unmodified `HEAD`
worktree, so none is a pruning regression. They are **two different problems**,
and an earlier version of this document wrongly described all of them as
environmental:

- **The two electron files are loader/timing-sensitive.** They stand up real
  loopback HTTP servers as fixtures, and their failure count varies between runs
  (4 → 5 → 6 across identical invocations). Observed shapes: `ECONNREFUSED` on a
  just-bound port, and a sanity check that counts zero hits on its own server.
  Proxy environment variables were ruled out; `/etc/hosts` and Node's `localhost`
  resolution are normal here.
- **`voice-prefs.test.ts` is a deterministic test-infrastructure bug**, not
  load-sensitivity, and it is diagnosable. It injects write failures with
  `vi.spyOn(localStorage, 'setItem')` and asserts that a failed write persists
  nothing. Verified with a probe test in this environment: the spy **does not
  intercept** — `setItem` calls recorded by the spy: 0, the mock's `throw` never
  fires, and the real value lands in storage. So the `fails === true` branch can
  never observe `null`. The fix is to stop depending on a spy over a host object
  (mock the storage helper the store uses, or install a fake `Storage`), which is
  a contained, two-test change — outside this round's scope, and carried as debt.

Neither problem is caused by, nor fixable by, the runtime separation: all three
files exercise Desktop code only. Nothing in them touches the `hermes` CLI.

### 12.7 Lint, stated precisely

`npm run --workspace apps/desktop lint` reports **17 errors, 149 warnings**, and
every error is in the untracked AgentBox POC
(`src/agentbox/client.test.ts`, `src/agentbox/event-adapter.test.ts`,
`src/plugins/agentbox-lab/lab.tsx`) — files this round is required not to modify.
The repository is **not** lint-clean; the accurate claim is narrower: **no
tracked change in this round introduced a lint error.** (Two were introduced and
fixed during the round: an import-order error in the rewritten relay budget test,
and one in `use-session-actions.test.tsx` after the fixture moved.)

Separately: `e2e/` is outside the lint scope (`eslint src/ electron/`), so the
restored specs' 8 pre-existing `curly` errors are unenforced rather than absent.
`e2e/` should either join the lint scope or stay documented as exempt.
