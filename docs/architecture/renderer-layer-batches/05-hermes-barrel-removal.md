# Batch 05 — remove the `@/hermes` compatibility barrel

**This is not layer debt.** It pays off no ledger entry and it is not part of the
sequence in [`README.md`](README.md) — it is a separate mechanical objective that
happens to share the same discipline. It is in this directory because the
eventual master policy document should see the whole mechanical stack in one
place.

Read [`README.md`](README.md) first for the shared rules (no widening, explicit
pathspecs, the in-flight paths, `--fix` hygiene) and the verification recipe.
They all apply. The extra rules this batch needs are in §6.

## 1. What it is

`apps/desktop/src/hermes.ts` is a 133-line barrel with no implementations: 9
runtime values plus 1 type from `./api/client`, `export *` over 12 API domain
modules, and a 100-name type block from `@/types/hermes`. Every backend call used
to live in that one file; the implementations were split into `api/` and the
barrel stayed behind so no call site had to change.

Why it is worth removing: `api/` is the bottom of the renderer's dependency
graph — it sends requests and depends on nothing. The barrel lets *any* module
reach back into `api/` through a path that looks like a leaf, which is why the
repo carries a rule forbidding `api/` from importing its own barrel. A shim that
needs a dedicated guard to stop it becoming a cycle is the cost of keeping it.

## 2. Verified state (re-measure before starting)

| | count |
| --- | --- |
| files referencing `@/hermes` in any form | 240 |
| lines matching `from '@/hermes'` | 189 |
| of those, `import type … from '@/hermes'` | 52 |
| `vi.mock('@/hermes', …)` files | 80 |
| namespace import (`import * as hermes`) | 1 |
| dynamic `import('@/hermes')` | 9 |
| `require('@/hermes')` fixture strings | 1 |
| consumers by layer | `app` 92, `store` 24, `components` 9, `lib` 7, `extension` 5, `application` 3 |

**An earlier draft of this work order carried stale numbers** (167 files / 183
lines / 13 domains / "the contract tests live in `api/`"). Three corrections that
matter:

- The 12 `export *` domains are **12**, not 13. The thirteenth module is
  `api/client.ts`, which the barrel names symbol by symbol rather than with `*`.
- The eight barrel contract tests are **in `dev/contracts/`**, not `api/` — they
  were moved there in an earlier round. See §5.
- The type-migration rule in that draft was **wrong**; see §3.

## 3. The mapping rule — the core of this batch

Resolve every imported symbol **by name** against the table below. **The owning
module is the destination. Whether the symbol is a type does not determine where
it goes.**

That last sentence is the trap. A draft of this order said "type imports become
`@/types/hermes`, except `ProfileScope`". That is false for 4 symbols and 23
occurrences, because some API modules define their own types:

| symbol imported as a type | actually lives in | occurrences |
| --- | --- | --- |
| `HermesGateway` | `@/api/client` | 18 |
| `McpTestResult` | `@/api/mcp` | 2 |
| `ProfileScope` | `@/api/client` | 2 |
| `SidebarSessionsResponse` | `@/api/sessions` | 1 |

`@/types/hermes` is the destination for exactly the **100 names in the barrel's
own type block** (`hermes.ts` lines 33–132) and nothing else.

Mapping is deterministic: the 193 named exports across the 13 API modules have
**zero name collisions**, verified. Derive the table from the barrel rather than
trusting the copy below if you find a discrepancy — but report the discrepancy.

### The table

