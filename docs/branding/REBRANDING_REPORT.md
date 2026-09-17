# Rebranding report — AgentBox → Ordessa (desktop side)

Order: `docs/desktop-product-delivery/work-orders/P18-ordessa-rebrand.md` (paired with backend 61, Pacthold).
Branch: `feature/agentbox-desktop-product`. This report is maintained as the work lands; §5 records what is
verified and what is not.

## 1. Mapping

| Before | After | Class |
| --- | --- | --- |
| `AgentBox` (the application, in user-visible copy) | `Ordessa` | own brand |
| `AgentBox Desktop`, `Hermes Desktop` (self-description) | `Ordessa` | own brand |
| `the AgentBox service`, `AgentBox backend` | `the Pacthold service` / `Pacthold` | paired service name |
| `agentbox-session-*` DOM hooks, `data-agentbox-*`, i18n key names, TS identifiers | unchanged | internal identifiers (order §2) |
| `AGENTBOX_SERVER_ROOT`, `AGENTBOX_SERVER_PORT` | unchanged; `ORDESSA_*` added as **winning aliases** | compatibility-sensitive |
| `hermes` harness family, `hermes` binary, native dirs, `@hermes/shared` package | unchanged | third-party / cross-repo |
| upstream licence, copyright, NOTICE | unchanged | attribution |

## 2. Identity (application metadata)

| Field | Before | After |
| --- | --- | --- |
| `name` | `hermes` | `ordessa` |
| `productName` | `Hermes` | `Ordessa` |
| `description` | Native desktop shell for Hermes Agent. | Native desktop client for Pacthold. |
| `build.appId` | `com.nousresearch.hermes` | `com.ordessa.app` |
| `build.executableName` | `Hermes` | `Ordessa` |
| `build.artifactName` | `Hermes-…` | `Ordessa-…` |
| `build.protocols` | `Hermes Protocol` / `hermes` | `Ordessa Protocol` / `ordessa` |
| `author` | `Nous Research` | **unchanged** (attribution of the upstream shell) |
| `repository` | upstream URL | **unchanged** (source provenance) |

Lockfile: the workspace entry (`packages["apps/desktop"].name` and `node_modules/<name>`) follows the rename;
no dependency was added, removed or bumped.

**Update channel:** there is none — no `electron-updater` dependency, `pack` publishes nothing
(`--publish never`), and the `build` section declares no `publish`. Nothing to disable, and no new URL invented.

## 3. Old data and the URL scheme

Renaming the application identity resets **Ordessa's own userData** (localStorage, window preferences).
Profiles, Sessions, credentials and the whole service data root are **not** in that directory and are
untouched. Per the order: **no migration**, nothing deleted, and `ordessa://` no longer competes with the
upstream `hermes://` registration.

## 4. Assets (from `/home/maoqh/projects/agent-box-brand/`, see its `KIT.md`)

Placed: `apps/desktop/assets/icon.png|.ico|.icns` ← the Ordessa icon set; `public/apple-touch-icon.png`
regenerated at 180×180 from `ordessa-256.png`; the in-app brand badge now draws the **Ordessa mark**
(`currentColor` SVG) instead of the upstream `nous-girl.jpg`; README banner uses `ordessa-lockup.png`.
Public assets that belonged to the upstream shell are listed per item in §5 with what happened to each.

Fidelity, carried over from the kit and NOT to be smoothed over: the mark's SVG is an **auto-trace** from a
~200px raster, the wordmark/tagline are **text raster** (not vector), and the **16px icon is faithful to the
original proportions, so its strokes read thin**. A release-grade 16px variant needs the designer.

## 5. Verification

| Gate | Result |
| --- | --- |
| G1 mapping and retention list | **done** — §1 and `NAMING.md` |
| G2 new name visible | **done** — window title `Ordessa` (index.html), `productName`, README banner `Ordessa, powered by Pacthold`, in-app brand badge = Ordessa mark, build log header `ordessa@0.17.2`; acceptance screenshots in `evidence/P18-ordessa/` |
| G3 identity + old-data handling | **done** — §3 (`com.ordessa.app`, `ordessa://`, userData reset stated, service data untouched, no migration) |
| G4 launch smoke | **partial** — the P06 acceptance driver ran the rebuilt app under the new identity in an isolated sandbox: **28/28 PASS, allOk=true** (`evidence/P18-ordessa/`), incl. clean exit, no legacy REST, no runtime process. The full form (connect to a running Pacthold + one no-model round) is **not** exercised by that driver and remains for the integration owner: `node e2e/p42-fullstack-integration-driver.mjs …` against a running service |
| G5 harness name / native protocol / third-party attribution untouched | **done** — `hermes` family untouched; cross-repo contracts unchanged with `ORDESSA_*` aliases tested; upstream attribution kept (README licence section, `author`, `repository`) |
| G6 no test-count regression | **done** — UI 805/806 (the one failure is the POSIX-`sh` plugin test, a Windows-environment baseline, file untouched); tests-js 8 files passed; electron project on Windows has a large pre-existing POSIX-environment failure set (ssh/symlink/`/bin/sh`), recorded as baseline, none naming-related |


## 6. Per-item disposition of `public/` assets (order §3-F item 4)

| Asset | Disposition |
| --- | --- |
| `nous-girl.jpg` | **removed** — upstream brand graphic; the in-app badge now draws `ordessa-mark.svg` (`brand-mark.tsx`) |
| `hermes.png`, `hermes-sprite.png`, `hermes-frames/` | **removed** — unreferenced by any source, test, script or HTML after the rename (verified by repo-wide search before removal) |
| `apple-touch-icon.png` | **replaced** — regenerated 180×180 from the Ordessa icon set |
| `ds-assets/` (filler background used by `Backdrop.tsx`) | **kept** — still referenced; not a brand graphic |
