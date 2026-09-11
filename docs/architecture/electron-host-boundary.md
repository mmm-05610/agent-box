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
| of which `electron/composition/` | 2 | 9,005 |
| of which `electron/process/` (E1) | 8 | 859 |

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

### DESKTOP_HOST — 70 modules, 13848 lines

| module | LOC | current callers | operates on | state authority | Hermes-only? | target | Session/Exec/Workspace |
|---|---:|---|---|---|---|---|---|
| `composition/api-proxy-composition.ts` | 1479 | `lh/ssh-inventory`, `main` | authenticated /api proxy, favicon/title cache | backend | yes | `composition/ (assembler)` | indirect |
| `windows/windows-composition.ts` | 1340 | `main` | window registry + app menu | Electron | yes | `windows/ (moved)` | no |
| `main.ts` | 1087 | — | Electron boot order + composition | Electron | partial | `app/ (root entry: startup order + composition only, 0 function declarations)` | no |
| `ipc/connection-ipc.ts` | 766 | `main` | connection channels | Electron | yes | `ipc/ (moved)` | indirect |
| `preload.ts` | 540 | — | contextBridge surface | Electron | partial | `ipc/` | no |
| `update/updates-composition.ts` | 457 | `main` | update check + desktop uninstall | git | partial | `update/ (moved)` | no |
| `update/updater-process.ts` | 455 | `c/bootstrap-env-composition` | detached updater child | updater script | partial | `update/ (moved)` | no |
| `windows/window-renderer-lifecycle.ts` | 426 | `c/bootstrap-env-composition`, `hc/credentials/cloud-oauth`, `windows/wake-indicator-window`, `windows/windows-composition` | renderer crash/reload policy | Electron | no | `windows/ (moved)` | no |
| `windows/quick-entry.ts` | 421 | `ipc/window-ipc`, `windows/hud-snap-shortcut`, `windows/quick-entry-settings`, `windows/windows-composition` | global quick-entry composer | OS | yes | `windows/ (moved)` | no |
| `ipc/window-ipc.ts` | 310 | `main` | window channels | Electron | yes | `ipc/ (moved)` | no |
| `windows/window-theme.ts` | 310 | `c/bootstrap-env-composition`, `ipc/theme-ipc`, `main`, `windows/windows-composition` | theme + translucency persistence | Electron | no | `windows/ (moved)` | no |
| `ipc/hud-ipc.ts` | 303 | `main` | HUD IPC channels | Electron | no | `ipc/ (moved)` | no |
| `update/desktop-uninstall.ts` | 268 | `c/bootstrap-env-composition`, `update/updates-composition` | app bundle + userData removal | filesystem | partial | `update/ (moved)` | no |
| `windows/hud-game-overlay.ts` | 261 | `windows/windows-composition` | fullscreen app detection | OS window facts | no | `windows/ (moved)` | no |
| `windows/find-in-page.ts` | 231 | `c/bootstrap-env-composition`, `ipc/window-ipc`, `main` | find-in-page | Electron | yes | `windows/ (moved)` | no |
| `ipc/files-ipc.ts` | 220 | `main` | file channels | filesystem | partial | `ipc/ (moved)` | indirect |
| `windows/zoom.ts` | 214 | `c/bootstrap-env-composition`, `ipc/window-ipc`, `windows/windows-composition` | zoom level + reassert | Electron | no | `windows/ (moved)` | no |
| `ipc/backend-ipc.ts` | 211 | `main` | backend boot/repair channels | Electron | yes | `ipc/ (moved)` | indirect |
| `app/log-buffer.ts` | 210 | `app/deep-link-composition`, `c/api-proxy-composition`, `c/bootstrap-env-composition`, `hc/credentials/cloud-oauth`, `hc/platform/wsl-fonts` +13 | desktop.log buffer + rotation | filesystem | yes | `app/ (moved)` | no |
| `windows/renderer-load-error-page.ts` | 198 | `c/bootstrap-env-composition` | load-error page | Electron | yes | `windows/ (moved)` | no |
| `ipc/system-ipc.ts` | 195 | `main` | app/system channels | Electron | yes | `ipc/ (moved)` | no |
| `windows/session-windows.ts` | 192 | `c/bootstrap-env-composition`, `windows/windows-composition` | per-session pop-out windows | Electron | no | `windows/ (moved)` | no |
| `windows/wake-indicator-window.ts` | 186 | `c/bootstrap-env-composition` | wake indicator window | Electron | no | `windows/ (moved)` | no |
| `windows/window-state.ts` | 169 | `c/bootstrap-env-composition`, `windows/windows-composition` | window-state.json | Electron | no | `windows/ (moved)` | no |
| `app/renderer-bundle.ts` | 160 | `c/bootstrap-env-composition` | renderer asset refs | build output | no | `app/ (moved)` | no |
| `ipc/pet-overlay-ipc.ts` | 151 | `main` | pet overlay IPC | Electron | no | `ipc/ (moved)` | no |
| `app/desktop-installation.ts` | 137 | `c/bootstrap-env-composition` | desktop-installation.json | Electron | no | `app/ (moved)` | no |
| `windows/hud-windowing.ts` | 136 | `ipc/hud-ipc`, `windows/windows-composition` | HUD windowing backend | pure | no | `windows/ (moved)` | no |
| `update/bundle-skew.ts` | 133 | `update/bundle-swap`, `windows/windows-composition` | git checkout vs build stamp | git | partial | `update/ (moved)` | no |
| `test-main-process-sources.ts` | 122 | — (tests only) | reads main-process sources for wiring assertions | none | no | `(test support)` | no |
| `windows/stream-throttle.ts` | 119 | `c/bootstrap-env-composition` | background throttling | renderer | no | `windows/ (moved)` | no |
| `ipc/theme-ipc.ts` | 113 | `main` | theme channels | Electron | no | `ipc/ (moved)` | no |
| `windows/translucency.ts` | 111 | `c/bootstrap-env-composition`, `ipc/hud-ipc`, `ipc/theme-ipc`, `windows/window-theme` | window translucency | OS | no | `windows/ (moved)` | no |
| `app/deep-link-composition.ts` | 109 | `main` | hermes:// deep links | Electron | yes | `app/ (moved)` | no |
| `app/dev-cdp.ts` | 108 | `c/bootstrap-env-composition`, `main` | dev CDP port | Electron | no | `app/ (moved)` | no |
| `windows/hud-geometry.ts` | 105 | `ipc/hud-ipc`, `windows/windows-composition` | HUD bounds | pure | no | `windows/ (moved)` | no |
| `ipc/notification-ipc.ts` | 102 | `main` | native notifications | OS | no | `ipc/ (moved)` | no |
| `update/update-gate.ts` | 95 | `c/bootstrap-env-composition` | update clearance gate | Electron | partial | `update/ (moved)` | no |
| `update/handoff-result.ts` | 93 | `c/bootstrap-env-composition` | HERMES_HOME update-result file | updater script | partial | `update/ (moved)` | no |
| `app/quit-guard.ts` | 92 | `app/quit-prompt`, `ipc/window-ipc`, `main`, `windows/active-work-throttle` | quit prompt | pure | no | `app/ (moved)` | no |
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
| `app/user-data.ts` | 21 | `lh/home`, `main` | HERMES_DESKTOP_USER_DATA_DIR override | Electron | no | `app/ (new)` | no |
| `app/desktop-log-line.ts` | 19 | `app/log-buffer` | log line format | pure | no | `app/ (moved)` | no |
| `windows/notification-types.ts` | 18 | `ipc/notification-ipc` | notification shape | pure | no | `windows/ (moved)` | no |

