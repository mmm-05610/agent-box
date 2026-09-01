# Verdict

The five official Harnesses are consolidated behind one versioned declarative
registry, one `agent-box-harnesses` distribution, six independent entry points,
and one `harness-profile` authority. This change is deliberately bounded to
the extension layer; Work Core and the RuntimeHost/Sandbox/Terminal protocols
are unchanged. Resource Routing and Studio are out of scope.

# Final package tree

`registry/` contains the typed schema, loader, definitions and validation;
`generic/` contains the store, selector, manager and execution factory;
`adapters/` contains narrow per-Harness drivers; `resources/` contains bounded
executable resolution and canonical profile encoding. `harnesses.toml` is wheel
package data.

# HarnessDefinition schema

v1 covers identity, executable resolver metadata, native/guest profile layout,
bounded launch argv arrays, runtime requirements, typed input cardinality and
projection targets, locator-only credentials, continuation routes and
capabilities. It contains no runtime handles, Work entities, session content,
secret, host credential path, callable or import path.

# Registry validation

Loading fails closed for wrong schema version, unknown fields, duplicate
harness/driver keys, unbounded values, shell-like argv tokens, non-canonical
guest paths, unsupported capabilities, unsafe credential targets and invalid
continuation declarations. The canonical source digest is exposed through
`HarnessRegistry.digest` and diagnostics.

# Generic factory

The factory creates the descriptor, generic execution provider, input limits,
typed selector compatibility, manager view, HostControl and diagnostics for a
definition. A harness entry point is isolated: its adapter or definition error
does not prevent other entry points from being discovered. The profile-store
entry point alone registers the shared provider.

# Adapter boundaries

`GenericCliAdapter` is the minimum common denominator. Codex retains app-server,
interactive, executable-bundle, subscription credential and native-session
adapter seams; Claude and OpenCode retain native projection; Hermes uses
transcript/context handoff only; Pi retains native session and instruction,
Skill and MCP projection seams. Adapters produce bounded typed command plans;
they do not create Work/Execution, select resources, choose runtime composition,
read credentials, or own runtime handles.

# Final entry points

`harness-profile-store`, `codex`, `claude`, `opencode`, `hermes`, and `pi` all
come from this wheel and read the same registry. They have independent
descriptor/provenance/readiness records and do not depend on import order.

# Unified Profile Store

Profiles are stored below `$AGENT_BOX_HOME/profiles/<harness>/<profile>/revisions`.
Writes are atomic, revisions immutable, JSON canonical, digests exact, and
updates use expected-revision CAS. Disable is metadata. Symlinks, path escape,
drift, secret-shaped fields and credential values are rejected.

# ProfileRef identity

`ProfileRef` is an `ArtifactRef` with provider `harness-profile`, stable
`native_id` equal to profile id, and metadata `harness_type`, `revision`, and
`digest`. Old provider ids are unsupported and are never aliased.

# Migration/breaking change

The unpublished provider ids `codex-profile`, `claude-code-profile`,
`opencode-profile`, `hermes-profile`, and `pi-profile` are removed. Existing
frozen bindings are not rewritten. Alpha migration is explicit preview/confirm
only; no HOME scan and no credential read is performed. A legacy Ref resolves
as unsupported.

# Five Harness capability matrix

| Harness | declarative/generic | adapter-required | unsupported/native limitation |
|---|---|---|---|
| Codex | profile, limits, stdio/PTY, projection, finish | app-server, bundle, subscription credential, native continuation | none in registry layer |
| Claude Code | profile, projection, continuation route, HostControl | native layout/session decoding | none in offline vertical |
| OpenCode | profile, exact ref, projection, continuation | native layout/protocol | none in offline vertical |
| Hermes | profile, stdio, observation, finish | transcript/context handoff | native resume |
| Pi | profile, prompt, runtime composition, finish | native session, Skill/MCP/instruction projection | product-specific native features outside adapter |

# Removed distributions

The four forwarding distributions `agent-box-harness-claude`,
`agent-box-harness-opencode`, `agent-box-harness-hermes`, and `agent-box-pi`
are removed. No compatibility distribution or alias remains.

# Quick Launch result

Five Harness definitions are discoverable from the installed registry. Selector
choice remains explicit and Catalog compatibility is typed; Web does not parse
the registry file.

# Runtime/offline verticals

The generic execution path consumes frozen resolved inputs and sends its typed
command to the existing runtime composition assembler. Process exit does not
implicitly finish; explicit finish remains the finalization entry point.

# Credential safety

Definitions carry only contract, locator provider, target class and materializer
metadata. Profile envelopes reject secret-shaped fields. No source path, value
or digest is stored or returned.

# Core changes, if any

None.

# Tests

Registry, profile-store, factory isolation, packaging and existing non-native
tests are the validation targets. `compileall` and `git diff --check` are also
required before release.

# Browser result

Not run in this consolidation; browser regressions require the optional Web
frontend environment.

# Clean-wheel/install result

The wheel metadata declares one distribution and six entry points. A clean
build/install/doctor run is required in release CI.

# Remaining limitations

Resource Routing, Studio, real model requests, and credential materialization
remain intentionally out of scope. Native behavior beyond the adapter seams
requires an adapter implementation and offline evidence.

# READY / NOT READY FOR RESOURCE ROUTING

READY FOR RESOURCE ROUTING: the registry, identity, store, factory and runtime
boundaries are in place. Routing itself is not implemented in this change.
