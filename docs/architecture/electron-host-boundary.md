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
| `apps/desktop/electron/` production | 180 | 50,675 |
| of which `electron/composition/` | 21 | 16,171 |
| of which `electron/main.ts` | 1 | 2,488 |
| `apps/desktop/electron/` tests | 149 files | 34,234 |

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

### DESKTOP_HOST — 69 modules, 15125 lines

| module | LOC | current callers | operates on | state authority | Hermes-only? | target | Session/Exec/Workspace |
|---|---:|---|---|---|---|---|---|
| `main.ts` | 2488 | `c/windows-composition` | Electron boot order + composition | Electron | partial | `app/` | no |
| `composition/api-proxy-composition.ts` | 1508 | `main` | authenticated /api proxy, favicon/title cache | backend | yes | `composition/` | indirect |
| `composition/windows-composition.ts` | 1247 | `main` | window registry + app menu | Electron | yes | `windows/` | no |
| `composition/ipc/connection-ipc.ts` | 766 | `main` | connection channels | Electron | yes | `ipc/` | indirect |
| `preload.ts` | 540 | — | contextBridge surface | Electron | partial | `ipc/` | no |
| `composition/updates-composition.ts` | 470 | `main` | update check + desktop uninstall | git | partial | `update/` | no |
| `updater-process.ts` | 455 | `c/bootstrap-env-composition` | detached updater child | updater script | partial | `update/` | no |
| `window-renderer-lifecycle.ts` | 427 | `c/bootstrap-env-composition`, `c/cloud-oauth-composition`, `c/windows-composition`, `wake-indicator-window` | renderer crash/reload policy | Electron | no | `windows/` | no |
| `quick-entry.ts` | 421 | `c/ipc/window-ipc`, `c/windows-composition`, `hud-snap-shortcut`, `main` | global quick-entry composer | OS | yes | `windows/` | no |
| `composition/ipc/window-ipc.ts` | 310 | `main` | window channels | Electron | yes | `ipc/` | no |
| `composition/window-theme.ts` | 310 | `c/bootstrap-env-composition`, `c/ipc/theme-ipc`, `c/windows-composition`, `main` | theme + translucency persistence | Electron | no | `windows/` | no |
| `hud-ipc.ts` | 303 | `main` | HUD IPC channels | Electron | no | `ipc/` | no |
| `desktop-uninstall.ts` | 268 | `c/bootstrap-env-composition`, `c/updates-composition` | app bundle + userData removal | filesystem | partial | `update/` | no |
| `hud-game-overlay.ts` | 261 | `c/windows-composition` | fullscreen app detection | OS window facts | no | `windows/` | no |
| `find-in-page.ts` | 231 | `c/bootstrap-env-composition`, `c/ipc/window-ipc`, `main` | find-in-page | Electron | yes | `windows/` | no |
| `composition/ipc/files-ipc.ts` | 220 | `main` | file channels | filesystem | partial | `ipc/` | indirect |
| `zoom.ts` | 214 | `c/bootstrap-env-composition`, `c/ipc/window-ipc`, `c/windows-composition` | zoom level + reassert | Electron | no | `windows/` | no |
| `composition/ipc/backend-ipc.ts` | 211 | `main` | backend boot/repair channels | Electron | yes | `ipc/` | indirect |
| `composition/log-buffer.ts` | 210 | `c/api-proxy-composition`, `c/bootstrap-env-composition`, `c/cloud-oauth-composition`, `c/connections-composition`, `c/deep-link-composition` +10 | desktop.log buffer + rotation | filesystem | yes | `app/` | no |
| `renderer-load-error-page.ts` | 198 | `c/bootstrap-env-composition` | load-error page | Electron | yes | `windows/` | no |
| `composition/ipc/system-ipc.ts` | 195 | `main` | app/system channels | Electron | yes | `ipc/` | no |
| `session-windows.ts` | 192 | `c/bootstrap-env-composition`, `c/windows-composition`, `main` | per-session pop-out windows | Electron | no | `windows/` | no |
| `wake-indicator-window.ts` | 185 | `c/bootstrap-env-composition` | wake indicator window | Electron | no | `windows/` | no |
| `window-state.ts` | 169 | `c/bootstrap-env-composition`, `c/windows-composition`, `main` | window-state.json | Electron | no | `windows/` | no |
| `renderer-bundle.ts` | 160 | `c/bootstrap-env-composition` | renderer asset refs | build output | no | `app/` | no |
| `pet-overlay-ipc.ts` | 151 | `main` | pet overlay IPC | Electron | no | `ipc/` | no |
| `desktop-installation.ts` | 137 | `c/bootstrap-env-composition` | desktop-installation.json | Electron | no | `app/` | no |
| `hud-windowing.ts` | 136 | `c/windows-composition`, `hud-ipc` | HUD windowing backend | pure | no | `windows/` | no |
| `bundle-skew.ts` | 133 | `bundle-swap`, `c/windows-composition` | git checkout vs build stamp | git | partial | `update/` | no |
| `stream-throttle.ts` | 119 | `c/bootstrap-env-composition` | background throttling | renderer | no | `windows/` | no |
| `composition/ipc/theme-ipc.ts` | 113 | `main` | theme channels | Electron | no | `ipc/` | no |
| `translucency.ts` | 111 | `c/bootstrap-env-composition`, `c/ipc/theme-ipc`, `c/window-theme`, `hud-ipc` | window translucency | OS | no | `windows/` | no |
| `dev-cdp.ts` | 108 | `c/bootstrap-env-composition`, `main` | dev CDP port | Electron | no | `app/` | no |
| `composition/deep-link-composition.ts` | 108 | `main` | hermes:// deep links | Electron | yes | `app/` | no |
| `hud-geometry.ts` | 105 | `hud-ipc`, `main` | HUD bounds | pure | no | `windows/` | no |
| `notification-ipc.ts` | 102 | `main` | native notifications | OS | no | `ipc/` | no |
| `update-gate.ts` | 95 | `c/bootstrap-env-composition` | update clearance gate | Electron | partial | `update/` | no |
| `handoff-result.ts` | 93 | `c/bootstrap-env-composition` | HERMES_HOME update-result file | updater script | partial | `update/` | no |
| `quit-guard.ts` | 92 | `c/ipc/window-ipc`, `main` | quit prompt | pure | no | `app/` | no |
| `renderer-log.ts` | 92 | `c/bootstrap-env-composition`, `c/ipc/system-ipc`, `c/windows-composition`, `wake-indicator-window` | renderer console capture | renderer | no | `app/` | no |
| `update-count.ts` | 92 | `c/updates-composition` | behind-count | git | no | `update/` | no |
| `app-icon.ts` | 85 | `c/bootstrap-env-composition` | app icon files | Electron | no | `windows/` | no |
| `composition/ipc/api-proxy-ipc.ts` | 82 | `main` | hermes:api proxy channel | backend | yes | `ipc/` | indirect |
| `link-title-window.ts` | 80 | `c/api-proxy-composition` | link title peek window | Electron | no | `windows/` | no |
| `window-reveal.ts` | 78 | `c/bootstrap-env-composition` | window reveal | Electron | no | `windows/` | no |
| `test-main-process-sources.ts` | 71 | `backend-dial-claim`, `backend-python-coherence`, `gateway-file-download-transport`, `hardening`, `pool-spawn-coordinator` +1 | reads main-process sources for wiring assertions | none | no | `(test support)` | no |
| `hud-cursor.ts` | 65 | `c/windows-composition` | cursor position | pure | no | `windows/` | no |
| `update-remote.ts` | 65 | `c/bootstrap-env-composition`, `c/updates-composition` | reviewed remote URL | git | no | `update/` | no |
| `bundle-swap.ts` | 61 | `c/bootstrap-env-composition`, `c/ipc/system-ipc` | bundle swap stamp | updater script | partial | `update/` | no |
| `hud-snap-shortcut.ts` | 60 | `c/windows-composition` | HUD global shortcut | OS | no | `windows/` | no |
| `hud-snap.ts` | 60 | `c/windows-composition` | HUD snapping | pure | no | `windows/` | no |
| `window-open-policy.ts` | 58 | `c/bootstrap-env-composition`, `link-title-window` | window.open policy | pure | no | `security/` | no |
| `crash-forensics.ts` | 51 | `c/bootstrap-env-composition` | crash handler | Electron | no | `app/` | no |
| `power-save.ts` | 50 | `main` | power-save blocker | OS | no | `app/` | no |
| `embed-referer.ts` | 48 | `main` | embed session request headers | Electron | yes | `security/` | no |
| `titlebar-overlay-width.ts` | 42 | `c/bootstrap-env-composition`, `c/window-theme` | titlebar overlay width | OS | no | `windows/` | no |
| `hud-overlay.ts` | 41 | `c/windows-composition` | HUD Electron overlay | Electron | no | `windows/` | no |
| `notification-registry.ts` | 41 | `notification-ipc` | notification registry | Electron | no | `windows/` | no |
| `composition/ipc/preview-ipc.ts` | 40 | `main` | preview channels | Electron | yes | `ipc/` | no |
| `hud-url.ts` | 39 | `c/windows-composition` | HUD window url | pure | no | `windows/` | no |
| `hud-drag.ts` | 37 | `hud-ipc` | HUD drag session | pure | no | `windows/` | no |
| `wake-indicator.ts` | 34 | `wake-indicator-window` | wake indicator state | pure | no | `windows/` | no |
| `workspace-cwd.ts` | 34 | `c/bootstrap-env-composition` | packaged-install path test | pure | no | `security/` | no |
| `event-dedupe.ts` | 32 | `main`, `notification-ipc` | cross-window one-shot keys | Electron | no | `app/` | no |
| `browser-windows.ts` | 31 | `c/windows-composition` | browser pop-out window | pure | no | `windows/` | no |
| `notification-actions.ts` | 29 | `notification-ipc` | notification action | pure | no | `windows/` | no |
| `main-window-lifecycle.ts` | 28 | `main` | main window | Electron | no | `windows/` | no |
| `desktop-log-line.ts` | 19 | `c/log-buffer` | log line format | pure | no | `app/` | no |
| `notification-types.ts` | 18 | `notification-ipc` | notification shape | pure | no | `windows/` | no |