### HOST_CAPABILITY — 48 modules, 10987 lines

| module | LOC | current callers | operates on | state authority | Hermes-only? | target | Session/Exec/Workspace |
|---|---:|---|---|---|---|---|---|
| `host-capabilities/platform/ssh-connection.ts` | 1148 | `c/bootstrap-env-composition`, `hc/terminal/terminal-ipc`, `lh/connect`, `lh/gateway-connection`, `lh/preview-reach` +4 | ssh exec / forward primitive | remote host | no | `host-capabilities/platform (moved)` | indirect |
| `host-capabilities/git/git-review-ops.ts` | 903 | `hc/git/git-ipc` | diff/commit/push/PR | git | no | `host-capabilities/git (moved)` | indirect |
| `host-capabilities/credentials/cloud-oauth.ts` | 838 | `c/api-proxy-composition`, `lh/cloud-agents`, `main` | Nous portal OAuth | portal | partial | `host-capabilities/credentials (moved)` | no |
| `host-capabilities/filesystem/hardening.ts` | 554 | `c/api-proxy-composition`, `c/bootstrap-env-composition`, `hc/contract`, `hc/credentials/cloud-oauth`, `hc/filesystem/fs-read-dir` +9 | path safety, data-URL read, secret encryption | filesystem | partial | `host-capabilities/filesystem (moved)` | no |
| `host-capabilities/git/git-worktree-ops.ts` | 537 | `hc/contract`, `hc/git/git-ipc` | worktrees + branches | git | no | `host-capabilities/git (moved)` | indirect |
| `host-capabilities/filesystem/desktop-plugin-install.ts` | 446 | `hc/contract`, `hc/filesystem/fs-ipc` | git clone into plugin root | git | partial | `host-capabilities/filesystem (moved)` | no |
| `host-capabilities/terminal/terminal-ipc.ts` | 398 | `c/bootstrap-env-composition` | node-pty sessions | PTY | partial | `host-capabilities/terminal (moved)` | indirect |
| `host-capabilities/platform/windows-sandbox-fallback.ts` | 394 | `c/bootstrap-env-composition`, `ipc/system-ipc`, `main` | Windows sandbox / ACL fallback | OS | no | `host-capabilities/platform (moved)` | no |
| `host-capabilities/preview/favicon.ts` | 347 | `hc/contract`, `hc/preview/favicon-cache` | favicon fetch + parse | remote host | no | `host-capabilities/preview (moved)` | no |
| `host-capabilities/preview/vscode-marketplace.ts` | 337 | `ipc/preview-ipc` | VSIX theme fetch | remote host | no | `host-capabilities/preview (moved)` | no |
| `host-capabilities/platform/window-below.ts` | 298 | `hc/contract`, `hc/platform/hyprland`, `ipc/window-ipc`, `windows/hud-game-overlay`, `windows/windows-composition` | native window enumeration | OS | no | `host-capabilities/platform (moved)` | no |
| `host-capabilities/credentials/native-oauth.ts` | 255 | `c/bootstrap-env-composition`, `hc/contract`, `hc/credentials/native-oauth-login`, `hc/credentials/native-token-store`, `ipc/connection-ipc` | PKCE + token parsing | pure | no | `host-capabilities/credentials (moved)` | no |
| `host-capabilities/credentials/native-auth-decisions.ts` | 235 | `c/api-proxy-composition`, `c/bootstrap-env-composition`, `hc/contract`, `hc/credentials/native-oauth`, `lh/connections-composition` | readiness/auth decisions | pure | yes | `host-capabilities/credentials (moved)` | no |
| `host-capabilities/credentials/native-oauth-login.ts` | 215 | `ipc/connection-ipc` | loopback login flow | credentials | no | `host-capabilities/credentials (moved)` | no |
| `host-capabilities/platform/hud-hyprland.ts` | 214 | `windows/hud-overlay` | Hyprland compositor IPC | compositor | no | `host-capabilities/platform (moved)` | no |
| `host-capabilities/preview/preview-reach.ts` | 210 | `lh/preview-reach`, `preview-reach.e2e.mts` | loopback preview reach | Electron | no | `host-capabilities/preview (moved)` | no |
| `host-capabilities/filesystem/fs-ipc.ts` | 204 | `main` | renderer filesystem IPC | filesystem | partial | `host-capabilities/filesystem (moved)` | indirect |
| `host-capabilities/git/git-repo-scan.ts` | 201 | `hc/contract`, `hc/git/git-ipc` | repo scan | filesystem | no | `host-capabilities/git (moved)` | indirect |
| `host-capabilities/platform/wsl-path-bridge.ts` | 198 | `c/bootstrap-env-composition`, `hc/contract`, `hc/filesystem/fs-read-dir`, `ipc/files-ipc`, `main` | WSL path translation | WSL distro | no | `host-capabilities/platform (moved)` | indirect |
| `host-capabilities/platform/shell-path.ts` | 187 | `c/bootstrap-env-composition`, `main` | login-shell PATH | login shell | no | `host-capabilities/platform (moved)` | no |
| `host-capabilities/preview/media-protocol.ts` | 186 | `hc/contract`, `hc/preview/media-registration` | hermes-media:// protocol | Electron | yes | `host-capabilities/preview (moved)` | no |
| `host-capabilities/credentials/mcp-oauth-callback-ipc.ts` | 181 | `main` | MCP OAuth loopback callback | credentials | no | `host-capabilities/credentials (moved)` | no |
| `host-capabilities/platform/hyprland.ts` | 177 | `hc/contract`, `hc/platform/hud-hyprland`, `hc/platform/window-below` | Hyprland socket | pure | no | `host-capabilities/platform (moved)` | no |
| `host-capabilities/platform/ssh-config.ts` | 175 | `ipc/connection-ipc` | ~/.ssh/config | filesystem | no | `host-capabilities/platform (moved)` | no |
| `host-capabilities/credentials/native-token-store.ts` | 165 | `c/bootstrap-env-composition` | persisted token set | credentials | no | `host-capabilities/credentials (moved)` | no |
| `host-capabilities/credentials/oauth-partition.ts` | 155 | `c/bootstrap-env-composition` | Electron session partition | OS keyring | no | `host-capabilities/credentials (moved)` | no |
| `host-capabilities/platform/bootstrap-platform.ts` | 150 | `c/bootstrap-env-composition`, `hc/platform/executables`, `hc/platform/platform-facts`, `hc/platform/wsl-fonts`, `windows/window-theme` | WSL / remote display / keyring | Electron (host facts) | partial | `host-capabilities/platform (moved)` | no |
| `host-capabilities/contract.ts` | 150 | — (tests only) | typed executor boundary for the six capability areas | OS / external tool | yes | `host-capabilities/ (new)` | no |
| `host-capabilities/preview/preview-capture.ts` | 131 | `hc/contract`, `ipc/files-ipc` | screenshot capture | Electron | no | `host-capabilities/preview (moved)` | no |
| `host-capabilities/platform/spawn-helper-perms.ts` | 122 | `hc/terminal/terminal-ipc` | node-pty spawn-helper mode | filesystem | no | `host-capabilities/platform (moved)` | no |
| `host-capabilities/git/git-ipc.ts` | 120 | `main` | git IPC channels | git | no | `host-capabilities/git (moved)` | indirect |
| `host-capabilities/filesystem/fs-read-dir.ts` | 112 | `hc/contract`, `hc/filesystem/fs-ipc` | directory listing | filesystem | no | `host-capabilities/filesystem (moved)` | indirect |
| `host-capabilities/preview/media-bridge.ts` | 109 | `c/api-proxy-composition`, `ipc/files-ipc`, `main` | media bridge + preview metadata | filesystem | no | `host-capabilities/preview (moved)` | no |
| `host-capabilities/credentials/secret-storage-policy.ts` | 102 | `c/bootstrap-env-composition`, `hc/contract`, `lh/connections-composition` | secret storage policy | OS keyring | no | `host-capabilities/credentials (moved)` | no |
| `host-capabilities/platform/wsl-clipboard-image.ts` | 102 | `ipc/files-ipc` | WSL clipboard image | windows.exe | no | `host-capabilities/platform (moved)` | no |
| `host-capabilities/platform/windows-user-env.ts` | 99 | `lh/home` | Windows user env | OS registry | no | `host-capabilities/platform (moved)` | no |
| `host-capabilities/git/gitlock.ts` | 96 | `update/updates-composition` | stale git index.lock | filesystem | no | `host-capabilities/git (moved)` | no |
| `host-capabilities/platform/find-git-bash.ts` | 89 | `c/bootstrap-env-composition`, `hc/contract` | Git Bash executable | filesystem | no | `host-capabilities/platform (moved)` | no |
| `host-capabilities/platform/windows-system-ca.ts` | 79 | `main` | Windows CA trust | OS | no | `host-capabilities/platform (moved)` | no |
| `host-capabilities/platform/executables.ts` | 63 | `c/bootstrap-env-composition`, `hc/git/gh-binary`, `hc/platform/find-git-bash`, `lh/venv` | findOnPath | OS PATH | no | `host-capabilities/platform/ (new)` | no |
| `host-capabilities/terminal/terminal-output-gate.ts` | 62 | `hc/contract`, `hc/terminal/terminal-ipc` | terminal exit payload | pure | no | `host-capabilities/terminal (moved)` | no |
| `host-capabilities/platform/wsl-fonts.ts` | 61 | `main` | WSL font registration | filesystem | no | `host-capabilities/platform (moved)` | no |
| `host-capabilities/git/git-root.ts` | 50 | `hc/contract`, `hc/filesystem/fs-ipc` | git root discovery | filesystem | no | `host-capabilities/git (moved)` | indirect |
| `host-capabilities/platform/windows-child-options.ts` | 37 | `c/api-proxy-composition`, `c/bootstrap-env-composition`, `hc/contract`, `ipc/connection-ipc`, `lh/bootstrap-runner` +4 | Windows child spawn options | pure | no | `host-capabilities/platform (moved)` | no |
| `host-capabilities/filesystem/fs-probe.ts` | 29 | `c/api-proxy-composition`, `c/bootstrap-env-composition`, `hc/filesystem/project-dir`, `hc/git/gh-binary`, `hc/platform/executables` +7 | fileExists / directoryExists | filesystem | no | `host-capabilities/filesystem/ (new)` | no |
| `host-capabilities/platform/pathext.ts` | 25 | `hc/platform/executables` | buildPathExtCandidates | pure | no | `host-capabilities/platform/ (new)` | no |
| `host-capabilities/platform/platform-facts.ts` | 24 | `c/bootstrap-env-composition`, `hc/git/gh-binary`, `hc/platform/executables`, `hc/platform/find-git-bash`, `lh/home` +5 | IS_MAC / IS_WINDOWS / IS_WSL | OS | no | `host-capabilities/platform/ (new)` | no |
| `host-capabilities/credentials/oauth-net-request.ts` | 17 | `c/bootstrap-env-composition` | OAuth request headers | pure | no | `host-capabilities/credentials (moved)` | no |

