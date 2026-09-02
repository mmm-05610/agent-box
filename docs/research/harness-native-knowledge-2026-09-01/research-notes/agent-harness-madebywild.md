# Research note: madebywild/agent-harness

Reviewed: 2026-09-02 from a `--depth 1` clone at `<temp-home>/agent-harness` (HEAD of 2026-08-30, "feat: behavior config for {{behavior.*}} placeholder substitution (#46)"). File:line citations are repo-relative under `packages/`.

## Identity

- Org/repo: madebywild/agent-harness — https://github.com/madebywild/agent-harness
- Language: TypeScript (Node >= 22), pnpm monorepo + Turborepo, Biome, Vitest, React (TUI via Storybook). npm package `@madebywild/agent-harness-framework`; workspace version 1.7.0 (`package.json:4`).
- License: MIT (`package.json:5`, `LICENSE`).
- Last activity seen: commit dated 2026-08-30. Actively maintained with dense commit history and PR numbering in the 40s for the monorepo.
- Official docs: extensive in-repo — `docs/architecture.md` (system model), per-module toolkit docs (`docs/toolkit.*.md`), provider guides (`docs/providers.md`, `docs/cursor-*.md`, `docs/monorepo.md`, `docs/behavior-config.md`), plus a DeepWiki badge.
- Self-description: "The Shadcn for agent harnesses" — single source of truth under `.harness/src/` rendering to provider-native config files for Codex, Claude Code, Copilot, Cursor (`README.md:7-10`). Git-registry model: pull shared entities as full editable source, not opaque imports.

## Architecture summary

Core abstractions (canonical → rendered → managed):

1. **Manifest (declarative workspace state)** — `.harness/manifest.json` parsed by `agentsManifestV1Schema` (`manifest-schema/src/index.ts:145-155`): `providers.enabled` (array of ProviderId), `registries` (default + entries; `local` or `git {url, ref, rootPath, tokenEnvVar}`, `:52-88`), `entities` (discriminated union of 7 entity refs, `:140-148`). Each `entityRefBaseSchema` (`:115-125`) carries `id`, `type`, `registry`, `sourcePath`, optional `target` (monorepo relocation), optional per-provider `overrides` map, optional `enabled`.
2. **Canonical entities** — 7 types, defined twice by design (CLI-side + manifest-side mapping): `CLI_ENTITY_TYPES` and `CLI_ENTITY_TO_MANIFEST_ENTITY` (`toolkit/src/types.ts:14-26`). Canonical shapes at `toolkit/src/types.ts:50-129`: `CanonicalPromptSection {id, body, target?}`, `CanonicalSkill {id, files[{path,sha256}], target?}`, `CanonicalMcpConfig {id, json, target?}`, `CanonicalSubagent {id, name, description, body, metadata, target?}`, `CanonicalHook {id, mode: strict|best_effort, events{handler[]}, target?}` (handlers carry per-OS command variants, `:82-104`), `CanonicalCommand {id, description, argumentHint?, model?, tools?, agent?, body, target?}`, `CanonicalSettings {id: ProviderId, payload, sourceFormat: json|toml}`.
3. **Provider Adapter interface** — `ProviderAdapter` (`toolkit/src/types.ts:150-169`): optional `renderPromptSections`, `renderSkill`, `renderMcp`, `renderSubagent`, `renderHooks`, `renderCommand`, `renderSettings`, `renderProviderState`; every render method takes canonical input plus per-entity `ProviderOverride` and returns `RenderedArtifact[]`. A shared factory `createProviderAdapter(definition, skillFilesByEntityId)` (`provider-adapters/create-adapter.ts:15`) implements the common methods from a `ProviderDefinition {id, defaults, mcpRenderer}` (`provider-adapters/types.ts:18-22`); each provider file specializes (e.g. codex overrides `renderProviderState` to emit a single TOML config, `provider-adapters/codex.ts:27-170`).
4. **Renderer** — pure string/template functions per artifact family: MCP renderers (`provider-adapters/mcp.ts`, codex = TOML `mcp_servers`, `codex.ts:13-24`), hooks (`provider-adapters/hooks.ts`, 448 lines), subagents (`provider-adapters/subagents.ts`). Prompt sections compose by manifest order, joined with `\n\n` (`create-adapter.ts:44-56`).
5. **RenderedArtifact** — `{path, content, ownerEntityId, provider, format: markdown|json|toml}` (`toolkit/src/types.ts:132-138`). `ownerEntityId` is a comma-joined id list for merged artifacts (built with `uniqSorted(...).join(",")` at `create-adapter.ts:56`).
6. **Plan/apply flow** — `HarnessEngine.apply()` (`toolkit/src/engine.ts:526-578`) calls `planInternal()` → `buildPlan()` (`toolkit/src/planner.ts:17-464`); if any error-severity diagnostics exist, apply returns without writing (`engine.ts:529-538`). Otherwise it executes operations sequentially (`create`/`update` write content; `delete` prunes, `engine.ts:544-561`), then rewrites lock and managed-index only if their stable-stringified content changed (`engine.ts:564-572`). `watch` mode re-runs apply on chokidar events with debounce and single-flight+rerun loop (`engine.ts:580-650`).
7. **Ownership/integrity state** — three workspace files: `manifest.json` (intent), `manifest.lock.json` (`ManifestLock`: manifestFingerprint, per-entity source/override sha256s, registry revision pinning, and `outputs[]` with `path/provider/contentSha256/ownerEntityIds`, `manifest-schema/src/index.ts:169-207`), `managed-index.json` (`managedSourcePaths` + `managedOutputPaths`, `:209-213`). Versioning: `LATEST_SCHEMA_MAJOR = 1` with `doctor` + `migrate` commands (`manifest-schema/src/versioning.ts:5`, `toolkit/src/versioning/doctor.ts`, `migrate.ts`).
8. **Registries & presets** — `registry pull` copies entities from git registries into `.harness/src/` with provenance tracked in the lock (`resolvePriorRegistryProvenance`, `planner.ts:466-478`); presets are bootstrap macros, not manifest entities (`docs/architecture.md:32-34`).

