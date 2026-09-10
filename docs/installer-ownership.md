# Who owns the Windows installer (`hermes-setup.exe`)

The pruning rounds removed `apps/bootstrap-installer/` — the Tauri "Hermes Setup"
application — from this repository. The Desktop still *uses* a binary that
application produces. That is a consumer without its producer, and this document
records the hand-off explicitly rather than leaving it implied.

**Status: OWNERSHIP_HANDOFF_DECLARED, end-to-end compatibility UNVERIFIED.** The
contract this repository depends on is frozen and covered by tests here; the
cross-product verification is not, and cannot be, performed from this repository.

## What the Desktop actually depends on

| Fact | Where |
|---|---|
| The binary is read from `<HERMES_HOME>/hermes-setup.exe`, Windows only | `electron/updater-process.ts` `resolveStagedUpdaterBinary()` |
| It is *staged there by itself*, not downloaded or built here | installer's own `bootstrap::copy_self_to_hermes_home` |
| During `--update` that staging no-ops, so the binary a user first installed orchestrates every later update | `electron/updater-process.ts` |
| A pre-written update marker must survive the hand-off | `electron/update-marker.ts` + its schema |
| Absent binary ⇒ `handOffWindowsBootstrapRecovery()` returns `false` and the normal bootstrap runs instead | `electron/main.ts` |

The last row is the important one for risk: **this is a soft dependency.** A
machine without `hermes-setup.exe` does not fail — it takes the ordinary
first-run/repair path that this repository still owns end to end
(`scripts/install.ps1`, or the same file downloaded from the pinned ref).

## Platform split, after this round

| Platform | Who orchestrates install and update |
|---|---|
| Windows, fresh install | **this repository** — `scripts/install.ps1` (kept) or the pinned GitHub copy |
| Windows, recovery / update hand-off | **external** — `hermes-setup.exe`; falls back to the repo path when absent |
| macOS / Linux | **this repository** — `scripts/desktop-update/posix.sh` (kept); the old in-app updater is gone |
| Runtime itself (all platforms) | **external** — an installed `hermes`; see `docs/desktop-pruning-phase2.md` §5 |

So the repository still commits to install and update for macOS and Linux, and to
Windows *fresh install*. What it no longer owns is the Windows **recovery
orchestrator**.

## The decision the owner must make

1. **Which repository builds and publishes `hermes-setup.exe`.** It is a Tauri
   application with macOS entitlements of its own, a staging step
   (`copy_self_to_hermes_home`) and an update-marker guard. Candidates: the
   upstream Hermes project alongside the runtime, or a dedicated installer
   repository. Whoever owns it must also own its signing/notarization, because
   the Desktop launches it with user privileges.
2. **How a fresh Windows install obtains it.** Today: opportunistically. If the
   product wants the "setup fast path" (the `/Applications/Hermes.app`-as-launcher
   behaviour the removed app existed for), the app must be delivered by the
   installer the user runs first — which is the same question as (1).
3. **The compatibility policy.** The Desktop's side of the contract is frozen at:
   the `$HERMES_HOME/hermes-setup.exe` path, the update-marker schema, and the
   `--update` argv. A producer that changes any of them must version the change;
   the marker's `schemaVersion` exists for exactly this and is validated on read.
4. **Who runs the cross-product E2E.** It cannot live here: it needs a built
   installer and a Windows runner. The `install-e2e-*.yml` lanes this repository
   used to carry have been removed with the rest of the runtime CI.

## What IS verified here (and what is not)

Verified, by tests that remain in this repository:

- `electron/updater-process.test.ts` — staged-binary path resolution and the
  macOS/Linux "repo-owned POSIX script" hand-off.
- `electron/update-marker.test.ts` — the marker contract the installer must
  honour, including the self-PID exclusion an older installer (pre-#74782) got
  wrong.
- `electron/bootstrap-runner.test.ts` — installer *script* resolution and the
  argument protocol, including the local-script and downloaded-script paths.

Not verified anywhere, and not claimed:

- That a currently-published `hermes-setup.exe` interoperates with this Desktop
  build. There is no producer in this repository and no lane that could run one.
- That the removed `apps/bootstrap-installer/` sources match whatever binary
  users have staged today. The sources are gone; the binary is the only artifact.

Until an owner is assigned and a cross-product lane exists, treat the Windows
recovery hand-off as **supported by contract, unverified in practice** — and keep
the fallback path (`handOffWindowsBootstrapRecovery` returning `false`) working,
because on a machine without the binary it is the only way through.
