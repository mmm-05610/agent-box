# LNX-002 — cross-repo wire protocol convergence

## 1. Authority and generation chain (as measured, not as documented)

| Role | Path | Note |
| --- | --- | --- |
| **Generation source (authority)** | `apps/desktop/src/types/wire/wire-v1.ts` — zod schemas; static types, runtime validation and JSON Schema all come from this one module | the settings line owns it; the chat line never modified it, so the merge left it untouched |
| Generated artifact (desktop) | `docs/desktop-product-delivery/contracts/wire-v1/generated/wire-v1.schema.json` | from `wireJsonSchemas()` |
| Registered evidence copy (backend) | `docs/server-round1/fullstack/contract/wire-v1.schema.registered-<sha8>.json` | **file name must equal its own sha256 prefix** (pinned by `test_wire_artifact_113.py`) |
| Backend's own inventory | `docs/server-round1/fullstack/contract/wire-v1.server-inventory.json` | method set + param shapes, generated from `handlers.py`; result shapes are the contract's authority, every row says `{"declared": false, "authority": "contract"}` |
| Tool | `scripts/server-round1/wire_artifact.py` (`--print-digest` / `--write` / `--check` / `--compare`) | stdlib only |

**Consumers of the artifact / digests** — all address it by explicit path; there is deliberately no default:

- `tests/server/test_wire_v1.py` — validates every response against the schema, **only** when
  `AGENT_BOX_WIRE_SCHEMA=<path>` is set (pinned by `test_wire_artifact_113.py`).
- `tests/server/test_wire_artifact_113.py` — `CONTRACT` path + `REGISTERED_SHA256` + `KNOWN_DRIFT`.
- `tests/server/test_hello_harnesses_105.py` — `ARTIFACT` path + `ARTIFACT_SHA256`.
- `tests/server/test_provider_update_keeps_omitted_112.py` — `ARTIFACT` path (reads the
  `providerModels.update#params` property table).
- `tests/server/test_wire_drive_coverage_103.py` — `docs/server-round1/fullstack/wire-drive-coverage.md`.

## 2. Generation command

> **Entry point (LNX-002 revision):** `apps/desktop/scripts/generate-wire-contract.mjs` —
> `node scripts/generate-wire-contract.mjs` writes and prints the digest, `--check`
> compares without writing. It is the reproducible entry; the commands below are what it
> does, and the reason the README's original one-liner is not reproducible on this host.

The command the desktop contract README documents is:

```bash
cd apps/desktop && node --experimental-strip-types -e "import('./src/types/wire/wire-v1.ts').then(async m => { const fs = await import('node:fs'); fs.writeFileSync('../../docs/desktop-product-delivery/contracts/wire-v1/generated/wire-v1.schema.json', JSON.stringify(m.wireJsonSchemas(), null, 2) + '\n') })"
```

⚠️ **It does not run on this host.** `node v22.22.1` here is built without TypeScript
support, so loading the `.ts` module throws `ERR_NO_TYPESCRIPT` (a plain `-e` script
works, which is why the flag looks accepted). The README's other regenerations were
made on Node v22.23.2 / v26.3.0.

**Substitute used, and why it is equivalent.** The module imports exactly one dependency
(`zod`) and types are stripped, never interpreted, so the loader cannot change the
result. The module was bundled with the project's own **esbuild 0.28.1** (the same
esbuild the vite pipeline uses) and then evaluated by node:

```bash
ESB=node_modules/@esbuild/linux-x64/bin/esbuild
$ESB apps/desktop/src/types/wire/wire-v1.ts --bundle --format=esm --platform=node --outfile=<tmp>/wire-v1.mjs
node <gen.mjs> file://<tmp>/wire-v1.mjs <out>
# where gen.mjs does: writeFileSync(out, JSON.stringify(m.wireJsonSchemas(), null, 2) + '\n')
```

**Equivalence proof (not an assertion — a measurement).** Replaying that command against
the **unedited** authority reproduced the registered artifact **byte for byte**:

```
replay    : 2dd265615fcd4232f25d0a5da4d2fd049f7050f5f0ead7a3e5d756abaeccd64c
registered: 2dd265615fcd4232f25d0a5da4d2fd049f7050f5f0ead7a3e5d756abaeccd64c
```