Lifecycle: `init` creates the workspace skeleton + empty manifest/lock/managed-index + a generated `.harness/.gitignore` (`engine.ts:92-145`) → `add <entity>` materializes source under `.harness/src/` → `apply` renders to enabled providers → `doctor`/`migrate` police schema versions.

## Required focus points

### Canonical entities
Listed above with citations (`toolkit/src/types.ts:14-26, 50-129`; schema `manifest-schema/src/index.ts:10-17, 115-148`). Settings is the odd one: one entity per provider, id = provider id. `command` entities exist at the CLI level but the README/architecture note that Cursor emits neither prompt nor command (`provider-adapters/constants.ts:44-49`).

### Provider Adapter interface
`toolkit/src/types.ts:150-169` (quoted shape above). All render methods optional — the planner feature-detects (`planner.ts:38,62,79,111,132,146,170,190`). The `renderProviderState` escape hatch (`types.ts:168`) lets a provider merge MCP + subagents + hooks + settings into one file (Codex's `config.toml`, Copilot's `harness.generated.json`), with `else if (adapter.renderMcp)` fallback at `planner.ts:111`.

### Renderer
Per-family pure functions; prompt composition is order-preserving from manifest entity order (`create-adapter.ts:36-56`); MCP merging via `mergeMcpServers` (`provider-adapters/mcp.ts`); hooks render per-provider event maps with strict vs best_effort modes (`provider-adapters/hooks.ts`).

### RenderedArtifact
`toolkit/src/types.ts:132-138`. Path is normalized relative (`normalizeRelativePath`), format constrained to markdown/json/toml — i.e. artifacts are always whole files, never patch/diff or binary.

### Plan/apply flow
`buildPlan` (`planner.ts:17`): (1) render all artifacts from enabled providers (`:30-206`); (2) dedupe by path with collision diagnostics (`:208-253`); (3) diff desired paths against disk + managed set to produce `create|update|noop|delete` operations (`:255-312`); (4) compute next lock + managed index with content-hash records (`:314-446`). Apply executes only when no error diagnostics (`engine.ts:529-538`) — a two-phase, generate-then-commit model with a dry-runable plan.

### Output ownership rules (who owns which files)
Three-tier: (1) only paths recorded in `managedIndex.managedOutputPaths` may be updated; (2) every artifact records `ownerEntityIds` in the lock's `outputs[]` (multiple entities may co-own a merged file, e.g. one AGENTS.md composed of many prompt sections); (3) stale managed paths are auto-deleted (`planner.ts:303-312`). Managed *source* paths (`.harness/src/**`) are tracked separately (`collectManagedSourcePaths`, `planner.ts:444`; `repository.ts`). The `.harness/.gitignore` written at init keeps per-developer files (`.env`, `behavior.yaml`) out of VCS (`docs/architecture.md:58, 70, 250`).