### HOST_CAPABILITY — 43 modules, 10672 lines

| module | LOC | current callers | operates on | state authority | Hermes-only? | target | Session/Exec/Workspace |
|---|---:|---|---|---|---|---|---|
| `ssh-connection.ts` | 1148 | `c/bootstrap-env-composition`, `c/runtime-composition`, `main`, `remote-lifecycle/connect`, `remote-lifecycle/spawn` +2 | ssh exec / forward primitive | remote host | no | `host-capabilities/platform` | indirect |
| `git-review-ops.ts` | 903 | `git-ipc` | diff/commit/push/PR | git | no | `host-capabilities/git` | indirect |
| `composition/cloud-oauth-composition.ts` | 839 | `c/api-proxy-composition`, `main` | Nous portal OAuth | portal | partial | `host-capabilities/credentials` | no |
| `hardening.ts` | 554 | `c/api-proxy-composition`, `c/bootstrap-env-composition`, `c/cloud-oauth-composition`, `c/connections-composition`, `c/ipc/api-proxy-ipc` +8 | path safety, data-URL read, secret encryption | filesystem | partial | `host-capabilities/filesystem` | no |
| `git-worktree-ops.ts` | 537 | `git-ipc` | worktrees + branches | git | no | `host-capabilities/git` | indirect |
| `desktop-plugin-install.ts` | 446 | `fs-ipc` | git clone into plugin root | git | partial | `host-capabilities/filesystem` | no |
| `terminal-ipc.ts` | 397 | `c/bootstrap-env-composition` | node-pty sessions | PTY | partial | `host-capabilities/terminal` | indirect |
| `windows-sandbox-fallback.ts` | 394 | `c/bootstrap-env-composition`, `c/ipc/system-ipc`, `main` | Windows sandbox / ACL fallback | OS | no | `host-capabilities/platform` | no |
| `favicon.ts` | 347 | `main` | favicon fetch + parse | remote host | no | `host-capabilities/preview` | no |
| `vscode-marketplace.ts` | 337 | `c/ipc/preview-ipc` | VSIX theme fetch | remote host | no | `host-capabilities/preview` | no |
| `window-below.ts` | 298 | `c/ipc/window-ipc`, `c/windows-composition`, `hud-game-overlay`, `hyprland` | native window enumeration | OS | no | `host-capabilities/platform` | no |
| `native-oauth.ts` | 255 | `c/bootstrap-env-composition`, `c/ipc/connection-ipc`, `native-oauth-login`, `native-token-store` | PKCE + token parsing | pure | no | `host-capabilities/credentials` | no |
| `native-auth-decisions.ts` | 235 | `c/api-proxy-composition`, `c/bootstrap-env-composition`, `c/connections-composition`, `native-oauth` | readiness/auth decisions | pure | yes | `host-capabilities/credentials` | no |
| `native-oauth-login.ts` | 215 | `c/ipc/connection-ipc` | loopback login flow | credentials | no | `host-capabilities/credentials` | no |
| `hud-hyprland.ts` | 214 | `hud-overlay` | Hyprland compositor IPC | compositor | no | `host-capabilities/platform` | no |
| `preview-reach.ts` | 210 | `main` | loopback preview reach | Electron | no | `host-capabilities/preview` | no |
| `fs-ipc.ts` | 203 | `main` | renderer filesystem IPC | filesystem | partial | `host-capabilities/filesystem` | indirect |
| `git-repo-scan.ts` | 201 | `git-ipc` | repo scan | filesystem | no | `host-capabilities/git` | indirect |
| `wsl-path-bridge.ts` | 198 | `c/bootstrap-env-composition`, `c/ipc/files-ipc`, `fs-read-dir`, `main` | WSL path translation | WSL distro | no | `host-capabilities/platform` | indirect |
| `shell-path.ts` | 187 | `c/bootstrap-env-composition`, `main` | login-shell PATH | login shell | no | `host-capabilities/platform` | no |
| `media-protocol.ts` | 186 | `main` | hermes-media:// protocol | Electron | yes | `host-capabilities/preview` | no |
| `mcp-oauth-callback-ipc.ts` | 181 | `main` | MCP OAuth loopback callback | credentials | no | `host-capabilities/credentials` | no |
| `hyprland.ts` | 177 | `hud-hyprland`, `window-below` | Hyprland socket | pure | no | `host-capabilities/platform` | no |
| `ssh-config.ts` | 175 | `c/ipc/connection-ipc` | ~/.ssh/config | filesystem | no | `host-capabilities/platform` | no |
| `native-token-store.ts` | 165 | `c/bootstrap-env-composition` | persisted token set | credentials | no | `host-capabilities/credentials` | no |
| `oauth-partition.ts` | 155 | `c/bootstrap-env-composition` | Electron session partition | OS keyring | no | `host-capabilities/credentials` | no |
| `bootstrap-platform.ts` | 150 | `c/bootstrap-env-composition`, `c/window-theme`, `c/wsl-fonts` | WSL / remote display / keyring | Electron (host facts) | partial | `host-capabilities/platform` | no |
| `preview-capture.ts` | 131 | `c/ipc/files-ipc` | screenshot capture | Electron | no | `host-capabilities/preview` | no |
| `spawn-helper-perms.ts` | 122 | `terminal-ipc` | node-pty spawn-helper mode | filesystem | no | `host-capabilities/platform` | no |
| `git-ipc.ts` | 120 | `main` | git IPC channels | git | no | `host-capabilities/git` | indirect |
| `fs-read-dir.ts` | 111 | `fs-ipc` | directory listing | filesystem | no | `host-capabilities/filesystem` | indirect |
| `composition/media-protocol.ts` | 109 | `c/api-proxy-composition`, `c/ipc/files-ipc`, `main` | media bridge + preview metadata | filesystem | no | `host-capabilities/preview` | no |
| `secret-storage-policy.ts` | 102 | `c/bootstrap-env-composition`, `c/connections-composition` | secret storage policy | OS keyring | no | `host-capabilities/credentials` | no |
| `wsl-clipboard-image.ts` | 102 | `c/ipc/files-ipc` | WSL clipboard image | windows.exe | no | `host-capabilities/platform` | no |
| `windows-user-env.ts` | 99 | `c/bootstrap-env-composition` | Windows user env | OS registry | no | `host-capabilities/platform` | no |
| `gitlock.ts` | 96 | `c/updates-composition` | stale git index.lock | filesystem | no | `host-capabilities/git` | no |
| `windows-system-ca.ts` | 79 | `main` | Windows CA trust | OS | no | `host-capabilities/platform` | no |
| `find-git-bash.ts` | 67 | `c/bootstrap-env-composition` | Git Bash executable | filesystem | no | `host-capabilities/platform` | no |
| `terminal-output-gate.ts` | 62 | `terminal-ipc` | terminal exit payload | pure | no | `host-capabilities/terminal` | no |
| `composition/wsl-fonts.ts` | 61 | `main` | WSL font registration | filesystem | no | `host-capabilities/platform` | no |
| `git-root.ts` | 50 | `fs-ipc` | git root discovery | filesystem | no | `host-capabilities/git` | indirect |
| `windows-child-options.ts` | 37 | `backend-claim`, `bootstrap-runner`, `c/api-proxy-composition`, `c/bootstrap-env-composition`, `c/ipc/connection-ipc` +2 | Windows child spawn options | pure | no | `host-capabilities/platform` | no |
| `oauth-net-request.ts` | 17 | `c/bootstrap-env-composition` | OAuth request headers | pure | no | `host-capabilities/credentials` | no |

