# Verdict

COMPLETE / READY FOR RESOURCE ROUTING

The registry worktree now contains one declarative five-Harness bundle. The
main worktree was used only as read-only evidence; no files there were changed.

# Final package tree

`agent-box-harnesses` contains `registry/`, `generic/`, `adapters/`, native
adapter subpackages for Claude/Hermes/OpenCode/Pi, `resources/`, and the
packaged `harnesses.toml`. Four former distributions are deleted.

# HarnessDefinition and registry

`HarnessDefinition` v1 is typed and frozen. It describes identity, executable
resolver metadata, bounded launch argv, profile layout, runtime requirements,
input cardinality/projection, locator-only credentials, continuation and
capabilities. The loader rejects unknown fields, duplicate harness/driver
keys, invalid paths/tokens/cardinality/capabilities and unsafe credential
targets. Registry digest and diagnostics are deterministic and readable.

# Generic factory and adapters

The factory generates independent descriptors, generic ExecutionProviders,
input limits, typed selector compatibility, manager views and HostControl.
The profile-store entry point is the sole registration of `harness-profile`;
Harness entry points consume the same canonical home without duplicate public
providers. Trusted adapter keys are fixed in `ADAPTERS`; user callables,
imports and shell strings are not accepted.

Native adapters retain the migrated behavior: Codex app-server/interactive,
bundle and credential seams; Claude projection and project continuation;
OpenCode exact native session continuation; Hermes transcript/context handoff
with native resume explicitly unsupported; and Pi instruction/Skill/MCP and
native-session projection. All execution paths use typed Runtime Composition;
adapters do not create Core entities or choose runtime resources.

# Profile Store and identity

`ProfileStore` is the only persistence authority. It uses atomic immutable
revision directories, canonical JSON, exact SHA-256 digests, expected-revision
CAS, disable metadata, drift detection and symlink/path checks. The exact Ref
identity is `ArtifactRef(provider="harness-profile", native_id=profile_id,
metadata={harness_type, revision, digest})`. Old provider IDs resolve as
unsupported and are not aliased; no credential value or host path is stored.

# Entry points and packaging

The single wheel exposes exactly six `agent_box.plugins` entries:
`harness-profile-store`, `codex`, `claude`, `opencode`, `hermes`, and `pi`.
Each has independent provenance/readiness. Failure in one definition/adapter
does not prevent the others from loading, and registration is transactional.

# Web and Quick Launch

The official matrix exposes all five Harness definitions through the installed
Catalog. Selector choice remains explicit and compatibility is typed; Web does
not parse registry structure. Profile views use the unified provider identity.

# Runtime, continuation and finish

Offline coverage includes all five adapter surfaces, direct stdio, managed
tmux and real bubblewrap projection. Single-spawn/replay/ambiguity checks and
explicit Finish/finalization semantics remain in the shared runtime tests;
process exit does not itself Finish. Continuation is always a new Execution.

# Migration and breaking change

`agent-box-harness-claude`, `agent-box-harness-opencode`,
`agent-box-harness-hermes`, and `agent-box-pi` are removed with no forwarding
distribution. The former profile provider identities are unsupported. Migration
is explicit preview/confirm only, never scans HOME, never reads credentials,
and never rewrites frozen Bindings.

# Core changes

None. Work Core ontology, Binding, Freeze, Dispatch, Finalization, schema,
migrations, Ref semantics and RuntimeHost/Sandbox/Terminal protocols were not
changed.

# Verification

- Python Core plus migrated Harness/runtime tests: `154 passed`.
- Native bwrap/tmux verticals: `2 passed`.
- Frontend Vitest: `6 passed`; lint and production build passed.
- `compileall` and `git diff --check` passed.
- Clean wheelhouse install built one Harness wheel; six entry points were
  discovered independently and all were READY.
- `agent-box doctor --json` passed in a clean virtualenv/home.
- No real model request was made and no credential content was read.

# Remaining limitations

Resource Routing and Studio are intentionally not implemented in this closure.
Frontend lint retains non-fatal pre-existing duplicate-translation/unused-import
warnings. Native product behavior beyond the declared adapter seams requires
future adapter work.

# READY / NOT READY FOR RESOURCE ROUTING

READY FOR RESOURCE ROUTING
