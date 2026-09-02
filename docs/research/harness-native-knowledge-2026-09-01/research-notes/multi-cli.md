# Research note: Spielewoy/multi-cli

Reviewed: 2026-09-02 from a `--depth 1` clone at `<temp-home>/multi-cli` (HEAD `6efb0d2`, "Prepare Multi-CLI v1.0.0 for launch (#8)"). File:line citations are repo-relative.

## Identity

- Org/repo: Spielewoy/multi-cli — https://github.com/Spielewoy/multi-cli
- Language: Bash 3.2+ (macOS/Linux launcher `multi-cli`, ~1,925 lines) with a full PowerShell 5.1 mirror (`multi-cli.ps1`, ~2,012 lines; `lib/*.psm1` modules). jq is the only hard dependency.
- License: MIT (`LICENSE`; README badge line 11).
- Last activity seen: commit dated 2026-08-19, v1.0.0 launch prep. Actively maintained, pre-1.0-announcement hygiene (docs translations in 6 languages, Pester + Bats test suites under `tests/`).
- Official docs: in-repo — `docs/adapter-schema.md` (schema v2 contract), `docs/support-matrix.md`, 17 per-tool adapter guides under `docs/adapters/`.
- Purpose: run multiple accounts of 17 AI CLIs/IDEs simultaneously via per-profile credential isolation with a shared "normal state" — the closest public analog to Agent-Box's profile/credential layer.

## Architecture summary

Core abstractions and lifecycle:

1. **Adapter manifest (declarative, per tool)** — one `adapter.json` per tool under `ai-tools/<id>/adapter.json`, validated against `schema/adapter.schema.json` plus a semantic validator. The launcher is fully adapter-driven; no tool logic lives in code (`multi-cli:1-9` header comment; dispatch reads manifests via `json_str`/`json_arr` helpers, `multi-cli:58-60`).
2. **Validation pipeline** — JSON Schema is enforced by test/validation scripts (`scripts/validate-adapters.sh`, `scripts/Validate-Adapters.ps1`), and semantic checks run before every use: `validate_adapter_manifest` at `lib/adapter-validation.sh:240` composing `is_safe_adapter_path` (`:22`, rejects absolute/drive/`..` paths), `adapter_paths_overlap` (`:35`), `validate_adapter_path_separation` (`:54`), `validate_adapter_placeholders` (`:70`), `validate_adapter_support` (`:162`), and `validate_adapter_v2` (`:183`).
3. **Profile creation** — `cmd_new` (README table `multi-cli:88-100`; `--isolated` flag gates whole-root mode at `multi-cli:757-758`). Each profile dir gets `.profile.json` (schemaVersion/adapterId/profileId/mode) written atomically with a fresh UUID (`runtime_write_profile_metadata`, `lib/multicli-runtime.sh:66-80`; UUID sources at `:46-64`).
4. **Runtime view build (the overlay)** — `runtime_build_overlay` (`lib/multicli-runtime.sh:198-217`) takes a mkdir-based lock, then `runtime_build_overlay_locked` (`:220-254`) builds a PID-unique staging tree, links shared+session state from the native root, links profile-local credentials from `<profile>/auth`, writes a `.runtime-manifest` of expected entries, removes the old overlay and `mv`s staging into `<profile>/.runtime`. Currency check: `runtime_overlay_is_current` (`:186-192`).
5. **Launch** — `runtime_launch_account_overlay` (`lib/multicli-runtime.sh:274-345`): expands the six placeholders (`runtime_expand_value`, `:256-267`), resolves account mechanism (see below), applies `isolation.env` and `isolation.clearEnv`, injects `MULTICLI_PROFILE_ID`, and execs via `env`.
6. **Migration / transfer / osuser as sibling libraries** — `lib/migration.sh` (legacy→v2, journaled), `lib/transfer.sh` (allowlist-driven template/export/import), `lib/multicli-osuser.sh` (OS-user mechanism), `lib/credential-store.sh` (OS keychain wrapper). Windows mirrors of each live in `lib/MultiCli.*.psm1`.