### Collision detection
Two codes, both error-severity and both block apply:
- `OUTPUT_PATH_COLLISION` — same path rendered by two different providers, or same provider + different content (`planner.ts:230-249`); identical content from multiple entities merges and co-accumulates `ownerEntityIds` (`:252`).
- `OUTPUT_COLLISION_UNMANAGED` — target file exists on disk but is not in the managed index; harness refuses to touch it with hint "Move or remove the file before running apply (v1 does not import/adopt existing files)" (`planner.ts:274-284`).
Regression tests: `toolkit/test/collisions.test.ts:57,81`; dedicated `test/ownership.test.ts`.

### Provider override
Two layers with the same schema `providerOverrideV1Schema {enabled?, targetPath?, options?}` (`manifest-schema/src/index.ts:109-117`): per-entity `overrides` map in the manifest keyed by provider (`:98-106`), plus per-entity override sidecar files (YAML, e.g. `OVERRIDES.codex.yaml`) documented in `docs/architecture.md:47-48` and loaded by `loader.ts`. Overrides flow into every render call (`planner.ts:40-48,67,81-89` etc.) and control enable/disable, output path, and provider-specific `options` (e.g. codex subagent `model`, `model_reasoning_effort`, `sandbox_mode` at `codex.ts:62-88`).

### Lock/fingerprint mechanism
`ManifestLock` (`manifest-schema/src/index.ts:169-207`): `manifestFingerprint = sha256(stableStringify(manifest))` (computed at `planner.ts:314`), per-entity `sourceSha256` and per-provider `overrideSha256ByProvider`, `importedSourceSha256` + `registryRevision {git ref, commit}` carried forward for registry provenance (`planner.ts:466-478`), and `outputs[]` with `contentSha256`. The lock is semantic: if the recomputed payload deep-equals the previous, `generatedAt` is preserved so the file doesn't churn (`planner.ts:434-440`). Written only on change (`engine.ts:564-567`). The managed index gates mutation; the lock provides integrity/audit; `doctor` cross-checks versions (`engine.ts:652+`, `versioning/doctor.ts`).

### The limits of a fixed provider enum/map (extensibility critique)
Adding a 5th provider requires edits in at least six code locations, despite the adapter interface being cleanly open:
1. `PROVIDERS` zod enum — `manifest-schema/src/index.ts:14` (`["codex","claude","copilot","cursor"] as const`); `providerIdSchema` at `:16`.
2. Hardcoded per-provider maps in the schema: `providerRelativePathMapSchema` (`:98-106`) and `providerShaMapSchema` (`:151-159`) both enumerate the four ids as literal keys, `.strict()`.
3. Adapter registry: `buildProviderAdapters` returns a `Record<ProviderId, ProviderAdapter>` with four literal builder calls (`provider-adapters/registry.ts:8-14`).
4. Capability tables: `PROVIDER_DEFAULTS` (`constants.ts:5-32`), `PROVIDER_NESTABLE_ARTIFACTS` (`:21-26`), `PROVIDER_EMITS_ARTIFACTS` (`:36-41`) — all `satisfies Record<ProviderId, ...>`, so a new id fails typecheck until each table gains an entry (helpful for safety, but every table is a mandatory edit).
5. Per-provider lock sha maps (same as 2) flow into lock records for every entity (`planner.ts:322-399`).
6. Docs/tests: `docs/architecture.md:16` still says "Supported providers are codex, claude, and copilot" while README and code ship Cursor — evidence of doc drift the fixed enum invites.
There is no third-party adapter registration point: `buildBuiltinAdapters` is the only construction path (`toolkit/src/providers.ts:6-10`), and `ProviderId`-keyed records mean a plugin cannot attach without recompiling. The `ProviderDefinition`/`createProviderAdapter` factory shows the team knows what a data-driven adapter looks like — the enum, the strict per-provider schema maps, and the capability tables are what pin it shut.

## Patterns worth borrowing for Agent-Box

