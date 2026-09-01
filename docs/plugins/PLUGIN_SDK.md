# Agent-Box Plugin SDK

Agent-Box plugins are trusted Python distributions discovered through the single
`agent_box.plugins` entry-point group. This is the canonical registration
source for every component; independent component entry-point groups are not
consumed. A plugin may contribute frozen Resource
Contracts, ResourceProviders, ExecutionProviders and namespaced typed
`CatalogContribution` values. Product-specific UI adapters are not part of
this SDK. The current Plugin API is v2; `PluginRegistration` has only
`contracts`, providers and `contributions`.

## Host discovery and routing

ExecutionProvider descriptors declare input requirements and capabilities only.
Host-facing selector compatibility is contributed through the Extension
Catalog (`SelectorCompatibility`); product ordering and defaults stay in the
Host. Profile envelopes carry cross-Harness identity and locators only;
Harness plugins own native payload validation and projection.

## Root sandbox contract

The Root SDK owns the provider-neutral sandbox protocol at
`agent_box.protocols.runtime`. It contains frozen DTOs, capability
negotiation, protocol types, and sandbox errors only. Backend plugins import
these values from Root and register only their ResourceProvider; they must not
ship a second protocol authority. A sandbox `Ref.provider` is the exact
ResourceProvider descriptor ID (`bwrap-sandbox` for the bwrap plugin).
Resolve is side-effect free and returns an execution-scoped `ResolvedSandbox`.
The only runtime call is `start(mounts: MountPlan, entrypoint:
SandboxEntrypoint) -> SandboxedProcess`. Host/Harness code prepares resources,
configuration, and digests before this call. The Sandbox validates and mounts
prepared sources, starts one main process, and only observes/terminates/cleans
that process; it does not understand Work, Execution, Harness, Profile, Skill,
or MCP semantics.

## Minimal package

```text
agent-box-example/
  pyproject.toml                 # [project.entry-points."agent_box.plugins"]
  README.md
  LICENSE
  src/agent_box_example/plugin.py
```

```toml
[project.entry-points."agent_box.plugins"]
example = "agent_box_example.plugin:create_plugin"
```

```python
from dataclasses import dataclass
from typing import ClassVar
from agent_box.extensions import PluginDescriptor, PluginRegistration

@dataclass(frozen=True)
class NoteV1:
    contract_id: ClassVar[str] = "example.note@1"
    text: str

class Plugin:
    def descriptor(self):
        return PluginDescriptor("example", "Example", "1.0.0",
                                description="A small example plugin",
                                docs_url="https://example.test/docs")
    def build(self, context):
        return PluginRegistration(contracts=(NoteV1,))

def create_plugin():
    return Plugin()
```

`PluginRegistration` is the sole runtime source of component truth. The loader
validates contracts before providers and commits one bundle atomically. A failed
plugin is isolated; `strict=True` makes loading fail fast. Plugins are trusted
in-process Python code, not sandboxed or signed extensions.

Contract IDs use `vendor.name@N`; incompatible meaning requires a new version.
A `Ref` retains exact provider/native identity. Binding freezes the selected
`(contract_id, Ref)` input and Dispatch passes frozen values to the
ExecutionProvider. Plugin configuration belongs under
`$AGENT_BOX_HOME/plugins/<plugin-id>/config.json` (or profiles/project defaults);
only selected, non-secret Refs enter Binding. Secrets never belong in
descriptors, Bindings, events, or observations.

A plugin may consume a Contract owned and registered by another installed
plugin. The Python distribution dependency belongs in the consuming plugin's
`pyproject.toml`; there is no runtime dependency manifest. `doctor` validates
against the complete installed environment, including Contracts registered by
other installed plugins. A `PluginRegistration` declares only the components
owned by that plugin and must not copy the dependency's Contract declaration.

Standalone conformance checks know Core built-ins and the plugin's own
Contracts by default. Tests for cross-plugin dependencies can pass the
read-only `available_contract_types` mapping to
`check_plugin_conformance()` or `check_registration_conformance()`.

Use `agent-box plugins list`, `agent-box plugins inspect <id>`, and
`agent-box plugins doctor [id]`. `doctor` exits 0 with warnings, 1 with errors,
and 2 for an unknown plugin or invalid arguments. These commands do not start,
observe, or resolve runtime providers, access the network, or create config
directories.

Third-party tests can call `check_plugin_conformance(plugin, context)` or
`assert_plugin_conforms(plugin, context)` from `agent_box.extensions`. P0 checks
structure, API and descriptor shape, frozen contracts, registration tuples,
duplicate IDs, provider links, input limits, capabilities, and clean atomic
registration. It does not prove provider behavior, security,
finish/recovery/idempotency, evidence claims, or that a malicious plugin will
not read secrets; those require the plugin's own tests.

After uninstall, historical Ref identity, frozen input, contract IDs, and
ResourceObservations remain readable. New resolve/start operations requiring the
missing provider fail with `ProviderUnavailable`.
## Finalization contributors

Host-neutral Preview registrations may also contribute `resource_selectors`
and `host_controls`. A selector declares bounded fields and prepares an exact
`ResourceSelection`; a control exposes attach/observe/finish for its provider.
These are capability objects, not Web Host APIs. The browser receives only
descriptors and bounded summaries; the selector remains the authority for
parameter validation and Ref preparation.

Host-facing plugins expose a bounded `FinalizationContributor` in the
namespaced `CatalogContribution` tuple. A contributor
receives a frozen input Ref and resolved resource, and returns only
`FinalizationContribution(output_refs, resource_observations)`. It never calls
Core terminal APIs. The Host aggregates contributions into the existing atomic
`ExecutionFinalizationRequest`.
## Host-neutral Web contributions

Plugins may register execution-provider descriptors, resource selectors,
resource providers, finalization contributors, and Host control/attach
capabilities through `PluginRegistration`. Selectors expose only bounded
fields, choices, requested summaries, exact prepared selections, and
assurance. The Web Host renders these declarations generically; plugin code
owns authority and provider-specific validation. Plugins must not depend on a
particular Host UI or retired UI implementation.

## Credential bindings

`CredentialRefV1` (`agent-box.credential@1`) is a locator-only binding value.
An installed credential ResourceProvider may resolve it to a provider-private,
execution-scoped `PreparedSecretMount`; secret bytes, source paths, content
digests and environment values are never part of Core inputs, manifests,
events, API responses or Evidence. Secret materialization is not a
`RuntimeSourceDeclaration` and cleanup is idempotent.