### PROCESS_PRIMITIVE — 9 modules, 1048 lines

| module | LOC | current callers | operates on | state authority | Hermes-only? | target | Session/Exec/Workspace |
|---|---:|---|---|---|---|---|---|
| `process/readiness.ts` | 207 | `lh/backend-ready` | stdout sentinel + polled-value readiness | OS | no | `process/ (new)` | no |
| `process/identity.ts` | 193 | `c/bootstrap-env-composition` | process start marker + claim policy | OS (PID identity) | no | `process/ (moved)` | no |
| `update/update-marker.ts` | 189 | `c/bootstrap-env-composition` | PID liveness + update marker file | OS | partial | `process/pid (moved)` | no |
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

### LEGACY_HERMES — 67 modules, 24356 lines

| module | LOC | current callers | operates on | state authority | Hermes-only? | target | Session/Exec/Workspace |
|---|---:|---|---|---|---|---|---|
| `composition/bootstrap-env-composition.ts` | 7526 | `app/deep-link-composition`, `c/api-proxy-composition`, `hc/credentials/cloud-oauth`, `lh/connections-composition`, `lh/first-run-continuation` +10 | env constants + local backend spawn + boot progress + updates | Electron | yes | `composition/ (assembler; the Hermes probes and paths moved out in E5a)` | indirect |
| `legacy-hermes/managed-ssh-update.ts` | 1084 | `c/bootstrap-env-composition`, `lh/managed-requests`, `lh/runtime-composition`, `main` | remote hermes install | filesystem + network | yes | `legacy-hermes/managed-ssh-update (moved)` | no |
| `legacy-hermes/connection-config.ts` | 1056 | `c/api-proxy-composition`, `c/bootstrap-env-composition`, `hc/credentials/cloud-oauth`, `ipc/api-proxy-ipc`, `ipc/backend-ipc` +13 | connection.json + baseUrl/wsUrl/auth mode | Electron | yes | `legacy-hermes/connections (moved)` | indirect |
| `legacy-hermes/bootstrap-runner.ts` | 1037 | `c/bootstrap-env-composition`, `lh/bootstrap-runner` | hermes checkout + install.sh | git / install script | yes | `legacy-hermes/bootstrap-runner (moved)` | no |
| `legacy-hermes/windows-remote-lifecycle.ts` | 789 | `c/bootstrap-env-composition`, `hc/terminal/terminal-ipc`, `lh/gateway-connection`, `lh/managed-ssh-update`, `lh/runtime-composition` | remote host process | remote host | yes | `legacy-hermes/windows-remote (moved)` | no |
| `legacy-hermes/ownership.ts` | 777 | `lh/connect`, `lh/remote-lifecycle`, `lh/resolve`, `lh/spawn` | remote lockfile + tokens | remote host | yes | `legacy-hermes/remote-lifecycle (moved)` | no |
| `legacy-hermes/runtime-composition.ts` | 721 | `c/api-proxy-composition`, `c/bootstrap-env-composition`, `lh/managed-requests`, `lh/pool-revalidation`, `main` | pool, liveness, managed ssh updates | Electron | yes | `legacy-hermes/runtime (moved)` | indirect |
| `legacy-hermes/connections-composition.ts` | 663 | `lh/gateway-connection`, `lh/ssh-inventory`, `main` | registry secrets + broadcast | Electron | yes | `legacy-hermes/connections (moved)` | indirect |
| `legacy-hermes/schema.ts` | 550 | `lh/connection-registry`, `lh/migration`, `lh/registry-ops`, `lh/roster` | registry normalisation | pure | yes | `legacy-hermes/connections (moved)` | indirect |
| `legacy-hermes/profile-session-routing.ts` | 455 | `c/api-proxy-composition` | profile→session rows | backend | yes | `legacy-hermes/connections (moved)` | yes |
| `legacy-hermes/remote-liveness.ts` | 440 | `c/bootstrap-env-composition`, `ipc/connection-ipc`, `lh/pool-revalidation`, `lh/runtime-composition`, `main` | cached remote descriptors | Electron | yes | `legacy-hermes/remote-liveness (moved)` | no |
| `legacy-hermes/identity.ts` | 384 | `lh/connection-registry`, `lh/migration`, `lh/registry-ops`, `lh/roster`, `lh/route-resolution` +1 | registry schema | pure | yes | `legacy-hermes/connections (moved)` | indirect |
| `legacy-hermes/spawn.ts` | 348 | `lh/connect`, `lh/remote-lifecycle` | remote dashboard spawn + forward | remote host | yes | `legacy-hermes/remote-lifecycle (moved)` | no |
| `legacy-hermes/gateway-file-download.ts` | 343 | `c/api-proxy-composition`, `hc/credentials/cloud-oauth` | gateway file/artifact download | gateway | yes | `legacy-hermes/download (moved)` | no |
| `legacy-hermes/backend-ownership.ts` | 336 | `c/bootstrap-env-composition` | backend-ownership.json | Electron (process facts) | yes | `legacy-hermes/ownership (moved)` | no |
| `legacy-hermes/venv-blocker-scan.ts` | 323 | `c/bootstrap-env-composition` | processes holding the hermes venv | OS process facts | yes | `legacy-hermes/venv-blockers (moved)` | no |
| `legacy-hermes/backend-health.ts` | 317 | `c/bootstrap-env-composition` | /api/health + /api/status readiness | backend | yes | `legacy-hermes/health (moved)` | no |
| `legacy-hermes/plugin-profile-routes.ts` | 312 | `ipc/connection-ipc`, `lh/remote-ws-headers` | profile route table | pure | yes | `legacy-hermes/connections (moved)` | indirect |
| `legacy-hermes/profile-migration.ts` | 311 | `c/bootstrap-env-composition` | legacy active-profile file | Electron | yes | `legacy-hermes/connections (moved)` | indirect |
| `legacy-hermes/connect.ts` | 286 | `lh/remote-lifecycle` | SSH remote backend | remote host | yes | `legacy-hermes/remote-lifecycle (moved)` | no |
| `legacy-hermes/windows-hermes-path.ts` | 285 | `c/bootstrap-env-composition`, `lh/venv` | Windows venv hermes command | Electron | yes | `legacy-hermes/windows-path (moved)` | no |
| `legacy-hermes/venv.ts` | 277 | `c/bootstrap-env-composition`, `update/updates-composition` | findPythonForRoot, findSystemPython, getVenvPython, venvRootForPython, isCommandScript, unwrapWindowsVenvHermesCommand | Electron | yes | `legacy-hermes/ (new)` | no |
| `legacy-hermes/registry-ops.ts` | 273 | `lh/connection-registry` | registry mutations | Electron | yes | `legacy-hermes/connections (moved)` | indirect |
| `legacy-hermes/pool-spawn-coordinator.ts` | 272 | `c/bootstrap-env-composition`, `lh/runtime-composition` | local backend spawn slots | Electron | yes | `legacy-hermes/pool (moved)` | indirect |
| `legacy-hermes/profile-delete-routing.ts` | 246 | `c/api-proxy-composition`, `c/bootstrap-env-composition`, `ipc/api-proxy-ipc`, `lh/profile-rename-routing` | profile delete routing | pure | yes | `legacy-hermes/connections (moved)` | indirect |
| `legacy-hermes/resolve.ts` | 243 | `lh/connect`, `lh/remote-lifecycle`, `lh/spawn` | remote hermes binary + profiles | remote host | yes | `legacy-hermes/remote-lifecycle (moved)` | no |
| `legacy-hermes/gateway-ws-probe.ts` | 237 | `c/bootstrap-env-composition`, `ipc/connection-ipc`, `lh/gateway-connection` | /api/ws upgrade | backend | yes | `legacy-hermes/ws-probe (moved)` | no |
| `legacy-hermes/backend-probes.ts` | 234 | `c/bootstrap-env-composition`, `lh/resolution`, `lh/venv` | hermes executable resolution ladder | Electron | yes | `legacy-hermes/resolution (moved)` | no |
| `legacy-hermes/desktop-remote-route.ts` | 228 | `c/bootstrap-env-composition`, `lh/runtime-composition` | ssh terminal pool key | pure | yes | `legacy-hermes/remote-route (moved)` | no |
| `legacy-hermes/lifecycle.ts` | 222 | `c/bootstrap-env-composition` | Hermes argv/env/descriptor producers + six-verb seam | Electron (legacy adapter) | yes | `legacy-hermes/ (new)` | no |
| `legacy-hermes/roster.ts` | 219 | `lh/connection-registry`, `lh/ssh-inventory` | agent roster | pure | yes | `legacy-hermes/connections (moved)` | indirect |
| `legacy-hermes/api-transport.ts` | 180 | `c/bootstrap-env-composition`, `hc/credentials/cloud-oauth`, `main` | gateway HTTP keepalive/retry | transport only | partial | `legacy-hermes/transport (moved)` | no |
| `legacy-hermes/resolution.ts` | 170 | `c/bootstrap-env-composition`, `update/updates-composition` | backendSupportsServe, getBackendArgsForRuntime, isHermesSourceRoot, looksLikeDesktopAppBinary, normalizeExecutablePathForCompare | Electron | yes | `legacy-hermes/ (new)` | no |
| `legacy-hermes/backend-env.ts` | 161 | `c/bootstrap-env-composition`, `hc/platform/shell-path`, `lh/home`, `lh/venv` | child env, HERMES_HOME, PATH | Electron (env policy) | yes | `legacy-hermes/env (moved)` | no |
| `legacy-hermes/migration.ts` | 152 | `lh/connection-registry` | v1→v2 registry migration | pure | yes | `legacy-hermes/connections (moved)` | indirect |
| `legacy-hermes/ssh-bootstrap-coordinator.ts` | 151 | `c/bootstrap-env-composition` | ssh bootstrap dial lifetime | Electron | partial | `legacy-hermes/ssh-bootstrap (moved)` | no |
| `legacy-hermes/backend-ready.ts` | 149 | `c/bootstrap-env-composition`, `lh/ownership` | stdout READY line + ready file | backend (announces port) | yes | `legacy-hermes/readiness (moved)` | no |
| `legacy-hermes/first-run-setup-gate.ts` | 148 | `c/bootstrap-env-composition`, `lh/primary-backend-startup` | first-run choice gate | Electron | yes | `legacy-hermes/first-run-gate (moved)` | no |
| `legacy-hermes/backend-start-failure.ts` | 140 | `c/bootstrap-env-composition` | latched boot failure | Electron | yes | `legacy-hermes/start-failure (moved)` | no |
| `legacy-hermes/plugin-compat-notice.ts` | 138 | `c/bootstrap-env-composition` | HERMES_HOME plugin-compat report | Hermes runtime | yes | `legacy-hermes/plugin-compat (moved)` | no |
| `legacy-hermes/profile-rename-routing.ts` | 138 | `c/api-proxy-composition`, `ipc/api-proxy-ipc` | profile rename lifecycle | Electron | yes | `legacy-hermes/connections (moved)` | indirect |
| `legacy-hermes/route-resolution.ts` | 131 | `lh/connection-registry`, `lh/ssh-inventory` | primary route resolution | Electron | yes | `legacy-hermes/connections (moved)` | indirect |
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
| `legacy-hermes/home.ts` | 89 | `c/bootstrap-env-composition`, `lh/resolution`, `lh/venv`, `main`, `update/updates-composition` | resolveHermesHome + HERMES_HOME/ACTIVE_HERMES_ROOT/VENV_ROOT | Electron (install facts) | yes | `legacy-hermes/ (new)` | no |
| `legacy-hermes/pool-stop.ts` | 86 | `c/bootstrap-env-composition` | pool teardown | Electron | yes | `legacy-hermes/pool (moved)` | indirect |
| `legacy-hermes/pool-limits.ts` | 81 | `c/bootstrap-env-composition`, `lh/runtime-composition` | pool limits | pure | yes | `legacy-hermes/pool (moved)` | indirect |
| `legacy-hermes/connection-registry.ts` | 73 | `c/api-proxy-composition`, `c/bootstrap-env-composition`, `ipc/connection-ipc`, `lh/connection-route-identity`, `lh/connections-composition` +7 | connections.json | Electron | yes | `legacy-hermes/connections (moved)` | indirect |
| `legacy-hermes/active-runtime-state.ts` | 58 | `c/bootstrap-env-composition` | bootstrap marker + ACTIVE_HERMES_ROOT | Electron (install facts) | yes | `legacy-hermes/active-runtime (moved)` | no |
| `legacy-hermes/pool-eviction.ts` | 58 | `c/bootstrap-env-composition` | profile backend pool | pure | yes | `legacy-hermes/pool (moved)` | indirect |
| `legacy-hermes/remote-lifecycle.ts` | 55 | `c/bootstrap-env-composition`, `lh/gateway-connection`, `lh/managed-ssh-update`, `lh/runtime-composition`, `lh/ssh-inventory` | remote backend + lockfile | remote host | yes | `legacy-hermes/remote-lifecycle (moved)` | no |
| `legacy-hermes/connection-config-apply.ts` | 53 | `ipc/connection-ipc` | connection.json | Electron | yes | `legacy-hermes/connections (moved)` | indirect |
| `legacy-hermes/paths.ts` | 50 | `lh/runtime-composition`, `main`, `windows/windows-composition` | hermes version + pool limits | filesystem | yes | `legacy-hermes/paths (moved)` | no |
| `legacy-hermes/backend-command.ts` | 48 | `lh/lifecycle`, `lh/resolution` | Hermes argv (serve / dashboard) | pure | yes | `legacy-hermes/command (moved)` | no |
| `legacy-hermes/backend-recycle.ts` | 47 | `ipc/backend-ipc` | owned backend child | Electron | yes | `legacy-hermes/recycle (moved)` | no |
| `legacy-hermes/venv-holder-select.ts` | 36 | `c/bootstrap-env-composition` | hermes-owned venv daemon | pure | yes | `legacy-hermes/venv-blockers (moved)` | no |
| `legacy-hermes/primary-connection-rehome.ts` | 35 | `ipc/connection-ipc` | connection re-home | Electron | yes | `legacy-hermes/rehome (moved)` | no |
| `legacy-hermes/pool-touch-scope.ts` | 19 | `lh/pool-revalidation` | pool touch keys | pure | yes | `legacy-hermes/pool (moved)` | indirect |
| `legacy-hermes/roster-source-fetch.ts` | 8 | `lh/ssh-inventory` | roster source JSON | remote host | yes | `legacy-hermes/connections (moved)` | indirect |

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
| E5a | `8104643` | the Hermes serve-detection cluster + the constants it read | `composition/bootstrap-env-composition.ts` | `legacy-hermes/resolution.ts` (`backendSupportsServe`, `getBackendArgsForRuntime`, `isHermesSourceRoot`, `looksLikeDesktopAppBinary`, `normalizeExecutablePathForCompare`), `legacy-hermes/venv.ts` (`findPythonForRoot`, `findSystemPython`, `getVenvPython`, `venvRootForPython`, `isCommandScript`, `unwrapWindowsVenvHermesCommand`), `legacy-hermes/home.ts` (`resolveHermesHome` + the paths), and the new leaves `host-capabilities/platform/{platform-facts,executables,pathext}.ts`, `host-capabilities/filesystem/fs-probe.ts`, `app/user-data.ts` | **Yes** — verbatim, including `findSystemPython`'s three-pass Windows enumeration and its refusal to fall back to a bare `python.exe`. Moving `buildPathExtCandidates` here also removed a real inversion: the platform capability had to import the Hermes adapter to ask a generic Windows question. |
| E5b | `1d07ec4` | main.ts's non-Hermes implementations | `main.ts` | `app/{power-state,downloads,spellcheck,persisted-flags}.ts`, `host-capabilities/preview/{favicon-cache,fetch-policy,media-registration}.ts`, `host-capabilities/filesystem/{composer-image,project-dir}.ts`, `host-capabilities/git/gh-binary.ts`, `windows/{quick-entry-settings,found-in-page,translucency-persistence,active-work-throttle}.ts`, and the placement verbs folded into `windows/windows-composition.ts` | **Yes.** `main.ts`: 2,485 → 1,933. The placement verbs went into `windows-composition.ts` rather than a new file because that module already owns the HUD state — a new module would have made the two import each other, and that cycle (windows-composition → main.ts) is now gone. |
| E5c | `434fc2f` | main.ts's Hermes-adjacent implementations | `main.ts` | `legacy-hermes/{gateway-connection,pool-revalidation,ssh-inventory,preview-reach,managed-requests,first-run-continuation,cloud-agents}.ts`, appends to `legacy-hermes/{api-transport,connections-composition,first-run-setup-gate}.ts`, `app/quit-prompt.ts` | **Yes.** `main.ts`: 1,933 → 1,087 and **zero function declarations** — only the startup sequence, 12 wiring consts, 13 IPC registrars and the lifecycle handlers. `legacy-hermes/first-run-continuation.ts` is a separate file from the gate on purpose: importing the composition root into `first-run-setup-gate.ts` dragged Electron into a node-env test and broke four test files, which the suite caught. |

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