### PROCESS_PRIMITIVE — 5 modules, 675 lines

| module | LOC | current callers | operates on | state authority | Hermes-only? | target | Session/Exec/Workspace |
|---|---:|---|---|---|---|---|---|
| `backend-claim.ts` | 221 | `c/bootstrap-env-composition` | child stdout/stderr + start marker | OS (PID identity) | no | `process/{output-tail,identity}` | no |
| `update-marker.ts` | 205 | `backend-claim`, `c/bootstrap-env-composition` | PID liveness + update marker file | OS | partial | `process/pid` | no |
| `backend-child.ts` | 103 | `c/bootstrap-env-composition` | child process + tree | spawner | no | `process/child-stop` | no |
| `backend-connection-state.ts` | 88 | `c/bootstrap-env-composition` | generation + owned child | Electron | no | `process/connection-state` | no |
| `backend-dial-claim.ts` | 58 | `c/bootstrap-env-composition` | keyed in-flight dial | Electron | no | `process/inflight-claim` | no |

### LEGACY_HERMES — 63 modules, 24144 lines

| module | LOC | current callers | operates on | state authority | Hermes-only? | target | Session/Exec/Workspace |
|---|---:|---|---|---|---|---|---|
| `composition/bootstrap-env-composition.ts` | 7959 | `c/api-proxy-composition`, `c/cloud-oauth-composition`, `c/connections-composition`, `c/deep-link-composition`, `c/paths-composition` +4 | env constants + local backend spawn + boot progress + updates | Electron | yes | `legacy-hermes (split)` | indirect |
| `managed-ssh-update.ts` | 1084 | `c/bootstrap-env-composition`, `c/runtime-composition`, `main` | remote hermes install | filesystem + network | yes | `legacy-hermes/managed-ssh-update` | no |
| `connection-config.ts` | 1056 | `c/api-proxy-composition`, `c/bootstrap-env-composition`, `c/cloud-oauth-composition`, `c/connections-composition`, `c/ipc/api-proxy-ipc` +10 | connection.json + baseUrl/wsUrl/auth mode | Electron | yes | `legacy-hermes/connections` | indirect |
| `bootstrap-runner.ts` | 1037 | `bootstrap-runner`, `c/bootstrap-env-composition` | hermes checkout + install.sh | git / install script | yes | `legacy-hermes/bootstrap-runner` | no |
| `windows-remote-lifecycle.ts` | 789 | `c/bootstrap-env-composition`, `c/runtime-composition`, `main`, `managed-ssh-update`, `terminal-ipc` | remote host process | remote host | yes | `legacy-hermes/windows-remote` | no |
| `remote-lifecycle/ownership.ts` | 777 | `remote-lifecycle`, `remote-lifecycle/connect`, `remote-lifecycle/resolve`, `remote-lifecycle/spawn` | remote lockfile + tokens | remote host | yes | `legacy-hermes/remote-lifecycle` | no |
| `composition/runtime-composition.ts` | 721 | `c/api-proxy-composition`, `c/bootstrap-env-composition`, `main` | pool, liveness, managed ssh updates | Electron | yes | `legacy-hermes/runtime` | indirect |
| `composition/connections-composition.ts` | 639 | `main` | registry secrets + broadcast | Electron | yes | `legacy-hermes/connections` | indirect |
| `connection-registry/schema.ts` | 551 | `connection-registry`, `connection-registry/migration`, `connection-registry/registry-ops`, `connection-registry/roster` | registry normalisation | pure | yes | `legacy-hermes/connections` | indirect |
| `remote-liveness.ts` | 458 | `c/bootstrap-env-composition`, `c/ipc/connection-ipc`, `c/runtime-composition`, `main` | cached remote descriptors | Electron | yes | `legacy-hermes/remote-liveness` | no |
| `profile-session-routing.ts` | 455 | `c/api-proxy-composition` | profile→session rows | backend | yes | `legacy-hermes/connections` | yes |
| `connection-registry/identity.ts` | 384 | `connection-registry`, `connection-registry/migration`, `connection-registry/registry-ops`, `connection-registry/roster`, `connection-registry/route-resolution` +1 | registry schema | pure | yes | `legacy-hermes/connections` | indirect |
| `remote-lifecycle/spawn.ts` | 348 | `remote-lifecycle`, `remote-lifecycle/connect` | remote dashboard spawn + forward | remote host | yes | `legacy-hermes/remote-lifecycle` | no |
| `gateway-file-download.ts` | 343 | `c/api-proxy-composition`, `c/cloud-oauth-composition` | gateway file/artifact download | gateway | yes | `legacy-hermes/download` | no |
| `backend-ownership.ts` | 336 | `c/bootstrap-env-composition` | backend-ownership.json | Electron (process facts) | yes | `legacy-hermes/ownership` | no |
| `venv-blocker-scan.ts` | 323 | `c/bootstrap-env-composition` | processes holding the hermes venv | OS process facts | yes | `legacy-hermes/venv-blockers` | no |
| `backend-health.ts` | 317 | `c/bootstrap-env-composition` | /api/health + /api/status readiness | backend | yes | `legacy-hermes/health` | no |
| `plugin-profile-routes.ts` | 312 | `c/ipc/connection-ipc`, `remote-ws-headers` | profile route table | pure | yes | `legacy-hermes/connections` | indirect |
| `profile-migration.ts` | 311 | `c/bootstrap-env-composition` | legacy active-profile file | Electron | yes | `legacy-hermes/connections` | indirect |
| `windows-hermes-path.ts` | 293 | `c/bootstrap-env-composition` | Windows venv hermes command | Electron | yes | `legacy-hermes/windows-path` | no |
| `remote-lifecycle/connect.ts` | 286 | `remote-lifecycle` | SSH remote backend | remote host | yes | `legacy-hermes/remote-lifecycle` | no |
| `connection-registry/registry-ops.ts` | 274 | `connection-registry` | registry mutations | Electron | yes | `legacy-hermes/connections` | indirect |
| `pool-spawn-coordinator.ts` | 272 | `c/bootstrap-env-composition`, `c/runtime-composition` | local backend spawn slots | Electron | yes | `legacy-hermes/pool` | indirect |
| `backend-ready.ts` | 257 | `c/bootstrap-env-composition`, `remote-lifecycle/ownership` | stdout READY line + ready file | backend (announces port) | yes | `legacy-hermes/readiness` | no |
| `profile-delete-routing.ts` | 246 | `c/api-proxy-composition`, `c/bootstrap-env-composition`, `c/ipc/api-proxy-ipc`, `profile-rename-routing` | profile delete routing | pure | yes | `legacy-hermes/connections` | indirect |
| `remote-lifecycle/resolve.ts` | 244 | `remote-lifecycle`, `remote-lifecycle/connect`, `remote-lifecycle/spawn` | remote hermes binary + profiles | remote host | yes | `legacy-hermes/remote-lifecycle` | no |
| `gateway-ws-probe.ts` | 237 | `c/bootstrap-env-composition`, `c/ipc/connection-ipc`, `main` | /api/ws upgrade | backend | yes | `legacy-hermes/ws-probe` | no |
| `backend-probes.ts` | 234 | `c/bootstrap-env-composition` | hermes executable resolution ladder | Electron | yes | `legacy-hermes/resolution` | no |
| `desktop-remote-route.ts` | 228 | `c/bootstrap-env-composition`, `c/runtime-composition` | ssh terminal pool key | pure | yes | `legacy-hermes/remote-route` | no |
| `connection-registry/roster.ts` | 219 | `connection-registry` | agent roster | pure | yes | `legacy-hermes/connections` | indirect |
| `api-transport.ts` | 178 | `c/bootstrap-env-composition`, `c/cloud-oauth-composition`, `main` | gateway HTTP keepalive/retry | transport only | partial | `legacy-hermes/transport` | no |
| `backend-env.ts` | 161 | `c/bootstrap-env-composition`, `shell-path` | child env, HERMES_HOME, PATH | Electron (env policy) | yes | `legacy-hermes/env` | no |
| `connection-registry/migration.ts` | 153 | `connection-registry` | v1→v2 registry migration | pure | yes | `legacy-hermes/connections` | indirect |
| `ssh-bootstrap-coordinator.ts` | 151 | `c/bootstrap-env-composition` | ssh bootstrap dial lifetime | Electron | partial | `legacy-hermes/ssh-bootstrap` | no |
| `first-run-setup-gate.ts` | 146 | `c/bootstrap-env-composition`, `primary-backend-startup` | first-run choice gate | Electron | yes | `legacy-hermes/first-run-gate` | no |
| `backend-start-failure.ts` | 140 | `c/bootstrap-env-composition` | latched boot failure | Electron | yes | `legacy-hermes/start-failure` | no |
| `plugin-compat-notice.ts` | 138 | `c/bootstrap-env-composition` | HERMES_HOME plugin-compat report | Hermes runtime | yes | `legacy-hermes/plugin-compat` | no |
| `profile-rename-routing.ts` | 138 | `c/api-proxy-composition`, `c/ipc/api-proxy-ipc` | profile rename lifecycle | Electron | yes | `legacy-hermes/connections` | indirect |
| `connection-registry/route-resolution.ts` | 131 | `connection-registry` | primary route resolution | Electron | yes | `legacy-hermes/connections` | indirect |
| `connection-route-identity.ts` | 131 | `connection-registry/identity`, `desktop-remote-route` | stored route identity | pure | yes | `legacy-hermes/connections` | indirect |
| `backend-release-gate.ts` | 127 | `c/bootstrap-env-composition` | backend PID release | Electron | yes | `legacy-hermes/release-gate` | no |
| `bootstrap-repair-guard.ts` | 121 | `c/ipc/backend-ipc` | bootstrap repair decision | pure | yes | `legacy-hermes/repair-guard` | no |
| `primary-backend-startup.ts` | 113 | `c/bootstrap-env-composition` | primary boot sequence | Electron | yes | `legacy-hermes/primary-startup` | no |
| `dashboard-token.ts` | 112 | `c/bootstrap-env-composition` | scraped dashboard session token | backend | yes | `legacy-hermes/token` | no |
| `connection-apply.ts` | 111 | `c/bootstrap-env-composition`, `c/ipc/connection-ipc`, `main`, `terminal-ipc` | applied connection + ssh teardown | Electron | yes | `legacy-hermes/connections` | indirect |
| `parent-process-identity.ts` | 108 | `backend-claim`, `c/bootstrap-env-composition` | HERMES_PARENT_* / HERMES_SPAWN env | Electron | yes | `legacy-hermes/parent-identity` | no |
| `gateway-stop-before-update.ts` | 97 | `c/bootstrap-env-composition` | messaging gateway process | gateway | yes | `legacy-hermes/gateway-stop` | no |
| `remote-ws-headers.ts` | 97 | `c/bootstrap-env-composition`, `c/runtime-composition`, `main` | WS request headers | Electron | yes | `legacy-hermes/remote-ws-headers` | no |
| `window-connection-route.ts` | 91 | `c/bootstrap-env-composition` | per-window connection route | Electron | yes | `legacy-hermes/connections` | indirect |
| `pool-stop.ts` | 86 | `c/bootstrap-env-composition` | pool teardown | Electron | yes | `legacy-hermes/pool` | indirect |
| `pool-limits.ts` | 81 | `c/bootstrap-env-composition`, `c/runtime-composition` | pool limits | pure | yes | `legacy-hermes/pool` | indirect |
| `connection-registry.ts` | 73 | `c/api-proxy-composition`, `c/bootstrap-env-composition`, `c/connections-composition`, `c/ipc/connection-ipc`, `c/runtime-composition` +5 | connections.json | Electron | yes | `legacy-hermes/connections` | indirect |
| `active-runtime-state.ts` | 58 | `c/bootstrap-env-composition` | bootstrap marker + ACTIVE_HERMES_ROOT | Electron (install facts) | yes | `legacy-hermes/active-runtime` | no |
| `pool-eviction.ts` | 58 | `c/bootstrap-env-composition` | profile backend pool | pure | yes | `legacy-hermes/pool` | indirect |
| `remote-lifecycle.ts` | 55 | `c/bootstrap-env-composition`, `c/runtime-composition`, `main`, `managed-ssh-update` | remote backend + lockfile | remote host | yes | `legacy-hermes/remote-lifecycle` | no |
| `connection-config-apply.ts` | 53 | `c/ipc/connection-ipc` | connection.json | Electron | yes | `legacy-hermes/connections` | indirect |
| `composition/paths-composition.ts` | 53 | `c/runtime-composition`, `c/windows-composition`, `main` | hermes version + pool limits | filesystem | yes | `legacy-hermes/paths` | no |
| `backend-command.ts` | 48 | `c/bootstrap-env-composition` | Hermes argv (serve / dashboard) | pure | yes | `legacy-hermes/command` | no |
| `backend-recycle.ts` | 47 | `c/ipc/backend-ipc` | owned backend child | Electron | yes | `legacy-hermes/recycle` | no |
| `venv-holder-select.ts` | 36 | `c/bootstrap-env-composition` | hermes-owned venv daemon | pure | yes | `legacy-hermes/venv-blockers` | no |
| `primary-connection-rehome.ts` | 35 | `c/ipc/connection-ipc` | connection re-home | Electron | yes | `legacy-hermes/rehome` | no |
| `pool-touch-scope.ts` | 19 | `main` | pool touch keys | pure | yes | `legacy-hermes/pool` | indirect |
| `roster-source-fetch.ts` | 8 | `main` | roster source JSON | remote host | yes | `legacy-hermes/connections` | indirect |

