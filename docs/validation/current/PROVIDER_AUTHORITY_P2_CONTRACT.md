# P2 Provider Authority — API Contract Design (primary-owned cross-repo contract)

Date: 2026-09-05. Authority: `WINDOWS_WSL_SEVEN_HARNESS_DAILY_DRIVER_PROGRAM.md` §4.
Status: design frozen for implementation (Agent C backend slice + P2 GUI).

## 1. Provider record (the one canonical surface)

| Field | Semantics | Public? |
|---|---|---|
| `provider_id` | Immutable user-chosen identity (`^[a-z0-9][a-z0-9-]{0,63}$`) | yes |
| `display_name` | Editable label | yes |
| `base_url` | Normalized HTTPS endpoint, or explicit loopback HTTP (`http://127.0.0.1*`/`http://localhost:*` only) | yes |
| `protocol_family` | `openai-completions` \| `openai-responses` \| `anthropic-messages` — never guessed per request | yes |
| `credential` | `{locator, present}` — locator only; **value is write-only and never readable back** | locator+present only |
| `models` | Explicit model ids + optional display/capability metadata | yes |
| `harness_routes` | Per-Harness compatibility + native projection settings (`{harness_type: {compatible: bool, model_route?: str, notes?}}`) | yes |
| `probe_evidence` | Timestamped bounded facts only: outcome, model_id, latency, error class. **Never prompts, never responses, never secret material, never hashes of secrets** | yes (bounded) |
| `group_label` | Optional visible group label for one physical gateway exposing multiple wire protocols | yes |

Invariants:
- Provider ids are never silently renamed. Deletion is rejected while referenced
  (scan of turn Bindings in the session store) unless an explicit
  `replacement=<provider_id>` query names a live replacement.
- `protocol_family` is validated against the enumeration; changing it is a
  normal edit but probes reset (evidence is per family).
- A successful `/models` discovery is NOT proof of generation; compatibility
  is recorded only via `probe`.

## 2. REST surface (Bearer; mirrors the profiles contribution pattern)

| Endpoint | Semantics |
|---|---|
| `GET /api/v1/providers` | `{providers: [row]}` redacted rows (credential value never present) |
| `POST /api/v1/providers` | 201 create; body `{provider_id, display_name, base_url, protocol_family, models?, credential_value?, group_label?}`; extra=forbid |
| `GET /api/v1/providers/{id}` | 404 `PROVIDER_NOT_FOUND` / `{provider: row}` |
| `PUT /api/v1/providers/{id}` | edit display_name/base_url/models/harness_routes/group_label (NOT provider_id, NOT credential) |
| `PUT /api/v1/providers/{id}/credential` | 201 write-only replace; body `{value}`; no read-back |
| `DELETE /api/v1/providers/{id}/credential` | 200; provider stays with `credential.present=false` |
| `DELETE /api/v1/providers/{id}?replacement=<id>` | 409 `PROVIDER_IN_USE` when referenced without replacement; else delete (credential file destroyed) |
| `POST /api/v1/providers/{id}/probe` | one bounded real request through the protocol family; 200 `{probe:{...}}` typed outcome; deterministic auth/model/protocol rejection stops the route |
| `POST /api/v1/providers/{id}/models/discover` | bounded listing-endpoint fetch; typed failure; manual models unaffected |

## 3. Write-only credential authority

- Location: `AGENT_BOX_HOME/credentials/<locator>.json`, mode `0600`,
  body `{"value": ...}` (+ `updated_at`). Locator form: `gateway/<provider_id>`.
- The value is read ONLY at materialization boundaries (probe execution and
  harness projection). It never appears in: API responses, events, Binding
  snapshots, logs, manifests, diagnostics, screenshots, tests, or any file
  outside that directory.
- Import path (this Goal's authorized gateway key): a temp file is read ONCE
  at the import boundary through a small local client that PUTs the value to
  the credential endpoint; the file is deleted immediately after a 201.
  No copy into either repository, no hash, no log line, no test fixture.

## 4. Bounded probe (compatibility truth)

Per protocol family, ONE minimal request:
- `openai-completions`: `POST {base}/chat/completions` `{model, messages:[{role:user,content:"ping"}], max_tokens: 1}`.
- `openai-responses`: `POST {base}/responses` with the minimal documented body.
- `anthropic-messages`: `POST {base}/v1/messages` minimal documented body.
Hard timeout (10s), response truncated to status + usage + model id (bodies
discarded). Evidence: `{at, outcome: ok|auth-rejected|model-rejected|protocol-rejected|unreachable|timeout, model_id, latency_ms, detail_class}`.
Retry is forbidden after a deterministic rejection.

## 5. Harness projection (adapter-owned)

Adapters translate a selected Provider route into native materialization:
- codex: profile payload `model_providers` block + `model_provider` key; the
  credential becomes a bounded env var injected via the launch env (never in
  config.toml, never in the workspace, locator-only in Binding evidence).
- claude/opencode/hermes/pi/dsh: per-adapter native config/env surfaces
  (P5 admission defines each; adapters must not contain seven brand-specific
  branches in the Studio service itself).
- Studio validates selection (provider compatible with harness per
  `harness_routes`), freezes `{provider_id, credential locator, protocol
  family, model}` into the Binding snapshot. Provider edits affect later
  turns only.

## 6. Test-first plan (P2)

RED (synthetic, offline):
1. CRUD: create/list/get/edit; provider_id immutable; 404s; extra=forbid.
2. Credential: write-only (never in any response), replace/delete semantics,
   0600 mode on disk, locator-only descriptor; deletion of provider destroys
   the credential file.
3. Deletion guard: referenced provider → 409; with replacement → ok.
4. Probe runner: fake HTTP server (local) for each family — ok/auth/model/
   timeout paths; no prompt/response in evidence; deterministic stop.
5. Model discovery: fake listing endpoint; manual models untouched.
6. Binding freeze: provider selection validated against harness_routes;
   snapshot carries locator only.
GREEN: smallest implementation (store + endpoints + probe runner), then the
GUI (provider list/edit panel per cc-switch/DeepSeek settings organization).
Real gateway probes: ONLY via the authorized temp-file import at the P2/P5
boundary, deleted immediately after import.

## 6.1 Current authority correction (2026-09-06)

The table above is historical design text. The current authority is the two-layer
contract in `CODEX_VERTICAL_LUNA_COMPLETION_HANDOFF.md`: `ProviderAccount` is a
user-facing grouping and never enters an Execution Binding; each immutable
`HarnessProviderConfigRevision` is independently addressed by an exact Ref and
is the only provider authority in a Binding. `harness_routes`, mutable global
provider selection, and provider-owned model fields are not current execution
authority. Credential delivery is mount-only through the root credential
materializer protocol and fixed guest launcher; no value-bearing command-env
carrier is permitted.
