# Agent-Box Architecture

## Core

`agent_box.work_core` owns the frozen ontology and semantics: Work, Execution,
Binding inputs, Dispatch, Ref, Evidence, durable persistence, resource
observations, and atomic finalization. `resource_contracts` contains only
provider-neutral versioned contracts. `extensions` discovers and validates
installed plugins through `agent_box.plugins`. Its canonical surface is the
pure Extension Kernel: descriptors, generic contributions, ownership and
transactional loading.

Core has no concrete Codex, Git, tmux, Web, Profile, MCP, workflow, or sandbox
implementation. Historical SQL migrations remain packaged for upgrade
compatibility; they are not a legacy runtime authority.

Protocol packs own provider-neutral Host, Runtime and Credential protocols in
`agent_box.protocols`: DTOs, capability negotiation, errors and
lease/observation protocols only. Concrete bwrap behavior belongs to the
optional `agent-box-sandbox-bwrap` plugin. The frozen sandbox Ref uses the
exact ResourceProvider ID `bwrap-sandbox`; its correlation Ref is owned by the
Harness ExecutionProvider and is a separate identity.

## Plugins and Hosts

Web is an optional Local Host. It owns HTTP, Quick Launch, Profile/integration
configuration, observation/control, and evidence inspection. Harnesses own
Profile revisions, capability projection, credential locators and native Codex
drivers. Git, tmux and Artifacts own their exact resource identities and
evidence. Other external Hosts or workflow systems may drive the same Core
contracts; Web is not the only product entry point.

Dependency direction: `Work Core → Extension Kernel → Protocol Packs →
Concrete Plugins → Optional Hosts`. The Kernel does not interpret Profile,
Harness, Runtime, Credential or Web semantics.

Quick Launch discovers Codex, Claude Code, OpenCode, Hermes and Pi from the
versioned declarative registry in `agent-box-harnesses`. One generic factory
The official `agent-box-skills` plugin provides the provider-neutral
`agent-box.skill@1` resource; Harness adapters project exact immutable SkillRefs
through the existing Runtime Composition boundary.
generates their provider, selector and manager contributions; narrow adapters
own only native protocol and projection differences. Profile persistence has
one authority, provider `harness-profile`, with immutable revisions and exact
digests. Quick Launch composes selectors into a normal Core Binding draft, but Freeze,
Dispatch and Finish retain Core semantics. Workflow progression, routing,
retry, scheduling, and future LangGraph/GitHub/Sandbox integrations remain
outside the current implementation.

The browser sends operation identifiers and structured form values only. It
never supplies arbitrary argv, shell text, executable paths, or credentials.
Terminal presentation consumes a provider-generated attach descriptor.

Credential bindings are provider-neutral locator references. Codex's official
login provider is the first materializer: bwrap receives only an
execution-scoped opaque SecretMount for the exact read-only auth child under
the writable profile-home parent. Other Harness credential materialization is
explicitly deferred.

## Installation boundary

`agent-box-cli[preview]` installs Web, Harnesses, Git, tmux and Artifacts. A
Root-only installation is intentionally degraded but useful for discovery and
diagnostics. The Web wheel contains the current frontend static bundle only;
the Root wheel contains Core, SDK, contracts and migrations only.