So the toolchain is pinned: same zod (4.4.3), same bytes, and the new artifact is
comparable with the registered ones.

## 3. What was converged, and where it was converged

Both changes were made **at the generation source** (`wire-v1.ts`) and the artifact
regenerated — never by hand-editing JSON (`wireJsonSchemas()` output is declared
hand-edit-forbidden) and never by editing the other tree's contract copy.

### 3.1 Registered drift closed — `provenance` (the 2 rows `--compare` reported)

The Server's own accept table declares it optional on three methods
(`handlers.py` `_PARAM_SHAPES`):

| method | server accepts (optional) | contract declared before |
| --- | --- | --- |
| `providerModels.create` | `provenance` | ✅ yes |
| `providerModels.update` | `provenance` | ❌ **no** |
| `providerModels.probeModels` | `provenance`, `credentialId` | ❌ **no** |

`provider_models_update` really writes it (`body.update(self._provenance(params) or {})`);
`provider_models_probe_models` validates it. The contract was therefore *denying a
parameter the Server honours*, which `wire_artifact.py --compare` reported as two
`optionalNotInContract` rows — exactly the drift `test_wire_artifact_113.py`'s
`KNOWN_DRIFT` carried.

Fix: added `provenance: ProviderProvenanceSchema.optional()` to both schemas, with the
enum values matching the Server's `_PROVENANCE_ENUMS` value for value
(`authStyle` `api_key|oauth|none`, `wireApi` **two** values `chat_completions|responses`
— `normalize_wire_api` is defined but never called, so the four-value collapse is not on
the write path — `fieldsSource` `preset|pulled|manual`).

The write face still deliberately does **not** gain `protocols` / `endpoints`:
`handlers.py:210-213` compares the model-row key set for equality, so sending them is a
typed refusal. That gap stays with `H-015`.

### 3.2 Unregistered drift found and closed — the profile read face

With the artifact bound via `AGENT_BOX_WIRE_SCHEMA`, 5 of the 37 wire tests failed. All 5
were the same root cause:

```
jsonschema.exceptions.ValidationError: Additional properties are not allowed
('recoveryPending', 'sendability' were unexpected)
```

These are facts the Server **already emitted** and the contract never declared:

- `recoveryPending` — `wire/projection.py:160`, tri-state (`bool | null`); `null` means the
  row did not carry the column, which is *unknown*, not "nothing is blocking this role".
- `sendability` — `wire/handlers.py:689` attaches it to **every** profile-returning method
  (`_profile`, used by `profiles.list/create/update/archive/clone/updateConfig/
  setPermissions` and `accounts.bind`); shape `{state, reason, message, actions, checks[]}`
  with per-check `{key, state, reason, message, actions, credentialId?}`, states
  `ready|blocked|unknown` (order 117 / QA-009, extended by 152: a credential whose identity
  resolves but whose secret cannot be opened on this host is `blocked`, never `ready`).

**Control experiment** (so the finding is attributed, not assumed): the *same* 5 failures
occur with the artifact from before any of my changes (`c4255b31…`, extracted from the
merge commit). ⇒ This is **pre-existing cross-repo drift** between the runtime line's
server and the desktop's contract, not something the convergence introduced.

Fix: declared `ProfileSendabilityCheckSchema`, `ProfileSendabilitySchema`,
`recoveryPending` and `sendability` in `wire-v1.ts` — the contract now describes what the
Server emits. This is what actually made the desktop's strict zod parsing able to accept a
real `profiles.list` response.

## 4. Verification