## 4. Dependency direction

Current direction, as it exists in the tree after this round:

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
   (Hermes policy)   (generic primitives)
        │
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
| `composition/bootstrap-env-composition.ts` | 199 | Local backend spawn env (`HERMES_HOME`, `HERMES_DASHBOARD_SESSION_TOKEN`, `HERMES_DESKTOP`), ready-file, update machinery. E2's split target. | `LEGACY_HERMES` |
| `remote-lifecycle/*` (5 files) | 32 | Remote spawn argv (`--isolated`, `--ssh-owner-nonce`, token file), ownership lockfile. | `LEGACY_HERMES` |
| `windows-remote-lifecycle.ts` | 19 | `-m hermes_cli.windows_ssh_runtime spawn`. | `LEGACY_HERMES` |
| `windows-hermes-path.ts` | 12 | Venv `hermes` shim layout. | `LEGACY_HERMES` |
| `managed-ssh-update.ts` | 13 | Remote install of the external runtime. | `LEGACY_HERMES` |
| `composition/updates-composition.ts` | 9 | `uninstallVenvPython` — the Hermes venv, not the Desktop bundle. | `LEGACY_HERMES` (inside an update module) |
| `parent-process-identity.ts` | 9 | `HERMES_PARENT_PID` / `HERMES_PARENT_START_MARKER` / `HERMES_PARENT_NONCE` / `HERMES_SPAWN`, mirrored by `hermes_cli/process_identity.py`. | `LEGACY_HERMES` |
| `backend-ready.ts` | 8 | `HERMES_(BACKEND|DASHBOARD)_READY port=` sentinel. | `LEGACY_HERMES` |
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
   is **not** production ownership; converting those six tests to behavioural contracts is the
   precondition for moving the code they scan. This round widens the helper's discovery so it
   survives the moves rather than pretending the constraint does not exist.