- **`@/types/hermes`** (100, the barrel's type block) — `ActionResponse`…
  `WebhooksResponse`. Take the authoritative list from `hermes.ts` lines 33–132.
- **`@/api/client`** (15 exports; the barrel exposes 10 of them): `HermesGateway`,
  `PROMPT_SUBMIT_REQUEST_TIMEOUT_MS`, `ProfileScope`, `STARTUP_REQUEST_TIMEOUT_MS`,
  `getApiRequestConnection`, `getApiRequestProfile`, `hermesApi`, `profileScopeKey`,
  `setApiRequestConnection`, `setApiRequestProfile`.
  **The other five — `capabilityScoped`, `connectionScoped`, `hasHermesApiBridge`,
  `profileScoped`, `requestHermesApi` — are client internals.** They are not
  reachable from `@/hermes`; do not introduce them into a call site while
  migrating. (Some call sites already import `capabilityScoped` / `profileScoped`
  directly; that is pre-existing and out of scope — do not widen it.)
- **`@/api/system`** (29): `AUDIO_SPEAK_MAX_REQUEST_TIMEOUT_MS`,
  `AUDIO_SPEAK_MIN_REQUEST_TIMEOUT_MS`, `AUDIO_TRANSCRIBE_MAX_REQUEST_TIMEOUT_MS`,
  `AUDIO_TRANSCRIBE_MIN_REQUEST_TIMEOUT_MS`, `AUDIO_TTS_LEASE_REQUEST_TIMEOUT_MS`,
  `audioSpeakRequestTimeoutMs`, `audioTranscribeRequestTimeoutMs`,
  `checkHermesUpdate`, `getActionStatus`, `getCuratorStatus`, `getElevenLabsVoices`,
  `getGhAuthStatus`, `getMemoryProviderConfig`, `getMemoryProviderOAuthStatus`,
  `getMemoryStatus`, `resetMemory`, `restartGateway`, `runBackup`, `runCurator`,
  `runDebugShare`, `runDoctor`, `runSecurityAudit`, `saveMemoryProviderConfig`,
  `setCuratorPaused`, `setTtsLease`, `speakText`, `startMemoryProviderOAuth`,
  `transcribeAudio`, `updateHermes`
- **`@/api/config`** (24): `activateCustomEndpoint`, `cancelOAuthSession`,
  `deleteCustomEndpoint`, `deleteEnvVar`, `disconnectOAuthProvider`,
  `getCustomEndpoints`, `getEnvVars`, `getHermesConfig`,
  `getHermesConfigDefaults`, `getHermesConfigRecord`, `getHermesConfigSchema`,
  `getLogs`, `getStatus`, `listOAuthProviders`, `pollOAuthSession`,
  `revealEnvVar`, `saveCustomEndpoint`, `saveHermesConfig`,
  `saveHermesConfigRecord`, `setEnvVar`, `startOAuthLogin`, `submitOAuthCode`,
  `validateCustomEndpoint`, `validateProviderCredential`
- **`@/api/sessions`** (22): `LATEST_SESSION_MESSAGES_LIMIT`, `SessionSourceFilter`,
  `SidebarSessionSlice`, `SidebarSessionsRequest`, `SidebarSessionsResponse`,
  `deleteSession`, `fetchAllProfileSessionsPage`, `fetchLatestSessionMessages`,
  `fetchSessionsPage`, `fetchSidebarSessions`, `getAllSessionMessages`,
  `getOlderSessionMessages`, `getSession`, `getSessionMessages`,
  `pageWindowSessions`, `renameSession`, `resetSidebarBatchCapability`,
  `scanSessionPullRequests`, `searchSessions`, `setSessionArchived`,
  `setSessionPinnedRemote`, `setSessionUnreadRemote`
- **`@/api/local-models`** (19): `HFFileGroup`, `HFSearchHit`, `QuickstartResponse`,
  `activateLocalModel`, `deleteLocalModel`, `downloadBrowsedModel`,
  `downloadLocalModel`, `ejectLocalModel`, `getLocalCatalog`, `getLocalHardware`,
  `getLocalModelsJobs`, `getLocalModelsStatus`, `getLocalRuntimeJob`,
  `installLocalRuntime`, `listHFRepoFiles`, `quickstartLocalModels`,
  `searchHFModels`, `setLocalServer`, `sideloadLocalModel`
- **`@/api/skills`** (16): `LearningNodeDetail`, `deleteLearningNode`,
  `editLearningNode`, `getLearningNode`, `getOfficialSkills`, `getSkillContent`,
  `getSkillHubSources`, `getSkills`, `getStarmapGraph`, `installSkillFromHub`,
  `previewSkillHub`, `scanSkillHub`, `searchSkillsHub`, `setSkillEnabled`,
  `uninstallSkillFromHub`, `updateSkillsFromHub`
- **`@/api/cron`** (12): `createCronJob`, `deleteCronJob`,
  `getAutomationBlueprints`, `getCronDeliveryTargets`, `getCronJob`,
  `getCronJobRuns`, `getCronJobs`, `instantiateAutomationBlueprint`,
  `pauseCronJob`, `resumeCronJob`, `triggerCronJob`, `updateCronJob`
- **`@/api/toolsets`** (12): `SelectToolsetProviderResponse`, `getComputerUseStatus`,
  `getTerminalBackends`, `getToolsetConfig`, `getToolsetModels`, `getToolsets`,
  `grantComputerUsePermissions`, `runToolsetPostSetup`, `selectTerminalBackend`,
  `selectToolsetModel`, `selectToolsetProvider`, `setToolsetEnabled`
- **`@/api/messaging`** (11): `approvePairing`, `createWebhook`, `deleteWebhook`,
  `enableWebhooks`, `getMessagingPlatforms`, `getPairing`, `getWebhooks`,
  `revokePairing`, `setWebhookEnabled`, `testMessagingPlatform`,
  `updateMessagingPlatform`
- **`@/api/mcp`** (10): `McpOAuthFlow`, `McpTestResult`, `addMcpServer`,
  `getMcpCatalog`, `installMcpCatalogEntry`, `listMcpServers`, `removeMcpServer`,
  `saveMcpServers`, `setMcpServerEnabled`, `testMcpServer`
- **`@/api/models`** (10): `RecommendedDefaultModel`, `getAuxiliaryModels`,
  `getGlobalModelInfo`, `getGlobalModelOptions`, `getMoaModels`,
  `getRecommendedDefaultModel`, `getUsageAnalytics`, `saveMoaModels`,
  `setGlobalModel`, `setModelAssignment`
- **`@/api/profiles`** (9): `createProfile`, `deleteProfile`,
  `exportProfileArchive`, `getProfileSetupCommand`, `getProfileSoul`, `getProfiles`,
  `importProfileArchive`, `renameProfile`, `updateProfileSoul`
- **`@/api/plugins`** (4): `PluginRestOptions`, `activeConnection`, `pluginRest`,
  `pluginSocket`

One import line may name symbols from several modules — **split it**. One symbol
never belongs to two modules.

`api/client.ts` is the single address of the platform bridge
(`requestHermesApi` / `hermesApi`); no other file may name
`window.hermesDesktop.api`. Migration must not change that.

## 4. Phases

Each phase is committed on its own and must be fully green before the next one
starts.

### Phase A — type imports (52 lines)

Rewrite every `import type { … } from '@/hermes'` to its owning module per §3.
Split lines that span modules. Keep the `import type` form — never let a type
import become a runtime import.

Commit: `refactor(desktop): import api types from their owning modules`

Run `typecheck` plus the tests for the files you touched; the full suite is not
required at this gate, because a type-only change cannot alter runtime behaviour.

### Phase B — production value imports

Rewrite every `from '@/hermes'` in **non-test** files that carries a runtime
value. Split cross-module lines. Also handle:

- the namespace import in `app/settings/local-models-settings.test.tsx` — that is
  a test file, so it belongs to Phase C, but note it: rewrite it to concrete
  imports of the symbols it actually uses.
- the 9 dynamic `await import('@/hermes')` — split if one destructuring spans
  domains.

Leave `vi.mock('@/hermes', …)` alone; that is Phase C. **If a test file's runtime
import changes and its mock has not, that test will fail — move the whole file to
Phase C rather than faking a mock to keep it green.**

At the end of Phase B no non-test file may contain `from '@/hermes'`.

Commit: `refactor(desktop): import api functions from their domains`

### Phase C — test mocks (80 files, batched by domain)

A `vi.mock('@/hermes', …)` stops intercepting anything the moment the barrel goes
— the test either errors or, worse, **silently reaches a real network call and
may still pass.**

Rewrite each mock to target the `@/api/<domain>` modules that file's production
code now imports. A file may need several. The mock's symbol set must match the
domain's real exports: extra symbols are a TS error, missing ones make the test
silently false. Do not add a symbol the domain does not export to make a test go
green.

Batch order, smallest reference count first, one commit per batch, full suite
green before the next:

1. `local-models`, `cron`, `messaging`
2. `models`, `mcp`, `skills`, `toolsets`, `config`
3. `sessions`, `profiles`, `system`, `plugins`

Commit per batch:
`test(desktop): mock the api domain instead of the hermes barrel (<domain>)`

**This phase is where "green but wrong" hides.** After each batch, open 1–2 of the
files you changed and confirm the mock's target module is exactly the module the
production code now imports — symbol for symbol — and say in your report which
files you checked and what you compared.

### Phase D — delete the barrel and clean up what existed for it

1. Delete `apps/desktop/src/hermes.ts`.
2. Decide the fate of the eight barrel contract tests, now in `dev/contracts/`:
   `hermes.test.ts`, `hermes-capability-scope.test.ts`, `hermes-cron-scope.test.ts`,
   `hermes-parity.test.ts`, `hermes-profile-scope.test.ts`, `pairing-scope.test.ts`,
   `plugin-socket-scope.test.ts`, `webhooks-rest.test.ts`.
   **The behaviour they assert must stay covered.** For each one: if an
   `api/<domain>.test.ts` already covers it, delete it and name the covering test
   in the commit message; if it is the only coverage, retarget it at
   `@/api/<domain>` and keep the assertions. Do not delete the set wholesale.
3. **Retarget the guards that name the barrel** — see §5. This is the part an
   earlier draft of this order missed.
4. Drop the `'hermes.ts': 0` entry from `ROOT_RANKS` in
   `apps/desktop/src/dev/contracts/renderer-layers.ts`; the layer model should not
   claim a file that no longer exists.
5. Update prose: `AGENTS.md`, `apps/desktop/AGENTS.md`,
   `apps/desktop/src/AGENTS.md`, and anything under `docs/**` that describes
   `@/hermes`. `apps/desktop/src/AGENTS.md` says `application/` must not be
   re-exported from the `@/hermes` barrel — with the barrel gone that sentence
   needs **rewriting to the surviving invariant** (application use-cases are not
   re-exported from anywhere), not deleting.

Commit: `refactor(desktop)!: remove the hermes compatibility barrel`

## 5. The guards that name the barrel — do not just delete the branch

Three test files encode `@/hermes` as a **rule**, not as a fixture:

| file | how it names the barrel |
| --- | --- |
| `api/import-boundary.test.ts` | `BARREL = 'hermes.ts'`, the `@/hermes` branch in `upperLayerOfSpecifier` / `upperLayerOfPath`, one reverse-control case, one closure-control graph |
| `store/session-store-purity.test.ts` | `BARREL`, an `@/hermes` branch in `forbiddenSpecifier` / `forbiddenPath`, plus fixtures |
| `store/profile-store-purity.test.ts` | the same shape |
| `store/store-boundaries.test.ts` | `'hermes.ts'` / `'hermes/'` in two forbidden lists, plus `@/hermes` reverse-control fixtures |

The question that matters: **does removing the branch leave a hole?** Verified:
**no.** All three guards already list `'api'` as a forbidden zone —
`store/session-store-purity.test.ts:48` and `store/profile-store-purity.test.ts:48`
both have `FORBIDDEN_ZONES = ['api', …]`, and
`store/store-boundaries.test.ts:53` has `'api/'` in `SESSION_STATE_FORBIDDEN`.

So once the 24 `store/` files that currently reach `@/hermes` import
`@/api/<domain>` instead, the `api` zone catches them. The barrel branch was
belt-and-braces on top of a rule that already holds.

Therefore:

- Delete the barrel-specific branch, the `BARREL` constant, and the `hermes.ts` /
  `hermes/` list entries. The `api` rules stay.
- **Retarget the reverse controls, do not delete them.** A reverse control whose
  fixture names a deleted path proves nothing. Point each at a specifier that is
  still forbidden, so the control still demonstrates the scanner can fail.
  `api/import-boundary.test.ts:314`, `store/profile-store-purity.test.ts:386,397`,
  `store/session-store-purity.test.ts:302` and `store/store-boundaries.test.ts:447,515,526,527`
  all need this treatment.
- Keep every other rule in `api/import-boundary.test.ts`: direct specifiers,
  `import()`/`require()`/`vi.mock()`, the transitive closure walk, the bridge-owner
  rule, and the remaining reverse controls.

## 6. Ordering against batches 01–04

The barrel removal touches 240 files; batches 01–04 touch about 100. They overlap
(for example `app/session/hooks/use-session-actions/session-create.ts` imports
`@/hermes` and is repointed by both 01 and 03). **Run 05 either entirely before or
entirely after the layer batches — never interleaved.**

Preferred: **05 first.** It is the larger and more mechanical change, its Phase C
is the one that can go quietly wrong, and afterwards the layer batches operate on
files that no longer mention the barrel. Doing it second would mean re-finding
paths that 01–04 moved.

05 does not touch `renderer-layers.debt.ts` — `@/hermes` is rank 0, so no edge to
it is upward — so it does not contend with the layer batches for the ledger. The
file overlap is the only conflict.

## 7. Gates

Per phase, all must hold:

```bash
cd apps/desktop
npm run typecheck                                # 3 tsc projects, exit 0
npm run test:ui                                  # 773 files / 7463 tests at start; never below
npx vitest run --project electron                # expect exactly the 4 known failures
npx eslint <files this phase changed>            # 0 errors
git diff --check                                 # clean
```

Baseline measured before this work: **773 files / 7463 tests, 0 failures**. The 4
expected electron failures are `electron/legacy-hermes/api-transport.test.ts` (1,
live-timing) and
`electron/host-capabilities/credentials/mcp-oauth-callback-ipc.test.ts` (3,
loopback `fetch` ECONNREFUSED). Anything else failing is yours.

After Phase D: `rg "@/hermes" apps/desktop/src` must return nothing.

## 8. Stop conditions

- A symbol imported from `@/hermes` is not in the table in §3 — stop and report
  it. Do not guess a module and do not add a re-export to make it resolve.
- A phase cannot be completed without a behaviour change — stop and report. This
  is a pure mechanical migration.
- A test only passes after you weaken, skip or delete an assertion — stop and
  report. That is the "green but wrong" failure this batch is most exposed to.
- More than the four files in §5 turn out to encode `@/hermes` as a rule.
