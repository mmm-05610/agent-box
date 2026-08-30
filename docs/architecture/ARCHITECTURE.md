# Agent-Box Architecture

## Core

`agent_box.work_core` owns the frozen ontology and semantics: Work, Execution,
Binding inputs, Dispatch, Ref, Evidence, durable persistence, resource
observations, and atomic finalization. `resource_contracts` contains only
provider-neutral versioned contracts. `extensions` discovers and validates
installed plugins through `agent_box.plugins`.

Core has no concrete Codex, Git, tmux, Web, Profile, MCP, workflow, or sandbox
implementation. Historical SQL migrations remain packaged for upgrade
compatibility; they are not a legacy runtime authority.

## Plugins and Hosts

Web is an optional Local Host. It owns HTTP, Quick Launch, Profile/integration
configuration, observation/control, and evidence inspection. Harnesses own
Profile revisions, capability projection, credential locators and native Codex
drivers. Git, tmux and Artifacts own their exact resource identities and
evidence. Other external Hosts or workflow systems may drive the same Core
contracts; Web is not the only product entry point.

Quick Launch composes selectors into a normal Core Binding draft, but Freeze,
Dispatch and Finish retain Core semantics. Workflow progression, routing,
retry, scheduling, and future LangGraph/GitHub/Sandbox integrations remain
outside the current implementation.

The browser sends operation identifiers and structured form values only. It
never supplies arbitrary argv, shell text, executable paths, or credentials.
Terminal presentation consumes a provider-generated attach descriptor.

## Installation boundary

`agent-box-cli[preview]` installs Web, Harnesses, Git, tmux and Artifacts. A
Root-only installation is intentionally degraded but useful for discovery and
diagnostics. The Web wheel contains the current frontend static bundle only;
the Root wheel contains Core, SDK, contracts and migrations only.