### What E5a–E5c did and did not finish

- **`main.ts` is now startup order and composition, and nothing else.** It holds
  1,087 lines: the Electron startup statements, 12 module-wiring consts, 13 IPC
  registrar calls, the `app.on(...)`/`whenReady` handlers, and the quit-sequencing
  flags those handlers both read and assign. `grep -cE '^(async )?function ' main.ts`
  is **0**. The remaining length is the registrar deps objects, which are the
  composition the file exists for.
- **`composition/` is down to two modules**, and only one of them is a problem.
  `api-proxy-composition.ts` (1,479) assembles the authenticated `/api` proxy and
  its caches. `bootstrap-env-composition.ts` (7,526) is still the knot: it owns the
  Desktop's boot state machine *and* implements the Hermes local-backend launch.
- **That last one cannot be moved without first breaking a cycle, and this is the
  recorded dependency knot.** `startHermes()` (the primary launch, with the spawn at
  `:6529`) and `spawnPoolBackend()` (the per-profile launch) are *called from* the
  composition root in five places — including three boot-recovery paths — and they
  *call back into* its boot state machine: `advanceBootProgress` (5×),
  `updateBootProgress`, `backendConnectionState`, `connectionAttempt`,
  `primaryProfileKey`, `runPrimaryBackendStartup`, `setWslBridgeProfileState`. Moving
  the launch to `legacy-hermes/` therefore makes the two modules import each other.
  That is a real mutual dependency, not a difficult edit, so the production path is
  kept where it is (the refactor's own stop condition) and the cycle is written down.
- **The first step out of it is named in §8 step 3, and it is not the launch.** The
  boot-progress and bootstrap-state cluster (`bootProgressState`, `advanceBootProgress`,
  `updateBootProgress`, `broadcastBootstrapEvent`, the liveness/tracking records) has
  to become a Desktop-host leaf first — it is what the launch cluster actually needs.
  With it extracted, the launch cluster depends on a leaf instead of on the root, the
  cycle disappears, and the spawn can move without touching boot behaviour.
- **`composer-image.ts`, `project-dir.ts` and `quit-prompt.ts` are host-side, not
  Hermes-side**, which is why they are under `host-capabilities/filesystem/` and
  `app/` rather than in `legacy-hermes/`: the first two are filesystem executors with
  their policy (extension normalization, install-tree exclusion) intact, and the quit
  prompt is a Desktop interaction.

### Target-directory status after E5

| Target directory | Exists? | Populated? |
|---|---|---|
| `app/` | yes | yes — 17 modules, 1,405 lines |
| `windows/` | yes | yes — 35 modules, 5,392 lines |
| `host-capabilities/` | yes | yes — 54 modules, 11,452 lines, six areas + the typed contract |
| `process/` | yes | yes — 8 modules, 859 lines |
| `workcore/` | yes | contract + slot + fixture only — 2 production modules, 198 lines; no implementation |
| `host-bridge/` | **no** | deliberately uncreated: it needs a Work Core consumer to have a shape |
| `ipc/` | yes | yes — 11 modules, 2,493 lines, `hermes:*` names unchanged |
| `update/` | yes | yes — 10 modules, 1,908 lines |
| `security/` | yes | yes — 3 modules, 140 lines |
| `legacy-hermes/` | yes | yes — 73 modules, 17,803 lines |
| `composition/` | yes | 2 modules, 9,005 lines — one assembler, one knot (§8 step 3) |

Everything in §3 whose target is not one of those directories is the
`WORKCORE_BACKEND` authority, which cannot move until a Work Core exists.

### The composition root, before and after

| | At `b55355f` | After E5 | After E5a–E5c |
|---|---:|---:|---:|
| `electron/main.ts` | 2,488 | 2,485 | **1,087** |
| `electron/main.ts` function declarations | 53 | 53 | **0** |
| `electron/composition/` | 21 modules, 16,171 | 2 modules, 9,446 | 2 modules, 9,005 |
| `electron/` flat root production modules | 149 | 4 | 4 (entry points + test support) |

The E5 column is why this round did not stop there: moving files out of `main.ts` into
`composition/` would have satisfied a directory diagram and nothing else. E5a–E5c moved the
*implementations* — the Hermes probes into `legacy-hermes/`, the host-side concerns into
`app/`, `windows/` and `host-capabilities/` — and left `main.ts` as the startup sequence and
the composition it exists to express. `composition/` is not empty; the one module that still
implements rather than assembles is the knot named in §8 step 3, with its cycle written out.

## 8. The next vertical chain (not started)

The safest first vertical chain, named so a later round can begin without re-deriving it:

> `backend-command.ts` + `backend-probes.ts` + `backend-env.ts` → a single `legacy-hermes/resolve.ts`
> hiding behind `interface HermesBackendLifecycle { resolve(); launch(); readiness(); descriptor();
> restart(); shutdown() }`, consumed by `main.ts` through one composition call.

**Step 1 (E2, done): argv/env assembly.** `legacy-hermes/lifecycle.ts` now owns it; the composition
root contains no Hermes argv literal and no backend env object.

**Step 2 (E5a, done).** The `serve`-support detection cluster and the constants it
read are out of the composition root: `backendSupportsServe`, `findPythonForRoot`,
`isHermesSourceRoot`, `venvRootForPython`, `unwrapWindowsVenvHermesCommand` and
`resolveHermesHome` now live in `legacy-hermes/{resolution,venv,home}.ts`, over new
platform leaves (`host-capabilities/platform/{platform-facts,executables,pathext}.ts`,
`host-capabilities/filesystem/fs-probe.ts`).

**Step 3 (next, and it starts with the boot-progress refactor, not the spawn).** Extract
the Desktop-host boot-progress/bootstrap-state cluster out of
`composition/bootstrap-env-composition.ts` into `app/boot-progress.ts`:
`bootProgressState`, `advanceBootProgress`, `updateBootProgress`, `broadcastBootstrapEvent`,
`firstRunSetupGate`, and the bootstrap failure/latch accessors the IPC layer already reads
through accessors. That cluster is *what the launch code calls back into*, so extracting it
is what breaks the cycle recorded above. Only then move `startHermes` / `spawnPoolBackend`
into `legacy-hermes/local-backend.ts`. Do not attempt the second half first: with the cycle
still present, the move makes the composition root and the launch cluster import each other.

**Step 4 (after that).** `composition/api-proxy-composition.ts` becomes an assembler: its
title/favicon cache plumbing and `mimeTypeForPath` belong with the preview capability, and
`postJsonForBackend` has already moved to `legacy-hermes/gateway-connection.ts`.

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
| `npx vitest run --project electron` (the surface this round changed) | 2 files / 4 tests failed — the pre-existing pair only; 2,162 passed |
| `npm run --workspace apps/desktop test` (full) | see "The renderer suite is red for a reason outside this round" below |

### Pre-existing failures, and what is NOT a regression

Baseline at `b55355f`, same full-suite command:

| | Files | Tests |
|---|---|---|
| Baseline `b55355f` | 3 failed / 923 passed / 2 skipped (928) | 5 failed / 9,584 passed / 6 skipped (9,595) |
| After E5 | 3 failed / 929 passed / 2 skipped (934) | 6 failed / 9,607 passed / 6 skipped (9,619) |
| After E5c | 3 failed / 932 passed / 2 skipped (937) | 7 failed / 9,622 passed / 6 skipped (9,635) |

The three failing **files** are the same in all three runs:

- `electron/.../api-transport.test.ts` — a live-loopback timing assertion.
- `electron/.../mcp-oauth-callback-ipc.test.ts` — loopback `ECONNREFUSED`. This file
  reports 2 failures in the full baseline run and 3 when run alone, and it does so **at
  `b55355f` too** (verified by stashing this round's changes), so the 2↔3 difference is
  order-dependent rather than new.
- `src/store/voice-prefs.test.ts` — `expected 'false' to be null`.

The +files and +passing tests are this round's new test files. One extra failure appeared
after E5b (`src/themes/import-boundary.test.ts`, 2 tests); it passes in isolation, twice,
and it reads only `src/themes/**` — it cannot be affected by an `electron/` change.

### The renderer suite is red for a reason outside this round

The final full run reported 16 failing files / 55 failing tests, all in the `ui` project.
They are not attributable to this round, and the evidence is specific:

- **This round's committed renderer diff is empty.** `git diff b55355f..HEAD -- apps/desktop/src`
  is not empty, but nothing in it was written by this round — see the contamination note
  below. No `electron/` change can alter a `src/theme-composition` or `src/app/settings` test.
- **A concurrent task is refactoring the renderer in the working tree right now.** `src/`
  currently has 62 modified files, 16 new untracked files, and **1 deleted file**:
  `src/app/settings/field-copy.ts`. Seven files still import or reference it
  (`src/app/settings/constants.ts`, `config-field.tsx`, `settings-search.ts`, four
  `src/i18n/*`). That is a half-applied refactor, which is exactly what makes the settings,
  i18n, theme-composition, messaging, skills and hermes-bots suites fail at once.
- The failing test *files* are themselves unmodified; they fail because the modules they
  import are mid-edit.

### Contamination this round caused, recorded plainly

Two of this round's commits staged with `git add -A apps/desktop` and therefore captured
**another task's uncommitted renderer work**:

| Commit | What it captured |
|---|---|
| `bca7e78` (E2) | `src/app/settings/pool-limits-setting.tsx` (the `pool-limits` import path) |
| `3dfbf9a` (E5) | `src/components/chat/{diff-body,diff-lines}.tsx`, `src/lib/preview-annotate/{group,model,pack}.ts`, `src/app/settings/pool-limits-setting.tsx`, `src/AGENTS.md` |

The earlier POC mis-staging (`bca7e78`, `3dfbf9a` → repaired in `5fae0dc`) was the same
mistake. It is not repaired this time: unlike the POC files, these are real product files
that belong in the repository, so there is nothing to untrack — the defect is that a
mid-flight snapshot of someone else's work landed under this round's commit messages, and
that snapshot may itself be the half-applied state some renderer tests trip over. History is
not rewritten (standing instruction), so this is recorded rather than undone.

**The consequence for review:** do not read the `ui` project's red state as this round's
regression, and do not read this round's commit range as containing only `electron/` changes.

### Boot smoke (isolated sandbox)

Each run gets its own `HERMES_HOME`, its own Electron userData and a distinct app name, so it
cannot touch a real instance or its single-instance lock. Residual detection reads
`/proc/<pid>/environ`, not the command line — an Electron child does not carry `HERMES_HOME`
in its argv, so a `pgrep -f` check misses exactly the orphans it exists to catch (which is how
a first attempt at this measurement reported "zero residue" while an orphan was still running).

| Variant | Verdict | Alive after verdict | Residual processes |
|---|---|---|---|
| with external Hermes (`v0.19.0` on PATH) | `Hermes backend is ready. Finalizing desktop startup` | yes | none |
| no Hermes reachable | `errorCode=HERMES_EXECUTABLE_NOT_FOUND` (typed) | yes | none |

Re-run after each of E5a, E5b and E5c with the same result. Observed with-Hermes ladder:
`Resolving Hermes backend` → `Resolving Hermes runtime` → `Using existing Hermes CLI at …` →
`Starting Hermes backend …` → `Waiting for Hermes backend to launch` → `Waiting for Hermes
backend to become ready` → ready.

One honest caveat about the second variant: reaching it requires `HERMES_DESKTOP_HERMES`
**unset**. An explicit override is trusted verbatim
(`legacy-hermes/backend-probes.ts::shouldTrustHermesOverride`), so pointing it at a bogus path
selects that path as the runtime and produces a spawn/ownership failure instead. That is
pre-existing, deliberate operator-override behaviour and was not changed here.