1. **Plan/apply with error-gated commit and operation list (create/update/noop/delete)** — `planner.ts:17-464`, `engine.ts:526-578` → owner: **resource-projector** (Agent-Box projection should be plan-first, executable only when diagnostics are clean, with explicit noops for idempotence).
2. **`OUTPUT_COLLISION_UNMANAGED`: refuse to touch files not in the managed index** — `planner.ts:274-284` → owner: **resource-projector** (never adopt or overwrite pre-existing files in a harness's native config dir; the v1 "no import/adopt" stance is the safe default; Agent-Box's U-Haul equivalent must be explicit).
3. **Managed index + content-hash lock as ownership ledger, with churn-free semantic locking** — `manifest-schema/src/index.ts:169-213`, `planner.ts:434-446` → owners: **resource-projector** (managedOutputPaths registry) and **observation-envelope** (lock outputs with contentSha256 + ownerEntityIds are a ready-made envelope for "what did projection change and who caused it").
4. **`RenderedArtifact {path, content, ownerEntityIds, provider, format}` as the universal projection unit** — `toolkit/src/types.ts:132-138` → owner: **resource-projector** (make the projected-artifact record a first-class typed value with provenance, not a side effect of writes).
5. **Per-provider capability tables (nestable/emits) declared as data** — `constants.ts:5-49` → owner: **harness-native-adapter** (Agent-Box adapters should declare which resource families they accept and where, so routing decisions are data, not scattered ifs).
6. **Per-entity, per-provider override sidecars with a single strict schema** — `manifest-schema/src/index.ts:98-117` → owner: **harness-registry-declaration** (one override schema reused at two layers: registry entry + file sidecar).
7. **Env/behavior placeholder substitution with layered resolution order and gitignored local layers** — `docs/architecture.md:53-70` → owner: **credential-materializer** (Agent-Box secrets should follow the same shape: committed ruleset + gitignored local values + process-env fallback; placeholders fail loudly when unresolved).
8. **Registry pull materializes full editable source with provenance pinned by commit sha** — `manifest-schema/src/index.ts:169-207`, `planner.ts:466-478` → owner: **test-strategy** and **harness-registry-declaration** (Agent-Box resource distribution can adopt the "own the source, pin the revision" model for shared skill libraries).
9. **Coded errors parsed from thrown messages into diagnostics** — `planner.ts:480-500` (`CODE: message` convention) → owner: **observation-envelope** (structured diagnostic codes surfacing from deep layers without typed exception plumbing).

## Anti-patterns / risks observed

- **Fixed provider enum tax** (detailed above): six mandatory edit sites per new provider; strict schema maps bake provider ids into the lock format, so adding a provider changes historical lock semantics.
- **Doc/code drift on provider list** — `docs/architecture.md:16` omits Cursor while code and README include it; generated docs (`docs/toolkit.*.md`) may lag code between releases.
- **Whole-file artifacts only** — format enum `markdown|json|toml` cannot express partial merges into a human-owned file (e.g. appending one section to an existing settings file); providers needing that (Codex `config.toml`) must aggregate everything into a generated file the tool fully owns, which can clobber hand edits — mitigated only by the unmanaged-file guard.
- **Coded-error convention via regex on exception text** (`planner.ts:480-500`) is fragile if message text is refactored.
- **Watch mode never resolves** (`engine.ts:648-650` intentional never-resolve promise) — fine for CLI, hostile to library embedding.
- **No credential story**: env substitution explicitly routes secrets to a gitignored `.harness/.env` in plaintext (`docs/architecture.md:58`); acceptable for repo-scoped vars, but there is no OS keychain integration — a gap Agent-Box's credential layer should not copy.

## Verification status

- Verified from source read (file:line above): manifest/lock/managed-index schemas; canonical entity types; ProviderAdapter interface and RenderedArtifact; planner render→dedupe→diff→lock flow; collision codes; apply/write/lock churn rules; codex adapter specialization; capability tables; registry/provenance records; watch loop; versioning constants; test files enumerated (collisions/ownership/monorepo-target/providers tests exist and their assertions on the two collision codes were read).
- Verified from README/docs only: npm package name, install/quick-start, U-Haul precedence (`claude > codex > copilot`), delegated-init flow, skills.sh integration (import code path read but external skills.sh service not verified), DeepWiki.
- Not verified: TUI package internals (`packages/tui`) beyond listing; `packages/toolkit/test/e2e` containers; actual rendering output correctness (no runtime execution); npm registry publication state; git history beyond the single depth-1 HEAD commit.