5. **Renderer mass is out of scope.** The 293k lines under `apps/desktop/src/` — including the
   Hermes product surfaces listed in `03-coupling-matrix.md` §4 (Bucket D) — are untouched. This
   round is Electron-main-process only.

## 7. Migration ledger

**This is the only section that asserts physical change.** Everything in §3 is classification.

An initial ledger. Each phase appends its own rows and its commit id when it lands.

| Phase | Commit | Module | From | To | Physical? |
|---|---|---|---|---|---|
| E0 | *(this commit)* | all 180 production modules | — | — | **No.** Classification only — an audit, not a move. |

Status of the target tree after E0:

| Target directory | Exists? | Populated? |
|---|---|---|
| `app/` | no | — |
| `windows/` | no | — |
| `host-capabilities/` | no | — |
| `process/` | no | — |
| `workcore/` | no | — |
| `host-bridge/` | no | — |
| `ipc/` | no | — |
| `update/` | no | — |
| `security/` | no | — |
| `legacy-hermes/` | no | — |

Everything in §3 is therefore a *registered future ownership*. Nothing has moved.

## 8. Next vertical chain (not started)

The safest first vertical chain, named so a later round can begin without re-deriving it:

> `backend-command.ts` + `backend-probes.ts` + `backend-env.ts` → a single `legacy-hermes/resolve.ts`
> hiding behind `interface HermesBackendLifecycle { resolve(); launch(); readiness(); descriptor();
> restart(); shutdown() }`, consumed by `main.ts` through one composition call.

Why this one first: it is the narrowest slice that removes Hermes argv/env assembly from the
composition root, all three modules are already pure and unit-tested, and the whole ladder already
has a typed sentinel outcome (`HERMES_EXECUTABLE_NOT_FOUND`). The chain is complete when `main.ts`
contains no `'serve'`, no `'--profile'` and no `HERMES_HOME` and the boot smoke is unchanged.

