# Electron host boundary — responsibility and dependency audit

Status: **audit + partial migration.** This document is the E0 deliverable of the Electron
Desktop Host boundary refactor. Every row below is a *current classification*, not an achievement:
the "Migration ledger" (§7) is the only place that says what has physically moved.

Evidence base: `apps/desktop/electron/` @ `b55355f` (branch `main`), read from the working tree.
Line counts are non-test, non-`.d.ts` lines from the working tree at audit time.

Companion documents:

- `03-coupling-matrix.md` — the earlier Desktop × Hermes coupling survey, taken before the
  megafile decomposition. Its mass numbers for `main.ts` (18,291 lines) are **stale**: `main.ts` is
  now 2,488 lines after the D/E extraction rounds (`docs/desktop-megafile-decomposition.md`). This
  document supersedes its file-level inventory; its bucket analysis still explains *why* the
  coupling exists and is not repeated here.
- `06-decision-and-migration.md` — the cross-repo decision ("Desktop owns the Ports, AgentBox owns
  the Harnesses"). This document is the Desktop-side execution of that decision's first stage.

## 0. Mass, now

| Layer | Modules | Non-test lines |
|---|---:|---:|
| `apps/desktop/electron/` production | 185 | 51,115 |
| of which `electron/legacy-hermes/` (E2) | 60 | 14,868 |
| of which `electron/composition/` | 21 | 16,151 |
| of which `electron/process/` (E1) | 8 | 859 |
| of which `electron/main.ts` | 1 | 2,488 |
| `apps/desktop/electron/` tests | 152 files | 34,429 |

Module counts exclude a type shim (`get-windows.d.ts`) and a test fixture
(`fixtures/windows-system-ca.ts`), which are not registered production modules.

The single most important structural fact: `composition/bootstrap-env-composition.ts` is **7,959
lines** — 47% of `composition/` and 16% of the whole main process. The megafile decomposition moved
code *out of* `main.ts` and into a small number of large `composition/` modules; it did not create
responsibility boundaries. That module is where resolution, spawn, readiness, boot progress, the
profile pool, the update machinery and a large block of app constants currently share one file, and
it is the primary target of E1/E2/E5.

## 1. Ownership vocabulary

Exactly six classes are used, and no others. Each module gets exactly one — where a module genuinely
straddles two, the class recorded is the one that owns its *destination*, and the straddle is called
out in §6.

| Class | Means | Authority |
|---|---|---|
| `DESKTOP_HOST` | Electron app lifecycle, windows, tray/notifications/HUD, IPC registration, desktop install/update, security policy | Electron is authoritative for desktop and machine facts |
| `HOST_CAPABILITY` | A local executor the app exposes: filesystem, git/worktree/review, terminal, credentials, preview, platform (WSL/Windows/Hyprland/ssh) | The host OS / external tool is authoritative; the module is an executor, never a Work/Execution authority |
| `PROCESS_PRIMITIVE` | Harness-neutral subprocess launch, supervision, identity, ownership, bounded stop, restart budget, typed result | The OS process is the fact |
| `WORKCORE_LIFECYCLE` | Electron's *infrastructure* lifecycle over a future Work Core process: resolve artifact, launch, readiness, connection handle, bounded restart, graceful shutdown | The Work Core owns its own Execution/Harness child processes; Electron owns only the infrastructure process |
| `WORKCORE_BACKEND` | Truth that will belong to the Work Core: remote Connection, Workspace, Execution, Session | Work Core (does not exist yet — see §6) |
| `LEGACY_HERMES` | Today's Hermes-direct adapter: resolution ladder, argv/env, readiness, profile pool, local/SSH/Windows lifecycle | Electron today; retires as the Work Core path lands |

Three vocabulary notes that matter for review:

1. **`HOST_CAPABILITY` is an executor, not an authority.** A module classified `HOST_CAPABILITY`
   may hold the only implementation of a capability, but must not decide Harness, Profile, Session
   or Execution. Where a current module does decide one of those, it is `LEGACY_HERMES`, not
   `HOST_CAPABILITY` — that is why `git-worktree-ops.ts` is a capability while
   `connection-registry/*` is legacy.
2. **"Hermes-only? = yes" is a string/import fact, not a judgement.** It records that the module
   contains Hermes-proprietary or `HERMES_*` vocabulary today. `partial` means the module's
   *structure* is harness-neutral while it still carries Hermes strings (§5).
3. **`WORKCORE_BACKEND` is registered, never implemented.** Nothing in this repository is a Work
   Core backend today. The class exists so that the modules whose authority is *scheduled* to move
   are not silently mislabelled as Desktop-owned.

## 2. Target directory tree (direction of responsibility, not a move order)

```
apps/desktop/electron/
├── app/                  Electron application lifecycle
├── windows/              windows, tray, notifications, HUD
├── host-capabilities/    filesystem/git/terminal/credentials/preview/platform
├── process/              generic child-process launch, supervision, stop primitives
├── workcore/             Work Core lifecycle interface + empty-boundary shell
├── host-bridge/          typed boundary for a Work Core calling local capabilities
├── ipc/                  Renderer → Electron IPC registration
├── update/               Desktop install and update
├── security/             path, IPC, secret, URL policy
└── legacy-hermes/        Hermes resolution, launch, readiness, remote lifecycle (compat layer)
```

This tree is a **direction**. Nothing is moved merely to make a directory exist; §7 records what
actually moved and §6 records what cannot move yet.

## 3. Module registry

Columns: **current callers** lists production importers (test importers excluded; `c/` abbreviates
`composition/`). **operates on** is the resource the module touches. **state authority** is who is
allowed to be right about that resource. **Hermes-only?** is the string/import fact described above.
**Session/Exec/Workspace** marks whether the module participates in Session, Execution or Workspace
truth — `indirect` means it routes or configures something that does, without being authoritative.

### DESKTOP_HOST — 69 modules, 15172 lines

| module | LOC | current callers | operates on | state authority | Hermes-only? | target | Session/Exec/Workspace |
|---|---:|---|---|---|---|---|---|
| `main.ts` | 2485 | `windows/windows-composition` | Electron boot order + composition | Electron | partial | `app/` | no |
| `composition/api-proxy-composition.ts` | 1508 | `main` | authenticated /api proxy, favicon/title cache | backend | yes | `composition/` | indirect |
| `windows/windows-composition.ts` | 1247 | `main` | window registry + app menu | Electron | yes | `windows/ (moved)` | no |
| `ipc/connection-ipc.ts` | 766 | `main` | connection channels | Electron | yes | `ipc/ (moved)` | indirect |
| `preload.ts` | 540 | — | contextBridge surface | Electron | partial | `ipc/` | no |
| `update/updates-composition.ts` | 470 | `main` | update check + desktop uninstall | git | partial | `update/ (moved)` | no |
| `update/updater-process.ts` | 455 | `c/bootstrap-env-composition` | detached updater child | updater script | partial | `update/ (moved)` | no |
| `windows/window-renderer-lifecycle.ts` | 426 | `c/bootstrap-env-composition`, `hc/credentials/cloud-oauth`, `windows/wake-indicator-window`, `windows/windows-composition` | renderer crash/reload policy | Electron | no | `windows/ (moved)` | no |
| `windows/quick-entry.ts` | 421 | `ipc/window-ipc`, `main`, `windows/hud-snap-shortcut`, `windows/windows-composition` | global quick-entry composer | OS | yes | `windows/ (moved)` | no |
| `ipc/window-ipc.ts` | 310 | `main` | window channels | Electron | yes | `ipc/ (moved)` | no |
| `windows/window-theme.ts` | 310 | `c/bootstrap-env-composition`, `ipc/theme-ipc`, `main`, `windows/windows-composition` | theme + translucency persistence | Electron | no | `windows/ (moved)` | no |
| `ipc/hud-ipc.ts` | 303 | `main` | HUD IPC channels | Electron | no | `ipc/ (moved)` | no |
| `update/desktop-uninstall.ts` | 268 | `c/bootstrap-env-composition`, `update/updates-composition` | app bundle + userData removal | filesystem | partial | `update/ (moved)` | no |
| `windows/hud-game-overlay.ts` | 261 | `windows/windows-composition` | fullscreen app detection | OS window facts | no | `windows/ (moved)` | no |
| `windows/find-in-page.ts` | 231 | `c/bootstrap-env-composition`, `ipc/window-ipc`, `main` | find-in-page | Electron | yes | `windows/ (moved)` | no |
| `ipc/files-ipc.ts` | 220 | `main` | file channels | filesystem | partial | `ipc/ (moved)` | indirect |
| `windows/zoom.ts` | 214 | `c/bootstrap-env-composition`, `ipc/window-ipc`, `windows/windows-composition` | zoom level + reassert | Electron | no | `windows/ (moved)` | no |
| `ipc/backend-ipc.ts` | 211 | `main` | backend boot/repair channels | Electron | yes | `ipc/ (moved)` | indirect |
| `app/log-buffer.ts` | 210 | `app/deep-link-composition`, `c/api-proxy-composition`, `c/bootstrap-env-composition`, `hc/credentials/cloud-oauth`, `hc/platform/wsl-fonts` +10 | desktop.log buffer + rotation | filesystem | yes | `app/ (moved)` | no |
| `windows/renderer-load-error-page.ts` | 198 | `c/bootstrap-env-composition` | load-error page | Electron | yes | `windows/ (moved)` | no |
| `ipc/system-ipc.ts` | 195 | `main` | app/system channels | Electron | yes | `ipc/ (moved)` | no |
| `windows/session-windows.ts` | 192 | `c/bootstrap-env-composition`, `main`, `windows/windows-composition` | per-session pop-out windows | Electron | no | `windows/ (moved)` | no |
| `windows/wake-indicator-window.ts` | 185 | `c/bootstrap-env-composition` | wake indicator window | Electron | no | `windows/ (moved)` | no |
| `windows/window-state.ts` | 169 | `c/bootstrap-env-composition`, `main`, `windows/windows-composition` | window-state.json | Electron | no | `windows/ (moved)` | no |
| `app/renderer-bundle.ts` | 160 | `c/bootstrap-env-composition` | renderer asset refs | build output | no | `app/ (moved)` | no |
| `ipc/pet-overlay-ipc.ts` | 151 | `main` | pet overlay IPC | Electron | no | `ipc/ (moved)` | no |
| `app/desktop-installation.ts` | 137 | `c/bootstrap-env-composition` | desktop-installation.json | Electron | no | `app/ (moved)` | no |
| `windows/hud-windowing.ts` | 136 | `ipc/hud-ipc`, `windows/windows-composition` | HUD windowing backend | pure | no | `windows/ (moved)` | no |
| `update/bundle-skew.ts` | 133 | `update/bundle-swap`, `windows/windows-composition` | git checkout vs build stamp | git | partial | `update/ (moved)` | no |
| `test-main-process-sources.ts` | 122 | — (tests only) | reads main-process sources for wiring assertions | none | no | `(test support)` | no |
| `windows/stream-throttle.ts` | 119 | `c/bootstrap-env-composition` | background throttling | renderer | no | `windows/ (moved)` | no |
| `ipc/theme-ipc.ts` | 113 | `main` | theme channels | Electron | no | `ipc/ (moved)` | no |
| `windows/translucency.ts` | 111 | `c/bootstrap-env-composition`, `ipc/hud-ipc`, `ipc/theme-ipc`, `windows/window-theme` | window translucency | OS | no | `windows/ (moved)` | no |
| `app/dev-cdp.ts` | 108 | `c/bootstrap-env-composition`, `main` | dev CDP port | Electron | no | `app/ (moved)` | no |
| `app/deep-link-composition.ts` | 108 | `main` | hermes:// deep links | Electron | yes | `app/ (moved)` | no |
| `windows/hud-geometry.ts` | 105 | `ipc/hud-ipc`, `main` | HUD bounds | pure | no | `windows/ (moved)` | no |
| `ipc/notification-ipc.ts` | 102 | `main` | native notifications | OS | no | `ipc/ (moved)` | no |
| `update/update-gate.ts` | 95 | `c/bootstrap-env-composition` | update clearance gate | Electron | partial | `update/ (moved)` | no |
| `update/handoff-result.ts` | 93 | `c/bootstrap-env-composition` | HERMES_HOME update-result file | updater script | partial | `update/ (moved)` | no |
| `app/quit-guard.ts` | 92 | `ipc/window-ipc`, `main` | quit prompt | pure | no | `app/ (moved)` | no |
| `app/renderer-log.ts` | 92 | `c/bootstrap-env-composition`, `ipc/system-ipc`, `windows/wake-indicator-window`, `windows/windows-composition` | renderer console capture | renderer | no | `app/ (moved)` | no |
| `update/update-count.ts` | 92 | `update/updates-composition` | behind-count | git | no | `update/ (moved)` | no |
| `windows/app-icon.ts` | 85 | `c/bootstrap-env-composition` | app icon files | Electron | no | `windows/ (moved)` | no |
| `ipc/api-proxy-ipc.ts` | 82 | `main` | hermes:api proxy channel | backend | yes | `ipc/ (moved)` | indirect |
| `windows/link-title-window.ts` | 80 | `c/api-proxy-composition` | link title peek window | Electron | no | `windows/ (moved)` | no |
| `windows/window-reveal.ts` | 78 | `c/bootstrap-env-composition` | window reveal | Electron | no | `windows/ (moved)` | no |
| `windows/hud-cursor.ts` | 65 | `windows/windows-composition` | cursor position | pure | no | `windows/ (moved)` | no |
| `update/update-remote.ts` | 65 | `c/bootstrap-env-composition`, `update/updates-composition` | reviewed remote URL | git | no | `update/ (moved)` | no |
| `update/bundle-swap.ts` | 61 | `c/bootstrap-env-composition`, `ipc/system-ipc` | bundle swap stamp | updater script | partial | `update/ (moved)` | no |
| `windows/hud-snap-shortcut.ts` | 60 | `windows/windows-composition` | HUD global shortcut | OS | no | `windows/ (moved)` | no |
| `windows/hud-snap.ts` | 60 | `windows/windows-composition` | HUD snapping | pure | no | `windows/ (moved)` | no |
| `security/window-open-policy.ts` | 58 | `c/bootstrap-env-composition`, `windows/link-title-window` | window.open policy | pure | no | `security/ (moved)` | no |
| `app/crash-forensics.ts` | 51 | `c/bootstrap-env-composition` | crash handler | Electron | no | `app/ (moved)` | no |
| `app/power-save.ts` | 50 | `main` | power-save blocker | OS | no | `app/ (moved)` | no |
| `security/embed-referer.ts` | 48 | `main` | embed session request headers | Electron | yes | `security/ (moved)` | no |
| `windows/titlebar-overlay-width.ts` | 42 | `c/bootstrap-env-composition`, `windows/window-theme` | titlebar overlay width | OS | no | `windows/ (moved)` | no |
| `windows/hud-overlay.ts` | 41 | `windows/windows-composition` | HUD Electron overlay | Electron | no | `windows/ (moved)` | no |
| `windows/notification-registry.ts` | 41 | `ipc/notification-ipc` | notification registry | Electron | no | `windows/ (moved)` | no |
| `ipc/preview-ipc.ts` | 40 | `main` | preview channels | Electron | yes | `ipc/ (moved)` | no |
| `windows/hud-url.ts` | 39 | `windows/windows-composition` | HUD window url | pure | no | `windows/ (moved)` | no |
| `windows/hud-drag.ts` | 37 | `ipc/hud-ipc` | HUD drag session | pure | no | `windows/ (moved)` | no |
| `windows/wake-indicator.ts` | 34 | `windows/wake-indicator-window` | wake indicator state | pure | no | `windows/ (moved)` | no |
| `security/workspace-cwd.ts` | 34 | `c/bootstrap-env-composition` | packaged-install path test | pure | no | `security/ (moved)` | no |
| `app/event-dedupe.ts` | 32 | `ipc/notification-ipc`, `main` | cross-window one-shot keys | Electron | no | `app/ (moved)` | no |
| `windows/browser-windows.ts` | 31 | `windows/windows-composition` | browser pop-out window | pure | no | `windows/ (moved)` | no |
| `windows/notification-actions.ts` | 29 | `ipc/notification-ipc` | notification action | pure | no | `windows/ (moved)` | no |
| `windows/main-window-lifecycle.ts` | 28 | `main` | main window | Electron | no | `windows/ (moved)` | no |
| `app/desktop-log-line.ts` | 19 | `app/log-buffer` | log line format | pure | no | `app/ (moved)` | no |
| `windows/notification-types.ts` | 18 | `ipc/notification-ipc` | notification shape | pure | no | `windows/ (moved)` | no |

### HOST_CAPABILITY — 44 modules, 10825 lines

| module | LOC | current callers | operates on | state authority | Hermes-only? | target | Session/Exec/Workspace |
|---|---:|---|---|---|---|---|---|
| `host-capabilities/platform/ssh-connection.ts` | 1148 | `c/bootstrap-env-composition`, `hc/terminal/terminal-ipc`, `lh/connect`, `lh/runtime-composition`, `lh/spawn` +2 | ssh exec / forward primitive | remote host | no | `host-capabilities/platform (moved)` | indirect |
| `host-capabilities/git/git-review-ops.ts` | 903 | `hc/git/git-ipc` | diff/commit/push/PR | git | no | `host-capabilities/git (moved)` | indirect |
| `host-capabilities/credentials/cloud-oauth.ts` | 839 | `c/api-proxy-composition`, `main` | Nous portal OAuth | portal | partial | `host-capabilities/credentials (moved)` | no |
| `host-capabilities/filesystem/hardening.ts` | 554 | `c/api-proxy-composition`, `c/bootstrap-env-composition`, `hc/contract`, `hc/credentials/cloud-oauth`, `hc/filesystem/fs-read-dir` +9 | path safety, data-URL read, secret encryption | filesystem | partial | `host-capabilities/filesystem (moved)` | no |
| `host-capabilities/git/git-worktree-ops.ts` | 537 | `hc/contract`, `hc/git/git-ipc` | worktrees + branches | git | no | `host-capabilities/git (moved)` | indirect |
| `host-capabilities/filesystem/desktop-plugin-install.ts` | 446 | `hc/contract`, `hc/filesystem/fs-ipc` | git clone into plugin root | git | partial | `host-capabilities/filesystem (moved)` | no |
| `host-capabilities/terminal/terminal-ipc.ts` | 398 | `c/bootstrap-env-composition` | node-pty sessions | PTY | partial | `host-capabilities/terminal (moved)` | indirect |
| `host-capabilities/platform/windows-sandbox-fallback.ts` | 394 | `c/bootstrap-env-composition`, `ipc/system-ipc`, `main` | Windows sandbox / ACL fallback | OS | no | `host-capabilities/platform (moved)` | no |
| `host-capabilities/preview/favicon.ts` | 347 | `hc/contract`, `main` | favicon fetch + parse | remote host | no | `host-capabilities/preview (moved)` | no |
| `host-capabilities/preview/vscode-marketplace.ts` | 337 | `ipc/preview-ipc` | VSIX theme fetch | remote host | no | `host-capabilities/preview (moved)` | no |
| `host-capabilities/platform/window-below.ts` | 298 | `hc/contract`, `hc/platform/hyprland`, `ipc/window-ipc`, `windows/hud-game-overlay`, `windows/windows-composition` | native window enumeration | OS | no | `host-capabilities/platform (moved)` | no |
| `host-capabilities/credentials/native-oauth.ts` | 255 | `c/bootstrap-env-composition`, `hc/contract`, `hc/credentials/native-oauth-login`, `hc/credentials/native-token-store`, `ipc/connection-ipc` | PKCE + token parsing | pure | no | `host-capabilities/credentials (moved)` | no |
| `host-capabilities/credentials/native-auth-decisions.ts` | 235 | `c/api-proxy-composition`, `c/bootstrap-env-composition`, `hc/contract`, `hc/credentials/native-oauth`, `lh/connections-composition` | readiness/auth decisions | pure | yes | `host-capabilities/credentials (moved)` | no |
| `host-capabilities/credentials/native-oauth-login.ts` | 215 | `ipc/connection-ipc` | loopback login flow | credentials | no | `host-capabilities/credentials (moved)` | no |
| `host-capabilities/platform/hud-hyprland.ts` | 214 | `windows/hud-overlay` | Hyprland compositor IPC | compositor | no | `host-capabilities/platform (moved)` | no |
| `host-capabilities/preview/preview-reach.ts` | 210 | `main`, `preview-reach.e2e.mts` | loopback preview reach | Electron | no | `host-capabilities/preview (moved)` | no |
| `host-capabilities/filesystem/fs-ipc.ts` | 204 | `main` | renderer filesystem IPC | filesystem | partial | `host-capabilities/filesystem (moved)` | indirect |
| `host-capabilities/git/git-repo-scan.ts` | 201 | `hc/contract`, `hc/git/git-ipc` | repo scan | filesystem | no | `host-capabilities/git (moved)` | indirect |
| `host-capabilities/platform/wsl-path-bridge.ts` | 198 | `c/bootstrap-env-composition`, `hc/contract`, `hc/filesystem/fs-read-dir`, `ipc/files-ipc`, `main` | WSL path translation | WSL distro | no | `host-capabilities/platform (moved)` | indirect |
| `host-capabilities/platform/shell-path.ts` | 187 | `c/bootstrap-env-composition`, `main` | login-shell PATH | login shell | no | `host-capabilities/platform (moved)` | no |
| `host-capabilities/preview/media-protocol.ts` | 186 | `hc/contract`, `main` | hermes-media:// protocol | Electron | yes | `host-capabilities/preview (moved)` | no |
| `host-capabilities/credentials/mcp-oauth-callback-ipc.ts` | 181 | `main` | MCP OAuth loopback callback | credentials | no | `host-capabilities/credentials (moved)` | no |
| `host-capabilities/platform/hyprland.ts` | 177 | `hc/contract`, `hc/platform/hud-hyprland`, `hc/platform/window-below` | Hyprland socket | pure | no | `host-capabilities/platform (moved)` | no |
| `host-capabilities/platform/ssh-config.ts` | 175 | `ipc/connection-ipc` | ~/.ssh/config | filesystem | no | `host-capabilities/platform (moved)` | no |
| `host-capabilities/credentials/native-token-store.ts` | 165 | `c/bootstrap-env-composition` | persisted token set | credentials | no | `host-capabilities/credentials (moved)` | no |
| `host-capabilities/credentials/oauth-partition.ts` | 155 | `c/bootstrap-env-composition` | Electron session partition | OS keyring | no | `host-capabilities/credentials (moved)` | no |
| `host-capabilities/platform/bootstrap-platform.ts` | 150 | `c/bootstrap-env-composition`, `hc/platform/wsl-fonts`, `windows/window-theme` | WSL / remote display / keyring | Electron (host facts) | partial | `host-capabilities/platform (moved)` | no |
| `host-capabilities/contract.ts` | 150 | — (tests only) | typed executor boundary for the six capability areas | OS / external tool | yes | `host-capabilities/ (new)` | no |
| `host-capabilities/preview/preview-capture.ts` | 131 | `hc/contract`, `ipc/files-ipc` | screenshot capture | Electron | no | `host-capabilities/preview (moved)` | no |
| `host-capabilities/platform/spawn-helper-perms.ts` | 122 | `hc/terminal/terminal-ipc` | node-pty spawn-helper mode | filesystem | no | `host-capabilities/platform (moved)` | no |
| `host-capabilities/git/git-ipc.ts` | 120 | `main` | git IPC channels | git | no | `host-capabilities/git (moved)` | indirect |
| `host-capabilities/filesystem/fs-read-dir.ts` | 112 | `hc/contract`, `hc/filesystem/fs-ipc` | directory listing | filesystem | no | `host-capabilities/filesystem (moved)` | indirect |
| `host-capabilities/preview/media-bridge.ts` | 109 | `c/api-proxy-composition`, `ipc/files-ipc`, `main` | media bridge + preview metadata | filesystem | no | `host-capabilities/preview (moved)` | no |
| `host-capabilities/credentials/secret-storage-policy.ts` | 102 | `c/bootstrap-env-composition`, `hc/contract`, `lh/connections-composition` | secret storage policy | OS keyring | no | `host-capabilities/credentials (moved)` | no |
| `host-capabilities/platform/wsl-clipboard-image.ts` | 102 | `ipc/files-ipc` | WSL clipboard image | windows.exe | no | `host-capabilities/platform (moved)` | no |
| `host-capabilities/platform/windows-user-env.ts` | 99 | `c/bootstrap-env-composition` | Windows user env | OS registry | no | `host-capabilities/platform (moved)` | no |
| `host-capabilities/git/gitlock.ts` | 96 | `update/updates-composition` | stale git index.lock | filesystem | no | `host-capabilities/git (moved)` | no |
| `host-capabilities/platform/windows-system-ca.ts` | 79 | `main` | Windows CA trust | OS | no | `host-capabilities/platform (moved)` | no |
| `host-capabilities/platform/find-git-bash.ts` | 67 | `c/bootstrap-env-composition`, `hc/contract` | Git Bash executable | filesystem | no | `host-capabilities/platform (moved)` | no |
| `host-capabilities/terminal/terminal-output-gate.ts` | 62 | `hc/contract`, `hc/terminal/terminal-ipc` | terminal exit payload | pure | no | `host-capabilities/terminal (moved)` | no |
| `host-capabilities/platform/wsl-fonts.ts` | 61 | `main` | WSL font registration | filesystem | no | `host-capabilities/platform (moved)` | no |
| `host-capabilities/git/git-root.ts` | 50 | `hc/contract`, `hc/filesystem/fs-ipc` | git root discovery | filesystem | no | `host-capabilities/git (moved)` | indirect |
| `host-capabilities/platform/windows-child-options.ts` | 37 | `c/api-proxy-composition`, `c/bootstrap-env-composition`, `hc/contract`, `ipc/connection-ipc`, `lh/bootstrap-runner` +3 | Windows child spawn options | pure | no | `host-capabilities/platform (moved)` | no |
| `host-capabilities/credentials/oauth-net-request.ts` | 17 | `c/bootstrap-env-composition` | OAuth request headers | pure | no | `host-capabilities/credentials (moved)` | no |

### PROCESS_PRIMITIVE — 9 modules, 1048 lines

| module | LOC | current callers | operates on | state authority | Hermes-only? | target | Session/Exec/Workspace |
|---|---:|---|---|---|---|---|---|
| `process/readiness.ts` | 207 | `lh/backend-ready` | stdout sentinel + polled-value readiness | OS | no | `process/ (new)` | no |
| `process/identity.ts` | 193 | `c/bootstrap-env-composition` | process start marker + claim policy | OS (PID identity) | no | `process/ (moved)` | no |
| `update/update-marker.ts` | 189 | `c/bootstrap-env-composition` | update-in-progress marker file (its `isPidAlive` went to `process/pid.ts` in E1) | OS | partial | `update/ (moved)` | no |
| `process/connection-state.ts` | 103 | `c/bootstrap-env-composition` | generation + owned child | Electron | no | `process/ (moved)` | no |
| `process/budget.ts` | 101 | `lh/remote-liveness`, `windows/window-renderer-lifecycle`, `wc/lifecycle` | failure streak + attempt window | pure | no | `process/ (new)` | no |
| `process/child-stop.ts` | 94 | `c/bootstrap-env-composition` | child process + tree | OS | no | `process/ (moved)` | no |
| `process/output-tail.ts` | 69 | `c/bootstrap-env-composition` | child stdout/stderr ring buffer | OS | no | `process/ (moved)` | no |
| `process/inflight-claim.ts` | 58 | `c/bootstrap-env-composition` | keyed in-flight claim | Electron | no | `process/ (moved)` | no |
| `process/pid.ts` | 34 | `p/identity`, `update/update-marker` | host-process liveness | OS | no | `process/ (moved)` | no |

### WORKCORE_LIFECYCLE — 2 modules, 198 lines

| module | LOC | current callers | operates on | state authority | Hermes-only? | target | Session/Exec/Workspace |
|---|---:|---|---|---|---|---|---|
| `workcore/lifecycle.ts` | 134 | `wc/slot` | the six-verb Work Core infrastructure contract | Work Core | no | `workcore/ (new)` | no |
| `workcore/slot.ts` | 64 | — (tests only) | the single composition position for a Work Core lifecycle | Electron (deliberately unpopulated) | no | `workcore/ (new)` | no |

### LEGACY_HERMES — 64 modules, 24220 lines

| module | LOC | current callers | operates on | state authority | Hermes-only? | target | Session/Exec/Workspace |
|---|---:|---|---|---|---|---|---|
| `composition/bootstrap-env-composition.ts` | 7939 | `app/deep-link-composition`, `c/api-proxy-composition`, `hc/credentials/cloud-oauth`, `lh/connections-composition`, `lh/paths` +4 | env constants + local backend spawn + boot progress + updates | Electron | yes | `legacy-hermes (split)` | indirect |
| `legacy-hermes/managed-ssh-update.ts` | 1084 | `c/bootstrap-env-composition`, `lh/runtime-composition`, `main` | remote hermes install | filesystem + network | yes | `legacy-hermes/managed-ssh-update (moved)` | no |
| `legacy-hermes/connection-config.ts` | 1056 | `c/api-proxy-composition`, `c/bootstrap-env-composition`, `hc/credentials/cloud-oauth`, `ipc/api-proxy-ipc`, `ipc/backend-ipc` +10 | connection.json + baseUrl/wsUrl/auth mode | Electron | yes | `legacy-hermes/connections (moved)` | indirect |
| `legacy-hermes/bootstrap-runner.ts` | 1037 | `c/bootstrap-env-composition`, `lh/bootstrap-runner` | hermes checkout + install.sh | git / install script | yes | `legacy-hermes/bootstrap-runner (moved)` | no |
| `legacy-hermes/windows-remote-lifecycle.ts` | 789 | `c/bootstrap-env-composition`, `hc/terminal/terminal-ipc`, `lh/managed-ssh-update`, `lh/runtime-composition`, `main` | remote host process | remote host | yes | `legacy-hermes/windows-remote (moved)` | no |
| `legacy-hermes/ownership.ts` | 777 | `lh/connect`, `lh/remote-lifecycle`, `lh/resolve`, `lh/spawn` | remote lockfile + tokens | remote host | yes | `legacy-hermes/remote-lifecycle (moved)` | no |
| `legacy-hermes/runtime-composition.ts` | 721 | `c/api-proxy-composition`, `c/bootstrap-env-composition`, `main` | pool, liveness, managed ssh updates | Electron | yes | `legacy-hermes/runtime (moved)` | indirect |
| `legacy-hermes/connections-composition.ts` | 639 | `main` | registry secrets + broadcast | Electron | yes | `legacy-hermes/connections (moved)` | indirect |
| `legacy-hermes/schema.ts` | 551 | `lh/connection-registry`, `lh/migration`, `lh/registry-ops`, `lh/roster` | registry normalisation | pure | yes | `legacy-hermes/connections (moved)` | indirect |
| `legacy-hermes/profile-session-routing.ts` | 455 | `c/api-proxy-composition` | profile→session rows | backend | yes | `legacy-hermes/connections (moved)` | yes |
| `legacy-hermes/remote-liveness.ts` | 440 | `c/bootstrap-env-composition`, `ipc/connection-ipc`, `lh/runtime-composition`, `main` | cached remote descriptors | Electron | yes | `legacy-hermes/remote-liveness (moved)` | no |
| `legacy-hermes/identity.ts` | 384 | `lh/connection-registry`, `lh/migration`, `lh/registry-ops`, `lh/roster`, `lh/route-resolution` +1 | registry schema | pure | yes | `legacy-hermes/connections (moved)` | indirect |
| `legacy-hermes/spawn.ts` | 348 | `lh/connect`, `lh/remote-lifecycle` | remote dashboard spawn + forward | remote host | yes | `legacy-hermes/remote-lifecycle (moved)` | no |
| `legacy-hermes/gateway-file-download.ts` | 343 | `c/api-proxy-composition`, `hc/credentials/cloud-oauth` | gateway file/artifact download | gateway | yes | `legacy-hermes/download (moved)` | no |
| `legacy-hermes/backend-ownership.ts` | 336 | `c/bootstrap-env-composition` | backend-ownership.json | Electron (process facts) | yes | `legacy-hermes/ownership (moved)` | no |
| `legacy-hermes/venv-blocker-scan.ts` | 323 | `c/bootstrap-env-composition` | processes holding the hermes venv | OS process facts | yes | `legacy-hermes/venv-blockers (moved)` | no |
| `legacy-hermes/backend-health.ts` | 317 | `c/bootstrap-env-composition` | /api/health + /api/status readiness | backend | yes | `legacy-hermes/health (moved)` | no |
| `legacy-hermes/plugin-profile-routes.ts` | 312 | `ipc/connection-ipc`, `lh/remote-ws-headers` | profile route table | pure | yes | `legacy-hermes/connections (moved)` | indirect |
| `legacy-hermes/profile-migration.ts` | 311 | `c/bootstrap-env-composition` | legacy active-profile file | Electron | yes | `legacy-hermes/connections (moved)` | indirect |
| `legacy-hermes/windows-hermes-path.ts` | 293 | `c/bootstrap-env-composition` | Windows venv hermes command | Electron | yes | `legacy-hermes/windows-path (moved)` | no |
| `legacy-hermes/connect.ts` | 286 | `lh/remote-lifecycle` | SSH remote backend | remote host | yes | `legacy-hermes/remote-lifecycle (moved)` | no |
| `legacy-hermes/registry-ops.ts` | 274 | `lh/connection-registry` | registry mutations | Electron | yes | `legacy-hermes/connections (moved)` | indirect |
| `legacy-hermes/pool-spawn-coordinator.ts` | 272 | `c/bootstrap-env-composition`, `lh/runtime-composition` | local backend spawn slots | Electron | yes | `legacy-hermes/pool (moved)` | indirect |
| `legacy-hermes/profile-delete-routing.ts` | 246 | `c/api-proxy-composition`, `c/bootstrap-env-composition`, `ipc/api-proxy-ipc`, `lh/profile-rename-routing` | profile delete routing | pure | yes | `legacy-hermes/connections (moved)` | indirect |
| `legacy-hermes/resolve.ts` | 244 | `lh/connect`, `lh/remote-lifecycle`, `lh/spawn` | remote hermes binary + profiles | remote host | yes | `legacy-hermes/remote-lifecycle (moved)` | no |
| `legacy-hermes/gateway-ws-probe.ts` | 237 | `c/bootstrap-env-composition`, `ipc/connection-ipc`, `main` | /api/ws upgrade | backend | yes | `legacy-hermes/ws-probe (moved)` | no |
| `legacy-hermes/backend-probes.ts` | 234 | `c/bootstrap-env-composition` | hermes executable resolution ladder | Electron | yes | `legacy-hermes/resolution (moved)` | no |
| `legacy-hermes/desktop-remote-route.ts` | 228 | `c/bootstrap-env-composition`, `lh/runtime-composition` | ssh terminal pool key | pure | yes | `legacy-hermes/remote-route (moved)` | no |
| `legacy-hermes/lifecycle.ts` | 222 | `c/bootstrap-env-composition` | Hermes argv/env/descriptor producers + six-verb seam | Electron (legacy adapter) | yes | `legacy-hermes/ (new)` | no |
| `legacy-hermes/roster.ts` | 219 | `lh/connection-registry` | agent roster | pure | yes | `legacy-hermes/connections (moved)` | indirect |
| `legacy-hermes/api-transport.ts` | 178 | `c/bootstrap-env-composition`, `hc/credentials/cloud-oauth`, `main` | gateway HTTP keepalive/retry | transport only | partial | `legacy-hermes/transport (moved)` | no |
| `legacy-hermes/backend-env.ts` | 161 | `c/bootstrap-env-composition`, `hc/platform/shell-path` | child env, HERMES_HOME, PATH | Electron (env policy) | yes | `legacy-hermes/env (moved)` | no |
| `legacy-hermes/migration.ts` | 153 | `lh/connection-registry` | v1→v2 registry migration | pure | yes | `legacy-hermes/connections (moved)` | indirect |
| `legacy-hermes/ssh-bootstrap-coordinator.ts` | 151 | `c/bootstrap-env-composition` | ssh bootstrap dial lifetime | Electron | partial | `legacy-hermes/ssh-bootstrap (moved)` | no |
| `legacy-hermes/backend-ready.ts` | 149 | `c/bootstrap-env-composition`, `lh/ownership` | stdout READY line + ready file | backend (announces port) | yes | `legacy-hermes/readiness (moved)` | no |
| `legacy-hermes/first-run-setup-gate.ts` | 146 | `c/bootstrap-env-composition`, `lh/primary-backend-startup` | first-run choice gate | Electron | yes | `legacy-hermes/first-run-gate (moved)` | no |
| `legacy-hermes/backend-start-failure.ts` | 140 | `c/bootstrap-env-composition` | latched boot failure | Electron | yes | `legacy-hermes/start-failure (moved)` | no |
| `legacy-hermes/plugin-compat-notice.ts` | 138 | `c/bootstrap-env-composition` | HERMES_HOME plugin-compat report | Hermes runtime | yes | `legacy-hermes/plugin-compat (moved)` | no |
| `legacy-hermes/profile-rename-routing.ts` | 138 | `c/api-proxy-composition`, `ipc/api-proxy-ipc` | profile rename lifecycle | Electron | yes | `legacy-hermes/connections (moved)` | indirect |
| `legacy-hermes/route-resolution.ts` | 131 | `lh/connection-registry` | primary route resolution | Electron | yes | `legacy-hermes/connections (moved)` | indirect |
| `legacy-hermes/connection-route-identity.ts` | 131 | `lh/desktop-remote-route`, `lh/identity` | stored route identity | pure | yes | `legacy-hermes/connections (moved)` | indirect |
| `legacy-hermes/backend-release-gate.ts` | 127 | `c/bootstrap-env-composition` | backend PID release | Electron | yes | `legacy-hermes/release-gate (moved)` | no |
| `legacy-hermes/bootstrap-repair-guard.ts` | 121 | `ipc/backend-ipc` | bootstrap repair decision | pure | yes | `legacy-hermes/repair-guard (moved)` | no |
| `legacy-hermes/primary-backend-startup.ts` | 113 | `c/bootstrap-env-composition` | primary boot sequence | Electron | yes | `legacy-hermes/primary-startup (moved)` | no |
| `legacy-hermes/dashboard-token.ts` | 112 | `c/bootstrap-env-composition` | scraped dashboard session token | backend | yes | `legacy-hermes/token (moved)` | no |
| `legacy-hermes/connection-apply.ts` | 111 | `c/bootstrap-env-composition`, `hc/terminal/terminal-ipc`, `ipc/connection-ipc`, `main` | applied connection + ssh teardown | Electron | yes | `legacy-hermes/connections (moved)` | indirect |
| `legacy-hermes/parent-process-identity.ts` | 108 | `c/bootstrap-env-composition` | HERMES_PARENT_* / HERMES_SPAWN env | Electron | yes | `legacy-hermes/parent-identity (moved)` | no |
| `legacy-hermes/gateway-stop-before-update.ts` | 97 | `c/bootstrap-env-composition` | messaging gateway process | gateway | yes | `legacy-hermes/gateway-stop (moved)` | no |
| `legacy-hermes/remote-ws-headers.ts` | 97 | `c/bootstrap-env-composition`, `lh/runtime-composition`, `main` | WS request headers | Electron | yes | `legacy-hermes/remote-ws-headers (moved)` | no |
| `legacy-hermes/window-connection-route.ts` | 91 | `c/bootstrap-env-composition` | per-window connection route | Electron | yes | `legacy-hermes/connections (moved)` | indirect |
| `legacy-hermes/pool-stop.ts` | 86 | `c/bootstrap-env-composition` | pool teardown | Electron | yes | `legacy-hermes/pool (moved)` | indirect |
| `legacy-hermes/pool-limits.ts` | 81 | `c/bootstrap-env-composition`, `lh/runtime-composition` | pool limits | pure | yes | `legacy-hermes/pool (moved)` | indirect |
| `legacy-hermes/connection-registry.ts` | 73 | `c/api-proxy-composition`, `c/bootstrap-env-composition`, `ipc/connection-ipc`, `lh/connection-route-identity`, `lh/connections-composition` +5 | connections.json | Electron | yes | `legacy-hermes/connections (moved)` | indirect |
| `legacy-hermes/active-runtime-state.ts` | 58 | `c/bootstrap-env-composition` | bootstrap marker + ACTIVE_HERMES_ROOT | Electron (install facts) | yes | `legacy-hermes/active-runtime (moved)` | no |
| `legacy-hermes/pool-eviction.ts` | 58 | `c/bootstrap-env-composition` | profile backend pool | pure | yes | `legacy-hermes/pool (moved)` | indirect |
| `legacy-hermes/remote-lifecycle.ts` | 55 | `c/bootstrap-env-composition`, `lh/managed-ssh-update`, `lh/runtime-composition`, `main` | remote backend + lockfile | remote host | yes | `legacy-hermes/remote-lifecycle (moved)` | no |
| `legacy-hermes/connection-config-apply.ts` | 53 | `ipc/connection-ipc` | connection.json | Electron | yes | `legacy-hermes/connections (moved)` | indirect |
| `legacy-hermes/paths.ts` | 53 | `lh/runtime-composition`, `main`, `windows/windows-composition` | hermes version + pool limits | filesystem | yes | `legacy-hermes/paths (moved)` | no |
| `legacy-hermes/backend-command.ts` | 48 | `c/bootstrap-env-composition`, `lh/lifecycle` | Hermes argv (serve / dashboard) | pure | yes | `legacy-hermes/command (moved)` | no |
| `legacy-hermes/backend-recycle.ts` | 47 | `ipc/backend-ipc` | owned backend child | Electron | yes | `legacy-hermes/recycle (moved)` | no |
| `legacy-hermes/venv-holder-select.ts` | 36 | `c/bootstrap-env-composition` | hermes-owned venv daemon | pure | yes | `legacy-hermes/venv-blockers (moved)` | no |
| `legacy-hermes/primary-connection-rehome.ts` | 35 | `ipc/connection-ipc` | connection re-home | Electron | yes | `legacy-hermes/rehome (moved)` | no |
| `legacy-hermes/pool-touch-scope.ts` | 19 | `main` | pool touch keys | pure | yes | `legacy-hermes/pool (moved)` | indirect |
| `legacy-hermes/roster-source-fetch.ts` | 8 | `main` | roster source JSON | remote host | yes | `legacy-hermes/connections (moved)` | indirect |

## 4. Dependency direction

Current direction, as it exists in the tree after E1 and E2:

```
                     main.ts  (Electron boot order + top-level composition)
                        │
        ┌───────────────┼────────────────┬──────────────────┐
        ▼               ▼                ▼                  ▼
   composition/     host-capabilities/  windows/          ipc/
   (assembly)        (executors)        (desktop windows)  (channel registration)
        │               │                │
        ▼               ▼                ▼
   legacy-hermes/ ◄── process/ ──────────┘
   (Hermes policy)   (generic primitives)      ← one-way: process/ and
        │                                         host-capabilities/ never
        │                                         import legacy-hermes/
        ▼
   external `hermes` runtime  (NOT in this repository)
```

Rules this round establishes, which review should enforce:

1. **`process/` never imports `legacy-hermes/`.** The dependency runs one way. A generic primitive
   that needs Hermes knowledge is not a generic primitive.
2. **`host-capabilities/` never imports `legacy-hermes/`.** A capability that has to ask how to
   resolve Hermes is a capability that has absorbed a product decision. (`host-capabilities/platform`
   may be imported *by* `legacy-hermes/`; the reverse is the violation.)
3. **`legacy-hermes/` may import `process/` and `host-capabilities/`, never `main.ts` or
   `composition/`.** The compatibility layer must be usable without the composition root.
4. **`workcore/` imports neither `legacy-hermes/` nor any harness vocabulary.** Its interface is
   the thing a future Work Core would satisfy; if it names Hermes, it is a lie about the boundary.
5. **`composition/` modules assemble and register; they do not implement.** A composition module
   that contains a git implementation, a process spawn or a Hermes probe is a composition module
   that has not been decomposed.

## 5. Remaining Hermes-proprietary strings and imports

Where Hermes vocabulary still lives, by density (non-test occurrences of `HERMES_*` / bare
`hermes` / `hermes_cli` / `dashboard --no-open`):

| Location | Density | Why it is still there | Class |
|---|---|---|---|
| `preload.ts` | 253 | **IPC channel names (`hermes:*`).** Deliberately not renamed this round: renaming a channel changes the public Renderer contract. Retirement is a separate, coordinated change. | `DESKTOP_HOST` |
| `composition/bootstrap-env-composition.ts` | ~150 | Local backend spawn env (`HERMES_HOME`, `HERMES_DASHBOARD_SESSION_TOKEN`, `HERMES_DESKTOP`), ready-file, update machinery. E2's split target. | `LEGACY_HERMES` |
| `legacy-hermes/remote-lifecycle/*` (5 files) | 32 | Remote spawn argv (`--isolated`, `--ssh-owner-nonce`, token file), ownership lockfile. | `LEGACY_HERMES` |
| `legacy-hermes/windows-remote-lifecycle.ts` | 19 | `-m hermes_cli.windows_ssh_runtime spawn`. | `LEGACY_HERMES` |
| `legacy-hermes/windows-hermes-path.ts` | 12 | Venv `hermes` shim layout. | `LEGACY_HERMES` |
| `legacy-hermes/managed-ssh-update.ts` | 13 | Remote install of the external runtime. | `LEGACY_HERMES` |
| `composition/updates-composition.ts` | 9 | `uninstallVenvPython` — the Hermes venv, not the Desktop bundle. | `LEGACY_HERMES` (inside an update module) |
| `legacy-hermes/parent-process-identity.ts` | 9 | `HERMES_PARENT_PID` / `HERMES_PARENT_START_MARKER` / `HERMES_PARENT_NONCE` / `HERMES_SPAWN`, mirrored by `hermes_cli/process_identity.py`. | `LEGACY_HERMES` |
| `legacy-hermes/backend-ready.ts` | 8 | `HERMES_(BACKEND|DASHBOARD)_READY port=` sentinel. | `LEGACY_HERMES` |
| `main.ts` | 25 | Log prefixes, `HERMES_DESKTOP_*` env reads, deep-link scheme. | `DESKTOP_HOST` (branding, not protocol) |
| `composition/ipc/*` (8 files) | 100 | Channel names + `HERMES_HOME` file roots. | `DESKTOP_HOST` |
| `git-ipc.ts`, `fs-ipc.ts`, `terminal-ipc.ts` | 43 | Channel names (`hermes:git:*`, `hermes:fs:*`, `hermes:terminal:*`) — unchanged by design. | `HOST_CAPABILITY` |

Two packages of Hermes knowledge are **not** in this list because they are not strings and were the
harder part of the audit:

- **Enumerated semantics.** `backend-command.ts` (which subcommands exist and what replaces what),
  `backend-probes.ts` (the resolution ladder and its gates), `backend-health.ts` (which HTTP shapes
  mean "gated", "unauthenticated", "cloud"), `dashboard-token.ts` (the token scrape). These are
  `LEGACY_HERMES` because of *behaviour*, not strings.
- **Import-level coupling.** `parent-process-identity.ts` exports a `HERMES_SPAWN` tag whose format
  is parsed by Python outside this repository; it cannot be changed here at all.

## 6. Dependency knots and deferred work

Recorded rather than forced, per the stop condition "if existing Hermes logic cannot be isolated
without changing behaviour, keep the production path and record the cycle".

1. **`composition/bootstrap-env-composition.ts` is the load-bearing knot.** It is simultaneously
   (a) a wide constant bag imported by `main.ts`, `composition/*` and `legacy-hermes` modules, and
   (b) the implementation site of the local backend spawn. Splitting it in one change would touch
   every importer at once. E2 extracts the Hermes-specific *policy* into `legacy-hermes/` and leaves
   the module as the assembly seam; the physical split of the constant bag is deferred with the
   regions named in §7.
2. **The profile pool is not a generic process pool.** `pool-*.ts` looks like process infrastructure
   but its unit is a Hermes *profile* and its eviction/liveness policy is about Hermes backends.
   Classified `LEGACY_HERMES`, not `PROCESS_PRIMITIVE`. Promoting it would put profile semantics
   inside `process/`.
3. **No Work Core exists to own remote Connection / Workspace / Execution.** `ssh-connection.ts`,
   `ssh-config.ts` and `wsl-path-bridge.ts` are classified `HOST_CAPABILITY` because they are local
   executors, but the *authority* over a remote Connection, a Workspace and an Execution is scheduled
   to move to the Work Core. Nothing in this repository may claim that authority in the meantime.
4. **The source-reading test helper.** `test-main-process-sources.ts` reads `.ts` files as text to
   assert wiring. The root `AGENTS.md` forbids this ("Never read source code in a test"), and it is
   why six test files constrain where production code may live. It is registered as test support and
   is **not** production ownership; converting those six tests to behavioural contracts remains the
   precondition for *deleting* the helper. E1 widened its discovery to walk the main-process tree
   (with `main.ts` still scanned first, since those assertions read the first `indexOf` match), so a
   module moving behind a boundary stays visible instead of silently dropping out of the scan.
5. **The `serve`-support detection cluster stays in the composition root.** `backendSupportsServe()`,
   `findPythonForRoot()`, `isHermesSourceRoot()`, `venvRootForPython()` and `unwrapWindowsVenvHermesCommand()`
   are genuine Hermes resolution knowledge, but they are entangled with the module-level constant bag
   (`HERMES_HOME`, `APP_ROOT`, `IS_WINDOWS`) that `composition/bootstrap-env-composition.ts` still
   owns. E2 moved argv *assembly* out (`hermesRuntimeArgs`) while leaving the *detection* in place:
   extracting it means first separating that constant bag, which is the deferred item above. This is
   the recorded dependency knot, not an oversight.
6. **Renderer mass is out of scope.** The 293k lines under `apps/desktop/src/` — including the
   Hermes product surfaces listed in `03-coupling-matrix.md` §4 (Bucket D) — are untouched. This
   round is Electron-main-process only.

## 7. Migration ledger

**This is the only section that asserts physical change.** Everything in §3 is classification.

**This is the only section that asserts physical change.** Everything in §3 is classification.

| Phase | Commit | Module | From | To | Physical? |
|---|---|---|---|---|---|
| E0 | `1cc19c4` | all 180 production modules | — | — | **No.** Classification only — an audit, not a move. |
| E1 | *(this commit)* | `backend-claim.ts` | `electron/` | split: `process/identity.ts` (start marker, probe, claim policy, `execText`) + `process/output-tail.ts` (stdout/stderr tail) | **Yes** — extracted, genericised, and the Hermes path re-pointed at it. The `winms:` self-marker format was *injected* (`ProcessIdentityDeps.selfMarker`) rather than moved, because `hermes_cli/process_identity.py` parses it. |
| E1 | *(this commit)* | `backend-child.ts` | `electron/` | `process/child-stop.ts` (`stopChildProcess`, `stopProcessTreesForUpdate`) | **Yes** — renamed generically; tree-kill / group-kill policy unchanged. |
| E1 | *(this commit)* | `backend-connection-state.ts` | `electron/` | `process/connection-state.ts` (`createConnectionState`) | **Yes** — renamed generically; generation semantics unchanged. |
| E1 | *(this commit)* | `backend-dial-claim.ts` | `electron/` | `process/inflight-claim.ts` (`InFlightClaims`) | **Yes** — renamed generically; single-flight semantics unchanged. |
| E1 | *(this commit)* | `update-marker.ts`'s `isPidAlive` | `electron/update-marker.ts` | `process/pid.ts` | **Yes** — a pure extraction that removes a real inversion: process identity no longer imports the Desktop-update module. |
| E1 | *(this commit)* | `backend-ready.ts`'s deadline/listener engine | `electron/backend-ready.ts` | `process/readiness.ts` (`waitForLineAnnouncement`, `waitForPolledValue`) | **Yes** — the Hermes sentinel regex and failure wording stay in `backend-ready.ts`; the deadline, listener teardown and already-buffered-sentinel recovery are now generic. |
| E1 | *(this commit)* | `RemoteLivenessTracker`, `pruneReloadTimes`/`pushReloadTime` | `electron/remote-liveness.ts`, `electron/window-renderer-lifecycle.ts` | `process/budget.ts` (`createFailureStreakBudget`, `pruneWindowTimestamps`, `recordWindowTimestamp`) | **Yes** — both supervising loops now share one bounded-budget implementation; their public classes/functions are unchanged wrappers. |
| E1 | *(this commit)* | `test-main-process-sources.ts` | `electron/` | `electron/` (rewritten in place) | **Yes, in behaviour** — discovery now walks the main-process tree instead of naming `composition/`, so the six source-scanning tests survive a module moving behind a boundary. `main.ts` is still scanned first, because those assertions read the first `indexOf` match. |
| E2 | *(this commit)* | 59 Legacy-Hermes modules | `electron/*` (+ `connection-registry/`, `remote-lifecycle/`) | `electron/legacy-hermes/` | **Yes** — moved, with every relative import in the repository re-resolved. |
| E2 | *(this commit)* | argv / env / local-descriptor assembly | inlined at both spawn sites in `composition/bootstrap-env-composition.ts` | `legacy-hermes/lifecycle.ts` (`hermesServeArgs`, `hermesRuntimeArgs`, `hermesBackendEnv`, `hermesLocalWsUrl`, `hermesPrimaryConnectionDescriptor`, `hermesProfiledConnectionDescriptor`) | **Yes** — the composition root no longer contains a Hermes argv literal or the backend env object. `HERMES_HOME`'s doc comment moved with the env producer. |
| E3 | *(this commit)* | 41 host-capability modules | `electron/*` | `electron/host-capabilities/{filesystem,git,terminal,credentials,preview,platform}/` | **Yes** — moved, import graph re-resolved. Implementations unchanged; no rewrite. |
| E3 | *(this commit)* | the typed executor boundary | — | `host-capabilities/contract.ts` + `contract.test.ts` | **Yes** — new declared surface; every interface is written with `typeof` against the real export, so a signature drift stops the build. |
| E4 | *(this commit)* | the Work Core lifecycle contract | — | `workcore/lifecycle.ts` | **Yes** — new contract. Six infrastructure verbs; no harness, no Session, no Execution and no credential policy. Nothing installs it, so it cannot change behavior. |
| E4 | *(this commit)* | the composition slot | — | `workcore/slot.ts` (`workCoreSlot`) | **Yes** — the position a Work Core lifecycle is installed into. Deliberately unpopulated in production: `current()` is null, the boot path does not branch on it, and there is no fallback behind it. |
| E4 | *(this commit)* | the real-process fixture | — | `workcore/workcore.test.ts` | **Yes, test-only.** Drives an actual child process through all six verbs using `process/{readiness,output-tail,child-stop,budget}.ts`, and asserts the slot is empty and that no process survives. |
| E5 | *(this commit)* | 120 root and `composition/` modules | `electron/*`, `electron/composition/ipc/*` | `electron/{windows,app,ipc,update,security}/`, plus `legacy-hermes/`, `host-capabilities/` and `process/` for the stragglers | **Yes** — the flat root and `composition/ipc/` are gone; only the two bundle entry points, the source-scanning test helper and a type shim remain at the root. |
| E5 | *(this commit)* | `getBootstrapState`'s self-recursive stub in `main.ts` | `electron/main.ts` | deleted; the real `composition/bootstrap-env-composition.ts::getBootstrapState` is now imported | **Yes — a bug fix, not a move.** See below. |
| E5 | *(this commit)* | the three `AGENTS.md` layers | — | root `AGENTS.md`, `apps/desktop/AGENTS.md`, `apps/desktop/src/AGENTS.md` | **Yes** — every stale path corrected, the directory tree and its three dependency rules written down. |

### What E1 deliberately did not extract

- **No pass-through spawn wrapper.** `bounded spawn` is realised by the primitives that actually
  bound something (`output-tail` bounds bytes, `readiness` bounds time, `child-stop` bounds
  lifetime). A `spawnChild()` that only forwards `child_process.spawn` would add a layer with no
  policy in it.
- **No standalone typed-process-result module.** The typed results are the option/result interfaces
  of those primitives (`StartMarkerProbe`, `ClaimDecision`, `FailureStreak`, `ProcessOutputTail`).
  A separate result type with no producer would be an empty abstraction.
- **The one real run-to-completion shape is still deferred.** `desktop-plugin-install.runGit`,
  `bootstrap-env-composition.runGit` and `composition/updates-composition`'s updater spawn all
  "run a child, capture bounded output, enforce a deadline", but their timeout, stdio, abort and
  error semantics differ. Unifying them changes behaviour at three live call sites, so it remains a
  registered future move rather than a forced abstraction.

### The narrow lifecycle interface (E2)

`legacy-hermes/lifecycle.ts` declares `HermesBackendLifecycle` — `resolve`, `launch`, `readiness`,
`descriptor`, `restart`, `shutdown` — as a **description of an existing shape**, not a new object:
each verb already has exactly one production implementation across `legacy-hermes/*`, and the
interface's doc comment names it. No orchestrator was introduced, because a single object owning all
six verbs is the god-object §6 and E5 forbid. `legacy-hermes/lifecycle.test.ts` pins the producers'
contracts (argv order, env pins, descriptor key presence, ws URL encoding) and proves the interface is
satisfiable from narrow functions.

Two properties the interface deliberately asserts:

- **`resolve` is still in the composition root.** Only argv/env/descriptor assembly left; the
  executable ladder's *detection* half is deferred (§6.5). The interface records the verb so the
  seam is complete, without pretending the move happened.
- **`descriptor` distinguishes absent from null.** The primary descriptor carries no `profile` key
  (the backend serves the active profile); a pooled descriptor always carries one, even when null.
  Collapsing those two would let a caller scope a request to a profile the backend does not serve.

### What E3 did and did not do

- **Moved, not rewritten.** `git-worktree-ops.ts`, `git-review-ops.ts`, `terminal-ipc.ts`,
  `hardening.ts`, `ssh-connection.ts` and their neighbours keep their current production call chain;
  the IPC registrars (`registerFsIpc`, `registerGitIpc`, `registerTerminalIpc`,
  `registerMcpOauthCallbackIpc`) still register the same **unchanged `hermes:*` channel names**. Only
  their relative import paths moved.
- **The `git` capability keeps its authority.** Worktree/review authority is *registered* as future
  `WORKCORE_BACKEND` territory in `contract.ts`, not moved. Until a Work Core exists, the current
  chain is the production path and nothing here claims otherwise.
- **`contract.ts` is a description, not a grant.** It names real exported verbs so it cannot drift.
  Four things are deliberately *absent*: the IPC registrars (registering channels is Desktop
  composition, E5's `ipc/`, not a machine capability) and `connection-registry` / `pool-*` / the
  profile routers, which decide Profile and therefore live in `legacy-hermes/`.
- **No capability decides Harness, Profile, Session or Execution.** Stated as a rule in
  `contract.ts`'s header and enforced by the classification: a module that *does* decide one of
  those is `LEGACY_HERMES`.

### What E4 did and did not do

- **A contract, a slot, and a fixture — nothing else.** `workcore/lifecycle.ts` declares the six
  infrastructure verbs (`resolve`, `launch`, `readiness`, `connectionHandle`, `restart`,
  `shutdown`). `workcore/slot.ts` is the one composition position a lifecycle can be installed into;
  it is a plain holder with an install/current/isPopulated surface, not a registry, manifest, or
  plugin system — this repository has one candidate consumer and no Work Core at all, so anything
  larger would be a framework built for an imagined second consumer.
- **The AgentBox POC is not connected.** `apps/desktop/src/agentbox/` and
  `apps/desktop/src/plugins/agentbox-lab/` are untouched and remain untracked. No import points at
  them, and nothing here was derived from their runtime shape.
- **No fake readiness, no fake Session, no fallback.** `resolve()` returning null means "no Work
  Core"; nothing pretends otherwise. The fixture is test-only and spawns a REAL child process whose
  readiness is a REAL stdout sentinel — it is a stub *artifact*, not a faked contract.
- **The interface names no harness.** There is no `harness_type`, `provider_id`, model, tool or
  execution verb, and no verb can enumerate or signal a child of the Work Core process. Electron
  owns the infrastructure process; the Work Core owns every Execution/Harness child it spawns
  (refactor invariant 5). An interface that named a harness here would make every harness a Desktop
  change.
- **The `resolve()` step and the boot path are still unconnected.** `workCoreSlot.current()` is null
  in production and the boot path does not consult it, so this seam cannot alter behavior yet. That
  is the point: the first real decision it makes will be the null-check, and it will be made when a
  real Work Core exists.

### The bug E5 found and fixed

`main.ts` declared

```ts
function getBootstrapState() { return getBootstrapState() }
```

while `composition/bootstrap-env-composition.ts` exported the real implementation. The `hermes:bootstrap:get`
IPC handler was handed the local function, so the renderer's bootstrap-state recovery — the path that lets a
devtools reload pick up the current snapshot instead of a blank state — died on a stack overflow. This is a
megafile-decomposition artifact: the function was hoisted out of `main.ts` and a same-named stub was left
behind, and no test noticed because every test tests the real implementation and nothing exercised the wiring.

Fixed by deleting the stub and importing the real function. Pinned by
`electron/main-process-shadowing.test.ts`, which asserts the *general* invariant — no main-process module
shadows a name another module exports with a single-statement self-call — and was verified to fail when the
stub is reintroduced. That test reads source, which the repository forbids for behavioural tests; the
justification is in its header, and replacing it with IPC-wiring coverage under an Electron harness is the
honest follow-up.

### What E5 did not finish, and why

- **`composition/bootstrap-env-composition.ts` is still 7,950 lines** and
  `composition/api-proxy-composition.ts` is 1,497. They are the two remaining implementation-carrying
  composition modules. Splitting them is the next chain (§8), not this round: the first holds the whole
  local-backend boot state machine, whose module-scoped state is read and written by ~50 other modules, so
  decomposing it is a behaviour-preserving rewrite that needs the boot smoke at every step.
- **`main.ts` is 2,485 lines and still holds implementations**, not only startup order: the favicon cache,
  the `gh` resolver, media-protocol registration, download handling, the connection test, the SSH profile
  inventory, the power/battery listeners. Each closes over module-scoped Electron singletons
  (`mainWindow`, the OAuth session, the IPC registrar), so extracting one means threading those in — and
  threading them in as a bag is exactly the god-object this refactor forbids. They are *registered* against
  their target directories in §3 and left in place.
- **`host-bridge/` is still empty** for the reason given in §7 (E4): it needs a Work Core consumer to have a
  shape.
- **`composition/paths-composition.ts` and `composition/wsl-fonts.ts` moved out**, so `composition/` now
  contains only the two modules above — the seam is visibly small even though it is not yet empty.

### The composition root, before and after

| File | At `b55355f` | Now |
|---|---:|---:|
| `electron/main.ts` | 2,488 | 2,485 |
| `electron/composition/` (21 modules) | 16,171 | 9,447 (2 modules) |
| `electron/` flat root (production modules) | 149 | 4 |

`main.ts` is essentially unchanged in size, and that is the honest headline: this round moved *where things
live* and *who decides what*, and it removed the assembly of Hermes argv/env from the composition root — but
it did not yet thin `main.ts` itself. §8 says how that starts.

### Target-directory status after E5

| Target directory | Exists? | Populated? |
|---|---|---|
| `app/` | yes | yes — 11 modules, 1,059 lines |
| `windows/` | yes | yes — 31 modules, 5,093 lines |
| `host-capabilities/` | yes | yes — 44 modules, 10,825 lines, six areas + the typed contract |
| `process/` | yes | yes — 8 modules, 859 lines |
| `workcore/` | yes | contract + slot + fixture only — 2 production modules, 198 lines; no implementation |
| `host-bridge/` | **no** | deliberately uncreated (needs a Work Core consumer) |
| `ipc/` | yes | yes — 11 modules, 2,493 lines, `hermes:*` channel names unchanged |
| `update/` | yes | yes — 10 modules, 1,921 lines |
| `security/` | yes | yes — 3 modules, 140 lines |
| `legacy-hermes/` | yes | yes — 63 modules, 16,281 lines |

Every row in §3 whose target is `windows/`, `app/`, `update/` or `security/` is now physical. The only
registered-but-unmoved ownership left is the implementation content *inside* `main.ts` and
`composition/bootstrap-env-composition.ts` (§9), and the `WORKCORE_BACKEND` authority that cannot move until a
Work Core exists.

## 8. The next vertical chain (not started)

The safest first vertical chain, named so a later round can begin without re-deriving it:

> `backend-command.ts` + `backend-probes.ts` + `backend-env.ts` → a single `legacy-hermes/resolve.ts`
> hiding behind `interface HermesBackendLifecycle { resolve(); launch(); readiness(); descriptor();
> restart(); shutdown() }`, consumed by `main.ts` through one composition call.

**Step 1 (E2, done): argv/env assembly.** `legacy-hermes/lifecycle.ts` now owns it; the composition
root contains no Hermes argv literal and no backend env object.

**Step 2 (next): the `serve`-support detection cluster.** `backendSupportsServe()`,
`findPythonForRoot()`, `isHermesSourceRoot()`, `venvRootForPython()` and
`unwrapWindowsVenvHermesCommand()` are pure Hermes resolution knowledge sitting inside
`composition/bootstrap-env-composition.ts` because they read its module-level constant bag
(`HERMES_HOME`, `APP_ROOT`, `IS_WINDOWS`, `VENV_ROOT`). Chain: extract the constants they need into a
`legacy-hermes/paths.ts` argument (that module already exists from E5 and holds `resolveHermesVersion`),
move the five functions into `legacy-hermes/resolution.ts` beside `backend-probes.ts`, and re-point
`resolveHermesBackend` — which is itself the last Hermes-argv-aware function in the composition root.

**Step 3 (after that): the local-backend boot state machine** becomes a `legacy-hermes/` module the
composition root *calls*, and `main.ts` drops to startup order. Do not attempt step 3 before step 2:
the state machine's ~50 module-scoped values are what makes it hard, and step 2 shrinks the surface
it exposes.

The chain is complete when `main.ts` contains no `'serve'`, no `'--profile'`, no `HERMES_HOME`, no
`resolveHermesBackend` call and no backend spawn, and both boot smokes are unchanged.


## 9. Verification of this round

Recorded so a reviewer can tell a regression from a pre-existing failure without
re-running everything.

### Gates

| Gate | Result |
|---|---|
| `npm run --workspace apps/desktop typecheck` (renderer + electron + e2e) | clean, exit 0 |
| `npm run --workspace apps/shared typecheck` | clean, exit 0 |
| `npm test --prefix tests-js` | 8 files / 47 tests passed |
| `npx eslint electron/` | clean |
| `git diff --check` | clean |
| `npm run --workspace apps/desktop test` (full) | 3 files / 6 tests failed, 929 files / 9607 tests passed, 2 files / 6 tests skipped (934 files, 9619 tests) |

### Pre-existing failures, and what is NOT a regression

Baseline at `b55355f` (the commit this round started from), same command:

| | Files | Tests |
|---|---|---|
| Baseline `b55355f` | 3 failed / 923 passed / 2 skipped (928) | 5 failed / 9584 passed / 6 skipped (9595) |
| After E5 | 3 failed / 929 passed / 2 skipped (934) | 6 failed / 9607 passed / 6 skipped (9619) |

The failing **files** are the same three in both runs:

- `electron/.../api-transport.test.ts` — a live-loopback timing assertion
  (`expected 1 to be greater than 1`).
- `electron/.../mcp-oauth-callback-ipc.test.ts` — loopback listener
  `ECONNREFUSED`; this file reports 2 failures in the full baseline run and 3
  when run alone, and it does so **at `b55355f` as well** (verified by stashing
  this round's changes and re-running it), so the 2↔3 variation is
  order-dependent, not new.
- `src/store/voice-prefs.test.ts` — `expected 'false' to be null`.

The +6 files and +23 passing tests are this round's seven new test files
(`process/{identity,output-tail,child-stop,connection-state,inflight-claim}`,
`legacy-hermes/lifecycle`, `host-capabilities/contract`, `workcore/workcore`,
`main-process-shadowing`). **One** extra test failure appeared (6 vs 5) and it is
the mcp-oauth file's order-dependent count above.

Two further renderer failures appeared in an intermediate full run
(`config-settings.test.tsx`, `shiki-block.test.tsx`) and did **not** recur; both
pass in isolation, and the "warm-switch perf guard" name says why. They are load
flakes, not regressions from this refactor, whose renderer diff is one type-only
import path in `src/global.d.ts`.

### Boot smoke (isolated sandbox)

Each run gets its own `HERMES_HOME`, its own Electron userData and a distinct app
name, so it cannot touch a real instance or its single-instance lock. Residual
detection reads `/proc/<pid>/environ`, not the command line — an Electron child
does not carry `HERMES_HOME` in its argv, so a `pgrep -f` check misses exactly
the orphans it exists to catch (which is how a first attempt at this measurement
reported "zero residue" while an orphan was still running).

| Variant | Verdict | Renderer | Residual processes |
|---|---|---|---|
| with external Hermes (`v0.19.0` on PATH) | `Hermes backend is ready. Finalizing desktop startup` | alive after verdict, 2 renderer processes | none |
| no Hermes reachable | `errorCode=HERMES_EXECUTABLE_NOT_FOUND` (typed, after `Waiting for first-run setup choice`) | alive after verdict, 2 renderer processes | none |

Observed with-Hermes ladder: `Resolving Hermes backend` → `Resolving Hermes
runtime` → `Using existing Hermes CLI at …/.local/bin/hermes` → `Starting Hermes
backend …` → `Waiting for Hermes backend to launch` → `Waiting for Hermes backend
to become ready` → ready.

One honest caveat about the second variant: reaching it required leaving
`HERMES_DESKTOP_HERMES` **unset**. An explicit override is trusted verbatim
(`legacy-hermes/backend-probes.ts::shouldTrustHermesOverride`), so pointing it at
a bogus path selects that path as the runtime and produces a spawn/ownership
failure instead. That is pre-existing, deliberate behaviour for an operator
override and was not changed here.
