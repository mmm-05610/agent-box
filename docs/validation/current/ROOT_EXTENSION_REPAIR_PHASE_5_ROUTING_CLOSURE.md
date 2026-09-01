# Architecture Repair Phase 5 — Routing and Discovery Closure

Date: 2026-09-01

## Verdict

Phase 5 closes Profile envelope, typed selector discovery, generic Quick Launch
discovery, continuation routing, HostControl lookup, and the Web compatibility
boundary. Resource Routing is deliberately not implemented.

## Final Extension Environment

`build_extension_environment()` is the canonical assembly path. It creates one
fresh Registry and Catalog, loads plugins transactionally, activates typed
bindings, and returns diagnostics/provenance in `PluginLoadReport`. The report
is not a capability query surface.

## Final Registry/Catalog ownership

Registry owns contracts and providers. Catalog owns selectors, controls,
managers, continuation routes, credential materializers, transport operations,
and ownership records. Hosts query selectors by typed compatibility metadata;
they do not infer ownership from provider-id strings.

## Profile envelope result

`ProfileEnvelope` is the shared Host/Extension envelope: profile identity,
harness type, provider identity, name, schema version, exact revision/digest,
disabled state, credential locator, capability references, overlay policy,
import provenance, and a plugin-owned bounded `native_payload`. Credential
values, paths, and secrets are rejected. Existing `AgentBoxProfileV1` and
`ProfileRef` revision/digest identity remain compatible; native schema remains
with each Harness plugin. Projector/layout authority and Session/Memory are not
profile fields.

## Selector compatibility model

`SelectorCompatibility` declares compatible execution providers/harness types,
multi-slot and exact-revision support, external configuration, Web availability,
and recommendation status. `ExtensionCatalog.selectors_for_provider()` returns
all compatible candidates; duplicate IDs and ambiguous routing fail closed.

## Quick Launch generic routing

Web consumes `quick-launch/discovery`: provider descriptor and input requirements
come from the ExecutionProvider, while compatible selectors and bounded fields
come from Catalog contributions. The UI prepares selections and a draft only;
review, Freeze, Binding, and Dispatch retain their existing authority. No
official provider/selector mapping remains in Quick Launch source. Recommended
metadata is convenience only.

## Continuation routing

Continuation candidates remain Catalog-driven and require terminal source phase,
persisted SessionRef, exact resource selection, and target-provider
compatibility. The source Execution is never reopened. Ambiguous or absent
routes are not presented. Hermes exposes transcript/context handoff only and
does not claim native resume.

## HostControl/runtime handle boundary

`ProviderHostControl` uses the provider-owned typed `get_handle(dispatch_id)`
port. It no longer falls back to private `_handles` or probes concrete provider
state. Missing ports produce typed HostControl unavailability. Runtime handles
remain ephemeral and are not placed in Core, Catalog, Binding, Evidence, or
PluginLoadReport.

## Compatibility paths removed or retained

The Web Host production server path bootstraps through `build_extension_environment()`.
`build_extension_environment_from_parts()` and `build_extension_registry()` remain
deprecated compatibility adapters: they delegate to the same builder and hold
no independent authority.

## Error typing result

Existing bounded error codes and result DTOs remain the HTTP boundary. Routing
does not use exception-message matching. Internal messages are truncated and
never include credentials, argv, paths, or tracebacks.

## Five Harness result

Codex, Claude Code, OpenCode, Hermes, and Pi identify their own harness manager,
execution provider, profile authority, and selector compatibility metadata.
Pi remains third-party/example: explicit installation makes it discoverable;
Preview extras do not install it. No fake Harness capability is introduced.

## Web/browser result

The static bundle was rebuilt from current frontend source. Quick Launch obtains
provider/selector discovery from the Host API and keeps the review boundary.

## Core changes, if any

No Work Core ontology, Binding, Freeze, Dispatch, Finalization, schema,
migrations, Ref identity, or Profile revision/digest semantics were changed.

## Tests

Targeted Extension, transport, profile, provider, and Web Quick Launch/Profile
tests: 40 passed. `compileall`, frontend Vite build, and `git diff --check`
passed.

## Clean-wheel/install result

Frontend static assets were rebuilt. Wheel installation remains an environment
validation step; no model request is part of it. Pi is verified separately and
is absent from Preview extras.

## Remaining limitations

Native payload schemas are intentionally not unified. Some legacy manager
presentation APIs still return bounded mappings until each Harness adopts the
shared envelope serializer. Compatibility adapters remain for external embedders
without independent loading authority.

## READY / NOT READY FOR RESOURCE ROUTING

## Phase 5.1 Closure

All five Harness managers now pass through the single `ProfileEnvelopeManager`
adapter. Create, list, get, edit/new revision, and applicable import/confirm
results are normalized to the same envelope. Native writers remain the owner
of payload validation; exact old revisions are read without rewriting their
digest. Hermes and Pi now retain historical immutable revisions, and OpenCode
exact-revision reads use the matching stored digest.

Quick Launch groups Catalog candidates by required contract. A single candidate
is visibly identified; multiple candidates require an explicit selector choice.
Only the chosen selector's bounded fields are rendered/resolved. Provider
changes clear selector and parameter state. Selector identity, plugin owner,
contract, status, and exact resolved Ref remain Host-visible; no provider or
selector implementation is imported by the frontend.

## READY / NOT READY FOR RESOURCE ROUTING

**COMPLETE / READY FOR RESOURCE ROUTING.** Resource Routing itself is not part
of Phase 5.1; only its Extension/Host boundary is closed here.