| Gate | Command | Result |
| --- | --- | --- |
| Backend drift tool | `python3 scripts/server-round1/wire_artifact.py --compare docs/server-round1/fullstack/contract/wire-v1.schema.registered-b1eb4762.json` | **all four axes empty, exit 0** |
| Backend inventory currency | `--check …/wire-v1.server-inventory.json` | `inventory is current (eaae93303f2380c3…)`, exit 0 |
| **Declared cross-repo gate** | `AGENT_BOX_WIRE_SCHEMA=…/registered-b1eb4762.json pytest -q tests/server/test_wire_v1.py` | **37 passed** |
| Same gate, pre-change artifact | `AGENT_BOX_WIRE_SCHEMA=<c4255b31> pytest -q tests/server/test_wire_v1.py` | 5 failed, 32 passed (the control) |
| Artifact ↔ contract | `pytest -q tests/server/test_wire_artifact_113.py tests/server/test_hello_harnesses_105.py tests/server/test_provider_update_keeps_omitted_112.py tests/server/test_wire_drive_coverage_103.py` | **65 passed** (after the relock bookkeeping in §5) |

## 5. Relock bookkeeping performed (the documented procedure, executed)

`docs/server-round1/wire-review.md` §5 prescribes three steps when a new pair lands, and
deliberately lets the gates go red once so that "the drift is gone" is a fact someone
looked at rather than a constant that moved itself. Executed:

1. `--compare` now exits 0 with no rows — verified above (§4).
2. Registered copy swapped: `…-c4255b31.json` removed, `…-b1eb4762.json` added (name =
   its own sha256 prefix). Pointer updated in
   `docs/server-round1/fullstack/generated/README.md`, and the "known drift" claim is
   recorded in `wire-review.md` (see the LNX-002 entry).
3. Gate constants updated, each with the reason recorded in place:
   - `test_wire_artifact_113.py`: `CONTRACT` path, `REGISTERED_SHA256`, and
     **`KNOWN_DRIFT = []`**.
   - `test_hello_harnesses_105.py`: `ARTIFACT` path + `ARTIFACT_SHA256`.
   - `test_provider_update_keeps_omitted_112.py`: `ARTIFACT` path; the property-set lock
     now excludes `provenance` **by name** (it is the Order 112 provenance object, not a
     column, so the nullability table stays exactly seven columns) instead of being
     widened silently.
   - `tests/server/test_hello_harnesses_105.py`: `test_wire_protocols_is_not_published_…`
     → replaced by `test_wire_protocols_reached_the_descriptor_and_is_still_not_published`.
     The old test *documented its own expiry* ("when 092 adds the field it goes red and the
     replacement - publish the key set - is a deliberate edit"); 092 has landed on the
     runtime line, so the descriptor assertion is inverted and the falsifiable half (hello
     must not publish an undeclared key) is kept.
   - `docs/server-round1/fullstack/wire-drive-coverage.md` regenerated with
     `python3 scripts/server-round1/wire_drive_coverage.py --markdown` (64/64 driven, 0 gaps).
   - `src/agent_box/server/model_configs/repository.py`: the arm-112 counter-example gate
     scans `ProviderModelRecords.update`'s source for the SQL keyword as a proxy for "the
     old null-default keep/clear shape is back". The merged runtime comment spelled it, so
     the scan fired on prose while the mechanism (the `KEEP` default, pinned separately)
     was correct. The comment was reworded to a single coalescing *expression* and says so;
     the mechanism guard is untouched.

## 6. Final digests (this checkpoint)

| Item | Full sha256 |
| --- | --- |
| TS authority `apps/desktop/src/types/wire/wire-v1.ts` | `c48d2dfcdf8d3d5f10d1837ceb793de1f6e7ff590d148cc7be7c13403bec58bb` |
| Contract artifact (both trees, byte-identical) | `b1eb4762b2a8e13e873967b770854e5e73a948488d4d066da07bc584e693dcd1` |
| Backend inventory `wire-v1.server-inventory.json` | `eaae93303f2380c34256bd4ea3ab03a3e5b922e2816953de82c439aa969bc16d` |
| Methods | **64** |
| Previous pair (superseded, kept in history) | TS `763758f0…025b57` / artifact `2dd26561…ccd64c` |
| Stale runtime snapshot (explicitly named, not a default) | `a1bd52a4fb68436079ae2d2e439953e8ac7f345ab5934a936a9434952bee0729` (33 methods) |

`docs/server-round1/fullstack/generated/wire-v1.schema.json` **does not exist** in this
tree: both source lines renamed it away and a file sitting at the default path is exactly
the "stale artifact picked by default" hazard. Every gate names its artifact explicitly.