## Required focus points

### Adapter schema v2 — full field list and semantics

Machine contract: `schema/adapter.schema.json`. Required top-level: `id`, `displayName`, `kind`, `binary`, `isolation` (`schema/adapter.schema.json:6-12`). Fields:

- `schemaVersion` — enum 1|2, default 1 (`:15-21`). A v2 `allOf` gate (`:369-414`) requires `account`, `normalState`, `concurrency`, `support`, forces `isolation.strategy` to `accountOverlay`, requires `isolation.mode`, forbids `shareFromRealHome`, and forbids the legacy `share`/`session`/`status` blocks; the `else` branch forbids the v2 blocks for v1. This is a clean versioned dual-schema in one file.
- `id` — `^[a-z0-9][a-z0-9-]*$` (`:22-25`).
- `displayName` — non-empty string (`:26-29`).
- `kind` — enum `cli|ide|gui|hybrid` (`:30-37`).
- `binary` — per-OS arrays of candidate paths/commands; keys limited to `windows|macos|linux` (`:38-54`). Resolution tries candidates in order (`validate_adapter_binary`, `lib/adapter-validation.sh:123`).
- `isolation` — object with required `strategy` (`:55-104`): `strategy` enum (see next), optional `mode` (`foreground|detached`), `env` (string→string map), `clearEnv` (env var name array), `args`, `shareFromRealHome` (v1 only). `additionalProperties: false` at `:103`.
- `account` (v2) — mechanism + credential declaration (`:105-155`).
- `normalState` (v2) — root + path classification (`:156-217`).
- `concurrency` (v2) — `level` + `singletonScope` (`:218-238`).
- `support` (v2) — per-OS `{level: supported|unsupported, reason}` (`:239-258`, `$defs/support` at `:349-367`). Docs note retired `verified`/`experimental` levels are invalid (`docs/adapter-schema.md:29-36`).
- `install` (string), `versionCommand` (argv array) (`:259-268`).
- Legacy v1 blocks `share` (`$defs/legacyShare`, `:280-302`: systemHome/linkable/neverLink) and `session` (`$defs/legacySession`, `:303-331`: portable/paths/credentials/reason/resumeHint).
- `$defs/relativePath` (`:332-348`): non-empty, rejects leading `/`/`\`, drive prefixes, and any `..` component — the path-safety contract is in the schema itself, not just code.

Full worked examples: `ai-tools/claude-cli/adapter.json` (fileOverlay, 27 sharedPaths), `ai-tools/codex/adapter.json`, `ai-tools/copilot-cli/adapter.json` (processSecret), `ai-tools/kiro/adapter.json` (osUserCredentialStore, detached).

### isolation.strategy — values and semantics

Enum at `schema/adapter.schema.json:61-69`: `env`, `userDataDir`, `redirectHome`, `appdata`, `sandboxUser`, `accountOverlay`. Launcher header (`multi-cli:5-7`) describes them as "how to find its binary and how to isolate its state". Strategy dispatch at launch: `multi-cli:1177` (`accountOverlay` → `runtime_launch_account_overlay`; the others are the v1 whole-root strategies where the entire tool home is redirected per profile). User-facing semantics table (README `:127-136`): File overlay = declared credential files separate, config/conversations shared; Process secret = one credential injected into the child; OS user = product's fixed OS identity, nothing shared; Isolated tool home = everything separate. v1 strategies are retained only for legacy profiles and migration; new adapters must be v2 `accountOverlay` (`docs/adapter-schema.md:61`).

### account.mechanism

Enum at `schema/adapter.schema.json:111-117`: `processSecret`, `fileOverlay`, `osUserCredentialStore`, `inseparable`. Semantics (`docs/adapter-schema.md:20-27` + dispatch in `lib/multicli-runtime.sh:289-323`):

- `fileOverlay` — credential files live in `<profile>/auth`, hard-linked/junctioned into the runtime view; `account.credentialFiles` must be non-empty (enforced `lib/adapter-validation.sh:194-195`).
- `processSecret` — one secret injected via `account.secret.environmentVariable`; launch fails closed until `multi-cli auth set` stored it (`lib/multicli-runtime.sh:297-304`; abort at `:301-303`). Also clears conflicting env via `clearEnv` (e.g. copilot-cli clears `GH_TOKEN`/`GITHUB_TOKEN`).
- `osUserCredentialStore` — a Multi-CLI-owned OS user (deterministic sandbox username `mc_osuser_username`, provisioning and scheduled-task launch on Windows; macOS/Linux "fail closed with a precise message — no sudo half-implementation", `lib/multicli-osuser.sh:1-17`).
- `inseparable` — auth and state cannot be divided; `account.reason` required, account-overlay launch aborts with the reason, user must use `--isolated` (`lib/multicli-runtime.sh:320-321`).

### normalState.root

Per-OS absolute native root of the tool's ordinary state: `schema/adapter.schema.json:166-186` (requires all of windows/macos/linux); resolved at runtime by `runtime_platform_root` (`lib/multicli-runtime.sh:35-40`) with token resolution (env vars like `$HOME`, `%USERPROFILE%` handled by `resolve_path_token` in the launcher). Example: claude-cli root `$HOME/.claude`. Optional `runtimeSubdir` (`:187-190`) scopes the runtime view to a safe relative dir below the root (`docs/adapter-schema.md:18`).

### sharedPaths / sessionPaths / unsafePaths / filePaths

All are arrays of `relativePath` under `normalState` (`schema/adapter.schema.json:191-214`):

- `sharedPaths` — normal config state shared across all profiles and the base install; linked from the native root into every profile runtime (`runtime_link_state_list`, `lib/multicli-runtime.sh:148-157`).
- `sessionPaths` — conversation/session state. Two uses: they are also linked into the runtime (so sessions are *shared* by default in v2), and they define what `multi-cli continue` copies for isolated profiles (`multi-cli:583-598`).
- `unsafePaths` — declared paths the tool treats as credentials-adjacent or otherwise boundary-unsafe; validated to not overlap credentials/shared/session (`lib/adapter-validation.sh:229-231`) and excluded from transfer. Example: copilot-cli declares `config.json`, `mcp-oauth-config`, `mcp-secrets` (`ai-tools/copilot-cli/adapter.json`).
- `filePaths` — the file-vs-dir distinction: "marks shared entries that must be treated as files rather than directories" (`docs/adapter-schema.md:18`). Implementation: `runtime_is_file_path` checks membership (`lib/multicli-runtime.sh:83-90`); `runtime_ensure_state_source` creates missing sources as empty files (`: > file`) instead of `mkdir -p` when declared (`:95-105`); on Windows the link type differs — junction for directories, hardlink for files (`runtime_link_path`, `:113-136`). Without this declaration a shared JSON file like `settings.json` would be materialized as a directory and corrupt the tool.

### Concurrency model

Two layers:

1. **Declared concurrency** — `concurrency.level: multiWriter|singleWriter|unsupported` plus `singletonScope` (schema `:218-238`). Most CLIs declare `multiWriter`/`none`; kiro (IDE) declares `singleWriter`/`osUser` (`ai-tools/kiro/adapter.json`).
2. **Runtime-build lock** — `runtime_build_overlay` uses `mkdir`-based lock `<profile>/.runtime.lock` with a PID liveness check (stale lock reaped when the owner PID is dead), 600 retries at 50 ms, then abort (`lib/multicli-runtime.sh:198-217`). Build happens in a PID-unique staging dir and is swapped in while holding the lock, so "a current overlay is reused so launching a second process never removes the runtime tree from beneath the first" (`:195-197`). Single-writer per profile for *builds*; multi-writer for *state* is a per-adapter declaration, not enforced by locks.

### OS support matrix

Three-axis: (a) launcher platforms — Bash 3.2+ macOS/Linux, PowerShell 5.1 Windows (README `:29-33`); (b) per-adapter `support.{windows,macos,linux}.{level,reason}` with only `supported|unsupported` (schema `:349-367`); (c) per-OS binary candidates (`binary.*`). Reason strings carry real constraints, e.g. claude-cli macOS: "subscription OAuth is unsupported because its fixed Keychain identity is not isolated" (`ai-tools/claude-cli/adapter.json`). Human matrix: `docs/support-matrix.md`.

### Credential precedence modeling

`account.credentialPrecedence` — ordered array of credential sources, schema `:125-131`, purely declarative documentation of the tool's own resolution order (e.g. copilot-cli: `["COPILOT_GITHUB_TOKEN","GH_TOKEN","GITHUB_TOKEN","copilot-cli keychain","gh auth token"]`). It is validated for non-empty strings (`lib/adapter-validation.sh:224-228` area) but not used to drive runtime behavior — the actual mechanism is `credentialFiles` (fileOverlay) or `secret.environmentVariable` (processSecret). Good pattern: declaring upstream precedence separately from the profile-owned slice.

### Session transfer between profiles/machines

- Same machine: `multi-cli continue <tool> <src> <dest> [--dry-run] [--no-merge]` (`multi-cli:573-640`). Endpoints can be `base` (= `normalState.root`, resolved by `adapter_system_home`, `multi-cli:313-330`) or a profile. v2 shared profiles: no-op message (they already share sessions, `multi-cli:590-594`); v2 isolated profiles: real copy of `sessionPaths` with safety check `assert_isolated_session_paths_safe` (`multi-cli:449`). Merge policy "keeps the newer file" and "credential paths never travel" (`multi-cli:568-571`). Legacy tools require `.session.portable: true`.
- Across machines: `multi-cli export`/`import` produce/consume a `.tar.gz` with a transport manifest (`.multicli-manifest.json`, `lib/transfer.sh:24`), see below. Templates (`template save|list|delete`) are the credential-free reuse path. Cross-adapter reuse is blocked: a template records its source `adapterId` and application to a different adapter aborts (`transfer_assert_template_compatible`, `lib/transfer.sh:394-411`).

### Credential-free template/export — how credentials are stripped

Defense in depth in `lib/transfer.sh`:

1. **Allowlist root** — only `normalState.sharedPaths` content is ever collected ("Only adapter-declared normalState.sharedPaths content is copied; credentials, sessions, links, hardlinks, and unclassified files never travel", header `:3-4`). Session paths are excluded from templates (`:360`).
2. **Credential path filter** — `transfer_is_credential_path` (`:47-57`): adapter-declared `credentialFiles` + a hardcoded blocklist of legacy basenames at any depth (`auth.json|.credentials.json|oauth_creds.json|google_accounts.json|mcp-oauth-tokens.json|a2a-oauth-tokens.json`, `:29-33`) + the `auth/` boundary itself.
3. **Content secret scan** — `transfer_file_refusal` (`:159-181`): files >1 MiB rejected ("secret-scan limit"), binary files (NUL byte via `od`) rejected, and pattern grep for `sk-|access_token|refresh_token|id_token|Bearer ` marks the file "looks like it contains a secret".
4. **Link hygiene** — symlinks are never followed; a link resolving outside shared-root/profile aborts as tampering (`transfer_resolve_top`, `:120-157`); hardlinks with nlink>1 refused (hardlink could alias a credential under an innocent name, `:203-205`).
5. **Transport manifest + import re-validation** — save writes `.multicli-manifest.json` with adapterId/name/kind; import validates adapter match, every entry against declared sharedPaths, and refuses archive entries whose names match credential paths (`:510-512`). Save path is staging-dir + atomic `mv` (`:321-329`).
6. **Legacy lockout** — any transfer on a pre-v2 profile aborts with an instruction to migrate first (`legacy_transfer_blocked`, `multi-cli:243-246`), because whole-root copies can leak tokens.

## Patterns worth borrowing for Agent-Box

1. **Path classification as schema, not code** — `normalState.{root,sharedPaths,sessionPaths,filePaths,unsafePaths}` + `account.credentialFiles` with overlap/separation validation (`lib/adapter-validation.sh:54-68,229-231`) → owner: **harness-registry-declaration** (make resource/credential path classification a declarative, validated part of each harness entry).
2. **Fail-closed account mechanisms with required `reason`** — `inseparable` forces an explicit reason string and refuses launch (`schema/adapter.schema.json:112-117`, `lib/multicli-runtime.sh:320-321`) → owner: **harness-native-adapter** (unsupported capabilities must abort with the adapter's own explanation, never degrade silently).
3. **Allowlist transfer + secret content scan + transport manifest** (`lib/transfer.sh:3-4,47-57,159-181`) → owner: **credential-materializer** (any profile export/template flow should be allowlist-first, scan content, and embed a manifest tying artifacts to their source adapter/profile schema).
4. **Staged atomic overlay swap under a PID-checked mkdir lock with a currency manifest** (`lib/multicli-runtime.sh:198-254,186-192`) and the **doctor --deep runtime audit** that re-verifies every link target against expectations (`multi-cli:1640-1676`) → owners: **resource-projector** (projection = staged build + manifest + swap, not in-place mutation) and **test-strategy** (audit mode that detects drift/tampering between projected view and source of truth).
5. **File-vs-dir link typing per platform** (symlink vs junction vs hardlink, `lib/multicli-runtime.sh:113-136`) → owner: **resource-projector** (skills/file projection on Windows needs junction/hardlink semantics declared per entry).
6. **Dual-version schema with `allOf` gating and a journaled migration engine** (`schema/adapter.schema.json:369-414`; `lib/migration.sh:8-24` journal to `.migration-journal.json` for roll-forward/rollback) → owner: **harness-registry-declaration** (v1↔v2 in one schema file; migrations journaled and same-volume atomic).
7. **Credential store discipline** — secrets only via stdin/env, never argv, never plaintext fallback; target naming `multi-cli/<tool>/<profileId>/<ENVVAR>` (`lib/credential-store.sh:6-19`) → owner: **profile-store** (key secrets by harness/profile-id/variable, not by profile name).

## Anti-patterns / risks observed

- **Dual-maintainer burden**: every feature exists twice (Bash + PowerShell mirrors, e.g. `lib/credential-store.sh` vs `lib/MultiCli.CredentialStore.psm1`). Drift risk is structural; only test discipline holds it together.
- **Secret scan is grep-based**: the `sk-|Bearer ` pattern list (`lib/transfer.sh:174-176`) gives false confidence for non-obvious token formats; the 1 MiB size limit means big state files skip scanning entirely (they are also just refused, which is fail-closed, but blocks large legit configs).
- **Precedence is documentation-only**: `credentialPrecedence` is not executable, so adapters can drift from the tool's real resolution order without any test noticing.
- **Concurrency declared but unenforced**: `singleWriter`/`singletonScope` exist in the schema, yet nothing at launch consults them for CLI mechanisms (only osUser/singleWriter IDE flow implies it); two launches of the same profile can race at the tool level.
- **Symlink dependency**: "no copy fallback is allowed" (`lib/multicli-runtime.sh:127`) means filesystems without symlink/junction support (some network mounts, WSL interop edge cases) fail hard at launch.

## Verification status

- Verified from source read (file:line above): adapter schema fields and allOf gating; isolation strategies and account mechanisms dispatch; overlay build/lock/manifest; file-vs-dir link logic; transfer allowlist + secret scan + manifest; continue/copy merge policy; osuser fail-closed design; credential store backends and rules; migration journaling (header + entry points).
- Verified from README/docs only: 17-tool support table, install/uninstall flow, `MULTICLI_*` env vars, translation coverage, per-adapter guides.
- Not verified: Windows/PowerShell code paths beyond file reads of headers and greps (no Windows execution); `docs/support-matrix.md` contents not read line-by-line; tests were enumerated (`tests/*.bats`, `tests/*.Tests.ps1`) but not executed; GitHub metadata (stars/issues) not checked.
